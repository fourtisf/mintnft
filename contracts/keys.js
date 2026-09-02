#!/usr/bin/env node
/**
 * The only thing in this repository that sends a transaction.
 *
 * Deploying and revealing are the two irreversible acts in the whole product,
 * so both live behind an explicit --confirm. Without it every subcommand
 * prints exactly what it would send, from which account, at what cost, and
 * stops. That is not politeness: the reveal window is about eight and a half
 * minutes wide on Base, and a dry run you can read in ten seconds is what lets
 * you send the real one without hesitating.
 *
 *   DEPLOY_RPC=https://rpc.mainnet.chain.robinhood.com  DEPLOY_PK=0x…
 *   ETH_RPC=https://…      an Ethereum mainnet endpoint, for the seed's second
 *                          ingredient. Read-only; nothing is ever sent to it.
 *
 *   node contracts/keys.js state
 *   … node contracts/keys.js deploy --owner 0x… --confirm
 *   … node contracts/keys.js phase public --confirm
 *
 * The key is read from the environment and never from an argument, because an
 * argument goes into shell history and into `ps`.
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { compile, artifact } = require('./build.js');
const { merkle, normalize } = require('./allowlist.js');

const OUT = process.env.KEYS_OUT || path.join(__dirname, '..', 'out');

/* ─────────── env ─────────── */

const env = n => {
  const v = process.env[n];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const die = m => { console.error(m); process.exit(1); };

/** Nothing here waits forever. An RPC that accepts a connection and never
 *  answers is the failure that looks most like work in progress, and every
 *  command below starts with one. */
const TIMEOUT_MS = Number(env('RPC_TIMEOUT_MS') ?? 15000);
const withTimeout = (promise, what, ms = TIMEOUT_MS) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${what} tidak menjawab dalam ${(ms / 1000).toFixed(0)} detik`)), ms).unref?.()),
]);

function wallet() {
  const rpc = env('DEPLOY_RPC');
  const pk = env('DEPLOY_PK');
  if (!rpc) die('DEPLOY_RPC belum diisi — RPC mana yang harus dikirimi?');
  // Said out loud before the first call, so a hang has a name attached to it.
  console.error(`menghubungi ${rpc} …`);
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  // Base produces a block every two seconds; ethers polls every four by
  // default, so a confirmation takes longer to notice than to happen.
  provider.pollingInterval = Number(env('DEPLOY_POLL_MS') ?? 2000);
  if (!pk) return { provider, signer: null };
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) die('DEPLOY_PK bukan private key 32 byte');
  return { provider, signer: new ethers.Wallet(pk, provider) };
}

/* ─────────── Ethereum mainnet, read only ─────────── */

/**
 * The season seed mixes in the hash of an Ethereum mainnet block whose number
 * was fixed before that block existed. Robinhood Chain cannot read it — Nitro's
 * blockhash() is not sourced from L1 and its own documentation calls it
 * cryptographically insecure — so the value is fetched here and submitted at
 * reveal, and the contract stores it for anyone to check against any Ethereum
 * node. This function is the operator's half of that; the reader's half is one
 * eth_getBlockByNumber away and needs nothing from us.
 */
async function ethMainnet() {
  const url = env('ETH_RPC');
  if (!url) die('ETH_RPC belum diisi — seed musim butuh satu blok Ethereum mainnet, '
    + 'dan tanpa endpoint itu tidak ada yang bisa dibaca');
  const call = async (method, params) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const body = await r.text();
    let j;
    try { j = JSON.parse(body); }
    catch {
      // A dead or moved endpoint answers with a web page, and "Unexpected
      // token '<'" is the parser's problem, not the operator's. Say what came
      // back instead of what failed to parse it.
      throw new Error(`membalas HTTP ${r.status} tapi bukan JSON: `
        + `"${body.slice(0, 70).replace(/\s+/g, ' ').trim()}…"\n`
        + '   Itu halaman web, bukan endpoint JSON-RPC. URL-nya kemungkinan sudah pindah.');
    }
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  let chainId;
  try { chainId = Number(await call('eth_chainId', [])); }
  catch (e) { die(`ETH_RPC (${url}) tidak menjawab — ${e.message}`); }
  if (chainId !== 1) {
    die(`ETH_RPC menunjuk ke chain ${chainId}, bukan Ethereum mainnet (1). `
      + 'Seed harus berpegang pada rantai yang bisa dicek siapa pun.');
  }
  return {
    head: async () => Number(await call('eth_blockNumber', [])),
    hashOf: async n => {
      const b = await call('eth_getBlockByNumber', ['0x' + Number(n).toString(16), false]);
      return b ? b.hash : null;
    },
  };
}

/* ─────────── artifacts ─────────── */

const built = () => {
  const out = compile(['ProofKeys.sol', 'ProofParts.sol', 'ProofRenderer.sol']);
  return {
    parts: artifact(out, 'ProofParts.sol', 'ProofParts'),
    renderer: artifact(out, 'ProofRenderer.sol', 'ProofRenderer'),
    keys: artifact(out, 'ProofKeys.sol', 'ProofKeys'),
  };
};

const deployedFile = chainId => path.join(OUT, `keys.${chainId}.json`);

function loadDeployed(chainId) {
  const f = deployedFile(chainId);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function keysContract(provider, signerOrNull, chainId, override) {
  const addr = override || env('KEYS_CONTRACT') || (loadDeployed(chainId) || {}).keys;
  if (!addr) die(`belum ada alamat ProofKeys untuk chain ${chainId} — jalankan deploy dulu, `
    + 'atau set KEYS_CONTRACT');
  return new ethers.Contract(addr, built().keys.abi, signerOrNull || provider);
}

/* ─────────── sending ─────────── */

const eth = w => ethers.utils.formatEther(w);

/**
 * Estimates first and always. A revert surfaces here, before a wallet is
 * unlocked and before anything is spent — and an estimate that fails is the
 * transaction telling you it would have failed.
 */
async function send(label, contract, method, args, { confirm, value = 0 } = {}) {
  const signer = contract.signer;
  if (!signer) die('DEPLOY_PK belum diisi — tidak ada yang bisa menandatangani');

  let gas;
  try {
    gas = await contract.estimateGas[method](...args, { value });
  } catch (e) {
    const reason = e?.error?.message || e?.reason || e?.message || String(e);
    die(`${label}: kontrak menolak sebelum dikirim — ${reason}`);
  }
  const price = await signer.provider.getGasPrice();
  const cost = gas.mul(price);

  console.log(`${label}`);
  console.log(`  ke      ${contract.address}`);
  console.log(`  dari    ${await signer.getAddress()}`);
  console.log(`  metode  ${method}(${args.map(a => JSON.stringify(a)).join(', ')})`);
  if (value) console.log(`  nilai   ${eth(value)} ETH`);
  console.log(`  gas     ${gas.toString()} @ ${ethers.utils.formatUnits(price, 'gwei')} gwei  ≈ ${eth(cost)} ETH`);

  if (!confirm) { console.log('\n  DRY RUN — tambahkan --confirm untuk benar-benar mengirim.'); return null; }

  const tx = await contract[method](...args, { value, gasLimit: gas.mul(12).div(10) });
  console.log(`  tx      ${tx.hash}`);
  const r = await tx.wait();
  console.log(`  block   ${r.blockNumber}  gas terpakai ${r.gasUsed.toString()}`);
  return r;
}

/* ─────────── subcommands ─────────── */

const PHASES = { closed: 0, allowlist: 1, public: 2 };
const PHASE_NAME = ['Closed', 'Allowlist', 'Public'];

async function cmdDeploy(argv, { provider, signer }, chainId, confirm) {
  if (!signer) die('DEPLOY_PK belum diisi');
  const owner = argv.owner || (await signer.getAddress());
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) die('--owner bukan alamat');

  const b = built();
  const balance = await signer.getBalance();
  console.log(`chain ${chainId}   deployer ${await signer.getAddress()}   saldo ${eth(balance)} ETH`);
  console.log(`owner  ${owner}\n`);

  const existing = loadDeployed(chainId);
  if (existing && !argv.again) {
    die(`out/keys.${chainId}.json sudah ada (ProofKeys ${existing.keys}).\n`
      + 'Deploy kedua membuat koleksi kedua, bukan memperbarui yang pertama.\n'
      + 'Tambahkan --again kalau itu memang yang Anda mau.');
  }

  const plan = [
    ['ProofParts', b.parts, []],
    ['ProofRenderer', b.renderer, ['<ProofParts>']],
    ['ProofKeys', b.keys, ['<ProofRenderer>', owner]],
  ];
  console.log('yang akan dikirim:');
  for (const [name, art, args] of plan) {
    console.log(`  ${name.padEnd(14)} ${(art.deployedSize / 1024).toFixed(1)} KB  arg: ${args.join(', ') || '-'}`);
  }

  if (!confirm) {
    console.log('\nDRY RUN — tambahkan --confirm untuk benar-benar men-deploy.');
    return;
  }

  const out = { chainId, owner, deployedAt: new Date().toISOString() };
  const factory = art => new ethers.ContractFactory(art.abi, art.bytecode, signer);

  console.log('\nmengirim…');
  const parts = await factory(b.parts).deploy();
  await parts.deployTransaction.wait();
  out.parts = parts.address;
  console.log(`  ProofParts     ${parts.address}`);

  const renderer = await factory(b.renderer).deploy(parts.address);
  await renderer.deployTransaction.wait();
  out.renderer = renderer.address;
  console.log(`  ProofRenderer  ${renderer.address}`);

  const keys = await factory(b.keys).deploy(renderer.address, owner);
  await keys.deployTransaction.wait();
  out.keys = keys.address;
  console.log(`  ProofKeys      ${keys.address}`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(deployedFile(chainId), JSON.stringify(out, null, 2));
  console.log(`\ntersimpan di out/keys.${chainId}.json`);
  console.log('\nberikutnya:');
  console.log(`  KEYS_CONTRACT=${keys.address} di signal-engine/.env`);
  console.log('  node contracts/keys.js state');
  console.log('  lihat contracts/DEPLOY.md untuk urutan buka mint dan reveal');
}

async function cmdState({ provider, signer }, chainId, argv) {
  const c = await keysContract(provider, null, chainId, argv.at);
  const [phase, price, allowPrice, minted, cap, revealed, root, commit, ethBlock, entropy, recommits] =
    await Promise.all([
      c.phase(), c.price(), c.allowlistPrice(), c.totalMinted(), c.seasonCap(),
      c.revealed(), c.allowlistRoot(), c.seedCommit(), c.entropyBlock(),
      c.mintEntropy(), c.recommitCount(),
    ]);
  const head = await provider.getBlockNumber();

  console.log(`ProofKeys ${c.address}  (chain ${chainId}, blok ${head})\n`);
  console.log(`  fase             ${PHASE_NAME[phase]}`);
  console.log(`  tercetak         ${minted} / ${cap}   (MAX_SUPPLY 1111)`);
  console.log(`  harga allowlist  ${eth(allowPrice)} ETH`);
  console.log(`  harga publik     ${eth(price)} ETH`);
  console.log(`  allowlist root   ${root === ethers.constants.HashZero ? 'belum diset' : root}`);
  console.log(`  saldo kontrak    ${eth(await provider.getBalance(c.address))} ETH`);

  console.log(`  entropi mint     ${entropy}`);

  if (commit === ethers.constants.HashZero) {
    console.log('  seed             belum ada komitmen');
  } else if (!revealed) {
    console.log(`  seed             dikomitkan, menunggu blok Ethereum ${ethBlock}`);
    // Whether that block exists yet is the only thing standing between here and
    // a reveal, and it is a fact, so read it rather than describe it.
    if (env('ETH_RPC')) {
      try {
        const eth = await ethMainnet();
        const now = await eth.head();
        console.log(ethBlock.lte(now)
          ? `  blok Ethereum    sudah ada (head ${now}) — reveal bisa dijalankan`
          : `  blok Ethereum    belum ada (head ${now}, kurang ${ethBlock.sub(now)} blok, `
            + `~${(ethBlock.sub(now).toNumber() * 12 / 60).toFixed(0)} menit)`);
      } catch (e) { console.log(`  blok Ethereum    tidak terbaca — ${e.message}`); }
    } else {
      console.log('  blok Ethereum    ETH_RPC belum diisi, jadi belum diperiksa — bukan berarti siap');
    }
  } else {
    const [seed, secret, ethHash] = await Promise.all([c.seed(), c.seedSecret(), c.entropyHash()]);
    console.log(`  seed             ${seed}`);
    console.log(`  rahasia          ${secret}`);
    console.log(`  blok Ethereum    ${ethBlock}`);
    console.log(`  hash blok itu    ${ethHash}`);

    // The audit anyone else can run, run here so a mismatch is found by us first.
    const want = ethers.utils.solidityKeccak256(['bytes32', 'bytes32', 'bytes32'],
      [secret, entropy, ethHash]);
    console.log(`  hitung ulang     ${want === seed ? 'cocok' : 'TIDAK COCOK — seed bukan hasil bahan-bahan ini'}`);
    console.log(`  komitmen         ${ethers.utils.keccak256(secret) === commit ? 'cocok' : 'TIDAK COCOK'}`);
    if (env('ETH_RPC')) {
      try {
        const real = await (await ethMainnet()).hashOf(ethBlock.toNumber());
        console.log(`  hash on-chain    ${real === ethHash ? 'cocok dengan Ethereum mainnet' : `TIDAK COCOK — Ethereum bilang ${real}`}`);
      } catch (e) { console.log(`  hash on-chain    tidak terbaca — ${e.message}`); }
    } else {
      console.log('  hash on-chain    ETH_RPC belum diisi — belum diperiksa, dan itu bukan lulus');
    }
  }
  if (recommits.gt(0)) console.log(`  recommitCount    ${recommits}  (komitmen pernah diganti, sebelum ada yang mint)`);
}

async function cmdAllowlistRoot(argv, ctx, chainId, confirm) {
  const file = argv._[1];
  if (!file) die('usage: keys.js allowlist-root addresses.txt [--confirm]');
  const addresses = fs.readFileSync(file, 'utf8')
    .split('\n').map(l => l.split('#')[0].trim()).filter(Boolean);
  const t = merkle(addresses);
  const root = '0x' + t.root.toString('hex');

  fs.mkdirSync(OUT, { recursive: true });
  const proofs = {};
  for (const a of addresses) proofs[normalize(a)] = t.proof(a).map(p => '0x' + p.toString('hex'));
  const dest = path.join(OUT, 'proofs.json');
  fs.writeFileSync(dest, JSON.stringify({ root, proofs }, null, 2));

  console.log(`${addresses.length} alamat  ->  root ${root}`);
  console.log(`bukti per alamat: ${dest}`);
  console.log('salin ke signal-engine/ dan set ALLOWLIST_PROOFS ke path-nya,');
  console.log('supaya situs bisa menyerahkan bukti ke dompet yang berhak.\n');

  const c = await keysContract(ctx.provider, ctx.signer, chainId, argv.at);
  await send('setAllowlistRoot', c, 'setAllowlistRoot', [root], { confirm });
}

/* ─────────── entry ─────────── */

function parseArgv(a) {
  const out = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--confirm') out.confirm = true;
    else if (a[i] === '--again') out.again = true;
    else if (a[i].startsWith('--')) out[a[i].slice(2)] = a[++i];
    else out._.push(a[i]);
  }
  return out;
}

const USAGE = `
  node contracts/keys.js <perintah> [--confirm]

    ping                           kedua RPC hidup atau tidak, dan saldo deployer
    state                          fase, harga, suplai, dan seed — termasuk
                                   menghitung ulang seed yang sudah terbit
    deploy --owner 0x…             ProofParts -> ProofRenderer -> ProofKeys
    phase closed|allowlist|public  buka atau tutup mint
    prices <allowlistEth> <publicEth>
    allowlist-root addresses.txt   hitung root, tulis out/proofs.json, kirim
    commit <secret> [--ahead 600]  komitkan seed musim, dipatok ke satu blok
                                   Ethereum mainnet yang belum ada
    reveal <secret>                buka seed (fase harus Closed)
    withdraw <alamat>              kirim seluruh saldo kontrak

  env: DEPLOY_RPC (wajib), DEPLOY_PK (untuk mengirim), KEYS_CONTRACT (opsional),
       ETH_RPC (Ethereum mainnet, hanya dibaca, untuk commit dan reveal)
  Tanpa --confirm setiap perintah hanya mencetak apa yang akan dikirim.
`;

(async () => {
  const argv = parseArgv(process.argv.slice(2));
  const cmd = argv._[0];
  if (!cmd || cmd === 'help') { console.log(USAGE); return; }

  const ctx = wallet();
  let chainId;
  try {
    chainId = (await withTimeout(ctx.provider.getNetwork(), `DEPLOY_RPC (${env('DEPLOY_RPC')})`)).chainId;
  } catch (e) {
    die(`${e.message}\n\n`
      + 'Periksa endpoint-nya langsung:\n'
      + `  curl -s --max-time 10 -X POST ${env('DEPLOY_RPC')} \\\n`
      + `    -H 'content-type: application/json' \\\n`
      + `    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'\n\n`
      + 'Kalau itu juga diam, RPC-nya yang bermasalah, bukan perintah ini.');
  }
  console.error(`terhubung, chain ${chainId}\n`);
  const confirm = !!argv.confirm;

  if (cmd === 'ping') {
    console.log(`DEPLOY_RPC  ${env('DEPLOY_RPC')}\n  chain ${chainId}, blok `
      + `${await withTimeout(ctx.provider.getBlockNumber(), 'DEPLOY_RPC')}`);
    if (ctx.signer) {
      const a = await ctx.signer.getAddress();
      console.log(`  deployer ${a}  saldo ${eth(await ctx.provider.getBalance(a))} ETH`);
    }
    if (!env('ETH_RPC')) return void console.log('\nETH_RPC belum diisi — commit dan reveal butuh itu');
    const l1 = await ethMainnet();
    console.log(`\nETH_RPC     ${env('ETH_RPC')}\n  chain 1, blok ${await l1.head()}`);
    return;
  }

  if (cmd === 'deploy') return cmdDeploy(argv, ctx, chainId, confirm);
  if (cmd === 'state') return cmdState(ctx, chainId, argv);
  if (cmd === 'allowlist-root') return cmdAllowlistRoot(argv, ctx, chainId, confirm);

  const c = await keysContract(ctx.provider, ctx.signer, chainId, argv.at);

  if (cmd === 'phase') {
    const p = PHASES[String(argv._[1] || '').toLowerCase()];
    if (p === undefined) die('fase harus closed, allowlist, atau public');
    if (p !== 0 && await c.revealed()) die('seed sudah terbit — mint tidak bisa dibuka lagi, dan itu disengaja');
    return void await send(`setPhase(${PHASE_NAME[p]})`, c, 'setPhase', [p], { confirm });
  }

  if (cmd === 'prices') {
    const [a, b] = [argv._[1], argv._[2]];
    if (!a || !b) die('usage: keys.js prices <allowlistEth> <publicEth>');
    const wa = ethers.utils.parseEther(a), wb = ethers.utils.parseEther(b);
    if (wa.gt(wb)) console.log('catatan: harga allowlist lebih mahal daripada publik. Sengaja?');
    return void await send('setPrices', c, 'setPrices', [wa, wb], { confirm });
  }

  if (cmd === 'commit') {
    const secret = argv._[1];
    if (!secret) die('usage: keys.js commit <secret> [--ahead 600]');
    const h = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(secret));
    const commitment = ethers.utils.keccak256(h);

    // Far enough ahead that the block is still unmined when this lands, and
    // that nobody can reorg their way to choosing it. 600 blocks is ~2 hours.
    const ahead = Number(argv.ahead ?? 600);
    if (!Number.isFinite(ahead) || ahead < 100) die('--ahead minimal 100 blok (~20 menit)');
    const eth = await ethMainnet();
    const target = (await eth.head()) + ahead;

    console.log('SIMPAN rahasia ini di luar repo. Tanpa itu seed tidak bisa dibuka,');
    console.log('dan koleksi tidak akan pernah punya tier.\n');
    console.log(`  rahasia          ${secret}`);
    console.log(`  komitmen         ${commitment}`);
    console.log(`  blok Ethereum    ${target}  (~${(ahead * 12 / 3600).toFixed(1)} jam lagi)`);
    console.log('\nSeed nanti = keccak(rahasia, entropi mint, hash blok Ethereum itu).');
    console.log('Blok itu belum ada, jadi tidak ada yang bisa digiling di muka —');
    console.log('dan setelah terbit, siapa pun bisa mencocokkannya ke node Ethereum.\n');
    return void await send('commitSeed', c, 'commitSeed', [commitment, target], { confirm });
  }

  if (cmd === 'reveal') {
    const secret = argv._[1];
    if (!secret) die('usage: keys.js reveal <secret>');
    const h = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(secret));

    const commit = await c.seedCommit();
    if (commit === ethers.constants.HashZero) die('belum ada komitmen — jalankan commit dulu');
    if (ethers.utils.keccak256(h) !== commit)
      die('rahasia ini tidak cocok dengan komitmen yang ada di chain. Salah kalimat?');

    const phase = await c.phase();
    if (phase !== 0) die(`fase masih ${PHASE_NAME[phase]} — tutup mint dulu: keys.js phase closed --confirm`);

    const target = (await c.entropyBlock()).toNumber();
    const eth = await ethMainnet();
    const now = await eth.head();
    if (target > now) {
      die(`blok Ethereum ${target} belum ada (head ${now}). `
        + `Kurang ${target - now} blok, sekitar ${((target - now) * 12 / 60).toFixed(0)} menit.`);
    }
    const ethHash = await eth.hashOf(target);
    if (!ethHash) die(`node Ethereum tidak punya blok ${target} — coba endpoint arsip`);

    const entropy = await c.mintEntropy();
    const willBe = ethers.utils.solidityKeccak256(['bytes32', 'bytes32', 'bytes32'],
      [h, entropy, ethHash]);
    console.log(`  blok Ethereum    ${target}`);
    console.log(`  hash blok itu    ${ethHash}`);
    console.log(`  entropi mint     ${entropy}`);
    console.log(`  seed jadinya     ${willBe}`);
    console.log('\nKetiga bahan itu tersimpan on-chain setelah ini, jadi siapa pun bisa');
    console.log('menghitung ulang baris di atas dan mencocokkan hash-nya ke Ethereum.\n');
    return void await send('reveal', c, 'reveal', [h, ethHash], { confirm });
  }

  if (cmd === 'withdraw') {
    const to = argv._[1];
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(to))) die('usage: keys.js withdraw 0x…');
    const bal = await ctx.provider.getBalance(c.address);
    console.log(`saldo kontrak ${eth(bal)} ETH -> ${to}\n`);
    return void await send('withdraw', c, 'withdraw', [to], { confirm });
  }

  die(`perintah tidak dikenal: ${cmd}\n${USAGE}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });

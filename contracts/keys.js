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
 *   DEPLOY_RPC=https://…  DEPLOY_PK=0x…  node contracts/keys.js state
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

function wallet() {
  const rpc = env('DEPLOY_RPC');
  const pk = env('DEPLOY_PK');
  if (!rpc) die('DEPLOY_RPC belum diisi — RPC mana yang harus dikirimi?');
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  // Base produces a block every two seconds; ethers polls every four by
  // default, so a confirmation takes longer to notice than to happen.
  provider.pollingInterval = Number(env('DEPLOY_POLL_MS') ?? 2000);
  if (!pk) return { provider, signer: null };
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) die('DEPLOY_PK bukan private key 32 byte');
  return { provider, signer: new ethers.Wallet(pk, provider) };
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
  const [phase, price, allowPrice, minted, cap, revealed, root, commit, revealBlock, recommits] =
    await Promise.all([
      c.phase(), c.price(), c.allowlistPrice(), c.totalMinted(), c.seasonCap(),
      c.revealed(), c.allowlistRoot(), c.seedCommit(), c.revealBlock(), c.recommitCount(),
    ]);
  const head = await provider.getBlockNumber();

  console.log(`ProofKeys ${c.address}  (chain ${chainId}, blok ${head})\n`);
  console.log(`  fase             ${PHASE_NAME[phase]}`);
  console.log(`  tercetak         ${minted} / ${cap}   (MAX_SUPPLY 1111)`);
  console.log(`  harga allowlist  ${eth(allowPrice)} ETH`);
  console.log(`  harga publik     ${eth(price)} ETH`);
  console.log(`  allowlist root   ${root === ethers.constants.HashZero ? 'belum diset' : root}`);
  console.log(`  saldo kontrak    ${eth(await provider.getBalance(c.address))} ETH`);

  if (revealed) {
    console.log(`  seed             sudah terbit (${await c.seed()})`);
  } else if (commit === ethers.constants.HashZero) {
    console.log('  seed             belum ada komitmen');
  } else {
    const left = revealBlock.add(256).sub(head).toNumber();
    console.log(`  seed             dikomitkan, reveal di blok ${revealBlock}`);
    console.log(`  jendela          ${left > 0 ? `${left} blok tersisa (~${(left * 2 / 60).toFixed(1)} menit di Base)` : 'SUDAH LEWAT — perlu recommitSeed'}`);
  }
  if (recommits.gt(0)) console.log(`  recommitCount    ${recommits}  (jendela pernah terlewat — ini terlihat publik)`);
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

    state                          baca fase, harga, suplai, jendela reveal
    deploy --owner 0x…             ProofParts -> ProofRenderer -> ProofKeys
    phase closed|allowlist|public  buka atau tutup mint
    prices <allowlistEth> <publicEth>
    allowlist-root addresses.txt   hitung root, tulis out/proofs.json, kirim
    commit <secret> [--delay 10]   komitkan seed musim
    reveal <secret>                buka seed (fase harus Closed)
    withdraw <alamat>              kirim seluruh saldo kontrak

  env: DEPLOY_RPC (wajib), DEPLOY_PK (untuk mengirim), KEYS_CONTRACT (opsional)
  Tanpa --confirm setiap perintah hanya mencetak apa yang akan dikirim.
`;

(async () => {
  const argv = parseArgv(process.argv.slice(2));
  const cmd = argv._[0];
  if (!cmd || cmd === 'help') { console.log(USAGE); return; }

  const ctx = wallet();
  const chainId = (await ctx.provider.getNetwork()).chainId;
  const confirm = !!argv.confirm;

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
    if (!secret) die('usage: keys.js commit <secret> [--delay 10]');
    const delay = Number(argv.delay ?? 10);
    const h = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(secret));
    const commitment = ethers.utils.keccak256(h);
    console.log('SIMPAN rahasia ini di luar repo. Tanpa itu seed tidak bisa dibuka,');
    console.log('dan koleksi tidak akan pernah punya tier.\n');
    console.log(`  secret     ${secret}`);
    console.log(`  komitmen   ${commitment}`);
    console.log(`  delay      ${delay} blok (~${(delay * 2)} detik di Base)\n`);
    return void await send('commitSeed', c, 'commitSeed', [commitment, delay], { confirm });
  }

  if (cmd === 'reveal') {
    const secret = argv._[1];
    if (!secret) die('usage: keys.js reveal <secret>');
    const h = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(secret));
    const phase = await c.phase();
    if (phase !== 0) die(`fase masih ${PHASE_NAME[phase]} — tutup mint dulu: keys.js phase closed --confirm`);
    const head = await ctx.provider.getBlockNumber();
    const rb = (await c.revealBlock()).toNumber();
    if (head <= rb) die(`terlalu awal — tunggu sampai blok ${rb} (sekarang ${head})`);
    if (head > rb + 256) die(`jendela sudah lewat di blok ${rb + 256} (sekarang ${head}) — perlu recommitSeed`);
    console.log(`jendela: ${rb + 256 - head} blok tersisa\n`);
    return void await send('reveal', c, 'reveal', [h], { confirm });
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

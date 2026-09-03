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
const net = require('net');
const path = require('path');
const { ethers } = require('ethers');
const { compile, artifact } = require('./build.js');

const OUT = process.env.KEYS_OUT || path.join(__dirname, '..', 'out');

/* ─────────── env ─────────── */

const env = n => {
  const v = process.env[n];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const die = m => { console.error(m); process.exit(1); };

/** The key must never be an argument, so it has to come from the environment,
 *  and "export it first" is the step an operator forgets and then debugs as a
 *  broken RPC. Read the file instead. An exported variable still wins, which
 *  is how a one-off run overrides what is on disk. */
// KEYS_ENV set to nothing means "read no file at all" — which is what a test
// needs, so that a stray .keys.env on a developer's machine cannot reach it.
const ENV_FILE = process.env.KEYS_ENV !== undefined
  ? (process.env.KEYS_ENV.trim() || null)
  : [path.join(process.cwd(), '.keys.env'), path.join(__dirname, '..', '.keys.env')]
      .find(f => fs.existsSync(f)) || null;

function loadEnvFile(file) {
  if (!file) return null;
  if (!fs.existsSync(file)) die(`KEYS_ENV menunjuk ${file}, dan file itu tidak ada`);

  // It holds a private key. Group- or world-readable is worth one line of
  // noise, because nothing else will ever mention it.
  const mode = fs.statSync(file).mode & 0o777;
  if (mode & 0o077) console.error(`peringatan: ${file} bisa dibaca akun lain — chmod 600 ${file}`);

  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { die(`${file} ada tapi tidak terbaca: ${e.message}`); }

  const names = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(s);
    // Silence here would look exactly like a variable that was set, which is
    // the one failure this repository refuses to ship anywhere.
    if (!m) die(`${file} baris ${i + 1} bukan NAMA=nilai: ${s}`);
    let value = m[2].trim();
    if (value.length > 1 && /^".*"$|^'.*'$/.test(value)) value = value.slice(1, -1);
    names.push(m[1]);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  });
  return { file, names };
}

const ENV_LOADED = loadEnvFile(ENV_FILE);

/** Every "you did not set X" message has to say where X goes, because the
 *  operator reading it has no way to know this file is even consulted. */
const missing = (name, why) => die(
  `${name} belum diisi — ${why}\n\n`
  + (ENV_LOADED
      ? `Terbaca dari ${ENV_LOADED.file}: ${ENV_LOADED.names.join(', ') || '(kosong)'}\n`
        + `${name} tidak ada di sana. Tambahkan satu baris ${name}=… lalu ulangi.`
      : `Tidak ada .keys.env di ${[...new Set([process.cwd(), path.join(__dirname, '..')])].join(' maupun ')}.\n`
        + 'Buat satu, lalu ulangi perintah ini:\n\n'
        + '  DEPLOY_RPC=https://rpc.mainnet.chain.robinhood.com\n'
        + '  DEPLOY_PK=0x…\n'
        + '  ETH_RPC=https://ethereum-rpc.publicnode.com'));

/** Nothing here waits forever. An RPC that accepts a connection and never
 *  answers is the failure that looks most like work in progress, and every
 *  command below starts with one. */
// Measured against Robinhood Chain's public mainnet endpoint, which answered
// roughly one call in three: 15s and three tries was not enough, and an
// operator should not have to discover that by watching it fail.
const TIMEOUT_MS = Number(env('RPC_TIMEOUT_MS') ?? 30000);
const withTimeout = (promise, what, ms = TIMEOUT_MS) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${what} tidak menjawab dalam ${(ms / 1000).toFixed(0)} detik`)), ms).unref?.()),
]);

/** Public endpoints answer one call and drop the next. Reads are safe to
 *  repeat, so repeat them rather than turning a flaky node into a failure. */
async function retry(fn, what, attempts = Number(env('RPC_ATTEMPTS') ?? 5)) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await withTimeout(fn(), what); }
    catch (e) {
      last = e;
      if (i < attempts) {
        console.error(`  ${e.message} — coba lagi (${i + 1}/${attempts})`);
        await new Promise(r => setTimeout(r, 1500 * i));
      }
    }
  }
  throw last;
}

function wallet() {
  const rpc = env('DEPLOY_RPC');
  const pk = env('DEPLOY_PK');
  if (!rpc) missing('DEPLOY_RPC', 'RPC mana yang harus dikirimi?');
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

/**
 * A hostname with an AAAA record, on a machine whose IPv6 does not route, is a
 * thirty-second silence indistinguishable from a dead RPC — and the operator
 * has no reason to suspect their own machine, so they go looking at the wrong
 * end. The difference is one connect() per family, so measure it and print
 * what came back rather than announcing a verdict: a family that could not be
 * probed at all says so, because "no answer" and "refused" are not the same
 * finding and neither is "fine".
 */
async function reachability(rpcUrl) {
  let host, port;
  try {
    const u = new URL(rpcUrl);
    host = u.hostname;
    port = Number(u.port) || (u.protocol === 'http:' ? 80 : 443);
  } catch { return null; }

  // lookup, not resolve4/resolve6: it reads /etc/hosts and honours the same
  // system policy the failing connection just used.
  const all = await require('dns').promises.lookup(host, { all: true }).catch(() => []);
  if (!all.length) return null;

  const probe = addr => new Promise(resolve => {
    const started = Date.now();
    const done = how => { s.destroy(); resolve({ ...addr, how, ms: Date.now() - started }); };
    const s = net.connect({ host: addr.address, port }, () => done('tersambung'));
    s.setTimeout(5000, () => done('tidak menjawab'));
    s.on('error', e => done(e.code === 'ECONNREFUSED' ? 'ditolak' : `gagal (${e.code || e.message})`));
  });

  const seen = [];
  for (const family of [4, 6]) {
    const first = all.find(a => a.family === family);
    if (first) seen.push(await probe(first));
  }
  return { host, port, seen };
}

const reachReport = r => {
  if (!r || !r.seen.length) return '';
  const rows = r.seen.map(a => `  IPv${a.family}  ${a.address}  ${a.how} (${(a.ms / 1000).toFixed(1)}s)`);
  const v4 = r.seen.find(a => a.family === 4), v6 = r.seen.find(a => a.family === 6);
  const blame = v4 && v6 && v4.how === 'tersambung' && v6.how !== 'tersambung'
    ? `\nJalur IPv4 ke ${r.host} hidup dan jalur IPv6 tidak, jadi yang diam bukan RPC-nya.\n`
      + 'Mesin ini mencoba IPv6 lebih dulu untuk setiap program, bukan hanya yang ini.\n'
      + 'Perbaiki sekali untuk seluruh sistem:\n\n'
      + "  echo 'precedence ::ffff:0:0/96  100' >> /etc/gai.conf\n"
    : '';
  return `\nmenguji ${r.host}:${r.port} per keluarga alamat:\n${rows.join('\n')}\n${blame}`;
};

/**
 * An endpoint that answers eth_chainId is not therefore an endpoint that can
 * deploy. Free tiers exist that serve a handful of methods and reject the rest
 * with -32601, and the first three commands here happen to be inside that
 * handful — so the endpoint reads healthy right up to the call that matters.
 * Discovering it mid-deploy costs a half-finished collection and a nonce that
 * blocks the retry, so ask for every method the deploy will use, before
 * anything is sent.
 *
 * eth_sendRawTransaction is deliberately not probed: the only honest probe is
 * a transaction. It is reported as untested rather than assumed present.
 */
const DEPLOY_METHODS = a => [
  ['eth_chainId', []],
  ['eth_blockNumber', []],
  ['eth_gasPrice', []],
  ['eth_getBalance', [a, 'latest']],
  ['eth_getTransactionCount', [a, 'latest']],
  ['eth_getBlockByNumber', ['latest', false]],
  ['eth_call', [{ to: a, data: '0x' }, 'latest']],
  ['eth_estimateGas', [{ from: a, to: a, value: '0x0' }]],
  ['eth_getTransactionReceipt', ['0x' + '00'.repeat(32)]],
];

async function methodSupport(url, address) {
  const rows = [];
  for (const [method, params] of DEPLOY_METHODS(address)) {
    try {
      const r = await withTimeout(fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }), method, 15000);
      const j = await r.json();
      // A null result is an answer. A receipt that does not exist is not a
      // method that does not exist, and the two must not print alike.
      if (!j.error) rows.push({ method, how: 'ada' });
      else rows.push({ method, how: j.error.code === -32601 ? 'TIDAK ADA' : 'galat',
                       why: `${j.error.code}: ${j.error.message}` });
    } catch (e) {
      rows.push({ method, how: 'gagal', why: e.message });
    }
  }
  return rows;
}

/** Prints the probe and answers one question: can this endpoint deploy. */
async function reportMethods(url, address) {
  const rows = await methodSupport(url, address);
  console.log('\n  metode yang dipakai deploy:');
  for (const r of rows) console.log(`    ${r.method.padEnd(28)}${r.how}${r.why ? '  ' + r.why : ''}`);
  console.log(`    ${'eth_sendRawTransaction'.padEnd(28)}tidak diuji — satu-satunya ujinya adalah mengirim`);

  const bad = rows.filter(r => r.how !== 'ada');
  if (!bad.length) return true;
  console.error(`\n${bad.length} metode tidak dilayani endpoint ini: ${bad.map(b => b.method).join(', ')}.\n`
    + 'Deploy akan berhenti di tengah — sebagian kontrak sudah berdiri, dan nonce\n'
    + 'yang bukan nol menghalangi percobaan ulang. Ganti endpoint dulu.');
  return false;
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
  if (!url) missing('ETH_RPC', 'seed musim butuh satu blok Ethereum mainnet, '
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

const eth = (w, dp = 6) => {
  const s = ethers.utils.formatEther(w);
  const [i, f = ''] = s.split('.');
  return dp ? `${i}.${f.padEnd(dp, '0').slice(0, dp)}` : i;
};

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

const PHASES = { closed: 0, '1': 1, '2': 2, '3': 3 };
const PHASE_NAME = ['Closed', 'Phase 1', 'Phase 2', 'Phase 3'];

async function cmdDeploy(argv, { provider, signer }, chainId, confirm) {
  if (!signer) die('DEPLOY_PK belum diisi');
  const owner = argv.owner || (await signer.getAddress());
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) die('--owner bukan alamat');

  // Three transactions go out back to back, so an endpoint that serves the
  // first and refuses the third leaves a collection half-built. Asked here,
  // before the first read: through ethers a missing method arrives as a
  // retried "bad response" naming whichever call happened to reach it first,
  // which says nothing about the eight others that would also have failed.
  const from = await signer.getAddress();
  if (!(await reportMethods(env('DEPLOY_RPC'), from))) process.exit(1);
  console.log('');

  const b = built();
  const balance = await signer.getBalance();
  console.log(`chain ${chainId}   deployer ${from}   saldo ${eth(balance)} ETH`);
  console.log(`owner  ${owner}\n`);

  const existing = loadDeployed(chainId);
  if (existing && !argv.again) {
    die(`out/keys.${chainId}.json sudah ada (ProofKeys ${existing.keys}).\n`
      + 'Deploy kedua membuat koleksi kedua, bukan memperbarui yang pertama.\n'
      + 'Tambahkan --again kalau itu memang yang Anda mau.');
  }

  // The dangerous case on a public RPC that drops calls: the deploy lands but
  // the reply is lost, so no file is written and a re-run looks like a first
  // run. The chain remembers even when the connection does not — a nonce above
  // zero on an account with no recorded deployment means something was sent.
  const nonce = await retry(() => signer.getTransactionCount(), 'nonce deployer');
  if (nonce > 0 && !existing && !argv.again) {
    die(`akun ini sudah mengirim ${nonce} transaksi, tetapi out/keys.${chainId}.json tidak ada.\n\n`
      + 'Kalau deploy sebelumnya terputus di tengah, kontraknya mungkin sudah berdiri dan\n'
      + 'deploy kedua akan membuat koleksi kedua di alamat lain. Periksa dulu di explorer:\n'
      + `  ${env('KEYS_EXPLORER') ?? 'https://robinhoodchain.blockscout.com'}/address/${await signer.getAddress()}\n\n`
      + 'Kalau memang belum ada kontrak di sana, ulangi dengan --again.');
  }

  // Measured on a local EVM (out/gas.mjs). Only used when the node refuses to
  // estimate — which it does when the account cannot pay for the gas it is
  // asking about, i.e. exactly when someone is trying to find out how much to
  // send. A floor, and labelled as one.
  const MEASURED = { ProofParts: 3306219n, ProofRenderer: 3245679n, ProofKeys: 2361979n };
  const ADMIN_GAS = 420780n;   // prices, commit, the three phases, reveal, withdraw

  // A stand-in for the address the previous step will produce. Both
  // constructors only store it, so the gas is the same as the real one.
  const soon = '0x' + '11'.repeat(20);
  const args = (types, vals) => ethers.utils.defaultAbiCoder.encode(types, vals).slice(2);
  const plan = [
    ['ProofParts', b.parts, [], ''],
    ['ProofRenderer', b.renderer, ['<ProofParts>'], args(['address'], [soon])],
    ['ProofKeys', b.keys, ['<ProofRenderer>', owner], args(['address', 'address'], [soon, owner])],
  ];

  console.log('yang akan dikirim:');
  let gas = 0n, estimated = true;
  for (const [name, art, shown, ctorHex] of plan) {
    let g;
    try {
      g = (await retry(() => signer.estimateGas({ data: '0x' + art.bytecode + ctorHex }),
        `estimasi ${name}`, 2)).toBigInt();
    } catch {
      g = MEASURED[name];
      estimated = false;
    }
    gas += g;
    console.log(`  ${name.padEnd(14)} ${(art.deployedSize / 1024).toFixed(1)} KB  `
      + `${g.toString().padStart(9)} gas  arg: ${shown.join(', ') || '-'}`);
  }
  gas += ADMIN_GAS;

  const price = await retry(() => provider.getGasPrice(), 'harga gas');
  const cost = price.toBigInt() * gas;
  console.log(`  ${'+ admin'.padEnd(14)} ${' '.repeat(7)}${ADMIN_GAS.toString().padStart(9)} gas  `
    + 'harga, commit, fase, reveal, withdraw');
  console.log(`\n  total     ${gas} gas @ ${ethers.utils.formatUnits(price, 'gwei')} gwei`);
  console.log(`  perkiraan biaya  ${eth(cost, 8)} ETH${estimated ? '' : '   (dari pengukuran lokal — node menolak mengestimasi)'}`);
  console.log(`  saldo Anda       ${eth(balance, 8)} ETH`);

  // On Nitro the fee also carries the cost of posting this data to Ethereum,
  // which a local measurement cannot see. Say so rather than let the number
  // read as complete.
  console.log('\n  Ini biaya eksekusi. Di chain ini biayanya juga memuat ongkos');
  console.log('  mengirim data kontrak ke Ethereum, yang tidak terlihat dari sini.');
  console.log('  Kirim lebih dari angka di atas, jangan pas-pasan.');

  if (balance.toBigInt() < cost) {
    console.log(`\n  SALDO KURANG — butuh sekitar ${eth(cost - balance.toBigInt(), 8)} ETH lagi, di chain ${chainId}.`);
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
  const [phase, now, p1, p2, p3, minted, cap, revealed, commit, ethBlock, entropy, recommits] =
    await Promise.all([
      c.phase(), c.currentPrice(), c.priceOne(), c.priceTwo(), c.priceThree(),
      c.totalMinted(), c.seasonCap(), c.revealed(), c.seedCommit(), c.entropyBlock(),
      c.mintEntropy(), c.recommitCount(),
    ]);
  const head = await provider.getBlockNumber();

  console.log(`ProofKeys ${c.address}  (chain ${chainId}, blok ${head})\n`);
  console.log(`  fase             ${PHASE_NAME[phase]}`);
  console.log(`  tercetak         ${minted} / ${cap}   (MAX_SUPPLY 1111)`);
  console.log(`  harga sekarang   ${phase === 0 ? 'mint tertutup' : eth(now) + ' ETH'}`);
  console.log(`  jadwal           ${eth(p1)} / ${eth(p2)} / ${eth(p3)} ETH   (fase 1 / 2 / 3)`);
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
    phase 1|2|3|closed             buka fase berikutnya, atau tutup mint
    prices <fase1Eth> <fase2Eth> <fase3Eth>
    commit <secret> [--ahead 600]  komitkan seed musim, dipatok ke satu blok
                                   Ethereum mainnet yang belum ada
    reveal <secret>                buka seed (fase harus Closed)
    withdraw <alamat>              kirim seluruh saldo kontrak

  env: DEPLOY_RPC (wajib), DEPLOY_PK (untuk mengirim), KEYS_CONTRACT (opsional),
       ETH_RPC (Ethereum mainnet, hanya dibaca, untuk commit dan reveal)
       Dibaca dari .keys.env di direktori ini kalau ada — chmod 600 — dan
       variabel yang sudah di-export tetap menang. KEYS_ENV menunjuk file lain.
  Tanpa --confirm setiap perintah hanya mencetak apa yang akan dikirim.
`;

(async () => {
  const argv = parseArgv(process.argv.slice(2));
  const cmd = argv._[0];
  if (!cmd || cmd === 'help') { console.log(USAGE); return; }

  const ctx = wallet();
  let chainId;
  try {
    chainId = (await retry(() => ctx.provider.getNetwork(), `DEPLOY_RPC (${env('DEPLOY_RPC')})`)).chainId;
  } catch (e) {
    die(`${e.message}\n`
      + reachReport(await reachability(env('DEPLOY_RPC')))
      + '\nPeriksa endpoint-nya langsung:\n'
      + `  curl -s --max-time 10 -X POST ${env('DEPLOY_RPC')} \\\n`
      + `    -H 'content-type: application/json' \\\n`
      + `    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'\n\n`
      + 'Kalau itu juga diam, RPC-nya yang bermasalah, bukan perintah ini.');
  }
  console.error(`terhubung, chain ${chainId}\n`);
  const confirm = !!argv.confirm;

  if (cmd === 'ping') {
    console.log(`DEPLOY_RPC  ${env('DEPLOY_RPC')}\n  chain ${chainId}`);

    // Before any ethers call: a missing method surfaces through ethers as a
    // retried "bad response", which reads like a flaky endpoint rather than
    // one that will never answer.
    if (ctx.signer && !(await reportMethods(env('DEPLOY_RPC'), await ctx.signer.getAddress()))) {
      process.exitCode = 1;
      return;
    }

    console.log(`  blok ${await retry(() => ctx.provider.getBlockNumber(), 'DEPLOY_RPC')}`);
    if (ctx.signer) {
      const a = await ctx.signer.getAddress();
      const [bal, nonce] = await Promise.all([
        retry(() => ctx.provider.getBalance(a), 'saldo'),
        retry(() => ctx.provider.getTransactionCount(a), 'nonce'),
      ]);
      console.log(`  deployer ${a}  saldo ${eth(bal)} ETH  transaksi terkirim ${nonce}`);
    }

    if (!env('ETH_RPC')) return void console.log('\nETH_RPC belum diisi — commit dan reveal butuh itu');
    const l1 = await ethMainnet();
    console.log(`\nETH_RPC     ${env('ETH_RPC')}\n  chain 1, blok ${await l1.head()}`);
    return;
  }

  if (cmd === 'deploy') return cmdDeploy(argv, ctx, chainId, confirm);
  if (cmd === 'state') return cmdState(ctx, chainId, argv);

  const c = await keysContract(ctx.provider, ctx.signer, chainId, argv.at);

  if (cmd === 'phase') {
    const p = PHASES[String(argv._[1] || '').toLowerCase()];
    if (p === undefined) die('fase harus 1, 2, 3, atau closed');
    if (p !== 0 && await c.revealed()) die('seed sudah terbit — mint tidak bisa dibuka lagi, dan itu disengaja');
    return void await send(`setPhase(${PHASE_NAME[p]})`, c, 'setPhase', [p], { confirm });
  }

  if (cmd === 'prices') {
    const [a, b, l] = [argv._[1], argv._[2], argv._[3]];
    if (!a || !b || !l) die('usage: keys.js prices <fase1Eth> <fase2Eth> <fase3Eth>');
    const [w1, w2, w3] = [a, b, l].map(v => ethers.utils.parseEther(v));
    console.log(`  fase 1  ${eth(w1)} ETH`);
    console.log(`  fase 2  ${eth(w2)} ETH`);
    console.log(`  fase 3  ${eth(w3)} ETH\n`);
    return void await send('setPrices', c, 'setPrices', [w1, w2, w3], { confirm });
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

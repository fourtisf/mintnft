/**
 * contracts/keys.js, driven as the command it actually is.
 *
 * This is the only tool in the repository that sends a transaction, so testing
 * it against an injected fake provider would prove the argument parsing and
 * nothing else: the ABI encoding, the constructor ordering, the nonces, the
 * receipts and the revert messages all live in the part a fake would replace.
 * So every case below runs `node contracts/keys.js …` as a child process,
 * against a JSON-RPC node over a real socket, backed by a real EVM.
 *
 * What it cannot prove: that a real network behaves like this one. Block times,
 * reorgs, fee markets and RPC failure modes are all absent. Base Sepolia is the
 * next step, not this file.
 */
const { execFile } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ethers } = require('ethers');
const { startTestRpc } = require('./testrpc.js');
const { compile, artifact } = require('./build.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok   ' : 'GAGAL'}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);

const ROOT = path.join(__dirname, '..');

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'nekara-keys-'));
  const owner = ethers.Wallet.createRandom();
  const buyer = ethers.Wallet.createRandom();
  const listed = ethers.Wallet.createRandom();
  const treasury = ethers.Wallet.createRandom();

  const rpc = await startTestRpc({
    chainId: 46630,                                   // Robinhood Chain testnet
    fund: [owner, buyer, listed].map(w => ({ address: w.address, balance: 10n ** 19n })),
  });
  // The seed's second ingredient is an Ethereum mainnet block, which this chain
  // cannot read. keys.js fetches it over ETH_RPC, so the test needs one that
  // answers like mainnet — including "that block does not exist yet".
  const l1 = await startTestRpc({ chainId: 1 });
  const l1Get = async (method, params = []) => {
    const r = await fetch(l1.url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return (await r.json()).result;
  };
  const provider = new ethers.providers.JsonRpcProvider(rpc.url);
  provider.pollingInterval = 10;

  /** Runs the real CLI. Never throws on a non-zero exit — the refusals are
   *  half of what is being tested. */
  const keys = (...args) => new Promise(resolve => {
    execFile('node', [path.join(__dirname, 'keys.js'), ...args], {
      cwd: ROOT,
      env: { ...process.env, DEPLOY_RPC: rpc.url, DEPLOY_PK: owner.privateKey,
             ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT, KEYS_CONTRACT: '' },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
  });

  const abi = artifact(compile(['ProofKeys.sol', 'ProofParts.sol', 'ProofRenderer.sol']),
    'ProofKeys.sol', 'ProofKeys').abi;
  const deployedPath = path.join(OUT, 'keys.46630.json');
  const at = who => new ethers.Contract(JSON.parse(fs.readFileSync(deployedPath, 'utf8')).keys,
    abi, who.connect(provider));

  /* ═══════ before anything exists ═══════ */
  head('sebelum ada apa-apa');
  {
    const r = await keys('state');
    ok(r.code !== 0 && /belum ada alamat/.test(r.out),
      'state tanpa kontrak berhenti dan bilang kenapa, bukan mencetak nol');
    ok(!fs.existsSync(deployedPath), 'dan tidak menulis file apa pun');
  }

  /* ═══════ an RPC that accepts and never answers ═══════ */
  head('RPC yang menerima lalu diam');
  {
    // The failure that looks most like work in progress. Every command starts
    // with a network call, and the first version of this CLI sat there with a
    // blank screen forever — the operator has no way to tell that from a slow
    // deploy, which is the same wrong-answer-is-worse-than-slow problem this
    // repository keeps paying for.
    const deaf = net.createServer(sock => { sock.on('data', () => {}); });   // accepts, replies never
    await new Promise(r => deaf.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${deaf.address().port}`;

    const t0 = Date.now();
    const r = await new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), 'ping'], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: '', RPC_TIMEOUT_MS: '2000', KEYS_OUT: OUT, KEYS_CONTRACT: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });
    const took = Date.now() - t0;

    ok(r.code !== 0, 'perintahnya berhenti, tidak menggantung selamanya');
    ok(took < 15000, `dan berhenti cepat (${(took / 1000).toFixed(1)} detik)`);
    ok(/tidak menjawab dalam/.test(r.out), 'mengatakan RPC-nya yang diam');
    ok(r.out.includes(url), 'dan menyebut endpoint mana');
    ok(/curl/.test(r.out), 'lalu memberi perintah untuk memeriksanya sendiri');
    await new Promise(res => deaf.close(res));
  }

  /* ═══════ an endpoint that answers with a web page ═══════ */
  head('endpoint yang membalas halaman web');
  {
    // What a moved or retired public RPC actually does. The raw failure is
    // "Unexpected token '<'", which tells the operator nothing about the URL
    // being wrong.
    const html = require('node:http').createServer((_, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
        .end('<!DOCTYPE html><html><body>Moved</body></html>');
    });
    await new Promise(r => html.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${html.address().port}`;

    const r = await new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), 'ping'], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: rpc.url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: url, RPC_TIMEOUT_MS: '5000', KEYS_OUT: OUT, KEYS_CONTRACT: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });

    ok(r.code !== 0, 'berhenti, bukan diteruskan dengan hasil setengah');
    ok(/bukan JSON/.test(r.out) && /halaman web/.test(r.out),
      'dan mengatakan yang datang itu halaman web, bukan "Unexpected token"');
    ok(r.out.includes(url), 'sambil menyebut URL mana yang salah');
    await new Promise(res => html.close(res));
  }

  /* ═══════ ping ═══════ */
  head('ping');
  {
    const r = await keys('ping');
    ok(r.code === 0 && /chain 46630/.test(r.out), 'ping menyebut chain yang dijawab RPC');
    ok(/deployer 0x[0-9a-fA-F]{40}\s+saldo/.test(r.out), 'dan saldo deployer, sebelum apa pun dikirim');
    ok(/ETH_RPC\s+http/.test(r.out) && /chain 1/.test(r.out), 'plus ETH_RPC dan bahwa itu benar mainnet');
  }

  /* ═══════ dry run ═══════ */
  head('dry run');
  {
    const before = await provider.getBlockNumber();
    const r = await keys('deploy', '--owner', owner.address);
    ok(r.code === 0 && /DRY RUN/.test(r.out), 'deploy tanpa --confirm berhenti di DRY RUN');
    ok(/ProofParts/.test(r.out) && /ProofRenderer/.test(r.out) && /ProofKeys/.test(r.out),
      'dan mencetak ketiga kontrak yang akan dikirim');
    ok(await provider.getBlockNumber() === before, 'tidak ada satu pun blok bertambah');
    ok(!fs.existsSync(deployedPath), 'tidak ada alamat yang ditulis');
  }

  /* ═══════ the deploy ═══════ */
  head('deploy');
  let keysAddr;
  {
    const r = await keys('deploy', '--owner', owner.address, '--confirm');
    ok(r.code === 0, 'deploy --confirm berhasil');
    ok(fs.existsSync(deployedPath), 'alamat tersimpan di keys.46630.json');
    const rec = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    keysAddr = rec.keys;
    ok(/^0x[0-9a-fA-F]{40}$/.test(rec.parts) && /^0x[0-9a-fA-F]{40}$/.test(rec.renderer)
      && /^0x[0-9a-fA-F]{40}$/.test(rec.keys), 'ketiganya punya alamat');
    ok((await provider.getCode(rec.keys)).length > 2, 'ProofKeys benar-benar punya kode on-chain');

    const c = at(owner);
    ok(await c.owner() === owner.address, 'owner terpasang seperti yang diminta');
    ok(await c.renderer() === rec.renderer, 'ProofKeys menunjuk ke ProofRenderer yang baru di-deploy');
    ok((await c.seasonCap()).toNumber() === 666, 'seasonCap 666');
    ok((await c.phase()) === 0, 'mint mulai tertutup');

    // The renderer wiring is the thing a deploy gets wrong silently, so read a
    // token URI through it rather than trusting the address matched.
    await (await c.setPhase(2)).wait();
    await (await c.mintPublic(1, { value: await c.price() })).wait();
    const uri = await c.tokenURI(1);
    ok(uri.includes('SEALED'), 'token pertama terbaca tersegel lewat renderer sungguhan');
    await (await c.setPhase(0)).wait();
  }

  head('deploy kedua');
  {
    const r = await keys('deploy', '--owner', owner.address, '--confirm');
    ok(r.code !== 0 && /sudah ada/.test(r.out),
      'deploy kedua ditolak — itu koleksi kedua, bukan pembaruan');

    // The case a flaky RPC produces: the deploy landed, the reply did not, so
    // nothing was recorded and a re-run looks like a first run.
    const OUT3 = fs.mkdtempSync(path.join(os.tmpdir(), 'nekara-lost-'));
    const lost = await new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), 'deploy', '--owner', owner.address, '--confirm'], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: rpc.url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT3, KEYS_CONTRACT: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });
    ok(lost.code !== 0 && /sudah mengirim \d+ transaksi/.test(lost.out),
      'catatan hilang tetapi chain ingat: nonce bukan nol menghentikan deploy kedua');
    ok(/explorer|address\//.test(lost.out), 'dan menunjuk ke explorer untuk memeriksanya sendiri');
    fs.rmSync(OUT3, { recursive: true, force: true });
  }

  /* ═══════ state ═══════ */
  head('state');
  {
    const r = await keys('state');
    ok(r.code === 0 && /fase\s+Closed/.test(r.out), 'membaca fase dari chain');
    ok(/1 \/ 666/.test(r.out), 'membaca suplai dari chain');
    ok(/harga publik\s+0\.0015 ETH/.test(r.out), 'membaca harga publik dari chain');
    ok(/belum ada komitmen/.test(r.out), 'mengatakan seed belum dikomitkan, bukan mengarang tanggal');
  }

  /* ═══════ prices ═══════ */
  head('harga');
  {
    const dry = await keys('prices', '0.001', '0.004');
    ok(dry.code === 0 && /DRY RUN/.test(dry.out), 'prices tanpa --confirm tidak mengirim');
    ok((await at(owner).price()).eq(ethers.utils.parseEther('0.0015')), 'harga belum berubah');

    await keys('prices', '0.001', '0.004', '--confirm');
    const c = at(owner);
    ok((await c.allowlistPrice()).eq(ethers.utils.parseEther('0.001'))
      && (await c.price()).eq(ethers.utils.parseEther('0.004')), 'keduanya bergerak bersama');
    await keys('prices', '0.0005', '0.0015', '--confirm');
  }

  /* ═══════ opening the public mint ═══════ */
  head('mint publik');
  {
    await keys('phase', 'public', '--confirm');
    const c = at(buyer);
    ok((await c.phase()) === 2, 'CLI benar-benar membuka fase Public');

    const price = await c.price();
    await (await c.mintPublic(2, { value: price.mul(2) })).wait();
    ok((await c.balanceOf(buyer.address)).toNumber() === 2,
      'dompet lain berhasil mint dua key dengan harga yang dibaca dari kontrak');

    let refused = null;
    try { await c.callStatic.mintPublic(1, { value: price.sub(1) }); }
    catch (e) { refused = e; }
    ok(refused !== null, 'bayar kurang satu wei ditolak');
  }

  /* ═══════ the allowlist, end to end ═══════ */
  head('whitelist');
  {
    const listFile = path.join(OUT, 'allowlist.txt');
    fs.writeFileSync(listFile, [listed.address, treasury.address, buyer.address].join('\n') + '\n');

    const r = await keys('allowlist-root', listFile, '--confirm');
    ok(r.code === 0, 'allowlist-root berjalan');
    const proofsFile = path.join(OUT, 'proofs.json');
    ok(fs.existsSync(proofsFile), 'bukti per alamat ditulis ke proofs.json');
    const { root, proofs } = JSON.parse(fs.readFileSync(proofsFile, 'utf8'));
    ok(await at(owner).allowlistRoot() === root, 'root yang ditulis sama dengan yang ada di chain');

    await keys('phase', 'allowlist', '--confirm');
    const c = at(listed);
    const proof = proofs[listed.address.toLowerCase()];
    ok(Array.isArray(proof), 'alamat terdaftar punya bukti di file');

    await (await c.mintAllowlist(1, proof, { value: await c.allowlistPrice() })).wait();
    ok((await c.balanceOf(listed.address)).toNumber() === 1,
      'bukti dari file itu diterima kontrak — root, bukti dan situs sepakat');

    const outsider = ethers.Wallet.createRandom().connect(provider);
    await (await owner.connect(provider).sendTransaction({ to: outsider.address, value: 10n ** 17n })).wait();
    let refused = null;
    try {
      await new ethers.Contract(at(owner).address, abi, outsider)
        .callStatic.mintAllowlist(1, proof, { value: await c.allowlistPrice() });
    } catch (e) { refused = e; }
    ok(refused !== null, 'bukti orang lain tidak berlaku untuk dompet yang tidak terdaftar');
  }

  /* ═══════ commit and reveal ═══════ */
  head('commit dan reveal');
  {
    const secret = 'musim-satu-rahasia';
    const c = at(owner);

    const dry = await keys('commit', secret, '--ahead', '600');
    ok(dry.code === 0 && /SIMPAN rahasia/.test(dry.out),
      'commit memperingatkan untuk menyimpan rahasianya sebelum mengirim apa pun');
    ok(/blok Ethereum\s+\d+/.test(dry.out),
      'dan menyebut blok Ethereum mana yang akan dipatok, sebelum blok itu ada');

    ok((await keys('commit', secret, '--ahead', '10')).code !== 0,
      '--ahead terlalu dekat ditolak: blok yang hampir ada bukan blok yang tak terduga');

    await keys('commit', secret, '--ahead', '600', '--confirm');
    ok(await c.seedCommit() !== ethers.constants.HashZero, 'komitmen tersimpan di chain');
    const target = (await c.entropyBlock()).toNumber();
    ok(target > Number(await l1Get('eth_blockNumber')),
      `blok Ethereum ${target} masih di masa depan saat dikomitkan`);

    ok((await keys('commit', secret, '--ahead', '600', '--confirm')).code !== 0,
      'commit kedua ditolak');

    const early = await keys('reveal', secret, '--confirm');
    ok(early.code !== 0 && /fase masih Allowlist/.test(early.out),
      'reveal ditolak selagi mint terbuka — dan CLI menyebut perintah untuk menutupnya');

    await keys('phase', 'closed', '--confirm');

    const notYet = await keys('reveal', secret, '--confirm');
    ok(notYet.code !== 0 && /belum ada/.test(notYet.out),
      'reveal ditolak selagi blok Ethereum-nya belum ada, dan menyebut kurang berapa');

    const wrong = await keys('reveal', 'rahasia-yang-salah', '--confirm');
    ok(wrong.code !== 0 && /tidak cocok dengan komitmen/.test(wrong.out),
      'rahasia salah ditolak sebelum menyentuh jaringan');

    const st = await keys('state');
    ok(/blok Ethereum\s+belum ada/.test(st.out), 'state mengatakan blok itu belum ada');

    l1.mine(700);                                  // Ethereum moves on
    const ready = await keys('state');
    ok(/reveal bisa dijalankan/.test(ready.out), 'setelah bloknya ada, state bilang siap');

    const r = await keys('reveal', secret, '--confirm');
    ok(r.code === 0 && await c.revealed(), 'reveal berhasil');

    // The audit an outsider runs, run here against the same two sources.
    const [seed, storedSecret, ethHash, entropy] =
      await Promise.all([c.seed(), c.seedSecret(), c.entropyHash(), c.mintEntropy()]);
    const real = (await l1Get('eth_getBlockByNumber', ['0x' + target.toString(16), false])).hash;
    ok(ethHash === real, 'hash yang tersimpan sama dengan yang Ethereum sebut untuk blok itu');
    ok(seed === ethers.utils.solidityKeccak256(['bytes32', 'bytes32', 'bytes32'],
      [storedSecret, entropy, ethHash]),
      'seed = keccak(rahasia, entropi mint, hash blok Ethereum) — dihitung ulang di luar kontrak');
    ok(ethers.utils.keccak256(storedSecret) === await c.seedCommit(),
      'dan rahasia yang diterbitkan memang yang dikomitkan sebelum mint dibuka');

    const audit = await keys('state');
    ok(/hitung ulang\s+cocok/.test(audit.out), 'state menghitung ulang seed-nya sendiri dan cocok');
    ok(/hash on-chain\s+cocok dengan Ethereum mainnet/.test(audit.out),
      'dan mencocokkan hash itu ke Ethereum, bukan mempercayainya');

    const tier = await c.tierOf(1);
    ok(tier >= 1 && tier <= 3, `tier token #1 bisa dibaca setelah reveal (${tier})`);

    const reopen = await keys('phase', 'public', '--confirm');
    ok(reopen.code !== 0 && /tidak bisa dibuka lagi/.test(reopen.out),
      'CLI menolak membuka mint lagi setelah seed terbit');
  }

  /* ═══════ no deadline left to miss ═══════ */
  head('tidak ada tenggat lagi');
  {
    // The old design had 256 blocks to reveal in — about eight minutes on Base,
    // and the scariest line in the runbook. Nothing in the seed decays now.
    const OUT2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nekara-keys2-'));
    const keys2 = (...args) => new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), ...args], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: rpc.url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT2, KEYS_CONTRACT: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });
    // --again on purpose: this account has been deploying all file long, and
    // the nonce guard is right to stop a re-run that has not been thought about.
    await keys2('deploy', '--owner', owner.address, '--again', '--confirm');
    await keys2('commit', 'rahasia-kedua', '--ahead', '600', '--confirm');
    l1.mine(100000);                              // ~two weeks of Ethereum
    rpc.mine(100000);
    const r = await keys2('reveal', 'rahasia-kedua', '--confirm');
    ok(r.code === 0, 'reveal seratus ribu blok kemudian tetap berhasil');
    const rec = JSON.parse(fs.readFileSync(path.join(OUT2, 'keys.46630.json'), 'utf8'));
    ok(await new ethers.Contract(rec.keys, abi, provider).revealed(), 'dan seed-nya terbit');
    fs.rmSync(OUT2, { recursive: true, force: true });
  }

  /* ═══════ money out ═══════ */
  head('withdraw');
  {
    const c = at(owner);
    const held = await provider.getBalance(c.address);
    ok(held.gt(0), `kontrak memegang ${ethers.utils.formatEther(held)} ETH dari mint di atas`);

    const dry = await keys('withdraw', treasury.address);
    ok(dry.code === 0 && /DRY RUN/.test(dry.out), 'withdraw tanpa --confirm tidak mengirim');
    ok((await provider.getBalance(treasury.address)).eq(0), 'tujuan masih kosong');

    await keys('withdraw', treasury.address, '--confirm');
    ok((await provider.getBalance(treasury.address)).eq(held), 'seluruh saldo sampai ke tujuan');
    ok((await provider.getBalance(c.address)).eq(0), 'kontrak kosong');
  }

  await rpc.close();
  await l1.close();
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log(`\n${failures ? failures + ' GAGAL' : 'semua lulus'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

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
             ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT, KEYS_CONTRACT: '', KEYS_ENV: '' },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
  });

  const SEASON_SECRET = 'musim-satu-rahasia';

  const abi = artifact(compile(['ProofKeys.sol', 'ProofParts.sol', 'ProofRenderer.sol']),
    'ProofKeys.sol', 'ProofKeys').abi;
  const deployedPath = path.join(OUT, 'keys.46630.json');
  const at = who => new ethers.Contract(JSON.parse(fs.readFileSync(deployedPath, 'utf8')).keys,
    abi, who.connect(provider));

  /* ═══════ .keys.env ═══════ */
  head('.keys.env');
  {
    // The key cannot be an argument, so it comes from the environment — and an
    // operator who forgets to export it first reads "DEPLOY_RPC belum diisi"
    // and goes looking for a broken RPC. The file is the fix; these cases are
    // that it is actually read, and that it never silently loses to anything.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekara-env-'));
    const file = path.join(dir, '.keys.env');
    const bare = (extra = {}) => new Promise(resolve => {
      const e = { ...process.env, ...extra, KEYS_OUT: OUT, DEPLOY_POLL_MS: '10' };
      for (const k of ['DEPLOY_RPC', 'DEPLOY_PK', 'ETH_RPC', 'KEYS_ENV', 'KEYS_CONTRACT'])
        if (!(k in extra)) delete e[k];
      execFile('node', [path.join(__dirname, 'keys.js'), 'ping'], { cwd: dir, env: e },
        (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });

    const none = await bare();
    ok(none.code !== 0, 'tanpa file dan tanpa export, perintahnya berhenti');
    ok(/\.keys\.env/.test(none.out) && none.out.includes(dir),
      'dan menyebut file yang dicari, di direktori mana');
    ok(/DEPLOY_RPC=/.test(none.out) && /DEPLOY_PK=/.test(none.out),
      'lalu isinya, bukan hanya nama variabel yang kurang');

    const good = `# ditulis tangan\nDEPLOY_RPC=${rpc.url}\nexport DEPLOY_PK=${owner.privateKey}\n`
      + `ETH_RPC="${l1.url}"\n\n`;
    fs.writeFileSync(file, good, { mode: 0o600 });
    const read = await bare();
    ok(read.code === 0 && /chain 46630/.test(read.out), 'dengan file itu, ping jalan tanpa export apa pun');
    ok(read.out.includes(owner.address), 'kuncinya terbaca dari file, bukan dari argumen');
    ok(read.out.includes(l1.url), 'tanda kutip dan "export" di depan tidak ikut terbawa');

    const win = await bare({ DEPLOY_PK: buyer.privateKey });
    ok(win.out.includes(buyer.address) && !win.out.includes(owner.address),
      'variabel yang sudah di-export menang atas file');

    fs.writeFileSync(file, `DEPLOY_RPC=${rpc.url}\nini bukan apa-apa\n`, { mode: 0o600 });
    const bad = await bare();
    ok(bad.code !== 0 && /baris 2/.test(bad.out),
      'baris yang tidak berbentuk NAMA=nilai dihentikan, dengan nomor barisnya');

    fs.writeFileSync(file, good);
    fs.chmodSync(file, 0o644);
    const loose = await bare();
    ok(/bisa dibaca akun lain/.test(loose.out), 'file berisi private key yang terbuka diperingatkan');
    ok(loose.code === 0, 'tapi tetap dijalankan — itu peringatan, bukan penolakan');

    const off = await bare({ KEYS_ENV: '', DEPLOY_RPC: rpc.url, DEPLOY_PK: owner.privateKey, ETH_RPC: l1.url });
    ok(off.code === 0 && !/bisa dibaca akun lain/.test(off.out),
      'KEYS_ENV kosong berarti tidak ada file yang dibaca sama sekali');

    fs.rmSync(dir, { recursive: true, force: true });
  }

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
               // Both knobs pinned: this tests the mechanism, not whatever the
               // defaults happen to be tuned to on the day.
               ETH_RPC: '', RPC_TIMEOUT_MS: '2000', RPC_ATTEMPTS: '2',
               KEYS_OUT: OUT, KEYS_CONTRACT: '', KEYS_ENV: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });
    const took = Date.now() - t0;

    ok(r.code !== 0, 'perintahnya berhenti, tidak menggantung selamanya');
    ok(took < 15000, `dan berhenti setelah dua percobaan (${(took / 1000).toFixed(1)} detik)`);
    ok(/tidak menjawab dalam/.test(r.out), 'mengatakan RPC-nya yang diam');
    ok(r.out.includes(url), 'dan menyebut endpoint mana');
    ok(/curl/.test(r.out), 'lalu memberi perintah untuk memeriksanya sendiri');
    // The silence has two causes that look identical from here — a dead
    // endpoint, and a machine that reaches for IPv6 first and never arrives.
    // Which one it is has to be measured and shown, not guessed at.
    ok(/menguji 127\.0\.0\.1:\d+ per keluarga alamat/.test(r.out),
      'dan menguji tiap keluarga alamat, lalu mencetak hasilnya');
    ok(/IPv4\s+127\.0\.0\.1\s+tersambung/.test(r.out),
      'TCP-nya tersambung — jadi yang diam memang RPC-nya, bukan jaringannya');
    ok(!/gai\.conf/.test(r.out) && !/IPv6/.test(r.out),
      'dan tanpa AAAA, IPv6 tidak disebut sama sekali — bukan tebakan, hasil ukur');
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
               ETH_RPC: url, RPC_TIMEOUT_MS: '5000', KEYS_OUT: OUT, KEYS_CONTRACT: '', KEYS_ENV: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });

    ok(r.code !== 0, 'berhenti, bukan diteruskan dengan hasil setengah');
    ok(/bukan JSON/.test(r.out) && /halaman web/.test(r.out),
      'dan mengatakan yang datang itu halaman web, bukan "Unexpected token"');
    ok(r.out.includes(url), 'sambil menyebut URL mana yang salah');
    await new Promise(res => html.close(res));
  }

  /* ═══════ an endpoint that serves some methods and not others ═══════ */
  head('endpoint yang melayani sebagian metode saja');
  {
    // A real free tier did exactly this: eth_chainId answered, eth_blockNumber
    // came back -32601. Every early command sits inside the methods it does
    // serve, so the endpoint reads healthy until the call that matters — and
    // the call that matters is in the middle of a three-transaction deploy.
    const partial = require('node:http').createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const { id, method } = JSON.parse(body);
        // eth_getBalance is in here because deploy read it before probing, and
        // a fake that answered everything but eth_blockNumber could not tell.
        const missing = method === 'eth_blockNumber' || method === 'eth_getBalance';
        const answer = missing
          ? { id, jsonrpc: '2.0', error: { code: -32601, message: `the method ${method} does not exist/is not available` } }
          : { id, jsonrpc: '2.0', result: method === 'eth_chainId' ? '0xb626' : '0x1' };
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer));
      });
    });
    await new Promise(r => partial.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${partial.address().port}`;

    const r = await new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), 'ping'], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: '', RPC_TIMEOUT_MS: '5000', RPC_ATTEMPTS: '2',
               KEYS_OUT: OUT, KEYS_CONTRACT: '', KEYS_ENV: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });

    ok(r.code !== 0, 'ping menolak endpoint yang tidak bisa menyelesaikan deploy');
    ok(/eth_blockNumber\s+TIDAK ADA/.test(r.out), 'menyebut metode mana yang hilang');
    ok(/eth_chainId\s+ada/.test(r.out), 'sambil mengakui yang memang dilayani — bukan vonis borongan');
    ok(/-32601/.test(r.out), 'beserta kode galat aslinya');
    ok(/setengah|berhenti di tengah/.test(r.out), 'dan mengatakan akibatnya kalau tetap diteruskan');
    ok(!/saldo/.test(r.out), 'berhenti sebelum membaca apa pun lagi, bukan lima kali coba lagi');
    ok(/tidak diuji/.test(r.out),
      'eth_sendRawTransaction dilaporkan tidak diuji, bukan dianggap ada');

    const d = await new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), 'deploy', '--owner', owner.address], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: '', RPC_TIMEOUT_MS: '5000', RPC_ATTEMPTS: '2',
               KEYS_OUT: OUT, KEYS_CONTRACT: '', KEYS_ENV: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });
    ok(d.code !== 0 && /TIDAK ADA/.test(d.out),
      'dan deploy menanyakannya sendiri, tidak bergantung pada operator menjalankan ping dulu');
    ok(/eth_getBalance\s+TIDAK ADA/.test(d.out) && /eth_blockNumber\s+TIDAK ADA/.test(d.out),
      'melaporkan kedua metode yang hilang, bukan hanya yang pertama ditabrak');
    ok(!/bad response/.test(d.out),
      'probe berjalan sebelum pembacaan apa pun — bukan setelah ethers gagal duluan');
    ok(!/DRY RUN/.test(d.out), 'berhenti sebelum mencetak rencana yang tidak bisa dijalankan');

    await new Promise(res => partial.close(res));
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
    // "how much ETH do I need" is the question a dry run exists to answer, and
    // it used to print contract sizes instead of a cost.
    ok(/total\s+\d+ gas @ [\d.]+ gwei/.test(r.out), 'beserta total gas dan harga gas dari chain');
    ok(/perkiraan biaya\s+[\d.]+ ETH/.test(r.out) && /saldo Anda\s+[\d.]+ ETH/.test(r.out),
      'perkiraan biaya dan saldo, berdampingan');
    ok(/mengirim data kontrak ke Ethereum/.test(r.out),
      'dan mengaku bahwa angka itu belum memuat ongkos posting data ke Ethereum');
    ok(await provider.getBlockNumber() === before, 'tidak ada satu pun blok bertambah');
    ok(!fs.existsSync(deployedPath), 'tidak ada alamat yang ditulis');
  }

  /* ═══════ an estimate that works small and fails big ═══════ */
  head('estimasi yang sanggup kecil tapi tidak sanggup besar');
  {
    // What mainnet did: the dry run estimated all three contracts, and seconds
    // later ethers estimated again for the send and got nothing back. The
    // failure arrives as UNPREDICTABLE_GAS_LIMIT, which reads like a
    // transaction that would revert rather than a dropped call — and by then
    // ProofParts was already on the chain and paid for.
    const bigFails = require('node:http').createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        const j = JSON.parse(body);
        const big = j.method === 'eth_estimateGas'
          && String(j.params?.[0]?.data ?? '').length > 20000;
        if (big) {
          return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(
            { id: j.id, jsonrpc: '2.0', error: { code: -32000, message: 'cannot estimate' } }));
        }
        const up = await fetch(rpc.url, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body });
        res.writeHead(200, { 'content-type': 'application/json' }).end(await up.text());
      });
    });
    await new Promise(r => bigFails.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${bigFails.address().port}`;
    const OUT4 = fs.mkdtempSync(path.join(os.tmpdir(), 'nekara-est-'));

    const r = await new Promise(resolve => {
      execFile('node', [path.join(__dirname, 'keys.js'), 'deploy', '--owner', owner.address, '--confirm'], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: url, DEPLOY_PK: listed.privateKey,
               ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT4, KEYS_CONTRACT: '', KEYS_ENV: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
    });

    ok(r.code === 0, 'deploy tetap selesai — batas gas-nya sudah diukur, tidak ditanya dua kali');
    ok(/dari pengukuran lokal/.test(r.out),
      'dan mengaku angkanya dari pengukuran lokal, bukan dari chain');
    ok(!/UNPREDICTABLE_GAS_LIMIT/.test(r.out), 'tanpa UNPREDICTABLE_GAS_LIMIT');
    const rec = JSON.parse(fs.readFileSync(path.join(OUT4, 'keys.46630.json'), 'utf8'));
    ok(/^0x[0-9a-fA-F]{40}$/.test(rec.keys ?? ''), 'ketiganya berdiri dan tercatat');

    fs.rmSync(OUT4, { recursive: true, force: true });
    await new Promise(res => bigFails.close(res));
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
    await (await c.mintPublic(1, { value: await c.currentPrice() })).wait();
    const uri = await c.tokenURI(1);
    const meta = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
    ok(/^data:image\/svg\+xml/.test(meta.image ?? ''),
      'token pertama menyerahkan ukirannya lewat renderer sungguhan');
    ok(meta.attributes.some(a => a.trait_type === 'Tier' && a.value === 'Not drawn yet'),
      'dengan tier yang belum ditarik, karena seed musim belum terbit');
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
               ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT3, KEYS_CONTRACT: '', KEYS_ENV: '' },
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
    ok(/jadwal\s+0\.0007\d* \/ 0\.0017\d* \/ 0\.0033\d* ETH/.test(r.out),
      'membaca ketiga harga fase dari chain');
    ok(/belum ada komitmen/.test(r.out), 'mengatakan seed belum dikomitkan, bukan mengarang tanggal');
  }

  /* ═══════ prices ═══════ */
  head('harga');
  {
    const dry = await keys('prices', '0.001', '0.004', '0.009');
    ok(dry.code === 0 && /DRY RUN/.test(dry.out), 'prices tanpa --confirm tidak mengirim');
    ok(/fase 1\s+0\.001\d* ETH/.test(dry.out) && /fase 3\s+0\.009\d* ETH/.test(dry.out),
      'dan mencetak ketiga harga fase');
    ok((await at(owner).priceTwo()).eq(ethers.utils.parseEther('0.0017')), 'harga belum berubah');

    await keys('prices', '0.001', '0.004', '0.009', '--confirm');
    const c = at(owner);
    ok((await c.priceOne()).eq(ethers.utils.parseEther('0.001'))
      && (await c.priceTwo()).eq(ethers.utils.parseEther('0.004'))
      && (await c.priceThree()).eq(ethers.utils.parseEther('0.009')), 'ketiganya bergerak bersama');
    ok((await keys('prices', '0.001', '0.004', '0.003', '--confirm')).code !== 0,
      'tangga harga yang turun ditolak');
    await keys('prices', '0.0007', '0.0017', '0.0033', '--confirm');
  }

  /* ═══════ opening the public mint ═══════ */
  head('mint publik');
  {
    // This order is the whole point: recommitSeed() refuses once a single key
    // exists, so a phase opened before the commitment leaves a bad commitment
    // permanently uncorrectable. The contract cannot tell the two apart, so
    // the CLI has to.
    const early = await keys('phase', '2', '--confirm');
    ok(early.code !== 0 && /seed belum dikomit/.test(early.out),
      'membuka fase tanpa seed terkomit ditolak, sebelum key pertama mengunci apa pun');
    ok(/recommitSeed/.test(early.out), 'dan mengatakan apa yang akan hilang, bukan sekadar menolak');
    ok((await at(owner).phase()) === 0, 'fasenya benar-benar tidak bergerak');
    ok((await keys('phase', 'closed', '--confirm')).code === 0,
      'menutup tetap boleh — yang dijaga hanya membuka');

    // commitSeed is one-shot, so everything that needs an uncommitted contract
    // has to happen here, before the commitment this season actually uses.
    const dry = await keys('commit', SEASON_SECRET, '--ahead', '600');
    ok(dry.code === 0 && /SIMPAN rahasia/.test(dry.out),
      'commit memperingatkan untuk menyimpan rahasianya sebelum mengirim apa pun');
    ok(/blok Ethereum\s+\d+/.test(dry.out),
      'dan menyebut blok Ethereum mana yang akan dipatok, sebelum blok itu ada');
    ok((await keys('commit', SEASON_SECRET, '--ahead', '10')).code !== 0,
      '--ahead terlalu dekat ditolak: blok yang hampir ada bukan blok yang tak terduga');

    // The secret arrives on stdin, not as an argument: an argument is in the
    // shell history of the machine that ran it, and this one decides every
    // tier in the season until reveal.
    const piped = await new Promise(resolve => {
      const child = execFile('node', [path.join(__dirname, 'keys.js'), 'commit', '--ahead', '600', '--confirm'], {
        cwd: ROOT,
        env: { ...process.env, DEPLOY_RPC: rpc.url, DEPLOY_PK: owner.privateKey,
               ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT, KEYS_CONTRACT: '', KEYS_ENV: '' },
      }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
      child.stdin.end(SEASON_SECRET + '\n');
    });
    ok(piped.code === 0, 'commit menerima rahasia dari stdin, tanpa pernah jadi argumen');
    ok(!piped.out.includes(SEASON_SECRET),
      'dan tidak mencetaknya kembali — layar itu berakhir di scrollback dan screenshot');
    ok(/tidak dicetak/.test(piped.out) && /SIMPAN rahasia/.test(piped.out),
      'tetap mengatakan bahwa rahasianya harus disimpan, dan bahwa ia sengaja tidak ditampilkan');
    ok((await at(owner).seedCommit()) !== ethers.constants.HashZero,
      'komitmennya benar-benar sampai ke chain lewat jalur itu');

    await keys('phase', '2', '--confirm');
    const c = at(buyer);
    ok((await c.phase()) === 2, 'CLI benar-benar membuka fase 2');

    const price = await c.currentPrice();
    await (await c.mintPublic(2, { value: price.mul(2) })).wait();
    ok((await c.balanceOf(buyer.address)).toNumber() === 2,
      'dompet lain berhasil mint dua key dengan harga yang dibaca dari kontrak');

    let refused = null;
    try { await c.callStatic.mintPublic(1, { value: price.sub(1) }); }
    catch (e) { refused = e; }
    ok(refused !== null, 'bayar kurang satu wei ditolak');
  }

  /* ═══════ commit and reveal ═══════ */
  head('commit dan reveal');
  {
    const secret = SEASON_SECRET;
    const c = at(owner);

    ok(await c.seedCommit() !== ethers.constants.HashZero, 'komitmen tersimpan di chain');
    const target = (await c.entropyBlock()).toNumber();
    ok(target > Number(await l1Get('eth_blockNumber')),
      `blok Ethereum ${target} masih di masa depan saat dikomitkan`);

    ok((await keys('commit', secret, '--ahead', '600', '--confirm')).code !== 0,
      'commit kedua ditolak');

    const early = await keys('reveal', secret, '--confirm');
    ok(early.code !== 0 && /fase masih Phase 2/.test(early.out),
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

    const reopen = await keys('phase', '3', '--confirm');
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
               ETH_RPC: l1.url, DEPLOY_POLL_MS: '10', KEYS_OUT: OUT2, KEYS_CONTRACT: '', KEYS_ENV: '' },
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

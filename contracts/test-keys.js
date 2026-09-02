/**
 * ProofKeys, on a real EVM.
 *
 * This contract holds every ether paid for a key and decides, for the life of
 * the collection, who is in which latency queue. Until now it had no tests at
 * all: it compiled, and compiling is not evidence. Two of the assertions below
 * fail against the version that shipped before this file existed —
 * mintReserved measured itself against MAX_SUPPLY while every paid path
 * measured itself against SEASON_1, and bestTierOf walked the whole season on
 * every sign-in.
 *
 * Everything runs against @ethereumjs/vm with the real ProofRenderer deployed,
 * so tiers come from the same code the artwork does rather than a stub. The
 * one piece that is simulated is the chain itself: blockhash comes from a
 * deterministic stub, and the 256-block window around it is enforced by the
 * EVM's own BLOCKHASH opcode, not by the stub.
 */
const { VM } = require('@ethereumjs/vm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { Block } = require('@ethereumjs/block');
const { Account, Address, bufferToBigInt } = require('@ethereumjs/util');
const { keccak256 } = require('ethereumjs-util');
const { compile, artifact } = require('./build.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);

/* ─────────── abi ─────────── */

const sel = sig => keccak256(Buffer.from(sig)).slice(0, 4);
const topic = sig => keccak256(Buffer.from(sig));
const u = v => Buffer.from(BigInt(v).toString(16).padStart(64, '0'), 'hex');
const addr32 = a => Buffer.from(String(a).slice(2).padStart(64, '0'), 'hex');
const b32 = x => Buffer.from(Buffer.from(x).toString('hex').padStart(64, '0'), 'hex');

/** head/tail encoding for the one dynamic argument shape this contract takes. */
const withProof = (qty, proof) => Buffer.concat([
  u(qty), u(0x40), u(proof.length), ...proof,
]);

const ETH = BigInt(1e18);
const gwei = BigInt(1e9);

/* ─────────── accounts ─────────── */

const acct = n => Address.fromString('0x' + String(n).padStart(2, '0').repeat(20));
const OWNER = acct(11);
const ALICE = acct(22);
const BOB = acct(33);
const CAROL = acct(44);
const DAVE = acct(55);
const TREASURY = acct(66);
const STRANGER = acct(77);

/* ─────────── vm ─────────── */

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });

/** Deterministic, and only ever consulted for blocks the EVM itself allows. */
const blockchain = { async getBlock(n) { return { hash: () => keccak256(Buffer.from('nekara-block-' + n)) }; } };
const blockHashOf = n => keccak256(Buffer.from('nekara-block-' + n));

const at = n => Block.fromBlockData({ header: { number: BigInt(n) }, withdrawals: [] }, { common });

/* ─────────── merkle ─────────── */

// The operator's own tool, checked here against the verifier that actually
// guards the money. If these ever disagree, the published root is wrong.
const { merkle, leafOf } = require('./allowlist.js');

/* ─────────── harness ─────────── */

async function main() {
  const out = compile(['ProofKeys.sol', 'ProofParts.sol', 'ProofRenderer.sol'], INLINE);
  const keys = artifact(out, 'ProofKeys.sol', 'ProofKeys');
  const parts = artifact(out, 'ProofParts.sol', 'ProofParts');
  const rend = artifact(out, 'ProofRenderer.sol', 'ProofRenderer');
  const reenter = artifact(out, 'test/Fixtures.sol', 'Reenterer');
  const refuser = artifact(out, 'test/Fixtures.sol', 'Refuser');

  /* every custom error the harness might see, by selector */
  const ERRORS = {};
  for (const file of Object.values(out.contracts)) {
    for (const c of Object.values(file)) {
      for (const e of c.abi.filter(x => x.type === 'error')) {
        ERRORS[sel(`${e.name}(${e.inputs.map(i => i.type).join(',')})`).toString('hex')] = e.name;
      }
    }
  }

  const vm = await VM.create({ common, blockchain });
  for (const a of [OWNER, ALICE, BOB, CAROL, DAVE, TREASURY, STRANGER]) {
    await vm.stateManager.putAccount(a, Account.fromAccountData({ balance: ETH * BigInt(100) }));
  }

  let block = at(1000);

  const deploy = async (bytecode, args = Buffer.alloc(0), caller = OWNER) => {
    const r = await vm.evm.runCall({
      caller, to: undefined, gasLimit: BigInt(300e6),
      data: Buffer.concat([Buffer.from(bytecode, 'hex'), args]), block,
    });
    if (r.execResult.exceptionError) throw new Error('deploy failed: ' + r.execResult.exceptionError);
    return r.createdAddress;
  };

  /** One call. Returns { ok, err, ret, gas, logs } — never throws on a revert,
   *  because a revert is usually the thing being asserted. */
  const send = async (to, sig, args = Buffer.alloc(0), { from = OWNER, value = 0n, gas = 300e6 } = {}) => {
    const r = await vm.evm.runCall({
      caller: from, to, gasLimit: BigInt(gas), value: BigInt(value),
      data: Buffer.concat([sel(sig), args]), block,
    });
    const e = r.execResult;
    let err = null;
    if (e.exceptionError) {
      const s = e.returnValue && e.returnValue.length >= 4 ? e.returnValue.subarray(0, 4).toString('hex') : '';
      err = ERRORS[s] || (s ? 'unknown(0x' + s + ')' : String(e.exceptionError));
    }
    return { ok: !e.exceptionError, err, ret: e.returnValue, gas: Number(e.executionGasUsed), logs: e.logs || [] };
  };

  const num = r => bufferToBigInt(r.ret.subarray(0, 32));
  const balance = async a => (await vm.stateManager.getAccount(a)).balance;
  const has = (logs, sig) => logs.some(l => l[1][0] && Buffer.from(l[1][0]).equals(topic(sig)));

  /* renderer once; a fresh ProofKeys per group so phase and reveal do not leak */
  const partsAddr = await deploy(parts.bytecode);
  const rendAddr = await deploy(rend.bytecode, addr32(partsAddr));

  const fresh = () => deploy(keys.bytecode, Buffer.concat([addr32(rendAddr), addr32(OWNER)]));

  const PUBLIC = 1500000000000000n;   // 0.0015 ether
  const ALLOW = 500000000000000n;     // 0.0005 ether

  /* ═══════════════ price ═══════════════ */
  head('harga');
  {
    const k = await fresh();
    const p = num(await send(k, 'price()'));
    const ap = num(await send(k, 'allowlistPrice()'));
    ok(p === PUBLIC, `harga publik ${Number(p) / 1e18} ETH`);
    ok(ap === ALLOW, `harga allowlist ${Number(ap) / 1e18} ETH`);
    ok(ap < p, 'allowlist lebih murah daripada publik');
    // $1-$10 at ETH between $2,000 and $6,500 — the band the owner asked for.
    ok(ap * 2000n / ETH * 1000n >= 1000n && p * 6500n / ETH <= 10n,
      'kedua harga jatuh di dalam $1-$10 untuk ETH $2,000-$6,500');

    const r = await send(k, 'setPrices(uint256,uint256)', Buffer.concat([u(7n), u(9n)]));
    ok(r.ok && has(r.logs, 'PricesSet(uint256,uint256)'), 'setPrices memancarkan PricesSet');
    ok(num(await send(k, 'price()')) === 9n && num(await send(k, 'allowlistPrice()')) === 7n,
      'setPrices menggerakkan keduanya sekaligus');
    ok((await send(k, 'setPrices(uint256,uint256)', Buffer.concat([u(1n), u(1n)]), { from: ALICE }))
      .err === 'OwnableUnauthorizedAccount', 'setPrices hanya untuk owner');
  }

  /* ═══════════════ phase gating ═══════════════ */
  head('fase');
  {
    const k = await fresh();
    ok((await send(k, 'mintPublic(uint256)', u(1), { from: ALICE, value: PUBLIC })).err === 'WrongPhase',
      'mint publik saat Closed ditolak');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, []), { from: ALICE, value: ALLOW })).err === 'WrongPhase',
      'mint allowlist saat Closed ditolak');

    await send(k, 'setPhase(uint8)', u(1));
    ok((await send(k, 'mintPublic(uint256)', u(1), { from: ALICE, value: PUBLIC })).err === 'WrongPhase',
      'mint publik saat fase Allowlist ditolak');

    await send(k, 'setPhase(uint8)', u(2));
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, []), { from: ALICE, value: ALLOW })).err === 'WrongPhase',
      'mint allowlist saat fase Public ditolak');
    ok((await send(k, 'setPhase(uint8)', u(0), { from: ALICE })).err === 'OwnableUnauthorizedAccount',
      'setPhase hanya untuk owner');
  }

  /* ═══════════════ payment and wallet limit ═══════════════ */
  head('pembayaran dan batas dompet');
  {
    const k = await fresh();
    await send(k, 'setPhase(uint8)', u(2));

    ok((await send(k, 'mintPublic(uint256)', u(2), { from: ALICE, value: PUBLIC })).err === 'BadPayment',
      'bayar kurang ditolak');
    ok((await send(k, 'mintPublic(uint256)', u(1), { from: ALICE, value: PUBLIC * 2n })).err === 'BadPayment',
      'bayar lebih juga ditolak, bukan diterima diam-diam');
    ok((await send(k, 'mintPublic(uint256)', u(0), { from: ALICE, value: 0n })).err === 'SoldOut',
      'qty nol ditolak');

    const r = await send(k, 'mintPublic(uint256)', u(3), { from: ALICE, value: PUBLIC * 3n });
    ok(r.ok && has(r.logs, 'Minted(address,uint256,uint256)'), 'tiga key tercetak, event terpancar');
    ok(num(await send(k, 'totalMinted()')) === 3n, 'totalMinted = 3');
    ok(num(await send(k, 'balanceOf(address)', addr32(ALICE))) === 3n, 'balanceOf = 3');

    ok((await send(k, 'mintPublic(uint256)', u(3), { from: ALICE, value: PUBLIC * 3n })).err === 'WalletLimit',
      '3 + 3 melewati batas 5 per dompet');
    ok((await send(k, 'mintPublic(uint256)', u(2), { from: ALICE, value: PUBLIC * 2n })).ok,
      '3 + 2 tepat di batas');
    ok((await send(k, 'mintPublic(uint256)', u(1), { from: ALICE, value: PUBLIC })).err === 'WalletLimit',
      'key keenam ditolak');
    ok((await send(k, 'mintPublic(uint256)', u(1), { from: BOB, value: PUBLIC })).ok,
      'batas dihitung per dompet, bukan global');
  }

  /* ═══════════════ allowlist ═══════════════ */
  head('whitelist');
  {
    const k = await fresh();
    const listed = [ALICE, BOB, CAROL, DAVE, TREASURY];
    const tree = merkle(listed.map(String));
    await send(k, 'setAllowlistRoot(bytes32)', b32(tree.root));
    await send(k, 'setPhase(uint8)', u(1));

    ok(Buffer.from(num(await send(k, 'allowlistRoot()')).toString(16).padStart(64, '0'), 'hex').equals(tree.root),
      'root tersimpan persis');

    const pAlice = tree.proof(String(ALICE));
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(2, pAlice), { from: ALICE, value: ALLOW * 2n })).ok,
      'alamat terdaftar dengan bukti sah bisa mint');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, pAlice), { from: ALICE, value: PUBLIC })).err === 'BadPayment',
      'harga publik ditolak di jalur allowlist — allowlist punya harganya sendiri');

    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, pAlice), { from: STRANGER, value: ALLOW })).err === 'NotAllowlisted',
      'bukti orang lain tidak memindahkan hak — leaf-nya msg.sender');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, tree.proof(String(BOB))), { from: ALICE, value: ALLOW })).err === 'NotAllowlisted',
      'bukti salah dari pohon yang sama ditolak');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, []), { from: ALICE, value: ALLOW })).err === 'NotAllowlisted',
      'bukti kosong ditolak');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])',
      withProof(1, [keccak256(Buffer.from('karangan'))]), { from: ALICE, value: ALLOW })).err === 'NotAllowlisted',
      'bukti karangan ditolak');

    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(4, pAlice), { from: ALICE, value: ALLOW * 4n })).err === 'WalletLimit',
      'batas dompet juga berlaku di allowlist');

    // A root swap must not leave the old list minting.
    const tree2 = merkle([BOB, CAROL].map(String));
    await send(k, 'setAllowlistRoot(bytes32)', b32(tree2.root));
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, pAlice), { from: ALICE, value: ALLOW })).err === 'NotAllowlisted',
      'ganti root mencabut daftar lama');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, tree2.proof(String(BOB))), { from: BOB, value: ALLOW })).ok,
      'daftar baru berlaku');
    ok((await send(k, 'setAllowlistRoot(bytes32)', b32(tree.root), { from: ALICE })).err === 'OwnableUnauthorizedAccount',
      'setAllowlistRoot hanya untuk owner');
  }

  /* ═══════════════ allowlist shapes the tool has to get right ═══════════════ */
  head('bentuk pohon allowlist');
  {
    const k = await fresh();
    await send(k, 'setPhase(uint8)', u(1));

    // One name on the list: the root is the leaf and the proof is empty. The
    // "empty proof is always wrong" reflex is wrong here, and the contract
    // has to agree with the generator about that.
    const solo = merkle([String(ALICE)]);
    ok(solo.root.equals(leafOf(String(ALICE))), 'pohon satu alamat: root adalah leaf-nya sendiri');
    await send(k, 'setAllowlistRoot(bytes32)', b32(solo.root));
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, solo.proof(String(ALICE))),
      { from: ALICE, value: ALLOW })).ok, 'daftar satu alamat: bukti kosong justru sah');
    ok((await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, []),
      { from: BOB, value: ALLOW })).err === 'NotAllowlisted', 'orang lain tetap tidak bisa masuk');

    // Odd counts are where a hand-rolled tree usually breaks: the last leaf is
    // carried up unpaired at several levels.
    const odd = [ALICE, BOB, CAROL, DAVE, TREASURY, STRANGER, acct(88)].map(String);
    const t7 = merkle(odd);
    await send(k, 'setAllowlistRoot(bytes32)', b32(t7.root));
    let allSeven = true;
    for (const a of odd) {
      const who = Address.fromString(a);
      await vm.stateManager.putAccount(who, Account.fromAccountData({ balance: ETH }));
      if (!(await send(k, 'mintAllowlist(uint256,bytes32[])', withProof(1, t7.proof(a)),
        { from: who, value: ALLOW })).ok) allSeven = false;
    }
    ok(allSeven, 'pohon ganjil (7 alamat): ketujuh buktinya diterima on-chain');

    let dup = null;
    try { merkle([String(ALICE), String(BOB), String(ALICE).toUpperCase().replace('0X', '0x')]); }
    catch (e) { dup = e.message; }
    ok(dup && dup.includes('duplicate'), 'generator menolak alamat kembar, bukan diam-diam menyatukannya');
  }

  /* ═══════════════ supply cap ═══════════════ */
  head('batas suplai');
  {
    const k = await fresh();
    ok(num(await send(k, 'seasonCap()')) === 666n, 'seasonCap mulai di 666, angka yang ditulis di situs');
    ok(num(await send(k, 'MAX_SUPPLY()')) === 1111n, 'MAX_SUPPLY tetap 1111');

    for (let i = 0; i < 6; i++) {
      const r = await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(111)]), { gas: 900e6 });
      if (!r.ok) { ok(false, 'mintReserved gagal di putaran ' + i + ': ' + r.err); break; }
    }
    ok(num(await send(k, 'totalMinted()')) === 666n, '666 tercetak lewat treasury');

    // This is the bug: before seasonCap, mintReserved measured itself against
    // MAX_SUPPLY, so the treasury could add 445 keys past the advertised number.
    ok((await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(1)]))).err === 'SoldOut',
      'treasury tidak bisa melewati seasonCap — inilah lubang 445 key itu');
    await send(k, 'setPhase(uint8)', u(2));
    ok((await send(k, 'mintPublic(uint256)', u(1), { from: STRANGER, value: PUBLIC })).err === 'SoldOut',
      'mint publik berhenti di batas yang sama');

    ok((await send(k, 'openSeason(uint256)', u(666))).err === 'BadCap', 'openSeason tidak menerima angka yang sama');
    ok((await send(k, 'openSeason(uint256)', u(600))).err === 'BadCap', 'seasonCap tidak bisa turun');
    ok((await send(k, 'openSeason(uint256)', u(1112))).err === 'BadCap', 'seasonCap tidak bisa melewati MAX_SUPPLY');
    ok((await send(k, 'openSeason(uint256)', u(1111), { from: ALICE })).err === 'OwnableUnauthorizedAccount',
      'openSeason hanya untuk owner');

    const r = await send(k, 'openSeason(uint256)', u(1111));
    ok(r.ok && has(r.logs, 'SeasonOpened(uint256)'), 'openSeason memancarkan SeasonOpened — pengenceran tidak pernah sunyi');
    ok((await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(445)]), { gas: 900e6 })).ok,
      'ekor season 2 bisa dicetak setelah batas dinaikkan');
    ok((await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(1)]))).err === 'SoldOut',
      '1111 adalah dinding terakhir');
    ok((await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(0)]))).err === 'SoldOut',
      'mintReserved qty nol ditolak');
  }

  /* ═══════════════ commit and reveal ═══════════════ */
  head('commit dan reveal');
  {
    const k = await fresh();
    const secret = keccak256(Buffer.from('rahasia musim satu'));
    const commitment = keccak256(secret);
    const ETH_BLOCK = 23500000n;                       // a mainnet block, later
    const ETH_HASH = keccak256(Buffer.from('hash blok ethereum'));

    ok((await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(0)]))).err === 'BadBlock',
      'blok Ethereum nol ditolak');
    ok((await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(ETH_BLOCK)]), { from: ALICE }))
      .err === 'OwnableUnauthorizedAccount', 'commitSeed hanya untuk owner');

    const c = await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(ETH_BLOCK)]));
    ok(c.ok && has(c.logs, 'SeedCommitted(bytes32,uint256)'), 'commitSeed memancarkan SeedCommitted');
    ok(num(await send(k, 'entropyBlock()')) === ETH_BLOCK,
      'nomor blok Ethereum terkunci di dalam komitmen, sebelum blok itu ada');
    ok((await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(ETH_BLOCK)]))).err === 'AlreadyCommitted',
      'commit kedua ditolak');

    // A commitment made wrongly can be replaced, but only before anyone mints.
    const c2 = await send(k, 'recommitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(ETH_BLOCK + 10n)]));
    ok(c2.ok && num(await send(k, 'recommitCount()')) === 1n,
      'recommit sebelum ada yang mint diperbolehkan, dan terhitung publik');

    await send(k, 'setPhase(uint8)', u(2));
    await send(k, 'mintPublic(uint256)', u(2), { from: ALICE, value: PUBLIC * 2n });
    ok((await send(k, 'recommitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(ETH_BLOCK)]))).err === 'MintingStarted',
      'setelah key pertama tercetak, recommit adalah lempar ulang dadu — dan ditolak');

    const entropyAfterMint = num(await send(k, 'mintEntropy()'));
    ok(entropyAfterMint !== 0n, 'mint mengaduk entropi, jadi tidak ada yang bisa digiling di muka');

    ok((await send(k, 'reveal(bytes32,bytes32)', Buffer.concat([b32(secret), b32(ETH_HASH)]))).err === 'WrongPhase',
      'reveal ditolak selama mint masih terbuka — kalau tidak, id Tier III bisa dipilih');
    await send(k, 'setPhase(uint8)', u(0));

    ok((await send(k, 'reveal(bytes32,bytes32)',
      Buffer.concat([b32(keccak256(Buffer.from('tebakan'))), b32(ETH_HASH)]))).err === 'BadSeed',
      'rahasia yang salah ditolak');
    ok((await send(k, 'reveal(bytes32,bytes32)', Buffer.concat([b32(secret), b32(Buffer.alloc(32))]))).err === 'BadBlock',
      'hash blok kosong ditolak — reveal tanpa bahan kedua bukan reveal');
    ok((await send(k, 'reveal(bytes32,bytes32)', Buffer.concat([b32(secret), b32(ETH_HASH)]), { from: ALICE }))
      .err === 'OwnableUnauthorizedAccount', 'reveal hanya untuk owner');

    // No window, and that is the point: on this chain there is no deadline to
    // miss, because nothing in the seed decays.
    block = at(1000 + 5000);
    const r = await send(k, 'reveal(bytes32,bytes32)', Buffer.concat([b32(secret), b32(ETH_HASH)]));
    ok(r.ok && has(r.logs, 'Revealed(bytes32,bytes32,bytes32,uint256,bytes32)'),
      'reveal berhasil ribuan blok setelah commit — tidak ada tenggat untuk terlewat');

    const entropy = Buffer.from(entropyAfterMint.toString(16).padStart(64, '0'), 'hex');
    const want = keccak256(Buffer.concat([secret, entropy, ETH_HASH]));
    const got = Buffer.from(num(await send(k, 'seed()')).toString(16).padStart(64, '0'), 'hex');
    ok(got.equals(want), 'seed = keccak(rahasia, entropi mint, hash blok Ethereum)');

    // Everything needed to recompute that line is on-chain and public.
    ok(Buffer.from(num(await send(k, 'seedSecret()')).toString(16).padStart(64, '0'), 'hex').equals(secret),
      'rahasianya diterbitkan, jadi siapa pun bisa menghitung ulang');
    ok(Buffer.from(num(await send(k, 'entropyHash()')).toString(16).padStart(64, '0'), 'hex').equals(ETH_HASH),
      'hash blok Ethereum tersimpan, jadi siapa pun bisa mencocokkannya ke node mana pun');
    ok(num(await send(k, 'entropyBlock()')) === ETH_BLOCK + 10n,
      'dan nomor bloknya, yang dikunci sebelum blok itu ada');

    ok((await send(k, 'reveal(bytes32,bytes32)', Buffer.concat([b32(secret), b32(ETH_HASH)]))).err === 'AlreadyRevealed',
      'reveal kedua ditolak');
    ok((await send(k, 'setPhase(uint8)', u(2))).err === 'AlreadyRevealed',
      'mint tidak bisa dibuka lagi setelah seed terbit');
    ok((await send(k, 'setPhase(uint8)', u(0))).ok, 'setPhase ke Closed tetap boleh setelah reveal');
    ok((await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(1)]))).err === 'AlreadyRevealed',
      'treasury pun tidak bisa mencetak setelah tier bisa dihitung');
  }

  /* ═══════════════ the same secret, a different mint ═══════════════ */
  head('entropi dari siapa yang mint');
  {
    // The whole reason the seed does not rest on this chain's blockhash: two
    // seasons with the identical committed secret and the identical Ethereum
    // block must still land on different seeds, because different people
    // minted. That is what a deployer cannot know when they commit.
    const secret = keccak256(Buffer.from('rahasia yang sama persis'));
    const commitment = keccak256(secret);
    const ETH_HASH = keccak256(Buffer.from('hash yang sama persis'));

    const run = async buyers => {
      block = at(6000);
      const k = await fresh();
      await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(commitment), u(23500000)]));
      await send(k, 'setPhase(uint8)', u(2));
      for (const [who, n] of buyers) {
        await send(k, 'mintPublic(uint256)', u(n), { from: who, value: PUBLIC * BigInt(n) });
      }
      await send(k, 'setPhase(uint8)', u(0));
      await send(k, 'reveal(bytes32,bytes32)', Buffer.concat([b32(secret), b32(ETH_HASH)]));
      return num(await send(k, 'seed()'));
    };

    const a = await run([[ALICE, 2], [BOB, 1]]);
    const b = await run([[CAROL, 2], [BOB, 1]]);
    const c = await run([[ALICE, 1], [BOB, 2]]);
    ok(a !== b, 'pembeli yang berbeda menghasilkan seed yang berbeda');
    ok(a !== c, 'urutan dan jumlah yang berbeda juga');

    const d = await run([[ALICE, 2], [BOB, 1]]);
    ok(a === d, 'dan mint yang identik menghasilkan seed yang identik — bukan acak yang tidak bisa dihitung ulang');
  }

  /* ═══════════════ tier reads, the index, and gas ═══════════════ */
  head('bestTierOf dan indeks per pemilik');
  {
    block = at(3000);
    const k = await fresh();
    await send(k, 'setPhase(uint8)', u(2));

    /* Two single-key holders, one at each end of a nearly full season. Their
       bestTierOf loops are exactly one iteration each, so any gas difference
       between them is the cost of *finding* the token — which is what the old
       implementation charged for and this one does not. */
    await send(k, 'mintPublic(uint256)', u(1), { from: CAROL, value: PUBLIC });        // 1
    await send(k, 'mintPublic(uint256)', u(5), { from: ALICE, value: PUBLIC * 5n });   // 2..6
    await send(k, 'mintPublic(uint256)', u(2), { from: BOB, value: PUBLIC * 2n });     // 7,8

    ok(num(await send(k, 'bestTierOf(address)', addr32(ALICE))) === 0n,
      'sebelum reveal bestTierOf 0 — tier belum ada untuk dibaca');
    ok((await send(k, 'tierOf(uint256)', u(1))).err === 'NotRevealed', 'tierOf sebelum reveal menolak');

    const ids = r => {
      const n = Number(bufferToBigInt(r.ret.subarray(32, 64)));
      return Array.from({ length: n }, (_, i) => Number(bufferToBigInt(r.ret.subarray(64 + i * 32, 96 + i * 32))));
    };
    ok(JSON.stringify(ids(await send(k, 'tokensOfOwner(address)', addr32(ALICE)))) === '[2,3,4,5,6]',
      'tokensOfOwner mencatat urutan cetak');
    ok(ids(await send(k, 'tokensOfOwner(address)', addr32(STRANGER))).length === 0,
      'bukan pemilik, daftar kosong');

    await send(k, 'mintReserved(address,uint256)', Buffer.concat([addr32(TREASURY), u(652)]), { gas: 900e6 });
    await send(k, 'mintPublic(uint256)', u(1), { from: DAVE, value: PUBLIC });         // 661
    await send(k, 'setPhase(uint8)', u(0));
    ok(num(await send(k, 'totalMinted()')) === 661n, 'season hampir penuh (661)');

    const secret = keccak256(Buffer.from('musim tier'));
    await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(keccak256(secret)), u(23500000)]));
    ok((await send(k, 'reveal(bytes32,bytes32)',
      Buffer.concat([b32(secret), b32(keccak256(Buffer.from('eth blok tier')))]))).ok, 'seed terbit');

    const seed = Buffer.from(num(await send(k, 'seed()')).toString(16).padStart(64, '0'), 'hex');
    const tierOfId = async id => {
      const r = await vm.evm.runCall({
        caller: OWNER, to: rendAddr, gasLimit: BigInt(300e6), block,
        data: Buffer.concat([sel('traits(uint256,bytes32)'), u(id), seed]),
      });
      return Number(bufferToBigInt(r.execResult.returnValue.subarray(0, 32)));
    };

    const aliceTiers = [];
    for (const id of [2, 3, 4, 5, 6]) aliceTiers.push(await tierOfId(id));
    const best = Math.max(...aliceTiers);
    ok(Number(num(await send(k, 'bestTierOf(address)', addr32(ALICE)))) === best,
      `bestTierOf = tier terbaik dari token miliknya sendiri (${aliceTiers.join(',')} -> ${best})`);
    ok(Number(num(await send(k, 'tierOf(uint256)', u(2)))) === aliceTiers[0], 'tierOf sepakat dengan renderer');
    ok(num(await send(k, 'bestTierOf(address)', addr32(STRANGER))) === 0n, 'bukan pemilik dapat 0');

    const gasFirst = (await send(k, 'bestTierOf(address)', addr32(CAROL))).gas;   // token #1
    const gasLast = (await send(k, 'bestTierOf(address)', addr32(DAVE))).gas;     // token #661
    ok(Math.abs(gasLast - gasFirst) < 3000,
      `posisi token di dalam season tidak lagi dibayar: #1 ${gasFirst} gas, #661 ${gasLast} gas`);
    ok(gasLast < 100000,
      `pemegang satu key di ujung season ${gasLast} gas — pemindaian lama membayar ~660 SLOAD dulu`);

    const gasFive = (await send(k, 'bestTierOf(address)', addr32(ALICE))).gas;
    ok(gasFive < 300000,
      `bestTierOf ${gasFive} gas untuk pemegang 5 key — pemindaian seluruh season sekitar 1.58M`);
    ok((await send(k, 'bestTierOf(address)', addr32(STRANGER))).gas < 30000,
      'yang tidak memegang apa pun hampir tidak membayar');

    /* transfers move the index, including from the middle */
    const xfer = 'safeTransferFrom(address,address,uint256)';
    ok((await send(k, xfer, Buffer.concat([addr32(ALICE), addr32(STRANGER), u(4)]), { from: ALICE })).ok,
      'transfer token tengah');
    ok(JSON.stringify(ids(await send(k, 'tokensOfOwner(address)', addr32(ALICE))).sort((a, b) => a - b)) === '[2,3,5,6]',
      'indeks pengirim menutup lubangnya');
    ok(JSON.stringify(ids(await send(k, 'tokensOfOwner(address)', addr32(STRANGER)))) === '[4]',
      'indeks penerima bertambah');
    ok(Number(num(await send(k, 'bestTierOf(address)', addr32(STRANGER)))) === aliceTiers[2],
      'tier ikut pindah bersama token');

    for (const id of [2, 3, 5, 6]) {
      await send(k, xfer, Buffer.concat([addr32(ALICE), addr32(DAVE), u(id)]), { from: ALICE });
    }
    ok(ids(await send(k, 'tokensOfOwner(address)', addr32(ALICE))).length === 0, 'menjual semua, daftar kosong');
    ok(num(await send(k, 'bestTierOf(address)', addr32(ALICE))) === 0n, 'menjual semua, tier kembali 0');
    const daveIds = ids(await send(k, 'tokensOfOwner(address)', addr32(DAVE)));
    ok(num(await send(k, 'balanceOf(address)', addr32(DAVE))) === BigInt(daveIds.length),
      `balanceOf sepakat dengan indeks (${daveIds.length} token)`);
    ok(JSON.stringify(daveIds.sort((a, b) => a - b)) === '[2,3,5,6,661]',
      'yang dicetak sendiri dan yang diterima duduk di daftar yang sama');
  }

  /* ═══════════════ tokenURI ═══════════════ */
  head('tokenURI');
  {
    block = at(4000);
    const k = await fresh();
    await send(k, 'setPhase(uint8)', u(2));
    await send(k, 'mintPublic(uint256)', u(1), { from: ALICE, value: PUBLIC });

    const read = async id => {
      const r = await send(k, 'tokenURI(uint256)', u(id), { gas: 900e6 });
      if (!r.ok) return { err: r.err };
      const len = Number(bufferToBigInt(r.ret.subarray(32, 64)));
      return { s: r.ret.subarray(64, 64 + len).toString() };
    };
    const sealed = await read(1);
    ok(sealed.s.includes('SEALED') && sealed.s.includes('Unrevealed'),
      'sebelum reveal token terbaca tersegel, bukan tier karangan');
    ok((await read(2)).err === 'ERC721NonexistentToken', 'token yang tidak ada menolak');

    await send(k, 'setPhase(uint8)', u(0));
    const secret = keccak256(Buffer.from('uri'));
    await send(k, 'commitSeed(bytes32,uint256)', Buffer.concat([b32(keccak256(secret)), u(23500000)]));
    await send(k, 'reveal(bytes32,bytes32)',
      Buffer.concat([b32(secret), b32(keccak256(Buffer.from('eth blok uri')))]));
    const open = await read(1);
    ok(open.s && open.s.startsWith('data:application/json;base64,') && !open.s.includes('SEALED'),
      'setelah reveal token menyerahkan artwork sungguhan');

    ok((await send(k, 'lockRenderer()')).ok, 'lockRenderer berjalan');
    ok((await send(k, 'setRenderer(address)', addr32(ALICE))).err === 'Locked',
      'renderer terkunci selamanya, termasuk dari owner');
  }

  /* ═══════════════ money out ═══════════════ */
  head('withdraw dan reentrancy');
  {
    block = at(5000);
    const k = await fresh();
    await send(k, 'setPhase(uint8)', u(2));
    await send(k, 'mintPublic(uint256)', u(4), { from: ALICE, value: PUBLIC * 4n });
    await send(k, 'mintPublic(uint256)', u(2), { from: BOB, value: PUBLIC * 2n });

    const held = (await vm.stateManager.getAccount(k)).balance;
    ok(held === PUBLIC * 6n, `kontrak memegang tepat yang dibayar (${Number(held) / 1e18} ETH)`);

    ok((await send(k, 'withdraw(address)', addr32(TREASURY), { from: ALICE })).err === 'OwnableUnauthorizedAccount',
      'withdraw hanya untuk owner');

    const refuserAddr = await deploy(refuser.bytecode);
    ok((await send(k, 'withdraw(address)', addr32(refuserAddr))).err === 'TransferFailed',
      'penerima yang menolak membuat withdraw revert, bukan menelan dana diam-diam');
    ok((await vm.stateManager.getAccount(k)).balance === held, 'saldo utuh setelah withdraw gagal');

    const before = await balance(TREASURY);
    ok((await send(k, 'withdraw(address)', addr32(TREASURY))).ok, 'withdraw berhasil');
    ok((await balance(TREASURY)) - before === held, 'seluruh saldo sampai ke tujuan');
    ok((await vm.stateManager.getAccount(k)).balance === 0n, 'kontrak kosong setelah withdraw');

    /* a receiver that mints again from inside onERC721Received */
    // Funded by the attacking call itself: putAccount would replace the account
    // and take its code with it, leaving a "successful attack" that was really
    // a transfer to an empty address.
    const atk = await deploy(reenter.bytecode, addr32(k));
    ok((await vm.stateManager.getContractCode(atk)).length > 0, 'kontrak penyerang benar-benar punya kode');
    const boom = await send(atk, 'attack(uint256)', u(PUBLIC), { from: CAROL, value: PUBLIC * 2n });
    ok(!boom.ok, `penerima yang masuk kembali ditolak (${boom.err})`);
    ok(num(await send(k, 'totalMinted()')) === 6n, 'tidak ada satu pun key ekstra tercetak dari serangan itu');
  }

  console.log(`\n${failures ? failures + ' GAGAL' : 'semua lulus'}`);
  process.exit(failures ? 1 : 0);
}

/* The attacker and the refuser live here rather than in contracts/, which holds
   only what gets deployed. */
const INLINE = {
  'test/Fixtures.sol': `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.24;

    interface IKeys { function mintPublic(uint256) external payable; }

    /// Mints one, then tries to mint again from inside the safe-transfer callback.
    contract Reenterer {
        IKeys public immutable keys;
        uint256 public price;
        bool private armed;
        constructor(address k) { keys = IKeys(k); }
        function attack(uint256 unitPrice) external payable {
            price = unitPrice;
            armed = true;
            keys.mintPublic{value: unitPrice}(1);
        }
        function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
            if (armed) { armed = false; keys.mintPublic{value: price}(1); }
            return this.onERC721Received.selector;
        }
    }

    /// Accepts nothing. Used to prove withdraw reverts instead of losing money.
    contract Refuser {
        receive() external payable { revert("no"); }
    }
  `,
};

main().catch(e => { console.error(e); process.exit(1); });

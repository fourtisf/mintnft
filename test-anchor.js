/**
 * Proves the anchor loop end to end against a real EVM: a register is built,
 * its window is anchored on-chain, and a proof produced by merkle.js verifies
 * inside ProofAnchor. Then the ways it must fail, fail.
 *
 * This is the test behind the claim "nothing can be quietly deleted". Without
 * it the hash chain only says the register agrees with itself.
 */
const solc = require('solc'), fs = require('fs'), path = require('path');
const { VM } = require('@ethereumjs/vm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { Address, keccak256 } = require('ethereumjs-util');

const word = n => Buffer.from(BigInt(n).toString(16).padStart(64, '0'), 'hex');
const hex = h => Buffer.from(h.replace(/^0x/, ''), 'hex');
const sel = sig => keccak256(Buffer.from(sig)).slice(0, 4);
const ok = (cond, msg) => {
  console.log(`  ${cond ? 'ok  ' : 'GAGAL'}  ${msg}`);
  if (!cond) process.exitCode = 1;
  return cond;
};

(async () => {
  const src = path.join(__dirname, 'contracts', 'ProofAnchor.sol');
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { 'ProofAnchor.sol': { content: fs.readFileSync(src, 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
                outputSelection: { '*': { '*': ['evm.bytecode.object'] } } },
  })));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) { errs.forEach(e => console.log(e.formattedMessage)); process.exit(1); }
  const code = out.contracts['ProofAnchor.sol'].ProofAnchor.evm.bytecode.object;

  const vm = await VM.create({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });
  const owner = Address.fromString('0x' + '11'.repeat(20));
  const stranger = Address.fromString('0x' + '22'.repeat(20));

  const dep = await vm.evm.runCall({ caller: owner, to: undefined, gasLimit: BigInt(30e6),
    data: Buffer.concat([hex(code), Buffer.from(owner.toString().slice(2).padStart(64, '0'), 'hex')]) });
  if (dep.execResult.exceptionError) throw new Error('deploy: ' + dep.execResult.exceptionError);
  const addr = dep.createdAddress;

  const send = (caller, data, gas = 30e6) =>
    vm.evm.runCall({ caller, to: addr, gasLimit: BigInt(gas), data });

  // ── a register with real records ────────────────────────────────────────
  const { FileStore } = await import('./signal-engine/store.js');
  const { buildAnchor, publishAnchor, proofFor } = await import('./signal-engine/anchor.js');
  const { verifyProof } = await import('./signal-engine/merkle.js');
  const tmp = path.join(__dirname, 'signal-engine', 'data', 'anchor-test.json');
  fs.rmSync(tmp, { force: true });
  const store = new FileStore(tmp);

  const N = 9;
  for (let i = 1; i <= N; i++) store.insertCall({
    callerId: i % 3 === 0 ? 2 : 1, chain: 'solana', tokenAddress: 'T' + i, pairAddress: 'P' + i,
    symbol: 'TK' + i, firedAt: new Date(Date.now() - (N - i) * 60000).toISOString(),
    entryPriceUsd: 0.0001, entrySupply: 2_400_000_000, entryMc: 240000,
    entrySupplySource: 'test', liquidityUsd: 70000, score: 70,
    reasonIds: ['depth'], sourceKind: 'screener', sourceRef: null,
  });

  console.log('ANCHOR ON-CHAIN\n');
  let anchorGas = 0n;
  const record = await publishAnchor(store, async a => {
    const data = Buffer.concat([sel('anchor(uint64,bytes32,bytes32)'),
      word(a.seqTo), hex(a.chainHead), hex(a.merkleRoot)]);
    const r = await send(owner, data);
    if (r.execResult.exceptionError) throw new Error(String(r.execResult.exceptionError));
    anchorGas = r.execResult.executionGasUsed;
    return 'local-evm:' + Number('0x' + r.execResult.returnValue.toString('hex'));
  }, () => {});

  ok(!!record.txHash, `window seq ${record.seqFrom}-${record.seqTo} published (${anchorGas} gas)`);

  // what the contract stored must be what we computed
  const stored = await send(owner, Buffer.concat([sel('latest()')]));
  const s = stored.execResult.returnValue;
  ok('0x' + s.slice(64, 96).toString('hex') === '0x' + record.chainHead, 'chainHead on-chain matches the local chain head');
  ok('0x' + s.slice(96, 128).toString('hex') === '0x' + record.merkleRoot, 'merkleRoot on-chain matches the local root');

  // ── every call proves against the anchor, inside the contract ───────────
  const verifyOnChain = async (leafHex, proof, id = 0) => {
    const data = Buffer.concat([sel('verify(uint256,bytes32,bytes32[])'),
      word(id), hex(leafHex), word(0x60), word(proof.length), ...proof.map(hex)]);
    const r = await send(stranger, data);
    if (r.execResult.exceptionError) throw new Error(String(r.execResult.exceptionError));
    return { ok: r.execResult.returnValue[31] === 1, gas: r.execResult.executionGasUsed };
  };

  let allProved = true, worstGas = 0n;
  for (let seq = 1; seq <= N; seq++) {
    const p = proofFor(store, seq);
    if (!p || !p.verifiesLocally) { allProved = false; break; }
    const v = await verifyOnChain(p.recordHash, p.proof);
    if (!v.ok) { allProved = false; break; }
    if (v.gas > worstGas) worstGas = v.gas;
  }
  // every verify() above was sent by `stranger`, so this also shows the audit
  // path is open to someone who does not own the contract
  ok(allProved, `all ${N} calls verify on-chain, called by a non-owner (worst ${worstGas} gas)`);

  console.log('\nYANG HARUS GAGAL, GAGAL\n');

  // a record that was never in the register
  const fake = require('crypto').createHash('sha256').update('never happened').digest('hex');
  const p1 = proofFor(store, 1);
  ok(!(await verifyOnChain(fake, p1.proof)).ok, 'a fabricated record does not verify');

  // an edited record: same call, one field changed
  const { recordHash } = await import('./signal-engine/integrity.js');
  const edited = { ...store.allCalls()[0], entryMc: 1 };
  ok(!(await verifyOnChain(recordHash(edited), p1.proof)).ok, 'an edited record does not verify against the anchor');

  // reattribution to another desk
  const moved = { ...store.allCalls()[0], callerId: 99 };
  ok(recordHash(moved) !== store.allCalls()[0].recordHash, 'moving a call to another caller changes its record hash');
  ok(!(await verifyOnChain(recordHash(moved), p1.proof)).ok, 'a reattributed call does not verify against the anchor');

  // re-anchoring a rewritten, shorter history
  const re = await send(owner, Buffer.concat([sel('anchor(uint64,bytes32,bytes32)'),
    word(record.seqTo), hex(record.chainHead), hex(record.merkleRoot)]));
  ok(!!re.execResult.exceptionError, 'anchoring at a seq already covered reverts (no quiet rewrite)');

  // a stranger cannot anchor at all
  const nf = await send(stranger, Buffer.concat([sel('anchor(uint64,bytes32,bytes32)'),
    word(999), hex(record.chainHead), hex(record.merkleRoot)]));
  ok(!!nf.execResult.exceptionError, 'a non-owner cannot anchor');

  // and the local chain still detects deletion, now with an on-chain witness
  const { verifyChain } = await import('./signal-engine/integrity.js');
  ok(!verifyChain(store.allCalls().filter(c => c.seq !== 4)).ok, 'deleting a call still breaks the local chain');

  console.log('\nVERIFIER MANDIRI\n');

  // The outsider's path: decode the anchor straight off the contract, recompute
  // the chain from the public CSV, and compare. No engine internals involved.
  const { decodeAnchor, verifyCsv } = await import('./signal-engine/verify.js');
  const { toCsv } = await import('./signal-engine/og.js');

  const onChain = decodeAnchor('0x' + (await send(stranger, sel('latest()'))).execResult.returnValue.toString('hex'));
  ok(onChain.seqTo === record.seqTo, `decoded seqTo off the real contract ABI (${onChain.seqTo})`);
  ok(onChain.chainHead === record.chainHead, 'decoded chainHead matches — the ABI layout is not an assumption');

  const csv = toCsv(store.register());
  const recomputed = verifyCsv(csv);
  ok(recomputed.ok, `public CSV recomputes cleanly (${recomputed.rows} calls)`);
  ok(recomputed.head === onChain.chainHead, 'CSV recomputed head equals the head published on-chain');

  const editedCsv = csv.replace('240000', '999999');
  ok(!verifyCsv(editedCsv).ok, 'a CSV with one number changed fails to recompute');
  const cut = csv.split('\n'); cut.splice(3, 1);
  ok(!verifyCsv(cut.join('\n')).ok, 'a CSV with one row removed fails to recompute');

  fs.rmSync(tmp, { force: true });
  console.log(`\n${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LOLOS'}`);
})();

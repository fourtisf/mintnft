/**
 * Proves the tier read reaches the real function.
 *
 * A wrong selector does not fail loudly — it reverts, ChainTierSource swallows
 * the error, and every holder silently becomes public tier. That is a bug that
 * looks exactly like "nobody has bought a key yet", so it gets its own test:
 * deploy the real ProofKeys, call it through the real ChainTierSource, and
 * separately show that a deliberately wrong selector does revert.
 */
const solc = require('solc'), fs = require('fs'), path = require('path');
const { VM } = require('@ethereumjs/vm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { Address, keccak256 } = require('ethereumjs-util');

const ok = (c, m) => { console.log(`  ${c ? 'ok   ' : 'GAGAL'}  ${m}`); if (!c) process.exitCode = 1; };

(async () => {
  const sources = {};
  for (const f of fs.readdirSync(path.join(__dirname, 'contracts')))
    sources['contracts/' + f] = { content: fs.readFileSync(path.join(__dirname, 'contracts', f), 'utf8') };
  const findImports = p => {
    const t = path.join(__dirname, 'node_modules', p);
    return fs.existsSync(t) ? { contents: fs.readFileSync(t, 'utf8') } : { error: 'nf ' + p };
  };
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
                outputSelection: { '*': { '*': ['evm.bytecode.object'] } } },
  }), { import: findImports }));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) { errs.forEach(e => console.log(e.formattedMessage)); process.exit(1); }

  const vm = await VM.create({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });
  const owner = Address.fromString('0x' + '11'.repeat(20));
  const dummyRenderer = '0x' + '22'.repeat(20);

  const code = out.contracts['contracts/ProofKeys.sol'].ProofKeys.evm.bytecode.object;
  const ctor = Buffer.concat([Buffer.from(code, 'hex'),
    Buffer.from(dummyRenderer.slice(2).padStart(64, '0'), 'hex'),
    Buffer.from(owner.toString().slice(2).padStart(64, '0'), 'hex')]);
  const dep = await vm.evm.runCall({ caller: owner, to: undefined, gasLimit: BigInt(60e6), data: ctor });
  if (dep.execResult.exceptionError) throw new Error('deploy ProofKeys: ' + dep.execResult.exceptionError);
  const keys = dep.createdAddress;

  console.log('TIER DIBACA DARI KONTRAK\n');

  // route ChainTierSource's JSON-RPC straight into the local EVM
  const rpc = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const r = await vm.evm.runCall({ caller: owner, to: keys, gasLimit: BigInt(30e6),
      data: Buffer.from(params[0].data.slice(2), 'hex') });
    return { json: async () => r.execResult.exceptionError
      ? { error: { message: String(r.execResult.exceptionError) } }
      : { result: '0x' + r.execResult.returnValue.toString('hex') } };
  };

  const { ChainTierSource, BEST_TIER_OF } = await import('./signal-engine/auth.js');
  const src = new ChainTierSource({ rpcUrl: 'local', contract: keys.toString(), fetchImpl: rpc, log: () => {} });

  ok(BEST_TIER_OF === '0x' + keccak256(Buffer.from('bestTierOf(address)')).slice(0, 4).toString('hex'),
     `selector derived from the signature (${BEST_TIER_OF})`);

  const tier = await src.bestTierOf('0x' + '33'.repeat(20));
  ok(tier === 0, 'a holder of nothing reads as tier 0 from the real contract');

  // the call must have succeeded, not merely been swallowed
  const direct = await vm.evm.runCall({ caller: owner, to: keys, gasLimit: BigInt(30e6),
    data: Buffer.concat([Buffer.from(BEST_TIER_OF.slice(2), 'hex'),
      Buffer.from('33'.repeat(20).padStart(64, '0'), 'hex')]) });
  ok(!direct.execResult.exceptionError, 'bestTierOf(address) exists on ProofKeys — the call does not revert');

  const wrong = await vm.evm.runCall({ caller: owner, to: keys, gasLimit: BigInt(30e6),
    data: Buffer.concat([Buffer.from('8fd3ab80', 'hex'),
      Buffer.from('33'.repeat(20).padStart(64, '0'), 'hex')]) });
  ok(!!wrong.execResult.exceptionError, 'a wrong selector reverts — so the 0 above is a real answer, not a fallback');

  // and a swallowed RPC failure must not promote anyone
  const broken = new ChainTierSource({ rpcUrl: 'local', contract: keys.toString(),
    fetchImpl: async () => { throw new Error('provider down'); }, log: () => {} });
  ok(await broken.bestTierOf('0x' + '33'.repeat(20)) === 0, 'a provider outage reads as public, never as a promotion');

  console.log(`\n${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LOLOS'}`);
})();

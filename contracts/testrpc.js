// A JSON-RPC node backed by @ethereumjs/vm, for testing contracts/keys.js.
//
// keys.js is the only thing here that sends a transaction, and it talks to a
// chain over HTTP. Testing it with an injected fake provider would prove the
// argument parsing and nothing else — the encoding, the nonces, the receipts
// and the constructor ordering all live in the part that would have been
// stubbed out. So this serves the real methods ethers calls, over a real
// socket, against a real EVM.
//
// It is not a chain: no mempool, no reorgs, one transaction per block, and
// blockhashes are deterministic. Everything it does answer, it answers the way
// a node does.
const http = require('node:http');
const { VM } = require('@ethereumjs/vm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { Block } = require('@ethereumjs/block');
const { TransactionFactory } = require('@ethereumjs/tx');
const { Account, Address } = require('@ethereumjs/util');
const { keccak256 } = require('ethereumjs-util');

const hex = v => '0x' + BigInt(v).toString(16);
const pad = (v, n = 32) => '0x' + BigInt(v).toString(16).padStart(n * 2, '0');
const GAS_PRICE = 1000000000n;   // 1 gwei

async function startTestRpc({ chainId = 8453, fund = [], gasLimit = 60000000n } = {}) {
  const common = Common.custom({ chainId, networkId: chainId },
    { baseChain: Chain.Mainnet, hardfork: Hardfork.Shanghai });

  // Deterministic and only ever consulted for blocks the EVM itself allows —
  // the 256-block BLOCKHASH window is enforced by the opcode, not here.
  const blockchain = {
    async getBlock(n) { return { hash: () => keccak256(Buffer.from('testrpc-' + n)) }; },
    // vm.copy() clones the blockchain too. There is no state in this one, so
    // the clone is itself.
    copy() { return this; },
    shallowCopy() { return this; },
  };
  const vm = await VM.create({ common, blockchain });

  for (const { address, balance } of fund) {
    await vm.stateManager.putAccount(Address.fromString(address),
      Account.fromAccountData({ balance: BigInt(balance) }));
  }

  let height = 1;
  const receipts = new Map();
  const blocks = new Map();
  const blockAt = n => ({
    number: hex(n), hash: '0x' + keccak256(Buffer.from('testrpc-' + n)).toString('hex'),
    parentHash: '0x' + keccak256(Buffer.from('testrpc-' + (n - 1))).toString('hex'),
    timestamp: hex(1780000000 + n * 2), gasLimit: hex(gasLimit), gasUsed: '0x0',
    miner: '0x' + '00'.repeat(20), extraData: '0x', difficulty: '0x0',
    totalDifficulty: '0x0', nonce: '0x0000000000000000', transactions: [],
    baseFeePerGas: null, uncles: [], sha3Uncles: '0x' + '00'.repeat(32),
    stateRoot: '0x' + '00'.repeat(32), size: '0x0', logsBloom: '0x' + '00'.repeat(256),
  });

  const blockFor = n => Block.fromBlockData(
    { header: { number: BigInt(n), gasLimit, timestamp: BigInt(1780000000 + n * 2) }, withdrawals: [] },
    { common });

  const account = async a => (await vm.stateManager.getAccount(Address.fromString(a)))
    ?? Account.fromAccountData({});

  /** Mines empty blocks. Used by tests to walk past a reveal delay. */
  const mine = n => { height += n; return height; };

  /** What runTx charges before the first opcode: EIP-2028 calldata, and for a
   *  deployment the create cost plus EIP-3860's per-word initcode charge. */
  const intrinsicGas = tx => {
    const data = Buffer.from(String(tx.data ?? '0x').slice(2), 'hex');
    let g = 21000n;
    for (const b of data) g += b === 0 ? 4n : 16n;
    if (!tx.to) g += 32000n + 2n * BigInt(Math.ceil(data.length / 32));
    return g;
  };

  const reverted = r => {
    const e = new Error('execution reverted');
    e.data = '0x' + (r.execResult.returnValue ?? Buffer.alloc(0)).toString('hex');
    return e;
  };

  /**
   * A read must not move the chain. vm.evm.runCall writes, so every eth_call
   * and eth_estimateGas runs inside a checkpoint that is always rolled back —
   * vm.copy() looked like the obvious way and silently dropped the funded
   * accounts, which made every estimate revert for insufficient balance.
   */
  const simulate = async tx => {
    await vm.stateManager.checkpoint();
    try {
      return await vm.evm.runCall({
        caller: Address.fromString(tx.from ?? '0x' + '00'.repeat(20)),
        to: tx.to ? Address.fromString(tx.to) : undefined,
        gasLimit, value: BigInt(tx.value ?? 0),
        data: Buffer.from(String(tx.data ?? '0x').slice(2), 'hex'),
        block: blockFor(height),
      });
    } finally {
      await vm.stateManager.revert();
    }
  };

  const methods = {
    eth_chainId: () => hex(chainId),
    net_version: () => String(chainId),
    eth_blockNumber: () => hex(height),
    eth_gasPrice: () => hex(GAS_PRICE),
    // null for a block that does not exist yet, the way a node answers. The
    // seed's second ingredient is a future Ethereum block, and "not yet" has to
    // be distinguishable from "here it is".
    eth_getBlockByNumber: ([tag]) => {
      const n = tag === 'latest' || tag === 'pending' ? height : Number(tag);
      return n > height ? null : blockAt(n);
    },
    eth_getBlockByHash: () => blockAt(height),
    eth_getBalance: async ([a]) => hex((await account(a)).balance),
    eth_getTransactionCount: async ([a]) => hex((await account(a)).nonce),
    eth_getCode: async ([a]) => '0x' + (await vm.stateManager.getContractCode(Address.fromString(a))).toString('hex'),
    eth_getTransactionReceipt: ([h]) => receipts.get(h.toLowerCase()) ?? null,

    async eth_call([tx, _tag]) {
      const r = await simulate(tx);
      if (r.execResult.exceptionError) throw reverted(r);
      return '0x' + r.execResult.returnValue.toString('hex');
    },

    async eth_estimateGas([tx]) {
      const r = await simulate(tx);
      if (r.execResult.exceptionError) throw reverted(r);
      // runCall charges for execution only; runTx also charges the intrinsic
      // cost and the calldata. Leaving that out returned an estimate that was
      // ~250K short on a 14KB deploy, and every deploy reverted out of gas
      // with the estimate reporting success.
      return hex(r.execResult.executionGasUsed + intrinsicGas(tx) + 20000n);
    },

    async eth_sendRawTransaction([raw]) {
      const tx = TransactionFactory.fromSerializedData(Buffer.from(raw.slice(2), 'hex'), { common });
      const n = ++height;
      const res = await vm.runTx({ tx, block: blockFor(n), skipBlockGasLimitValidation: true });
      const h = '0x' + Buffer.from(tx.hash()).toString('hex');
      const b = blockAt(n);
      blocks.set(n, b);
      receipts.set(h.toLowerCase(), {
        transactionHash: h, transactionIndex: '0x0',
        blockHash: b.hash, blockNumber: b.number,
        from: tx.getSenderAddress().toString(),
        to: tx.to ? tx.to.toString() : null,
        contractAddress: res.createdAddress ? res.createdAddress.toString() : null,
        gasUsed: hex(res.totalGasSpent), cumulativeGasUsed: hex(res.totalGasSpent),
        effectiveGasPrice: hex(GAS_PRICE), type: '0x' + tx.type.toString(16),
        status: res.execResult.exceptionError ? '0x0' : '0x1',
        logsBloom: '0x' + '00'.repeat(256),
        logs: (res.execResult.logs ?? []).map((l, i) => ({
          address: '0x' + Buffer.from(l[0]).toString('hex'),
          topics: l[1].map(t => '0x' + Buffer.from(t).toString('hex')),
          data: '0x' + Buffer.from(l[2]).toString('hex'),
          blockNumber: b.number, blockHash: b.hash, transactionHash: h,
          transactionIndex: '0x0', logIndex: hex(i), removed: false,
        })),
      });
      if (res.execResult.exceptionError) {
        const e = new Error('transaction reverted: '
          + (res.execResult.exceptionError.error ?? res.execResult.exceptionError));
        e.data = '0x' + (res.execResult.returnValue ?? Buffer.alloc(0)).toString('hex');
        throw e;
      }
      return h;
    },

    // Not a node method. Tests use it to walk past a reveal delay.
    test_mine: ([n]) => hex(mine(Number(n ?? 1))),
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400).end('{}'); return; }
      const one = async r => {
        const fn = methods[r.method];
        if (!fn) return { jsonrpc: '2.0', id: r.id, error: { code: -32601, message: 'unsupported: ' + r.method } };
        try {
          return { jsonrpc: '2.0', id: r.id, result: await fn(r.params ?? []) };
        } catch (e) {
          return { jsonrpc: '2.0', id: r.id,
            error: { code: 3, message: e.message, data: e.data } };
        }
      };
      const out = Array.isArray(payload) ? await Promise.all(payload.map(one)) : await one(payload);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    });
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    vm, common, mine,
    close: () => new Promise(r => server.close(r)),
  };
}

module.exports = { startTestRpc, GAS_PRICE };

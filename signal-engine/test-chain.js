/**
 * The on-chain gates, against a stubbed RPC.
 *
 * There is no key in this environment and there will not be one until the
 * owner buys it, so every assertion below is against a transport that answers
 * exactly what a Solana or EVM node answers. That proves the parsing, the
 * abstention and the vetoes. It does not prove the node says what I think it
 * says, and the file says so out loud rather than implying coverage it has
 * not got.
 *
 * The case this file exists for is the third one: a check that could not run
 * must never read as a check that passed.
 */
import { ChainInspector, chainVerdict } from "./chain.js";
import { CONFIG } from "./rules.js";

/* Fikstur di sini pool Solana, dan gate rantai defaultnya robinhood saja.
   Yang diuji berkas ini adalah gate on-chain, bukan rantai mana yang ditembak. */
const ANY = { ...CONFIG, chains: [] };
import { Engine } from "./engine.js";
import { FIXTURES } from "./fixtures.js";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

const SYS = "11111111111111111111111111111111";
const MINT = "TOKmint";

/** A node that answers from a script, and records what it was asked. */
const rpc = answers => {
  const asked = [];
  const f = async (_url, init) => {
    const { method, params } = JSON.parse(init.body);
    asked.push(method);
    const a = answers[method];
    const result = typeof a === "function" ? a(params) : a;
    if (result === "DOWN") return { ok: false, status: 503, json: async () => ({}) };
    if (result === "THROW") throw new Error("connection reset");
    return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result }) };
  };
  f.asked = asked;
  return f;
};

const mint = ({ mintAuthority = null, freezeAuthority = null, supply = "1000" }) => ({
  value: { data: { parsed: { type: "mint",
    info: { decimals: 6, supply, mintAuthority, freezeAuthority, isInitialized: true } } } },
});

const largest = holdings => ({ value: holdings.map(([address, amount]) => ({ address, amount: String(amount) })) });
const tokenAccounts = owners => ({ value: owners.map(owner => ({ data: { parsed: { type: "account", info: { owner, mint: MINT } } } })) });
const ownerAccounts = programs => ({ value: programs.map(owner => (owner ? { owner, lamports: 1 } : null)) });

const solPair = { chainId: "solana", pairAddress: "PAIR", baseToken: { address: MINT, symbol: "TEST" } };
const inspect = (fetchImpl, pair = solPair) =>
  new ChainInspector({ solanaRpc: "http://rpc.test", fetchImpl, log: () => {} }).inspect(pair);

/* ── a clean Solana token: authorities revoked, supply spread ───────────── */
console.log("\nTOKEN BERSIH");
{
  const f = rpc({
    getAccountInfo: mint({ supply: "1000" }),
    getTokenLargestAccounts: largest([["ATA_POOL", 600], ["ATA_A", 80], ["ATA_B", 60]]),
    // The pool's authority is a PDA — an account the AMM program owns, not the
    // System Program. That is the difference between a vault and a whale, and
    // it is stated by the chain rather than worked out from the balance.
    getMultipleAccounts: p => p[0][0] === "ATA_POOL"
      ? tokenAccounts(["POOL_PDA", "WALLET_A", "WALLET_B"])
      : ownerAccounts(["AmmProgram1111", SYS, SYS]),
  });
  const r = await inspect(f);
  const v = chainVerdict(r, CONFIG);
  ok(v.vetoes.length === 0, "nothing to refuse: mint and freeze revoked, no wallet oversized");
  ok(r.mintAuthority === null && r.freezeAuthority === null, "and both authorities are recorded as revoked");
  ok(Math.abs(r.topHolderPct - 0.08) < 1e-9,
     `the 60% pool vault is not a holder — largest wallet reads ${(r.topHolderPct * 100).toFixed(0)}%`);
  ok(r.holdersSampled === 2, "only the wallets are counted");
  ok(v.checked.length === 4, `four gates had something to judge (${v.checked.join(", ")})`);
  ok(!v.checked.includes("lp_burned"), "and LP burn is not one of them on Solana — it is not read here");
}

/* ── the three refusals ────────────────────────────────────────────────── */
console.log("\nYANG DITOLAK");
{
  const spread = {
    getTokenLargestAccounts: largest([["ATA_A", 80], ["ATA_B", 60]]),
    getMultipleAccounts: p => p[0][0] === "ATA_A" ? tokenAccounts(["W_A", "W_B"]) : ownerAccounts([SYS, SYS]),
  };
  const v1 = chainVerdict(await inspect(rpc({ ...spread, getAccountInfo: mint({ mintAuthority: "DevWallet9x" }) })), CONFIG);
  ok(v1.vetoIds.includes("mint_revoked"), "a live mint authority is refused");
  ok(/increased at will/.test(v1.vetoes[0]), `and says why — "${v1.vetoes[0].slice(0, 58)}…"`);

  const v2 = chainVerdict(await inspect(rpc({ ...spread, getAccountInfo: mint({ freezeAuthority: "DevWallet9x" }) })), CONFIG);
  ok(v2.vetoIds.includes("freeze_revoked"), "a live freeze authority is refused");

  const v3 = chainVerdict(await inspect(rpc({
    getAccountInfo: mint({ supply: "1000" }),
    getTokenLargestAccounts: largest([["ATA_A", 400], ["ATA_B", 60]]),
    getMultipleAccounts: p => p[0][0] === "ATA_A" ? tokenAccounts(["W_A", "W_B"]) : ownerAccounts([SYS, SYS]),
  })), CONFIG);
  ok(v3.vetoIds.includes("holder_concentration"), "one wallet on 40% of supply is refused");
  ok(v3.vetoIds.includes("holder_spread"), "and the top-ten ceiling catches it too");
}

/* ── the case this file exists for ─────────────────────────────────────── */
console.log("\nYANG TIDAK BISA DIPERIKSA");
{
  // The owner lookup comes back short. A partial answer would count a pool
  // vault as a whale, so concentration is not reported at all.
  const short = rpc({
    getAccountInfo: mint({ supply: "1000" }),
    getTokenLargestAccounts: largest([["ATA_A", 900], ["ATA_B", 60]]),
    getMultipleAccounts: p => p[0][0] === "ATA_A" ? tokenAccounts(["W_A", "W_B"]) : ownerAccounts([SYS]),
  });
  const r = await inspect(short);
  const v = chainVerdict(r, CONFIG);
  ok(!r.has("topHolderPct"), "a partial owner lookup reports no concentration at all");
  ok(!v.vetoIds.includes("holder_concentration"), "so it does not refuse a token it could not measure");
  ok(!v.checked.includes("holder_concentration"), "and does not claim the gate ran");
  ok(v.checked.includes("mint_revoked"), "what did arrive is still judged");

  const down = await inspect(rpc({ getAccountInfo: "DOWN", getTokenLargestAccounts: "DOWN" }));
  ok(down !== null && down.have.length === 0, "an RPC returning 503 establishes nothing");
  ok(chainVerdict(down, CONFIG).vetoes.length === 0, "and refuses nothing — a dead node is not evidence");

  const threw = await inspect(rpc({ getAccountInfo: "THROW" }));
  ok(threw !== null, "a transport that throws is caught, not propagated");
  ok(chainVerdict(threw, CONFIG).vetoes.length === 0, "and still refuses nothing");

  const noKey = new ChainInspector({ solanaRpc: null, rpcs: {}, log: () => {} });
  ok(noKey.configured === false, "with no RPC anywhere the inspector says so");
  ok(/^idle — nothing set in HELIUS_KEY/.test(noKey.summary()),
     `and names what it looked for: "${noKey.summary().slice(0, 44)}…"`);
  ok((await noKey.inspect(solPair)) === null, "and reads nothing");
  ok(chainVerdict(null, CONFIG).vetoes.length === 0, "a null reading is silence, not a pass and not a veto");
  ok(chainVerdict(null, CONFIG).checked.length === 0, "and claims no gate ran");
}

/* ── what the boot log says ────────────────────────────────────────────── */
console.log("\nAPA YANG DIKATAKAN LOG");
{
  // A key pasted into a systemd drop-in arrives with whitespace often enough to
  // matter, and one that keeps it builds a URL that 401s on every call — which
  // then reads as "the chain established nothing", the one outcome reserved for
  // not being able to look at all.
  const padded = new ChainInspector({ heliusKey: "  abc123  ", rpcs: {}, log: () => {} });
  ok(padded.configured, "a key with whitespace around it is still a key");
  ok(padded.solana === "https://mainnet.helius-rpc.com/?api-key=abc123",
     "and the whitespace does not reach the URL");
  ok(!padded.summary().includes("abc123"),
     `the boot line never carries the key itself — "${padded.summary()}"`);
  ok(/^armed — solana via HELIUS_KEY/.test(padded.summary()),
     "it says what is armed and which variable armed it");

  const empty = new ChainInspector({ heliusKey: "   ", rpcs: {}, log: () => {} });
  ok(!empty.configured, "a key that is only whitespace is not a key");

  // The failure this line exists for: the engine used to log only when nothing
  // was configured, so a working key produced no line, and no line cannot be
  // read out of a log that still holds the idle lines from an earlier boot.
  const both = new ChainInspector({ heliusKey: "k", rpcs: { base: "https://b.example" }, log: () => {} });
  ok(/armed/.test(both.summary()) && /base via BASE_RPC/.test(both.summary()),
     `every armed chain is named, not just the first — "${both.summary()}"`);
}

/* ── EVM: the pair address is the LP token ─────────────────────────────── */
console.log("\nLP DI EVM");
{
  const hex = n => "0x" + n.toString(16).padStart(64, "0");
  const evm = (total, dead, burn) => rpc({
    eth_call: p => {
      if (p[0].data === "0x18160ddd") return total;
      return p[0].data.endsWith("dead") ? burn : dead;
    },
  });
  const evmPair = { chainId: "base", pairAddress: "0xPAIR", baseToken: { address: "0xTOK" } };
  const look = f => new ChainInspector({ rpcs: { base: "http://rpc.test" }, fetchImpl: f, log: () => {} }).inspect(evmPair);

  const burned = await look(evm(hex(1000), hex(995), hex(0)));
  ok(Math.abs(burned.lpBurnedPct - 0.995) < 1e-9, `a burned pool reads ${(burned.lpBurnedPct * 100).toFixed(1)}%`);
  ok(chainVerdict(burned, CONFIG).vetoes.length === 0, "and is not refused");

  const held = await look(evm(hex(1000), hex(100), hex(0)));
  const hv = chainVerdict(held, CONFIG);
  ok(hv.vetoIds.includes("lp_burned"), "10% burned is refused — the pool can be pulled");
  ok(/can be pulled/.test(hv.vetoes[0]), `with the reason attached — "${hv.vetoes[0].slice(0, 50)}…"`);

  // A v3 pool has no ERC-20 LP token, so totalSupply reverts. That is not
  // "nothing is burned", and reading it that way would refuse every v3 pair.
  const v3 = await look(rpc({ eth_call: "0x" }));
  ok(!v3.has("lpBurnedPct"), "a pair with no LP token reports no burn figure");
  ok(chainVerdict(v3, CONFIG).vetoes.length === 0, "and a v3 pool is not refused for not being v2");

  const halfRead = await look(rpc({ eth_call: p => p[0].data === "0x18160ddd" ? hex(1000) : (p[0].data.endsWith("dead") ? "0x" : hex(100)) }));
  ok(!halfRead.has("lpBurnedPct"), "one burn address answering and the other not reports nothing");
}

/* ── through the engine ────────────────────────────────────────────────── */
console.log("\nLEWAT MESIN");
{
  const pair = { ...FIXTURES.fires };
  const source = { name: "test", candidates: async () => [pair] };
  const client = { latestProfiles: async () => [], latestBoosts: async () => [], topBoosts: async () => [] };

  const fired = [], rejected = [];
  const run = inspector => new Engine({
    client, source, inspector, cfg: ANY, log: () => {},
    onSignal: s => fired.push(s), onReject: (_p, ev) => rejected.push(ev),
  }).tick();

  await run({ configured: false, inspect: async () => null });
  ok(fired.length === 1, "with no RPC the engine fires exactly as it did before");
  ok(fired[0].chainChecks === null, "and the call records chainChecks: null — not checked, not clean");

  fired.length = 0; rejected.length = 0;
  const clean = rpc({
    getAccountInfo: mint({ supply: "1000" }),
    getTokenLargestAccounts: largest([["ATA_A", 80]]),
    getMultipleAccounts: p => p[0][0] === "ATA_A" ? tokenAccounts(["W_A"]) : ownerAccounts([SYS]),
  });
  await run(new ChainInspector({ solanaRpc: "http://rpc.test", fetchImpl: clean, log: () => {} }));
  ok(fired.length === 1, "a clean token still fires");
  ok(fired[0].chainChecks?.mintAuthority === null, "and the call carries what the chain said");
  ok(Array.isArray(fired[0].chainChecks?.have) && fired[0].chainChecks.have.includes("topHolderPct"),
     "including which fields were actually established");
  ok(chainVerdict(fired[0].chainChecks, CONFIG).checked.length === 4,
     "and the stored form judges the same as the live one — it survives the round trip");

  fired.length = 0; rejected.length = 0;
  const rugged = rpc({
    getAccountInfo: mint({ mintAuthority: "DevWallet9x", supply: "1000" }),
    getTokenLargestAccounts: largest([["ATA_A", 80]]),
    getMultipleAccounts: p => p[0][0] === "ATA_A" ? tokenAccounts(["W_A"]) : ownerAccounts([SYS]),
  });
  await run(new ChainInspector({ solanaRpc: "http://rpc.test", fetchImpl: rugged, log: () => {} }));
  ok(fired.length === 0, "a token whose mint is still live does not reach the register");
  ok(rejected.length === 1 && rejected[0].vetoIds.includes("mint_revoked"),
     "it is reported as a veto, so Triage shows the fact that refused it");

  // The expensive check must not run on a candidate the free rules refuse.
  let looked = 0;
  fired.length = 0; rejected.length = 0;
  await new Engine({
    client, source: { candidates: async () => [FIXTURES.thin_liquidity] },
    inspector: { configured: true, inspect: async () => { looked++; return null; } }, cfg: ANY,
    log: () => {}, onSignal: s => fired.push(s), onReject: () => {},
  }).tick();
  ok(looked === 0, "a candidate the free gates refuse costs no RPC call");
}

console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);

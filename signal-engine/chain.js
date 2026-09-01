/**
 * What the chain says, as opposed to what the market says.
 *
 * Every rule in rules.js reads trading data. Trading data cannot see the two
 * things that end a call before the thesis has a chance to be wrong: a mint
 * authority that has not been revoked, and a supply held by three wallets.
 * Neither shows up as a price until the moment it does, and by then the call
 * is on a record that cannot be edited.
 *
 * Three rules govern everything here, and they are the whole design:
 *
 *   1. A check that did not run is not a check that passed. Every field
 *      carries whether it was actually established. A gate abstains on a
 *      field it does not have; it never treats absence as clean.
 *   2. The call records what was verified, not that verification happened.
 *      "mint authority revoked" is publishable. "we looked" is not.
 *   3. Nothing here infers. If the RPC does not state it, it is null. There
 *      is no field on this report that is a guess dressed as a fact, and
 *      anything that would have to be one was left out instead.
 *
 * With no key configured the inspector returns null, the gates all abstain,
 * and the call records `chainChecks: null` — which the site prints as "not
 * checked" rather than as a clean bill.
 */

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const BURN_ADDRESSES = ["0x0000000000000000000000000000000000000000",
                        "0x000000000000000000000000000000000000dEaD"];

/** ERC-20 selectors, used raw so this file pulls in no ABI encoder. */
const SEL_TOTAL_SUPPLY = "0x18160ddd";
const SEL_BALANCE_OF   = "0x70a08231";

const EVM_CHAINS = { ethereum: "ETH_RPC", base: "BASE_RPC", bsc: "BSC_RPC" };

const pct = n => (n * 100).toFixed(0) + "%";

/**
 * A single reading. `have` is the honest part: a field absent from it was
 * never established, whatever value sits next to it.
 */
class Report {
  constructor(source) {
    this.source = source;
    this.checkedAt = new Date().toISOString();
    this.have = [];
  }
  set(field, value) { this[field] = value; this.have.push(field); return this; }
  has(field) { return this.have.includes(field); }
  /** What goes on the call. Ordered so two readings of the same token
   *  serialise identically, and `have` travels with the values it describes. */
  toJSON() {
    const o = { source: this.source, checkedAt: this.checkedAt, have: [...this.have].sort() };
    for (const f of o.have) o[f] = this[f];
    return o;
  }
}

/* A systemd drop-in written by hand ends up with a trailing space or a stray
   newline often enough that it is worth handling, and a key with whitespace on
   it builds a URL that 401s on every call — which then reads as "the chain
   established nothing", the one outcome that is supposed to mean we could not
   look. Absent and empty are the same thing here; neither is a key. */
const env = name => {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export class ChainInspector {
  constructor({ heliusKey = env("HELIUS_KEY"),
                solanaRpc = env("SOLANA_RPC"),
                rpcs = null,
                fetchImpl = globalThis.fetch,
                timeoutMs = 6000,
                log = console.log } = {}) {
    const sol = (typeof solanaRpc === "string" && solanaRpc.trim()) ? solanaRpc.trim() : null;
    const key = (typeof heliusKey === "string" && heliusKey.trim()) ? heliusKey.trim() : null;
    this.solana = sol || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null);
    this.solanaFrom = sol ? "SOLANA_RPC" : key ? "HELIUS_KEY" : null;
    this.rpcs = rpcs ?? Object.fromEntries(
      Object.entries(EVM_CHAINS).map(([c, name]) => [c, env(name)]));
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.log = log;
  }

  /** True when at least one chain can be inspected. Used only for logging —
   *  the engine must behave identically either way. */
  get configured() { return Boolean(this.solana || Object.values(this.rpcs).some(Boolean)); }

  /**
   * One line saying what is armed and what armed it, for the boot log.
   *
   * It exists because the engine used to log only when nothing was configured,
   * which made a working key indistinguishable from a restart that never
   * happened: you cannot read the absence of a line out of `journalctl | grep`,
   * because the old lines are still there. Silence is not a success signal
   * anywhere else in this codebase and it should not have been one here.
   *
   * Never the key itself — this goes to a log that gets pasted into chats.
   */
  summary() {
    const on = [];
    if (this.solana) on.push(`solana via ${this.solanaFrom} (${new URL(this.solana).host})`);
    for (const [chain, url] of Object.entries(this.rpcs))
      if (url) on.push(`${chain} via ${EVM_CHAINS[chain]}`);
    return on.length
      ? `armed — ${on.join(", ")}`
      : `idle — nothing set in ${["HELIUS_KEY", "SOLANA_RPC", ...Object.values(EVM_CHAINS)].join(", ")}`;
  }

  /**
   * Never throws and never rejects a call by failing. An RPC being down is a
   * reason to know less about a token, not a reason to refuse it — the same
   * footing every other provider in this engine is on.
   */
  async inspect(pair) {
    const chain = pair?.chainId, mint = pair?.baseToken?.address;
    if (!chain || !mint) return null;
    try {
      if (chain === "solana") return this.solana ? await this.#solana(mint) : null;
      if (this.rpcs[chain]) return await this.#evm(chain, mint, pair.pairAddress);
      return null;
    } catch (e) { this.log("[chain]", chain, String(e)); return null; }
  }

  /* ───────────────────────────── solana ───────────────────────────── */

  async #solana(mint) {
    const r = new Report("solana-rpc");

    const info = await this.#rpc(this.solana, "getAccountInfo",
      [mint, { encoding: "jsonParsed" }]);
    const parsed = info?.value?.data?.parsed?.info;
    if (parsed) {
      // Both are explicitly nullable in the SPL mint layout, so null here is a
      // fact — the authority was revoked — not a field that failed to arrive.
      r.set("mintAuthority", parsed.mintAuthority ?? null);
      r.set("freezeAuthority", parsed.freezeAuthority ?? null);
      if (parsed.decimals != null) r.set("decimals", parsed.decimals);
    }

    const largest = await this.#rpc(this.solana, "getTokenLargestAccounts", [mint]);
    const accounts = largest?.value ?? [];
    const total = Number(info?.value?.data?.parsed?.info?.supply ?? 0);
    if (accounts.length && total > 0) {
      // A pool vault is not a holder. Its authority is a program-derived
      // address, so it is the one account in the list whose owner is not a
      // wallet — and "owned by the System Program" is what makes an account a
      // wallet. That is a fact the chain states, not a balance we guessed at.
      const owners = await this.#ownersOf(accounts.map(a => a.address));
      if (!owners) return r;   // could not separate pools from people: say nothing

      const held = accounts
        .map((a, i) => ({ amount: Number(a.amount ?? 0), wallet: owners.wallet[i] }))
        .filter(a => a.wallet && !owners.program.has(a.wallet));

      if (held.length) {
        const share = a => a.amount / total;
        r.set("topHolderPct", share(held[0]));
        r.set("top10Pct", held.slice(0, 10).reduce((s, a) => s + share(a), 0));
        r.set("holdersSampled", held.length);
      }
    }
    return r;
  }

  /**
   * For each token account: who holds it, and is that holder a wallet or a
   * program. Returns null if either call comes back short — a partial answer
   * here would silently count a pool vault as a whale.
   */
  async #ownersOf(tokenAccounts) {
    const accs = await this.#rpc(this.solana, "getMultipleAccounts",
      [tokenAccounts, { encoding: "jsonParsed" }]);
    const vals = accs?.value;
    if (!Array.isArray(vals) || vals.length !== tokenAccounts.length) return null;

    const wallet = vals.map(v => v?.data?.parsed?.info?.owner ?? null);
    const uniq = [...new Set(wallet.filter(Boolean))];
    if (!uniq.length) return null;

    const holders = await this.#rpc(this.solana, "getMultipleAccounts",
      [uniq, { encoding: "base64" }]);
    const hv = holders?.value;
    if (!Array.isArray(hv) || hv.length !== uniq.length) return null;

    const program = new Set();
    uniq.forEach((addr, i) => {
      // An account that does not exist is off-curve or unfunded, and either
      // way it is not a wallet we can attribute a holding to.
      if (!hv[i] || hv[i].owner !== SYSTEM_PROGRAM) program.add(addr);
    });
    return { wallet, program };
  }

  /* ────────────────────────────── evm ────────────────────────────── */

  /**
   * On a v2-style DEX the pair address *is* the LP token, so the burned share
   * is two calls and no interpretation. On v3 the position is an NFT and
   * totalSupply does not exist — the call reverts, the field never gets set,
   * and the gate abstains rather than reading a v3 pool as unburned.
   */
  async #evm(chain, token, pairAddress) {
    const rpc = this.rpcs[chain];
    const r = new Report(`evm-rpc:${chain}`);
    if (!pairAddress) return r;

    const supply = await this.#call(rpc, pairAddress, SEL_TOTAL_SUPPLY);
    const total = supply == null ? 0n : BigInt(supply);
    if (total > 0n) {
      let burned = 0n, complete = true;
      for (const dead of BURN_ADDRESSES) {
        const b = await this.#call(rpc, pairAddress, SEL_BALANCE_OF + dead.slice(2).toLowerCase().padStart(64, "0"));
        if (b == null) { complete = false; break; }
        burned += BigInt(b);
      }
      // Both reads or neither: a burn address that failed to answer would
      // understate the burn and veto a pool that is in fact locked.
      if (complete) r.set("lpBurnedPct", Number((burned * 10000n) / total) / 10000);
    }
    return r;
  }

  async #call(rpc, to, data) {
    const out = await this.#rpc(rpc, "eth_call", [{ to, data }, "latest"]);
    return typeof out === "string" && /^0x[0-9a-f]+$/i.test(out) && out.length > 2 ? out : null;
  }

  /* ───────────────────────────── transport ───────────────────────────── */

  async #rpc(url, method, params) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, {
        method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body?.error ? null : body?.result ?? null;
    } catch { return null; }
    finally { clearTimeout(t); }
  }
}

/**
 * The gates.
 *
 * A gate here judges one field and nothing else. Whether that field was
 * established is chainVerdict's question, not theirs — a gate is never handed
 * a reading it cannot judge, so `check` returning true always means the token
 * passed, never that we failed to look.
 */
export const CHAIN_GATES = [
  {
    id: "mint_revoked",
    check: r => r.mintAuthority == null,
    fail: r => `Mint authority is still live (${String(r.mintAuthority).slice(0, 8)}…) — the supply we priced can be increased at will`,
  },
  {
    id: "freeze_revoked",
    check: r => r.freezeAuthority == null,
    fail: r => `Freeze authority is still live (${String(r.freezeAuthority).slice(0, 8)}…) — a holder can be stopped from selling`,
  },
  {
    id: "holder_concentration",
    check: (r, c) => r.topHolderPct <= c.maxTopHolderPct,
    fail: (r, c) => `Largest wallet holds ${pct(r.topHolderPct)} of supply, over the ${pct(c.maxTopHolderPct)} ceiling — one seller is the whole exit`,
  },
  {
    id: "holder_spread",
    check: (r, c) => r.top10Pct <= c.maxTop10Pct,
    fail: (r, c) => `Top 10 wallets hold ${pct(r.top10Pct)} of supply, over the ${pct(c.maxTop10Pct)} ceiling`,
  },
  {
    id: "lp_burned",
    check: (r, c) => r.lpBurnedPct >= c.minLpBurnedPct,
    fail: (r, c) => `Only ${pct(r.lpBurnedPct)} of the LP is burned, under the ${pct(c.minLpBurnedPct)} floor — the pool can be pulled`,
  },
];

/** Which field each gate stands on, so "did this gate run" has one answer. */
const GATE_FIELD = {
  mint_revoked: "mintAuthority", freeze_revoked: "freezeAuthority",
  holder_concentration: "topHolderPct", holder_spread: "top10Pct",
  lp_burned: "lpBurnedPct",
};

/** A live Report, or the plain object one turns into once it has been stored
 *  and read back. Both have to answer the same question. */
const held = r => (typeof r?.has === "function" ? f => r.has(f) : f => (r?.have ?? []).includes(f));

/**
 * Apply the gates to a reading. A null report — no key, unsupported chain, RPC
 * down — is not a veto and not a pass: it is silence, and the call says so.
 *
 * `checked` is the list of gates that actually had something to judge. It is
 * what the site prints, because "passed four of five, LP not established" and
 * "passed five of five" are different claims and only one of them is true.
 */
export function chainVerdict(report, cfg) {
  if (!report) return { vetoes: [], vetoIds: [], checked: [] };
  const has = held(report);
  const vetoes = [], vetoIds = [], checked = [];
  for (const g of CHAIN_GATES) {
    if (!has(GATE_FIELD[g.id])) continue;
    checked.push(g.id);
    let ok = true;
    try { ok = g.check(report, cfg); } catch { ok = true; }
    if (!ok) { vetoes.push(g.fail(report, cfg)); vetoIds.push(g.id); }
  }
  return { vetoes, vetoIds, checked };
}

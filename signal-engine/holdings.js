/**
 * How many keys an address holds, and what that opens.
 *
 * The tier a key draws decides *speed* — 10s, 5s, instant — and `bestTierOf`
 * returns the best tier held, so ten Tier I keys open exactly what one opens.
 * That left nobody a reason to mint a second key, which is a hole in the
 * business and not a detail: 666 keys that sell to 666 people is a different
 * number from 666 keys that sell.
 *
 * So holdings are the second axis, and they buy *features* rather than speed.
 * Deliberately: latency is zero-sum on a $25K token — several hundred holders
 * acting on one are the market, and whoever enters first sells to whoever
 * enters second. A count ladder over speed would make the one problem this
 * product already has worse. A count ladder over the reject tape, the
 * near-miss list and a gate report on demand costs no holder anything, because
 * my reading them takes nothing from yours.
 *
 * Two rules carried over from the tier read, and neither is optional:
 *
 *   Counted when it is used, never stored. A key can be sold between linking a
 *   chat and a call firing, and a stored count keeps paying the seller a level
 *   they no longer own while stranding the buyer below it. Same reason
 *   `tgbot.js` asks the chain on every send.
 *
 *   A provider that is down reads as the bottom rung, never as a promotion.
 *   An RPC timeout that silently granted Desk would be a hole anyone could
 *   open by making the node unreachable.
 */
import { keccak256 } from "ethereumjs-util";

export const PUBLIC = 0, MEMBER = 1, PREMIUM = 2, DESK = 3;

export const LEVEL_NAME = { 0: "Public", 1: "Member", 2: "Premium", 3: "Desk" };

const num = (k, d) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : d;
};

/* Keys needed for each rung. Settable because 1/3/5 is a reasoned guess and
   not a measurement — nobody knows the right numbers before anyone has minted.
   They may be raised for a later season but never lowered on a live one:
   dropping a rung after people bought to reach it sells under the holders who
   showed up first, the same reason `setPrices` refuses a falling ladder. */
export const LADDER = () => ({
  [MEMBER]: num("HOLD_MEMBER", 1),
  [PREMIUM]: num("HOLD_PREMIUM", 3),
  [DESK]: num("HOLD_DESK", 5),
});

/** The rung a count reaches. Monotonic by construction, so a misconfigured
 *  ladder cannot open Desk to someone who does not also reach Premium. */
export function levelFor(count, ladder = LADDER()) {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n >= Math.max(ladder[DESK], ladder[PREMIUM], ladder[MEMBER])) return DESK;
  if (n >= Math.max(ladder[PREMIUM], ladder[MEMBER])) return PREMIUM;
  if (n >= ladder[MEMBER]) return MEMBER;
  return PUBLIC;
}

export const TOKENS_OF_OWNER =
  "0x" + keccak256(Buffer.from("tokensOfOwner(address)")).slice(0, 4).toString("hex");

/** Always the bottom rung. Used when no contract is configured, so a desk with
 *  no collection deployed hands nobody a level it cannot verify. */
export class NoHoldings {
  get configured() { return false; }
  async countOf() { return 0; }
  async levelOf() { return PUBLIC; }
}

export class ChainHoldings {
  constructor({ rpcUrl, contract, fetchImpl = fetch, timeoutMs = 6000, log = console.log }) {
    const clean = v => (typeof v === "string" && v.trim() ? v.trim() : null);
    this.contract = clean(contract);
    this.rpcUrl = clean(rpcUrl);
    Object.assign(this, { fetchImpl, timeoutMs, log });
  }

  get configured() { return Boolean(this.contract && this.rpcUrl); }

  /**
   * `tokensOfOwner` returns a dynamic array: a head word holding the offset,
   * then the length, then the ids. The length is the count, and reading it
   * rather than `balanceOf` means one call answers both this and the token
   * list a page wants to draw.
   */
  async countOf(address) {
    if (!this.configured || typeof address !== "string") return 0;
    const data = TOKENS_OF_OWNER + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: this.contract, data }, "latest"] }),
        signal: ac.signal,
      });
      const j = await res.json();
      // A JSON-RPC error arrives as a 200 with an `error` member, so reading
      // `.result` past it turns "execution reverted" into undefined and
      // undefined into a count of zero — a failure wearing an answer's clothes.
      if (j.error || typeof j.result !== "string") throw new Error(j.error?.message ?? "bad eth_call result");
      const hex = j.result.replace(/^0x/, "");
      if (hex.length < 128) return 0;              // offset + length is the minimum
      return Number(BigInt("0x" + hex.slice(64, 128)));
    } catch (e) {
      this.log(`holdings read failed for ${address}, treating as public — ${String(e)}`);
      return 0;
    } finally {
      clearTimeout(t);
    }
  }

  async levelOf(address, ladder = LADDER()) {
    return levelFor(await this.countOf(address), ladder);
  }
}

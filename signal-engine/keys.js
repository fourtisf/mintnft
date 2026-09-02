/**
 * What the mint panel is allowed to know.
 *
 * Everything here is read from the chain on request. Nothing is cached and
 * nothing is assumed: with no contract configured the answer is "not deployed",
 * not a set of zeroes that looks like a mint which has opened and sold nothing.
 * A reader cannot tell those apart on a page, and one of them is a lie.
 *
 * Reads only. The transaction is signed in the visitor's wallet and sent from
 * their browser — this process never holds a key and never spends anything.
 */
import { readFileSync } from "node:fs";
import { keccak256 } from "ethereumjs-util";

const sel = sig => "0x" + keccak256(Buffer.from(sig)).slice(0, 4).toString("hex");

const CALL = {
  phase: sel("phase()"),
  price: sel("currentPrice()"),
  priceOne: sel("priceOne()"),
  priceTwo: sel("priceTwo()"),
  priceThree: sel("priceThree()"),
  totalMinted: sel("totalMinted()"),
  seasonCap: sel("seasonCap()"),
  maxPerWallet: sel("MAX_PER_WALLET()"),
  revealed: sel("revealed()"),
  recommitCount: sel("recommitCount()"),
};
const MINTED_BY = sel("mintedBy(address)");

/**
 * The two selectors the browser needs to build a transaction. They are derived
 * here and shipped to the page rather than written into it, because a selector
 * copied by hand is a selector that keeps matching a function that has been
 * renamed — and the failure is a wallet rejecting a transaction the visitor
 * has already agreed to pay for.
 */
export const MINT_SELECTORS = { public: sel("mintPublic(uint256)") };

const word = hexResult => BigInt(hexResult);
const addrArg = a => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

export class KeysReader {
  constructor({
    contract = process.env.KEYS_CONTRACT,
    // KEYS_RPC is the name; BASE_RPC still works because it is what is already
    // written in every .env this project has ever had.
    rpcUrl = process.env.KEYS_RPC ?? process.env.BASE_RPC,
    chainId = Number(process.env.KEYS_CHAIN_ID ?? 4663),
    explorer = process.env.KEYS_EXPLORER ?? "https://robinhoodchain.blockscout.com",
    fetchImpl = fetch,
    timeoutMs = 6000,
    log = console.log,
  } = {}) {
    const clean = v => (typeof v === "string" && v.trim() ? v.trim() : null);
    this.contract = clean(contract);
    this.rpcUrl = clean(rpcUrl);
    Object.assign(this, { chainId, explorer, fetchImpl, timeoutMs, log });
  }

  get configured() { return Boolean(this.contract && this.rpcUrl); }

  /** What the site needs before it can render anything at all. */
  identity() {
    return this.configured
      ? { configured: true, contract: this.contract, chainId: this.chainId,
          explorer: this.explorer, selectors: MINT_SELECTORS }
      : {
          configured: false,
          // Named separately because they fail differently: no address means
          // nothing is deployed, no RPC means we cannot see what is.
          why: !this.contract ? "no contract address configured" : "no RPC configured",
        };
  }

  async #call(data) {
    const res = await this.fetchImpl(this.rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: this.contract, data }, "latest"] }),
    });
    const j = await res.json();
    if (j.error || typeof j.result !== "string") throw new Error(j.error?.message ?? "bad eth_call result");
    return j.result;
  }

  /**
   * The whole mint state in one round trip's worth of calls, plus what this
   * particular address is entitled to. An RPC failure returns an error rather
   * than defaults — a mint panel that renders a dead node as "open, 0 minted"
   * invites a transaction that cannot succeed.
   */
  async state(address = null) {
    if (!this.configured) return { ...this.identity(), state: null };

    const wanted = Object.entries(CALL);
    let raw;
    try {
      const results = await Promise.all(wanted.map(([, data]) => this.#call(data)));
      raw = Object.fromEntries(wanted.map(([k], i) => [k, results[i]]));
      if (address) raw.mintedBy = await this.#call(MINTED_BY + addrArg(address));
    } catch (e) {
      this.log(`[keys] state read failed — ${String(e.message ?? e)}`);
      return { ...this.identity(), state: null, error: "chain unreachable" };
    }

    const phase = Number(word(raw.phase));
    const state = {
      phase,
      phaseName: ["closed", "one", "two", "three"][phase] ?? "unknown",
      // What a key costs right now, read from the contract rather than picked
      // by the page from a phase number it would have to keep in step.
      price: word(raw.price).toString(),
      priceOne: word(raw.priceOne).toString(),
      priceTwo: word(raw.priceTwo).toString(),
      priceThree: word(raw.priceThree).toString(),
      totalMinted: Number(word(raw.totalMinted)),
      seasonCap: Number(word(raw.seasonCap)),
      maxPerWallet: Number(word(raw.maxPerWallet)),
      revealed: word(raw.revealed) === 1n,
      // Public on-chain either way. Printing it is the difference between a
      // safeguard anyone can check and one only a reader who goes looking can.
      recommitCount: Number(word(raw.recommitCount)),
    };

    if (address) {
      state.address = address.toLowerCase();
      state.mintedBy = Number(word(raw.mintedBy));
      state.remaining = Math.max(0, state.maxPerWallet - state.mintedBy);
      Object.assign(state, this.entitlement(address, state));
    }

    return { ...this.identity(), state };
  }

  /**
   * Whether this address can mint right now, and the proof if it needs one.
   * The refusal carries its reason: "not on the list" and "you already have
   * five" are different facts, and a disabled button that says neither is the
   * kind of thing people assume is broken.
   */
  entitlement(address, state) {
    const a = address.toLowerCase();

    if (state.phase === 0) return { canMint: false, why: "minting is closed" };
    if (state.totalMinted >= state.seasonCap) return { canMint: false, why: "the season is sold out" };
    if (state.remaining === 0) return { canMint: false, why: `this wallet already holds its ${state.maxPerWallet}` };

    // Every open phase is public and flat-priced, so quantity times the price
    // is the exact cost. nextPrices stays because the page sums it either way,
    // and a schedule that varies again would not need the page changed.
    const next = Array(state.maxPerWallet).fill(state.price);
    return { canMint: true, method: "public", unitPrice: state.price, nextPrices: next };
  }
}

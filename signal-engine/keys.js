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
  price: sel("price()"),
  allowlistPrice: sel("allowlistPrice()"),
  priceLate: sel("priceLate()"),
  publicStep: sel("PUBLIC_STEP()"),
  totalMinted: sel("totalMinted()"),
  seasonCap: sel("seasonCap()"),
  maxPerWallet: sel("MAX_PER_WALLET()"),
  revealed: sel("revealed()"),
  allowlistRoot: sel("allowlistRoot()"),
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
export const MINT_SELECTORS = {
  public: sel("mintPublic(uint256)"),
  allowlist: sel("mintAllowlist(uint256,bytes32[])"),
};

const word = hexResult => BigInt(hexResult);
const addrArg = a => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/**
 * The allowlist as published. Loaded once at start: a file that changes under
 * a running process would hand out proofs for a root the contract no longer
 * carries, and the visitor would meet that as a failed transaction they paid
 * gas for.
 */
export function loadProofs(file, log = console.log) {
  if (!file) return null;
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    if (!j?.root || !j?.proofs) throw new Error("no root or proofs in the file");
    const proofs = {};
    for (const [k, v] of Object.entries(j.proofs)) proofs[k.toLowerCase()] = v;
    log(`[keys] allowlist loaded: ${Object.keys(proofs).length} addresses, root ${j.root}`);
    return { root: String(j.root).toLowerCase(), proofs };
  } catch (e) {
    // Loud, and then nothing: an allowlist we could not read must not read as
    // an allowlist nobody is on.
    log(`[keys] ALLOWLIST NOT LOADED from ${file} — ${String(e.message ?? e)}`);
    return { root: null, proofs: null, error: String(e.message ?? e) };
  }
}

/**
 * What the next few keys cost, one at a time.
 *
 * The public price steps up after PUBLIC_STEP keys, and a purchase can straddle
 * that step: buying five at 331 is two at the old price and three at the new
 * one. The contract charges exactly that, so the page has to send exactly that
 * — a single unit price multiplied by quantity would be refused by the mint it
 * was trying to pay for.
 */
export function schedule(state, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(state.totalMinted + i < state.publicStep ? state.price : state.priceLate);
  }
  return out;
}

export class KeysReader {
  constructor({
    contract = process.env.KEYS_CONTRACT,
    // KEYS_RPC is the name; BASE_RPC still works because it is what is already
    // written in every .env this project has ever had.
    rpcUrl = process.env.KEYS_RPC ?? process.env.BASE_RPC,
    chainId = Number(process.env.KEYS_CHAIN_ID ?? 4663),
    explorer = process.env.KEYS_EXPLORER ?? "https://robinhoodchain.blockscout.com",
    proofs = loadProofs(process.env.ALLOWLIST_PROOFS),
    fetchImpl = fetch,
    timeoutMs = 6000,
    log = console.log,
  } = {}) {
    const clean = v => (typeof v === "string" && v.trim() ? v.trim() : null);
    this.contract = clean(contract);
    this.rpcUrl = clean(rpcUrl);
    Object.assign(this, { chainId, explorer, proofs, fetchImpl, timeoutMs, log });
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
      phaseName: ["closed", "allowlist", "public"][phase] ?? "unknown",
      price: word(raw.price).toString(),
      allowlistPrice: word(raw.allowlistPrice).toString(),
      priceLate: word(raw.priceLate).toString(),
      publicStep: Number(word(raw.publicStep)),
      totalMinted: Number(word(raw.totalMinted)),
      seasonCap: Number(word(raw.seasonCap)),
      maxPerWallet: Number(word(raw.maxPerWallet)),
      revealed: word(raw.revealed) === 1n,
      // Public on-chain either way. Printing it is the difference between a
      // safeguard anyone can check and one only a reader who goes looking can.
      recommitCount: Number(word(raw.recommitCount)),
      allowlistRoot: "0x" + word(raw.allowlistRoot).toString(16).padStart(64, "0"),
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

    if (state.phase === 2) {
      const next = schedule(state, state.maxPerWallet);
      return { canMint: true, method: "public", unitPrice: next[0], nextPrices: next };
    }

    if (!this.proofs) return { canMint: false, why: "no allowlist has been published" };
    if (this.proofs.proofs === null) {
      // The file was there and unreadable. Saying "you are not on the list"
      // would be a claim we have no basis for.
      return { canMint: false, why: "the allowlist could not be read — this is our fault, not yours" };
    }
    if (this.proofs.root && this.proofs.root !== state.allowlistRoot.toLowerCase()) {
      return { canMint: false, why: "the published allowlist does not match the one on-chain" };
    }
    const proof = this.proofs.proofs[a];
    if (!proof) return { canMint: false, why: "this wallet is not on the allowlist" };
    return {
      canMint: true, method: "allowlist", unitPrice: state.allowlistPrice,
      nextPrices: Array(state.maxPerWallet).fill(state.allowlistPrice), proof,
    };
  }
}

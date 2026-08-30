/**
 * SIWE sign-in, and where a session's tier comes from.
 *
 * The tier is read from the chain on every issue and every refresh. The keys
 * table is a display cache and is never authoritative — a holder can sell a
 * key mid-session, and a session that outlives the key it was bought with is
 * the same latency leak as gating in the browser, just slower to notice.
 *
 * Sessions are short-lived on purpose: the JWT carries the tier, so the only
 * bound on a stale tier is how long the token lives.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPersonalMessage, ecrecover, pubToAddress, bufferToHex, fromRpcSig, keccak256 } from "ethereumjs-util";

export const SESSION_TTL_S = 300;
const NONCE_TTL_MS = 10 * 60_000;

const b64u = b => Buffer.from(b).toString("base64url");
const unb64u = s => Buffer.from(s, "base64url");

/* ─────────────────────────────── sessions ─────────────────────────────── */

export function issueSession({ address, tier }, secret, ttl = SESSION_TTL_S) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(JSON.stringify({ addr: address.toLowerCase(), tier, iat: now, exp: now + ttl }));
  const body = `${header}.${payload}`;
  return `${body}.${b64u(createHmac("sha256", secret).update(body).digest())}`;
}

/** Returns the claims, or null. A bad token is never a partial session. */
export function readSession(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const want = createHmac("sha256", secret).update(body).digest();
  const got = unb64u(parts[2]);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let claims;
  try { claims = JSON.parse(unb64u(parts[1]).toString()); } catch { return null; }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
  if (![0, 1, 2, 3].includes(claims.tier)) return null;
  return claims;
}

/* ──────────────────────────────── nonces ──────────────────────────────── */

export class NonceStore {
  #issued = new Map();
  create(now = Date.now()) {
    const n = randomBytes(16).toString("hex");
    this.#issued.set(n, now + NONCE_TTL_MS);
    for (const [k, exp] of this.#issued) if (exp <= now) this.#issued.delete(k);
    return n;
  }
  /** Single use: a replayed signature must not buy a second session. */
  consume(n, now = Date.now()) {
    const exp = this.#issued.get(n);
    if (exp === undefined || exp <= now) return false;
    this.#issued.delete(n);
    return true;
  }
}

/* ───────────────────────────────── SIWE ───────────────────────────────── */

export function siweMessage({ domain, address, uri, chainId = 8453, nonce, issuedAt = new Date().toISOString(),
                              statement = "Sign in to the Proof register." }) {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\n` +
    `URI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

export function parseSiwe(message) {
  const lines = String(message).split("\n");
  const field = name => {
    const l = lines.find(x => x.startsWith(name + ": "));
    return l ? l.slice(name.length + 2) : null;
  };
  return {
    domain: (lines[0] ?? "").replace(" wants you to sign in with your Ethereum account:", ""),
    address: lines[1] ?? null,
    uri: field("URI"), chainId: field("Chain ID"),
    nonce: field("Nonce"), issuedAt: field("Issued At"),
  };
}

export function recoverAddress(message, signature) {
  const { v, r, s } = fromRpcSig(signature);
  const pub = ecrecover(hashPersonalMessage(Buffer.from(message, "utf8")), v, r, s);
  return bufferToHex(pubToAddress(pub));
}

/**
 * Verifies the signature binds this address to a nonce we issued, for our
 * domain. Returns the address, or a reason it was refused.
 */
export function verifySiwe({ message, signature, domain, nonces, now = Date.now() }) {
  const f = parseSiwe(message);
  if (!f.address) return { ok: false, why: "no address in message" };
  if (f.domain !== domain) return { ok: false, why: "wrong domain" };
  if (!f.nonce || !nonces.consume(f.nonce, now)) return { ok: false, why: "unknown, expired or reused nonce" };

  let recovered;
  try { recovered = recoverAddress(message, signature); }
  catch { return { ok: false, why: "signature does not recover" }; }

  if (recovered.toLowerCase() !== f.address.toLowerCase())
    return { ok: false, why: "signature is not from the stated address" };
  return { ok: true, address: recovered.toLowerCase() };
}

/* ────────────────────────────── tier sources ──────────────────────────── */

/** Derived, not written down: a mistyped selector reads as "everyone is public". */
export const BEST_TIER_OF = "0x" + keccak256(Buffer.from("bestTierOf(address)")).slice(0, 4).toString("hex");

/** For tests and for running the desk before the keys are deployed. */
export class StaticTierSource {
  constructor(byAddress = {}) { this.map = byAddress; }
  async bestTierOf(address) { return this.map[address.toLowerCase()] ?? 0; }
}

/**
 * Reads ProofKeys.bestTierOf over JSON-RPC. Never cached here: the caller
 * decides how long a tier may go unchecked, and that is the session TTL.
 */
export class ChainTierSource {
  constructor({ rpcUrl, contract, fetchImpl = fetch, log = console.log }) {
    Object.assign(this, { rpcUrl, contract, fetchImpl, log });
  }
  async bestTierOf(address) {
    const data = BEST_TIER_OF + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    try {
      const res = await this.fetchImpl(this.rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: this.contract, data }, "latest"] }),
      });
      const j = await res.json();
      if (j.error || typeof j.result !== "string") throw new Error(j.error?.message ?? "bad eth_call result");
      const tier = Number(BigInt(j.result));
      return [0, 1, 2, 3].includes(tier) ? tier : 0;
    } catch (e) {
      // A provider being down must never silently promote anyone.
      this.log(`tier read failed for ${address}, treating as public — ${String(e)}`);
      return 0;
    }
  }
}

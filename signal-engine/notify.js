/**
 * Push signals out. Telegram first, because that is where the audience is.
 *
 * The alert carries the reasoning, not just a ticker. Two effects: a reader
 * can judge the call, and when it fails the receipt is already public.
 */
import { ticker } from "./og.js";   // one rule for how a symbol is displayed

const esc = s => String(s).replace(/[_*[\]()~`>#+=|{}.!-]/g, m => "\\" + m);
const usd = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
              : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`;

const SITE = "https://nekara.xyz";
const CHAIN_LABEL = { solana: "SOL", base: "BASE", ethereum: "ETH", bsc: "BNB" };
const pad4 = n => String(n ?? "").padStart(4, "0");

/** The call's own page. It carries the hash, the chart and the verdict as it
 *  moves, so every message points at the record rather than restating it. */
const callUrl = seq => `${SITE}/call/${seq}`;
const chartUrl = row => row.pairAddress
  ? `https://dexscreener.com/${row.chain}/${row.pairAddress}` : null;

/** A markdown link, or the label alone when there is nothing to link to. */
const link = (label, url) => url ? `[${esc(label)}](${url})` : esc(label);

/**
 * The contract address, labelled and whole.
 *
 * It was one unlabelled line of base58 under the reasons — the single thing a
 * reader acts on, printed as if it were a footnote. It is never shortened:
 * an address a reader has to reconstruct is an address they paste wrong, and
 * on a memecoin the wrong address is somebody else's token with the same name.
 */
const ca = address => address
  ? [`*CA* · tap to copy`, `\`${esc(address)}\``, ``]
  : [];

/**
 * What the chain said, or that nobody asked it.
 *
 * `chainChecks` is null when no RPC was configured or the read failed, and the
 * two are not the same as a clean bill. Printing nothing would let a reader
 * take silence for a pass, which is the one thing this field exists to prevent.
 */
function chainLines(sig) {
  const c = sig.chainChecks;
  if (!c) return ["*On chain*", "· not checked — no RPC was reachable when this fired"];
  const have = new Set(c.have ?? []);
  const out = [];
  if (have.has("mintAuthority"))
    out.push(c.mintAuthority ? "· mint authority still live" : "· mint authority revoked");
  if (have.has("freezeAuthority"))
    out.push(c.freezeAuthority ? "· freeze authority still live" : "· freeze authority revoked");
  if (have.has("lpBurnedPct")) out.push(`· LP burned ${esc((c.lpBurnedPct * 100).toFixed(0))}%`);
  if (have.has("topHolderPct")) out.push(`· top holder ${esc((c.topHolderPct * 100).toFixed(1))}%`);
  if (have.has("top10Pct")) out.push(`· top 10 hold ${esc((c.top10Pct * 100).toFixed(1))}%`);
  if (!out.length) return ["*On chain*", "· nothing could be established"];
  return ["*On chain*", ...out];
}

export function formatSignal(sig, seq) {
  const chain = CHAIN_LABEL[sig.chain] ?? String(sig.chain ?? "").toUpperCase();
  const vol = sig.entryVolumeH1
    ? `Volume 1h  ${usd(sig.entryVolumeH1)}` : null;
  return [
    `🟢 *SIGNAL \\#${pad4(seq)}* · ${esc(ticker(sig.symbol))}`,
    `${esc(sig.name ?? "")} · ${esc(chain)} · ${esc(sig.dex)}`,
    ``,
    ...ca(sig.tokenAddress),
    "```",
    `Entry MC   ${usd(sig.entryMc)}`,
    `Liquidity  ${usd(sig.liquidityUsd)}`,
    ...(vol ? [vol] : []),
    `Score      ${sig.score}/100`,
    "```",
    `*Why it fired*`,
    ...sig.reasons.map(r => `· ${esc(r)}`),
    ``,
    ...chainLines(sig),
    ``,
    `${link("Chart", chartUrl(sig))} · ${link("Record on nekara.xyz", callUrl(seq))}`,
  ].filter(l => l !== null).join("\n");
}

/**
 * Sent while a call is still open, when the trailing stop fills.
 *
 * This is the half of a call that nobody publishes, because it is the half you
 * can be wrong about in public. It is written as what the rule did, never as
 * what to do: the stop is walked over sampled prices with no slippage, so it is
 * an upper bound on a trailing stop and not a fill anyone is promised.
 */
/**
 * Where a call is now, against where it was called.
 *
 * The exit alert used to live here and was removed on the owner's instruction:
 * the channel carries the call and then how far it ran, and nothing else. The
 * stop is still walked and still recorded on the mark — the Hindsight table and
 * the call page both read it — it simply is not announced. Removing the message
 * did not remove the rule, and the two must not be confused later.
 *
 * Sent on milestones rather than on every poll, because the poller runs every
 * twenty seconds and a channel that says "1.04x" three times a minute is a
 * channel nobody reads by the time something actually moves.
 */
export const PROGRESS_MILESTONES = [1.5, 2, 3, 5, 10, 25, 50, 100];

/** The highest milestone a multiple has reached, or 0 for none. */
export const milestoneOf = x =>
  PROGRESS_MILESTONES.filter(m => (x ?? 0) >= m).pop() ?? 0;

export function formatProgress(row) {
  const since = row.firedAt ? (Date.now() - Date.parse(row.firedAt)) / 1000 : null;
  const held = since == null ? null
    : since < 3600 ? `${Math.round(since / 60)}m` : `${(since / 3600).toFixed(1)}h`;
  return [
    `📈 *${(row.nowX ?? 1).toFixed(2)}x* · \#${pad4(row.seq)} ${esc(ticker(row.symbol))}`,
    ``,
    "```",
    `Now      ${(row.nowX ?? 1).toFixed(2)}x`,
    `Peak     ${(row.peakX ?? 1).toFixed(2)}x`,
    ...(held ? [`Since    ${held}`] : []),
    "```",
    ...ca(row.tokenAddress),
    `${link("Chart", chartUrl(row))} · ${link("Record on nekara.xyz", callUrl(row.seq))}`,
    ``,
    `_Measured from the call, not from the low\. The record is the same either way\._`,
  ].join("\n");
}

/** Sent when a call settles — including the losses. Nobody else posts these. */
export function formatOutcome(row) {
  const win = row.verdict === "win";
  const mark = row.isDead ? "⚫" : win ? "✅" : "❌";
  const v = win ? "WIN" : "MISS";
  const dead = row.isDead ? " · DEAD" : "";
  return [
    `${mark} *${esc(v)}${esc(dead)}* · \\#${pad4(row.seq)} ${esc(ticker(row.symbol))}`,
    ``,
    "```",
    `Peak     ${row.peakX.toFixed(2)}x`,
    `Now      ${row.nowX.toFixed(2)}x`,
    row.secondsTo2x
      ? `To 2x    ${Math.round(row.secondsTo2x / 60)}m`
      : `To 2x    never`,
    "```",
    `Fired on: ${esc((row.reasons ?? [])[0] ?? "n/a")}`,
    ``,
    ...ca(row.tokenAddress),
    `${link("Record on nekara.xyz", callUrl(row.seq))}`,
    ``,
    `_Every call stays up, win or loss\\. Nothing here is ever removed\\._`,
  ].join("\n");
}

export class Telegram {
  constructor({ token, chatId, fetchImpl = globalThis.fetch, log = console.log } = {}) {
    this.token = token; this.chatId = chatId; this.fetch = fetchImpl; this.log = log;
  }
  /** Asked before a send is attempted, so an unconfigured channel is skipped
   *  once at the caller rather than logged per call on every poll. */
  get configured() { return Boolean(this.token && this.chatId); }
  async send(text) {
    if (!this.configured) { this.log("[telegram] not configured, skipping"); return false; }
    try {
      const r = await this.fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: "MarkdownV2",
                               disable_web_page_preview: true }),
      });
      if (!r.ok) { this.log("[telegram] failed", r.status); return false; }
      return true;
    } catch (e) { this.log("[telegram] error", String(e)); return false; }
  }
}

export class Webhook {
  constructor({ url, fetchImpl = globalThis.fetch } = {}) { this.url = url; this.fetch = fetchImpl; }
  async send(payload) {
    if (!this.url) return false;
    try {
      await this.fetch(this.url, { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      return true;
    } catch { return false; }
  }
}

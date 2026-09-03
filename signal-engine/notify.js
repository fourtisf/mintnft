/**
 * Push signals out. Telegram first, because that is where the audience is.
 *
 * The alert carries the reasoning, not just a ticker. Two effects: a reader
 * can judge the call, and when it fails the receipt is already public.
 */
import { ticker } from "./og.js";   // one rule for how a symbol is displayed
import { TRAIL_DROP } from "./analytics.js";
const TRAIL_DROP_PCT = TRAIL_DROP * 100;

const esc = s => String(s).replace(/[_*[\]()~`>#+=|{}.!-]/g, m => "\\" + m);
const usd = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
              : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`;

export function formatSignal(sig, seq) {
  const lines = [
    `*SIGNAL \\#${seq}* · ${esc(ticker(sig.symbol))}`,
    `${esc(sig.chain)} · ${esc(sig.dex)} · score *${sig.score}/100*`,
    ``,
    `Entry MC ${esc(usd(sig.entryMc))} · Liquidity ${esc(usd(sig.liquidityUsd))}`,
    ``,
    `*Why it fired*`,
    ...sig.reasons.map(r => `· ${esc(r)}`),
    ``,
    `\`${esc(sig.tokenAddress)}\``,
    ``,
    `_Peak is not a realized return\\. Tracked to win, miss or dead on the public register\\._`,
  ];
  return lines.join("\n");
}

/**
 * Sent while a call is still open, when the trailing stop fills.
 *
 * This is the half of a call that nobody publishes, because it is the half you
 * can be wrong about in public. It is written as what the rule did, never as
 * what to do: the stop is walked over sampled prices with no slippage, so it is
 * an upper bound on a trailing stop and not a fill anyone is promised.
 */
export function formatExit(row) {
  const held = row.exitSeconds != null
    ? (row.exitSeconds < 3600 ? `${Math.round(row.exitSeconds / 60)}m` : `${(row.exitSeconds / 3600).toFixed(1)}h`)
    : null;
  return [
    `*EXIT RULE* · \\#${row.seq} ${esc(ticker(row.symbol))}`,
    `Stop followed a high of *${(row.exitHighX ?? 1).toFixed(2)}x*, filled at *${(row.exitX ?? 1).toFixed(2)}x*`,
    held ? `${esc(held)} after the call fired` : null,
    ``,
    `\`${esc(row.tokenAddress)}\``,
    ``,
    `_A ${Math.round(TRAIL_DROP_PCT)}% trailing stop, walked over the prices this service observed\\._`,
    `_Sampled, not continuous, and without slippage \\— an upper bound, not advice\\._`,
  ].filter(Boolean).join("\n");
}

/** Sent when a call settles — including the losses. Nobody else posts these. */
export function formatOutcome(row) {
  const v = row.verdict === "win" ? "WIN" : "MISS";
  const dead = row.isDead ? " · DEAD" : "";
  return [
    `*${esc(v)}${esc(dead)}* · \\#${row.seq} ${esc(ticker(row.symbol))}`,
    `Peak *${row.peakX.toFixed(2)}x* · now ${row.nowX.toFixed(2)}x`,
    row.secondsTo2x ? `Reached 2x in ${Math.round(row.secondsTo2x / 60)}m` : `Never reached 2x`,
    ``,
    `Fired on: ${esc((row.reasons ?? [])[0] ?? "n/a")}`,
    `_Stays on the register either way\\._`,
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

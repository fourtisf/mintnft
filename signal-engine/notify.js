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
  async send(text) {
    if (!this.token || !this.chatId) { this.log("[telegram] not configured, skipping"); return false; }
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

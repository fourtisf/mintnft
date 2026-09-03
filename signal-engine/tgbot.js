/**
 * The Telegram bot, and the only place a holder's latency is actually
 * collectable.
 *
 * The channel this replaces was one hardcoded chat id with no notion of who
 * was reading it. Everything arrived at once, for everybody, which meant the
 * product sold seconds it had no way to deliver: the only tier-aware path was
 * a browser tab left open on nekara.xyz, and nobody watches a tab at 3am.
 *
 * Two rules the rest of this file exists to keep:
 *
 *   The tier is read from the chain at send time, never stored on the
 *   subscriber. A key sold between linking and firing would otherwise keep
 *   paying the seller and strand the buyer on the public leg — and the buyer
 *   would be right to call that a scam.
 *
 *   An unlinked chat is a public subscriber, not an error. `/start` alone is a
 *   working alert channel an hour behind, which is exactly what the public leg
 *   is, so the free tier and the paid ladder are one mechanism rather than two.
 *
 * Long polling rather than a webhook: it needs no public URL, no TLS
 * termination of its own and no nginx location, so the bot cannot be the
 * reason a deploy has to touch the web server.
 */
import { TIER_DELAY_S } from "./gating.js";

const API = "https://api.telegram.org";
const CODE_TTL_MS = 10 * 60_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no O/0, no I/1

export const TIER_NAME = { 3: "Tier III", 2: "Tier II", 1: "Tier I", 0: "Public" };

/** Six characters a person has to retype without mistaking O for 0. */
export function makeCode(rand = Math.random) {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

const esc = s => String(s).replace(/[_*[\]()~`>#+=|{}.!-]/g, m => "\\" + m);

/**
 * Codes live in memory on purpose. They are valid for ten minutes and a
 * restart simply means the holder asks for another one — persisting a secret
 * that expires faster than a deploy buys nothing and is one more thing to leak.
 */
export class LinkCodes {
  constructor({ ttlMs = CODE_TTL_MS, now = Date.now } = {}) {
    this.ttlMs = ttlMs; this.now = now; this.byCode = new Map();
  }
  issue(chatId, rand) {
    // One live code per chat: issuing a second must retire the first, or a code
    // read off someone's screen an hour ago still works.
    for (const [c, v] of this.byCode) if (v.chatId === chatId) this.byCode.delete(c);
    let code;
    do { code = makeCode(rand); } while (this.byCode.has(code));
    this.byCode.set(code, { chatId, expiresAt: this.now() + this.ttlMs });
    return code;
  }
  /** Single use, and gone whether or not the caller does anything with it. */
  redeem(code) {
    const key = String(code ?? "").trim().toUpperCase();
    const v = this.byCode.get(key);
    if (!v) return null;
    this.byCode.delete(key);
    return v.expiresAt >= this.now() ? v : null;
  }
  sweep() {
    const t = this.now();
    for (const [c, v] of this.byCode) if (v.expiresAt < t) this.byCode.delete(c);
  }
}

const HELP = [
  "*Nekara alerts*",
  "",
  "You are subscribed on the public leg — every call, every exit, every outcome,",
  "an hour behind the desk\\.",
  "",
  "Hold a Proof Key and link it to move up the ladder:",
  "`/link` gives you a code to paste on nekara\\.xyz",
  "",
  "`/status` what you are getting and how far behind",
  "`/unlink` go back to the public leg",
  "`/filters` chain and score filters",
  "`/stop` stop everything",
].join("\n");

export class TelegramBot {
  /**
   * @param {object} o
   * @param {string} o.token          bot token; without it the bot does not run
   * @param {object} o.store          the register store, for subscribers
   * @param {object} o.tierSource     bestTierOf, read at send time
   * @param {object} o.codes          LinkCodes
   * @param {object} o.delays         tier -> seconds, the same table ws.js uses
   */
  constructor({ token, store, tierSource, codes = new LinkCodes(), delays = TIER_DELAY_S,
                fetchImpl = globalThis.fetch, log = console.log, site = "nekara.xyz" } = {}) {
    Object.assign(this, { token, store, tierSource, codes, delays, log, site });
    this.fetch = fetchImpl;
    this.offset = 0;
    this.running = false;
    this.timers = new Set();
  }

  get configured() { return Boolean(this.token); }

  async call(method, body) {
    const r = await this.fetch(`${API}/bot${this.token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      const e = new Error(j.description ?? `telegram ${method} failed`);
      e.code = j.error_code;
      throw e;
    }
    return j.result;
  }

  /**
   * A send that fails is not all one thing. 403 is the person blocking the bot
   * — a subscriber gone, and retrying it every poll for ever is how a log
   * becomes unreadable. Anything else is left alone to be retried.
   */
  async say(chatId, text) {
    try {
      await this.call("sendMessage", { chat_id: chatId, text, parse_mode: "MarkdownV2",
                                       disable_web_page_preview: true });
      return true;
    } catch (e) {
      if (e.code === 403) {
        this.store.deactivateSubscriber?.(chatId);
        this.log(`[tg] ${chatId} blocked the bot, deactivated`);
      } else {
        this.log(`[tg] send to ${chatId} failed — ${e.message}`);
      }
      return false;
    }
  }

  /* ─────────── commands ─────────── */

  async handle(msg) {
    const chatId = msg?.chat?.id;
    const text = String(msg?.text ?? "").trim();
    if (!chatId || !text.startsWith("/")) return;
    const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
    const rest = text.slice(cmd.length).trim();

    if (cmd === "/start" || cmd === "/help") {
      await this.store.addSubscriber(chatId);
      return this.say(chatId, HELP);
    }
    if (cmd === "/stop") {
      await this.store.deactivateSubscriber(chatId);
      return this.say(chatId, "Stopped\\. Send `/start` to turn alerts back on\\.");
    }
    if (cmd === "/link") {
      await this.store.addSubscriber(chatId);
      const code = this.codes.issue(chatId);
      return this.say(chatId, [
        "*Link your key*", "",
        `Open ${esc(this.site)}, connect the wallet that holds it, and paste:`,
        "", `\`${code}\``, "",
        "The code is good for ten minutes and works once\\.",
        "Your tier is read from the chain every time a call fires, so selling the",
        "key moves the latency with it\\.",
      ].join("\n"));
    }
    if (cmd === "/unlink") {
      await this.store.unlinkSubscriber(chatId);
      return this.say(chatId, "Unlinked\\. You are on the public leg\\.");
    }
    if (cmd === "/status") return this.status(chatId);
    if (cmd === "/filters") return this.filters(chatId, rest);
    return this.say(chatId, "Unknown command\\. Send `/help`\\.");
  }

  async status(chatId) {
    const sub = await this.store.subscriber(chatId);
    if (!sub) return this.say(chatId, "Not subscribed\\. Send `/start`\\.");
    const tier = await this.tierOf(sub);
    const d = this.delays[tier] ?? this.delays[0];
    const f = sub.filters ?? {};
    const filt = [
      f.chains?.length ? `chains: ${f.chains.join(", ")}` : null,
      f.minScore ? `score ≥ ${f.minScore}` : null,
      f.maxMc ? `MC ≤ $${f.maxMc.toLocaleString("en-US")}` : null,
    ].filter(Boolean);
    return this.say(chatId, [
      `*${esc(TIER_NAME[tier])}* · ${d === 0 ? "as it fires" : esc(`${d}s behind the desk`)}`,
      sub.address ? `Linked to \`${esc(sub.address)}\`` : "No key linked — send `/link`",
      "",
      filt.length ? `Filters: ${esc(filt.join(" · "))}` : "No filters — everything the desk fires",
    ].join("\n"));
  }

  /**
   * `/filters sol,base score 70 mc 200000` — read out of whatever order it
   * arrives in, because a person typing into a chat is not filling in a form.
   * An unparseable word is refused rather than ignored: a filter that silently
   * did nothing is a subscriber wondering why they still get everything.
   */
  async filters(chatId, rest) {
    const sub = await this.store.subscriber(chatId);
    if (!sub) return this.say(chatId, "Not subscribed\\. Send `/start`\\.");
    if (!rest || rest.toLowerCase() === "off") {
      await this.store.setSubscriberFilters(chatId, {});
      return this.say(chatId, "Filters cleared\\. You get everything the desk fires\\.");
    }
    const f = {}, bad = [];
    const words = rest.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase();
      if (w === "score" || w === "mc") {
        const n = Number(String(words[++i] ?? "").replace(/[_,$]/g, ""));
        if (!Number.isFinite(n) || n <= 0) { bad.push(`${w} ${words[i] ?? ""}`.trim()); continue; }
        if (w === "score") f.minScore = n; else f.maxMc = n;
        continue;
      }
      const chains = w.split(",").map(c => CHAIN_ALIAS[c] ?? null);
      if (chains.every(Boolean)) (f.chains ??= []).push(...chains);
      else bad.push(words[i]);
    }
    if (bad.length)
      return this.say(chatId, `Could not read: ${esc(bad.join(", "))}\\.\n`
        + "Try `/filters sol,base score 70 mc 200000` or `/filters off`\\.");
    await this.store.setSubscriberFilters(chatId, f);
    return this.status(chatId);
  }

  /* ─────────── delivery ─────────── */

  /** Never cached. The whole point is that it is true at the moment of sending. */
  async tierOf(sub) {
    if (!sub.address) return 0;
    try { return await this.tierSource.bestTierOf(sub.address); }
    catch (e) {
      // A provider being down must never silently promote anyone.
      this.log(`[tg] tier read failed for ${sub.address}, treating as public — ${String(e)}`);
      return 0;
    }
  }

  static passes(sub, call) {
    const f = sub.filters ?? {};
    if (f.chains?.length && !f.chains.includes(call.chain)) return false;
    if (f.minScore && (call.score ?? 0) < f.minScore) return false;
    if (f.maxMc && (call.entryMc ?? 0) > f.maxMc) return false;
    return true;
  }

  /**
   * One call, every subscriber, each on their own clock.
   *
   * The delay is measured from fired_at rather than from now, so a restart
   * cannot re-leak: a message queued for +10s and lost to a crash is simply not
   * sent, where one queued for "ten seconds from whenever the engine came back"
   * would arrive early for everybody who had already waited.
   */
  async fanout(call, text, { filtered = true } = {}) {
    if (!this.configured) return 0;
    const subs = await this.store.subscribers();
    const fired = Date.parse(call.firedAt);
    // Everything already due is awaited together, so that when this resolves a
    // blocked subscriber has actually been deactivated rather than being on its
    // way to it — the next fanout would otherwise count them again. What is not
    // due yet stays on a timer and is nobody's to wait for.
    const now = [];
    let scheduled = 0;
    for (const sub of subs) {
      if (filtered && !TelegramBot.passes(sub, call)) continue;
      const tier = await this.tierOf(sub);
      const due = fired + (this.delays[tier] ?? this.delays[0]) * 1000 - Date.now();
      scheduled++;
      if (due <= 0) { now.push(this.say(sub.chatId, text)); continue; }
      const t = setTimeout(() => { this.timers.delete(t); this.say(sub.chatId, text); }, due);
      this.timers.add(t);
    }
    await Promise.all(now);
    return scheduled;
  }

  /* ─────────── the polling loop ─────────── */

  async poll() {
    const updates = await this.call("getUpdates", { offset: this.offset, timeout: 25, limit: 50 });
    for (const u of updates) {
      this.offset = Math.max(this.offset, u.update_id + 1);
      try { await this.handle(u.message ?? u.edited_message); }
      catch (e) { this.log(`[tg] handling update ${u.update_id} failed — ${String(e)}`); }
    }
    this.codes.sweep();
    return updates.length;
  }

  start() {
    if (!this.configured) { this.log("[tg] TG_TOKEN not set — no bot"); return this; }
    this.running = true;
    const loop = async () => {
      while (this.running) {
        try { await this.poll(); }
        catch (e) {
          this.log(`[tg] poll failed — ${String(e)}`);
          await new Promise(r => setTimeout(r, 5_000));
        }
      }
    };
    loop();
    return this;
  }

  stop() {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}

/** What a person types, and what the register calls it. */
export const CHAIN_ALIAS = {
  sol: "solana", solana: "solana",
  base: "base",
  eth: "ethereum", ethereum: "ethereum",
  bnb: "bsc", bsc: "bsc",
};

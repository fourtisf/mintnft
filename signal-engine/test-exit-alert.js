/**
 * The exit, alerted while the call is still open.
 *
 * Entry signals are a commodity. The half nobody publishes is where the rule
 * would have got out, because that is the half you can be wrong about in
 * public — which is the whole shape of this product, so it belongs here.
 *
 * Two things this proves that the Hindsight table could not:
 *
 *   The stop is walked forward over every observation, not over the series the
 *   register publishes. `samples` is decimated at 96 and thinned to 24 again
 *   before anything downstream can walk it, and an exit recomputed from 24
 *   points is a different number on the one figure a holder acted on.
 *
 *   The broadcast waits the public leg. Sending a call to Telegram the moment
 *   it fired put the free channel ahead of every paid tier — Tier I pays for
 *   ten seconds and the message was already out. A product that sells seconds
 *   cannot give them away on the side.
 */
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { start } from "./index.js";
import { applyObservation, RULES } from "./scorer.js";
import { trailExit, TRAIL_DROP } from "./analytics.js";
import { formatSignal, formatOutcome } from "./notify.js";

const DATA = "./data/exit-alert-test.json";
const PORT = 8799;

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);

const SUPPLY = 1e9, ENTRY = 0.00005;
const ENTRY_MC = ENTRY * SUPPLY;
const pair = priceUsd => ({
  chainId: "solana", dexId: "meteora", pairAddress: "FIRED",
  baseToken: { address: "TOK", symbol: "BRASS", name: "Brass Monkey" },
  priceUsd: String(priceUsd), liquidity: { usd: 60_000 },
});

let pairs = [];
const api = {
  latestProfiles: async () => [], latestBoosts: async () => [], topBoosts: async () => [],
  pairsForToken: async () => [], tokensBatch: async () => pairs,
};

/* A Telegram that records instead of sending, and reports whether it is
   configured — an unconfigured channel is skipped at the caller, so a fake that
   says it is unconfigured would silently prove nothing. */
const sent = [];
const telegram = { configured: true, send: async t => { sent.push(t); return true; } };

const newCall = (store, firedAt = new Date().toISOString()) => store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "TOK", pairAddress: "FIRED",
  symbol: "BRASS", name: "Brass Monkey", dex: "meteora", firedAt,
  entryPriceUsd: ENTRY, entrySupply: SUPPLY, entryMc: ENTRY_MC,
  entryLiquidityUsd: 60_000, score: 81, reasons: ["Volume running 5.7× the hourly pace"],
});

/* ═══════ the walk itself, with no engine around it ═══════ */
head("stop mengikuti puncak, lalu terisi");
{
  // 1x -> 4x -> 3.1x -> 2.9x. A 25% stop off a high of 4 sits at 3.0, so the
  // fill is the first sample at or below it: 2.9, not 3.0 and not 0.75 * 4.
  const call = { firedAt: new Date(0).toISOString(), entryMc: ENTRY_MC };
  let m = { peakMc: ENTRY_MC, peakAllMc: ENTRY_MC, nowMc: ENTRY_MC, nowX: 1,
            samples: 1, isDead: false, verdict: "open", state: "live" };
  // One clock across every walk: restarting it per call would date the fill
  // back to the moment the call fired and prove nothing about the elapsed time.
  let t = 0;
  const walk = xs => xs.forEach(x => { t += 60_000; m = applyObservation(call, m, ENTRY_MC * x, t); });

  walk([1, 4, 3.1]);
  ok(!m.exitAt, "3.1x setelah puncak 4x belum menyentuh stop (batasnya 3.0x)");
  ok(Math.abs(m.trailHighX - 4) < 1e-9, "puncak berjalan tercatat di 4.00x");

  walk([2.9]);
  ok(m.exitAt, "2.9x menembusnya, dan stop terisi");
  ok(Math.abs(m.exitX - 2.9) < 1e-9,
    `terisi di harga yang benar-benar teramati (${m.exitX?.toFixed(2)}x), bukan 0.75 × puncak (3.00x)`);
  ok(Math.abs(m.exitHighX - 4) < 1e-9, "dan menyimpan puncak yang diikutinya");
  ok(m.exitRule === "trail", "aturannya dinamai di baris itu sendiri");
  ok(m.exitSeconds === 240, `dan berapa lama setelah call menyala (${m.exitSeconds}s)`);

  const first = { ...m };
  walk([1.2, 6, 0.5]);
  ok(m.exitAt === first.exitAt && m.exitX === first.exitX,
    "isian berikutnya tidak menggeser yang pertama — stop yang terisi dua kali bukan stop");
  ok(m.peakX > first.peakX || m.peakAllX > first.peakAllX,
    "sementara puncaknya tetap berjalan, karena catatan dan aturan bukan hal yang sama");
}

head("yang naik terus tidak punya exit");
{
  const call = { firedAt: new Date(0).toISOString(), entryMc: ENTRY_MC };
  let m = { peakMc: ENTRY_MC, peakAllMc: ENTRY_MC, nowMc: ENTRY_MC, nowX: 1,
            samples: 1, isDead: false, verdict: "open", state: "live" };
  [1, 1.5, 2.4, 3.9, 7.2].forEach((x, i) => { m = applyObservation(call, m, ENTRY_MC * x, i * 60_000); });
  ok(!m.exitAt, "tidak ada isian yang dikarang untuk call yang belum pernah turun");
  ok(trailExit({ ...m, entryMc: ENTRY_MC, spark: [] }).x === m.nowX,
    "dan Hindsight melaporkan posisi sekarang, masih dipegang");
}

head("yang rugi dihentikan di sekitar -25%, bukan di nol");
{
  const call = { firedAt: new Date(0).toISOString(), entryMc: ENTRY_MC };
  let m = { peakMc: ENTRY_MC, peakAllMc: ENTRY_MC, nowMc: ENTRY_MC, nowX: 1,
            samples: 1, isDead: false, verdict: "open", state: "live" };
  [1, 0.9, 0.7, 0.05].forEach((x, i) => { m = applyObservation(call, m, ENTRY_MC * x, i * 60_000); });
  ok(m.exitAt && Math.abs(m.exitX - 0.7) < 1e-9,
    `berhenti di 0.70x, bukan ikut sampai 0.05x (${m.exitX?.toFixed(2)}x)`);
  ok(Math.abs(1 - TRAIL_DROP - 0.75) < 1e-9 && RULES.trailDrop === TRAIL_DROP,
    "satu angka untuk dua tempat: aturan yang memberi alert dan tabel yang menilainya");
}

head("seri yang diterbitkan tidak dipakai ulang untuk menghitung exit");
{
  // The published series is thinned to 24 points, and a spike that lived
  // between two of them is gone. The recorded live walk saw it; a re-walk here
  // cannot, so the recorded one has to win or the alert and the table disagree.
  const row = { entryMc: ENTRY_MC, nowX: 0.4, exitAt: new Date().toISOString(),
                exitX: 2.9, exitHighX: 4, spark: [ENTRY_MC, ENTRY_MC * 0.4] };
  const e = trailExit(row);
  ok(e.x === 2.9 && e.live,
    `Hindsight memakai isian yang dicatat hidup (${e.x}x), bukan menghitung ulang dari 24 titik`);
  const legacy = trailExit({ entryMc: ENTRY_MC, nowX: 0.4, spark: [ENTRY_MC, ENTRY_MC * 0.4] });
  ok(!legacy.live && legacy.simulated,
    "baris lama yang ditulis sebelum ini ada tetap dihitung dari serinya, seperti dulu");
}

/* ═══════ what the channel actually reads ═══════ */
head("pesan yang masuk ke channel");
{
  const sig = { symbol: "BRASS", name: "Brass Monkey", chain: "solana", dex: "meteora",
    score: 81, entryMc: 50_000, liquidityUsd: 62_000, entryVolumeH1: 52_000,
    tokenAddress: "TOK", pairAddress: "PAIR", reasons: ["Volume running 5.7x the hourly pace"],
    chainChecks: { have: ["mintAuthority", "lpBurnedPct"], mintAuthority: null, lpBurnedPct: 1 } };

  const m = formatSignal(sig, 7);
  ok(/#0007/.test(m), "nomor call ditulis empat digit, jadi urutannya terbaca sekilas");
  ok(/nekara\.xyz\/call\/7/.test(m), "setiap pesan menunjuk ke halaman call-nya sendiri");
  ok(/dexscreener\.com\/solana\/PAIR/.test(m), "dan ke chart pair yang benar-benar dipakai call itu");
  ok(/mint authority revoked/.test(m) && /LP burned 100%/.test(m),
    "apa yang chain bilang ikut, bukan cuma skor");

  /* The one that matters: a chain nobody could read must never look like a
     clean bill. Silence is what a reader takes for a pass. */
  const unread = formatSignal({ ...sig, chainChecks: null }, 8);
  ok(/not checked/.test(unread),
    "RPC yang tidak terbaca dicetak sebagai tidak diperiksa, bukan dihilangkan diam-diam");
  ok(!/revoked|burned/.test(unread), "dan tidak ada satu pun gate yang terbaca lulus");

  const empty = formatSignal({ ...sig, chainChecks: { have: [] } }, 9);
  ok(/nothing could be established/.test(empty),
    "laporan yang datang kosong juga bilang begitu, bukan diam");

  const loss = formatOutcome({ seq: 12, symbol: "FINE", verdict: "miss", isDead: true,
    peakX: 1.12, nowX: 0.06, secondsTo2x: null, reasons: ["Volume"] });
  ok(/MISS/.test(loss) && /DEAD/.test(loss), "yang kalah diumumkan dengan kata yang sama jelasnya");
  ok(/ever removed/.test(loss), "dan pesannya sendiri mengatakan itu tidak akan dihapus");
}

/* ═══════ through the engine, which is where the alert comes from ═══════ */
head("alert keluar sekali, dan membawa angkanya");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const call = newCall(store);
  const eng = start({ store, api, port: PORT, log: () => {}, telegram, publicDelayS: 0 });

  sent.length = 0;
  pairs = [pair(ENTRY * 4)];
  await eng.refresh(store.liveCalls());
  ok(!sent.some(t => /EXIT RULE/.test(t)), "naik ke 4x saja tidak mengirim apa pun");

  pairs = [pair(ENTRY * 2.9)];
  await eng.refresh(store.liveCalls());
  const exit = sent.filter(t => /EXIT RULE/.test(t));
  ok(exit.length === 1, `satu pesan exit terkirim (${exit.length})`);
  ok(/3\.00x/.test(exit[0] ?? "") || /4\.00x/.test(exit[0] ?? ""),
    "pesannya menyebut puncak yang diikuti stop");
  ok(/2\.90x/.test(exit[0] ?? ""), "dan harga isiannya");
  ok(/upper bound, not advice/.test(exit[0] ?? ""),
    "dengan batasnya sendiri di dalam pesan — sampel, tanpa slippage, bukan nasihat");

  pairs = [pair(ENTRY * 2.5)];
  await eng.refresh(store.liveCalls());
  ok(sent.filter(t => /EXIT RULE/.test(t)).length === 1,
    "poll berikutnya tidak mengirim ulang");

  ok(store.mark(call.seq).exitX === 2.9, "dan isiannya tersimpan di mark, bukan hanya dikirim");
  eng.stop();
}

head("saluran publik menunggu jatahnya");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  // Fired now, so the public leg has not opened yet at a 3600s delay.
  newCall(store);
  const eng = start({ store, api, port: PORT + 1, log: () => {}, telegram, publicDelayS: 3600 });

  sent.length = 0;
  pairs = [pair(ENTRY * 4)];
  await eng.refresh(store.liveCalls());
  pairs = [pair(ENTRY * 2.9)];
  await eng.refresh(store.liveCalls());
  ok(sent.length === 0,
    "tidak ada yang keluar ke channel selama jendela publik belum terbuka");
  ok(store.mark(1).exitAt,
    "walaupun stop-nya sudah terisi — yang ditahan adalah siarannya, bukan aturannya");
  eng.stop();
}

head("call yang jendelanya sudah lewat disiarkan langsung");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  newCall(store, new Date(Date.now() - 2 * 3600e3).toISOString());
  const eng = start({ store, api, port: PORT + 2, log: () => {}, telegram, publicDelayS: 3600 });

  sent.length = 0;
  pairs = [pair(ENTRY * 4)];
  await eng.refresh(store.liveCalls());
  pairs = [pair(ENTRY * 2.9)];
  await eng.refresh(store.liveCalls());
  ok(sent.some(t => /EXIT RULE/.test(t)),
    "call dua jam lalu sudah lewat jatah publiknya, jadi exit-nya langsung keluar");
  eng.stop();
}

rmSync(DATA, { force: true });
console.log(`\n${failures ? failures + " GAGAL" : "semua lolos"}`);
process.exit(failures ? 1 : 0);

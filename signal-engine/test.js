import { evaluate, toSignal, CONFIG, GATES, SIGNALS } from "./rules.js";
import { FIXTURES } from "./fixtures.js";

const pad = (s, n) => String(s).padEnd(n);
const MAX = SIGNALS.reduce((a, s) => a + s.max, 0);
console.log("UJI ATURAN SINYAL");
console.log(`${GATES.length} gate · skor maks ${MAX} · ambang ${CONFIG.scoreToFire} (${(CONFIG.scoreToFire / MAX * 100).toFixed(0)}% dari maks)\n`);
console.log(pad("kasus", 16) + pad("hasil", 9) + pad("skor", 6) + "alasan / veto");
console.log("-".repeat(96));

let fired = 0, blocked = 0;
for (const [name, pair] of Object.entries(FIXTURES)) {
  const ev = evaluate(pair, CONFIG, new Map());
  const verdict = ev.vetoes.length ? "VETO" : ev.fire ? "FIRE" : "lemah";
  if (ev.fire) fired++; else blocked++;
  const detail = ev.vetoes.length ? ev.vetoes[0]
    : ev.reasons.length ? ev.reasons[0].why : "tidak ada bukti";
  console.log(pad(name, 16) + pad(verdict, 9) + pad(ev.score, 6) + detail.slice(0, 62));
}
console.log("-".repeat(96));
console.log(`${fired} lolos, ${blocked} ditahan\n`);

const ev = evaluate(FIXTURES.strong, CONFIG, new Map());
const sig = toSignal(FIXTURES.strong, ev);
console.log(`Contoh sinyal penuh — $${sig.symbol}, skor ${sig.score}/${MAX}:`);
sig.reasons.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

// $APEC, apa adanya dari register: satu-satunya alasan gate jam itu ada.
// Ditampilkan dua arah, karena gate yang belum pernah terlihat meloloskan
// sesuatu tidak bisa diperdebatkan siapa pun.
const OLD = { ...CONFIG, maxHourPumpPct: Infinity, steadyHourCapPct: Infinity };
const beforeFix = evaluate(FIXTURES.hour_already_ran, OLD, new Map());
const afterFix = evaluate(FIXTURES.hour_already_ran, CONFIG, new Map());
const climb = beforeFix.reasons.find(r => r.id === "steady_climb");
console.log(`\n$APEC — +4.5% pada 5m, +126% pada jam terakhir:`);
console.log(`  aturan lama : ${beforeFix.fire ? "TEMBAK" : "ditahan"} pada skor ${beforeFix.score}` +
  `${climb ? ` — "steady_climb" menyumbang ${climb.pts} poin, maksimum` : ""}`);
console.log(`  aturan baru : ${afterFix.vetoes[0] ?? (afterFix.fire ? "TEMBAK" : "skor " + afterFix.score)}`);
const gateOk = beforeFix.fire && !afterFix.fire && afterFix.vetoIds?.includes("not_vertical");
console.log(`  ${gateOk ? "ok   " : "GAGAL"}  lolos di aturan lama, ditahan gate jam di aturan baru`);
if (!gateOk) process.exitCode = 1;

/* Rantai. Situs, banner dan CLAUDE.md semuanya menyebut empat rantai, sementara
   discovery mengembalikan rantai apa pun yang timnya mengisi profil — dan
   sebelum gate ini tidak ada satu baris pun di jalur ini yang membaca chainId.
   Call sungguhan pertama menyala di robinhood. Jadi ini diuji dua arah: yang
   di luar daftar ditolak dengan alasan rantainya, dan daftar kosong benar-benar
   berarti tanpa batas — bukan berarti tanpa satu pun. */
const chainCase = (chainId, chains) => {
  const pair = { ...FIXTURES.strong, chainId };
  return evaluate(pair, { ...CONFIG, chains }, new Map());
};
const FOUR = ["solana", "base", "bsc", "ethereum"];
const chainChecks = [
  ["solana lolos", chainCase("solana", FOUR).fire === true],
  ["base lolos", chainCase("base", FOUR).fire === true],
  ["bsc lolos", chainCase("bsc", FOUR).fire === true],
  ["ethereum lolos", chainCase("ethereum", FOUR).fire === true],
  ["robinhood ditahan", chainCase("robinhood", FOUR).vetoIds?.includes("tracked_chain") === true],
  ["sui ditahan", chainCase("sui", FOUR).vetoIds?.includes("tracked_chain") === true],
  ["alasannya menyebut rantainya", /On sui, which this desk does not track/.test(chainCase("sui", FOUR).vetoes[0] ?? "")],
  ["rantai tanpa nama ditahan", chainCase(undefined, FOUR).vetoIds?.includes("tracked_chain") === true],
  ["daftar kosong = tanpa batas", chainCase("sui", []).fire === true],
  ["ditolak sebelum gate lain menilainya", chainCase("sui", FOUR).vetoIds[0] === "tracked_chain"],
  // Defaultnya semua rantai, dan itu keputusan pemilik. Diuji di sini supaya
  // sebuah daftar yang menyelinap masuk sebagai default terlihat, bukan
  // ditemukan lewat call yang tidak pernah menyala.
  ["default: tanpa batas", CONFIG.chains.length === 0],
];
console.log(`\nrantai — gate diuji dengan ${FOUR.join(", ")}:`);
for (const [label, ok] of chainChecks) {
  console.log(`  ${ok ? "ok   " : "GAGAL"}  ${label}`);
  if (!ok) process.exitCode = 1;
}

// pengecekan waras: cooldown benar-benar menahan sinyal kedua
const seen = new Map();
evaluate(FIXTURES.strong, CONFIG, seen);
seen.set(`${FIXTURES.strong.chainId}:${FIXTURES.strong.baseToken.address}`, Date.now());
const again = evaluate(FIXTURES.strong, CONFIG, seen);
console.log(`\ncooldown 24 jam: ${again.fire ? "GAGAL - masih menembak" : "ok - sinyal kedua ditahan"}`);

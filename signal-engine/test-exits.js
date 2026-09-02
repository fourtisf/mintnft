/**
 * What an exit rule would actually have returned.
 *
 * This had no test at all, which is how "Trail peak -25%" came to report +426%
 * on a register that lost money under every other rule. The old rule returned
 * three quarters of the highest value ever seen, on every call, whether or not
 * the price ever passed through that level — on the page whose own subtitle
 * says peak is a ceiling nobody sold at.
 *
 * The case this file exists for is the first one below: a token that ran to 8x
 * and collapsed between two polls. The number a reader is shown has to be a
 * price somebody could have got, not a discount off a high nobody sold at.
 */
import { exitMultiple, trailExit, realised, exitSimulation, ROUND_TRIP_COST } from "./analytics.js";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);

const call = (spark, nowX, peakX, seq = 1) => ({
  seq, entryMc: 1000, spark, nowX, peakX, state: "settled",
  firedAt: new Date(Date.UTC(2026, 7, seq, 12)).toISOString(),
});

/* ═══════════════ the caps ═══════════════ */
head("aturan bertakik");
{
  const ran = call([1000, 3000, 9000, 500], 0.5, 9);
  ok(exitMultiple(ran, "2x") === 2, "2x membukukan tepat 2x untuk yang pernah menyentuhnya");
  ok(exitMultiple(ran, "1.5x") === 1.5, "1.5x membukukan tepat 1.5x");
  ok(exitMultiple(ran, "hold") === 0.5, "hold membukukan di mana ia berakhir");

  const flat = call([1000, 1100, 900], 0.9, 1.1);
  ok(exitMultiple(flat, "2x") === 0.9, "yang tidak pernah 2x tidak dibukukan 2x — ia dipegang sampai selesai");
}

/* ═══════════════ the one this file is for ═══════════════ */
head("trailing stop di atas harga yang teramati");
{
  // 1x -> 8x -> 1.2x -> 0.12x. The old rule paid 8 * 0.75 = 6x on this.
  const spike = call([1000, 2000, 5000, 8000, 1200, 120], 0.12, 8);
  const t = trailExit(spike);
  ok(t.simulated === true, "seri harganya ada, jadi keluarnya disimulasikan");
  ok(t.x === 1.2, `keluar di 1.2x — harga berikutnya yang benar-benar terlihat (bukan 6x)`);
  ok(t.x < 8 * 0.75, "dan jauh di bawah apa yang aturan lama akan bayarkan");

  // A stop that follows the high should also stop a loser out early.
  const bleed = call([1000, 900, 700, 300, 100], 0.1, 1);
  ok(trailExit(bleed).x === 0.7, "yang rugi dihentikan di 0.7x, tidak dibiarkan jalan ke 0.1x");

  // One that keeps climbing and never drops a quarter is still held.
  const climber = call([1000, 1500, 2200, 3000, 4000], 4, 4);
  const c = trailExit(climber);
  ok(c.x === 4 && c.simulated === true, "yang tidak pernah turun 25% tetap dipegang di nilai sekarang");

  const stalled = call([1000, 1200, 1100, 1150], 1.15, 1.2);
  ok(trailExit(stalled).x === 1.15, "bergerak datar juga: tidak pernah kena stop, dibukukan apa adanya");
}

/* ═══════════════ no series, no credit ═══════════════ */
head("tanpa seri harga");
{
  const blind = { entryMc: 1000, nowX: 0.3, peakX: 6, state: "settled", firedAt: new Date().toISOString() };
  const t = trailExit(blind);
  ok(t.simulated === false, "tanpa seri, keluarnya tidak disimulasikan — dan mengaku begitu");
  ok(t.x === 0.3, "dan dibukukan di nilai sekarang, bukan 75% dari puncak yang tak terbukti");
  ok(trailExit({ ...blind, spark: [1000] }).simulated === false, "satu titik bukan sebuah jalur");
  ok(trailExit({ ...blind, spark: [1000, 2000], entryMc: 0 }).simulated === false,
    "tanpa harga masuk tidak ada kelipatan untuk dihitung");
}

/* ═══════════════ cost ═══════════════ */
head("biaya");
{
  const two = call([1000, 2000, 2100], 2.1, 2.1);
  ok(Math.abs(realised(two, "2x") - (2 * 0.95 - 1)) < 1e-12,
    `2x setelah biaya bolak-balik 5% adalah +${((2 * 0.95 - 1) * 100).toFixed(0)}%, bukan +100%`);
  ok(ROUND_TRIP_COST === 0.05, "biayanya 5%, di satu tempat");
}

/* ═══════════════ the whole register ═══════════════ */
head("simulasi seluruh register");
{
  const rows = [
    call([1000, 2000, 8000, 1100, 90], 0.09, 8, 1),   // ran and collapsed
    call([1000, 900, 600, 200], 0.2, 1, 2),           // straight down
    call([1000, 1400, 2600, 3000], 3, 3, 3),          // still climbing
  ];

  const trail = exitSimulation(rows, { rule: "trail", size: 100 });
  ok(trail.simulated === 3, "ketiga call punya seri, jadi ketiganya benar-benar dijalani");
  ok(trail.n === 3 && trail.invested === 300, "tiga call, modal 300");

  // The number that mattered: the old formula on this set.
  const oldWay = rows.reduce((a, r) => a + 100 * (Math.max(r.nowX, r.peakX * 0.75) * 0.95 - 1), 0);
  ok(trail.result < oldWay,
    `hasilnya lebih rendah daripada rumus lama (${trail.result.toFixed(0)} vs ${oldWay.toFixed(0)})`);

  const hold = exitSimulation(rows, { rule: "hold", size: 100 });
  ok(hold.simulated === null, "aturan lain tidak mengklaim ada yang disimulasikan");
  ok(hold.n === 3, "dan tetap menghitung setiap call");

  const two = exitSimulation(rows, { rule: "2x", size: 100 });
  ok(two.result < trail.result, "menakik di 2x membuang ekornya, dan itu terlihat di hasilnya");

  ok(exitSimulation([], { rule: "trail" }).n === 0, "register kosong tidak meledak");

  // Drawdown is measured on the running equity, in the order the calls fired.
  const dd = exitSimulation(rows, { rule: "hold", size: 100 });
  ok(dd.drawdown > 0, "drawdown terburuk dihitung dari kurva, bukan dari hasil akhir");
}

console.log(`\n${failures ? failures + " GAGAL" : "semua lolos"}`);
process.exit(failures ? 1 : 0);

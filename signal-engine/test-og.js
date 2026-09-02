/**
 * A shared link has to preview the call it points at.
 *
 * The register's argument is that a losing call stays published. That argument
 * is only made if the link someone pastes into a group chat unfurls into the
 * call — with its real multiple on it. A generic site card on every link lets
 * a winner and a corpse look identical in the preview, which is exactly the
 * ambiguity this product exists to remove.
 *
 * So: the card is drawn from the call's own marks, and /call/:seq serves the
 * app with that call's meta swapped in. A call the public cannot see yet gets
 * no card — the preview is a leak of the same kind as an early feed row.
 */
import { rmSync } from "node:fs";
import { podiumCard } from "./og.js";
import { FileStore } from "./store.js";
import { start } from "./index.js";

const DATA = "./data/og-test.json";
const PORT = 8798;
const ENTRY = 0.0004335, SUPPLY = 1e9;

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

process.env.SITE_INDEX = new URL("../site/index.html", import.meta.url).pathname;
process.env.PUBLIC_DELAY_S = "0";

rmSync(DATA, { force: true });
const store = new FileStore(DATA);
const call = store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "TOK", pairAddress: "FIRED",
  symbol: "$TAP", name: "Tapcoin", dex: "meteora",
  firedAt: new Date(Date.now() - 7200e3).toISOString(),
  entryPriceUsd: ENTRY, entrySupply: SUPPLY, entryMc: ENTRY * SUPPLY,
  entryLiquidityUsd: 55_000, score: 76, reasons: ["Volume running 5.7× the hourly pace"],
});

let pairs = [];
const api = {
  latestProfiles: async () => [], latestBoosts: async () => [], topBoosts: async () => [],
  pairsForToken: async () => [], tokensBatch: async () => pairs,
};

const engine = start({ store, api, port: PORT, log: () => {} });
const pair = (priceUsd, liquidityUsd = 55_000) => ({
  chainId: "solana", dexId: "meteora", pairAddress: "FIRED",
  baseToken: { address: "TOK", symbol: "$TAP", name: "Tapcoin" },
  priceUsd: String(priceUsd), liquidity: { usd: liquidityUsd },
});
pairs = [pair(ENTRY * 3)];
await engine.refresh(store.liveCalls());

const B = `http://127.0.0.1:${PORT}`;
const png = buf => buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG";

console.log("\nKARTU PER CALL");
const svg = await fetch(`${B}/og/call/${call.seq}.svg`);
const svgTxt = await svg.text();
ok(svg.status === 200 && (svg.headers.get("content-type") ?? "").includes("svg"),
  `the card is served as SVG (${svg.status})`);
ok(svgTxt.includes("$TAP") && !svgTxt.includes("$$TAP"),
  "a symbol that already carries a dollar does not get a second one");
ok(svgTxt.includes("3.00×"), "and the card shows the multiple the call actually made");

const raster = await fetch(`${B}/og/call/${call.seq}.png`);
const rbuf = Buffer.from(await raster.arrayBuffer());
ok(raster.status === 200 && png(rbuf),
  `a real PNG, because no platform unfurls an SVG (${(rbuf.length / 1024) | 0} KB)`);

console.log("\nBANNER PREMIUM");
{
  // Walk the call down off its peak, so now and peak are different numbers and
  // the assertion can actually tell them apart. The old fixture had both at 3x,
  // which meant "headlines now, not peak" could never have failed.
  pairs = [pair(ENTRY * 1.2)];
  await engine.refresh(store.liveCalls());
  const mark = store.mark(call.seq);
  ok(Math.abs(mark.peakX - 3) < 0.01 && Math.abs(mark.nowX - 1.2) < 0.01,
    `peak ${mark.peakX.toFixed(2)}× and now ${mark.nowX.toFixed(2)}× are now different`);

  const b = await fetch(`${B}/og/banner/${call.seq}.svg`);
  const txt = await b.text();
  ok(b.status === 200, `the banner is served (${b.status})`);
  ok(txt.includes("$TAP") && !txt.includes("$$TAP"), "with one dollar on the ticker");
  // The headline is whichever text is set largest on the card.
  const sizes = [...txt.matchAll(/font-size="(\d+)"[^>]*>([^<]*×)</g)]
    .map(m => [Number(m[1]), m[2]]).sort((a, b2) => b2[0] - a[0]);
  ok(sizes[0]?.[1] === "1.20×",
    `the largest figure on the card is where it is now, not the peak it left (${sizes[0]?.[1]})`);
  ok(txt.includes("PEAK 3.00×"), "with the peak kept beside it, in small type");
  ok(txt.includes("#5B7CFA"), "and drawn in the gradient, because it is above entry");
  ok(!txt.includes("#E5606B"), "not in the dead colour");

  // And a call below entry flips both, so the picture can never argue with
  // the number it is printing.
  pairs = [pair(ENTRY * 0.3)];
  await engine.refresh(store.liveCalls());
  const down = await (await fetch(`${B}/og/banner/${call.seq}.svg`)).text();
  const grad = down.match(/<linearGradient id="g"[^>]*><stop stop-color="([^"]+)"/)?.[1];
  ok(grad === "#E5606B",
    `a call that fell below entry is drawn in the dead colour (${grad})`);
  // The badge does not follow it, and should not: the register still calls
  // this a win, because it reached 2× and that fact does not expire. Two
  // signals saying two true things — the failure would be one of them lying.
  ok(down.includes("WIN"), "while the badge still says what the register calls it");

  const raster = await fetch(`${B}/og/banner/${call.seq}.png`);
  const rbuf = Buffer.from(await raster.arrayBuffer());
  ok(raster.status === 200 && png(rbuf), `and rasterises (${(rbuf.length / 1024) | 0} KB)`);
  ok((await fetch(`${B}/og/banner/9999.png`)).status === 404,
    "a call nobody can see has no banner either");
}

console.log("\nRINGKASAN BEBERAPA SINYAL");
{
  // A second call, deliberately the better one, fired after the first.
  const two = store.insertCall({
    callerId: 1, chain: "solana", tokenAddress: "TOK2", pairAddress: "PAIR2",
    symbol: "WAGMI", name: "Wagmi", dex: "raydium",
    firedAt: new Date(Date.now() - 3600e3).toISOString(),
    entryPriceUsd: 0.001, entrySupply: 1e9, entryMc: 1e6, entrySupplySource: "derived",
    entryLiquidityUsd: 90_000, score: 91, reasons: ["Buying has held for hours"],
  });
  pairs = [
    { chainId: "solana", dexId: "raydium", pairAddress: "PAIR2",
      baseToken: { address: "TOK2", symbol: "WAGMI", name: "Wagmi" },
      priceUsd: "0.001", liquidity: { usd: 90_000 } },
    ...pairs,
  ];
  await engine.refresh(store.liveCalls());

  const d = await fetch(`${B}/og/digest.svg?days=7&n=6`);
  const txt = await d.text();
  ok(d.status === 200, `the digest is served (${d.status})`);
  ok(txt.includes("$TAP") && txt.includes("$WAGMI"), "carrying more than one call");
  ok(/most recent of 2/.test(txt),
    "and saying how many of how many these are, so the selection is not taken on trust");
  // The newer call is the weaker one here; if it came second the rows were sorted.
  ok(txt.indexOf("$WAGMI") < txt.indexOf("$TAP"),
    "newest first — the rows are not ordered by how well they did");
  const raster = await fetch(`${B}/og/digest.png?days=7`);
  ok(raster.status === 200 && png(Buffer.from(await raster.arrayBuffer())), "and rasterises");
}

console.log("\nKARTU PEMENANG, DENGAN PENYEBUTNYA");
{
  const w = await fetch(`${B}/og/wins.svg?days=7`);
  const txt = await w.text();
  ok(w.status === 200, `the winners card is served (${w.status})`);
  ok(!txt.includes("WAGMI"), "the call that never reached 2× is not drawn on it");
  ok(txt.includes("$TAP"), "the one that did, is");
  // The whole point: selecting what to draw is fine, hiding the base is not.
  ok(/1 of 2 calls/.test(txt),
    "it says how many of how many, in words, on the same image");
  ok(/>50%<[\s\S]{0,220}HIT/.test(txt),
    "and the hit rate is over every call in the window, not over the ones shown");
  ok(/the other 1 are on the register too/.test(txt),
    "naming what was left out rather than leaving the reader to assume");
  // A win that later went to nothing is still a win under the published rule —
  // and a winners card that says nothing about it is the complaint that started
  // all of this: "it died, why is it filed as a win".
  const died = podiumCard([{ symbol: "X", chain: "solana", entryMc: 1e5, peakMc: 3e5, nowMc: 4e3,
    peakX: 3, nowX: 0.04, verdict: "win", isDead: true, state: "settled", score: 80,
    spark: [1e5, 3e5, 4e3] }], { calls: 1, hitRate: 1, dead: 1 }, { days: 7 });
  ok(/DIED AFTER/.test(died), "a win that later died carries that on the card, not only in the header");
  const raster = await fetch(`${B}/og/wins.png?days=7`);
  ok(raster.status === 200 && png(Buffer.from(await raster.arrayBuffer())), "and rasterises");

  // Past five the hero layout gives way to the board, and the board prints the
  // figure it ranks on. Showing the now multiple on a dead row put 0.04× above
  // a 2.19× and read as a broken sort rather than as a warning.
  const many = Array.from({ length: 9 }, (_, i) => ({
    symbol: "T" + i, chain: "solana", entryMc: 1e5, peakMc: 1e5 * (9 - i),
    nowMc: i === 4 ? 4e3 : 2e5, peakX: 9 - i, nowX: i === 4 ? 0.04 : 2,
    verdict: "win", isDead: i === 4, state: "settled", spark: [1e5, 1e5 * (9 - i), 2e5],
  }));
  const board = podiumCard(many, { calls: 20, hitRate: 0.45, dead: 3 }, { days: 7, max: 10 });
  ok(/T0[\s\S]*T8/.test(board), "all nine are on the board");
  ok(board.includes("9.00\u00d7"), "ranked and printed on the same figure");
  ok(!board.includes("0.04\u00d7"),
    "the board prints highs, not where a call ended — a 0.04× among ranked ATHs reads as a broken sort");

  /* The board carries no per-row death marker, and that is only honest while
     its title says ATH rather than profit. These three are what stand in for
     it, and a change that drops any of them has to bring the marker back. */
  ok(/Highest ATH reached/.test(board), "its title claims a high, not a return");
  ok(/>3</.test(board) && /DEAD/.test(board), "the dead count is on the card");
  ok(/an ATH is not a realised return/.test(board), "and the footer says what an ATH is not");
  ok(/9 of 20 calls/.test(board), "with the denominator, as everywhere else");

  // The hero layout does say "the ones that paid", so there the marker stays.
  const heroCard = podiumCard(many.slice(0, 5), { calls: 20, hitRate: 0.45, dead: 3 }, { days: 7, max: 5 });
  ok(/The ones that paid/.test(heroCard) && /DIED AFTER/.test(heroCard),
    "a card that claims profit still marks the win that died");
}

console.log("\nKARTU SITUS");
const site = await fetch(`${B}/og/site.png`);
const sbuf = Buffer.from(await site.arrayBuffer());
ok(site.status === 200 && png(sbuf), `the front page has a card too (${(sbuf.length / 1024) | 0} KB)`);

console.log("\nMETA DI /call/:seq");
const page = await fetch(`${B}/call/${call.seq}`);
const html = await page.text();
ok(page.status === 200 && html.includes("<!doctype html"), `the call url serves the app (${page.status})`);
ok(/og:title" content="[^"]*TAP/.test(html), "og:title names the token, not the site");
ok(html.includes(`/og/call/${call.seq}.png`), "og:image points at this call's own card");
ok(new RegExp(`og:url" content="[^"]*/call/${call.seq}"`).test(html),
  "and the canonical url is the call, so the share does not collapse to the home page");

console.log("\nYANG BELUM BOLEH DILIHAT");
const unknown = await fetch(`${B}/call/9999`);
const uHtml = await unknown.text();
ok(unknown.status === 200 && uHtml.includes("<!doctype html"),
  "an unknown call still serves the app rather than a 404 page");
ok(!uHtml.includes("/og/call/9999.png"), "but promises no card for a call that does not exist");
const bogus = await fetch(`${B}/og/call/9999.png`);
ok(bogus.status === 404, `and the card itself is not drawn for it (${bogus.status})`);

engine.stop();
rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);

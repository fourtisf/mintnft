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
pairs = [{
  chainId: "solana", dexId: "meteora", pairAddress: "FIRED",
  baseToken: { address: "TOK", symbol: "$TAP", name: "Tapcoin" },
  priceUsd: String(ENTRY * 3), liquidity: { usd: 55_000 },
}];
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
  const b = await fetch(`${B}/og/banner/${call.seq}.svg`);
  const txt = await b.text();
  ok(b.status === 200, `the banner is served (${b.status})`);
  ok(txt.includes("$TAP") && !txt.includes("$$TAP"), "with one dollar on the ticker");
  // The call is live and up 3x, so now is what gets headlined and the line
  // reads in the brand gradient rather than in --dead.
  ok(/font-size="128"[^>]*>3\.00×/.test(txt), "headlined on where it is now, not on a peak it left");
  ok(txt.includes("#5B7CFA"), "and drawn in the gradient, because it is above entry");
  ok(!txt.includes("#E5606B"), "not in the dead colour");

  const raster = await fetch(`${B}/og/banner/${call.seq}.png`);
  const rbuf = Buffer.from(await raster.arrayBuffer());
  ok(raster.status === 200 && png(rbuf), `and rasterises (${(rbuf.length / 1024) | 0} KB)`);
  ok((await fetch(`${B}/og/banner/9999.png`)).status === 404,
    "a call nobody can see has no banner either");
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

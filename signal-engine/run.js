import { Engine } from "./engine.js";
const watch = process.argv.includes("--watch");
const eng = new Engine({
  onSignal(s) {
    console.log(`\n[SIGNAL] $${s.symbol}  ${s.chain}  score ${s.score}/100`);
    console.log(`  entry MC $${Math.round(s.entryMc).toLocaleString()}  liq $${Math.round(s.liquidityUsd).toLocaleString()}`);
    s.reasons.forEach(r => console.log(`  · ${r}`));
    console.log(`  ${s.tokenAddress}`);
  },
});
if (watch) { console.log("watching, 60s interval"); await eng.watch(60_000); }
else { const st = await eng.tick(); console.log("pass complete:", st); }

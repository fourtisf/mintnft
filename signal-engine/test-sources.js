/**
 * Which source found a call, and whether it earned its key.
 *
 * The profile feed only ever sees tokens whose team filed a profile, which the
 * pools worth catching have not. A pool watcher fixes that — and turning one
 * on is an act of faith unless the counts are kept per source, because the
 * candidate total goes up either way. A source that doubles the candidates and
 * never produces one that clears a gate is a source costing a key for nothing,
 * and only scanned-and-fired together can say so.
 *
 * The attribution is frozen on the call, in a hashed field, so a source cannot
 * be credited afterwards with a winner it did not find.
 */
import { MergedSource } from "./sources.js";
import { Triage } from "./triage.js";
import { Engine } from "./engine.js";
import { FIXTURES } from "./fixtures.js";
import { recordHash } from "./integrity.js";
import { FileStore } from "./store.js";
import { rmSync } from "node:fs";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

const src = (name, pairs) => ({ name, candidates: async () => pairs });
const tok = (a, o = {}) => ({ ...FIXTURES.fires, chainId: "solana",
  pairAddress: "P" + a, baseToken: { ...FIXTURES.fires.baseToken, address: a, symbol: a }, ...o });

console.log("\nSIAPA YANG MENEMUKAN");
{
  const merged = new MergedSource([
    src("dexscreener-profiles", [tok("A"), tok("SHARED")]),
    src("helius-pools", [tok("SHARED"), tok("B")]),
  ]);
  const got = await merged.candidates();
  ok(got.length === 3, `three tokens after the duplicate is dropped (${got.length})`);
  const by = Object.fromEntries(got.map(p => [p.baseToken.address, p.discoveredBy]));
  ok(by.A === "dexscreener-profiles" && by.B === "helius-pools", "each carries the source that produced it");
  ok(by.SHARED === "dexscreener-profiles",
    "a token both sources see is credited to the one that saw it first — the only comparison worth making");

  const broken = new MergedSource([
    { name: "throws", candidates: async () => { throw new Error("rpc down"); } },
    src("helius-pools", [tok("C")]),
  ]);
  ok((await broken.candidates()).length === 1,
    "a source that throws does not take the others down with it");
}

console.log("\nHITUNGAN PER SUMBER");
{
  const t = new Triage();
  t.scanned(3, [tok("A", { discoveredBy: "dexscreener-profiles" }),
                tok("B", { discoveredBy: "helius-pools" }),
                tok("C", { discoveredBy: "helius-pools" })]);
  t.fired("helius-pools");
  const s = t.snapshot();
  const of = id => s.sources.find(x => x.id === id);
  ok(s.scanned === 3 && s.fired === 1, "the totals are unchanged");
  ok(of("helius-pools").scanned === 2 && of("helius-pools").fired === 1,
    "the watcher's two candidates and its one call are counted against it");
  ok(of("dexscreener-profiles").fired === 0 && of("dexscreener-profiles").passRate === 0,
    "a source that found nothing that fired reads 0, because it did scan");
  const empty = new Triage().snapshot();
  ok(empty.sources.length === 0, "and a source that scanned nothing is not invented");

  const un = new Triage();
  un.scanned(1, [tok("X")]);
  ok(un.snapshot().sources[0].id === "unattributed",
    "a candidate with no source is labelled, not silently dropped from the count");
}

console.log("\nATRIBUSI IKUT TERKUNCI DI HASH");
{
  const DATA = "./data/sources-test.json";
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const fired = [];
  await new Engine({
    client: {}, log: () => {},
    source: new MergedSource([src("helius-pools", [tok("A")])]),
    inspector: { configured: false, inspect: async () => null },
    onSignal: s => fired.push(store.insertCall(s)),
  }).tick();

  ok(fired.length === 1, "the call fired");
  ok(fired[0].sourceRef === "helius-pools", "and records which source found it");
  const hash = fired[0].recordHash;
  ok(recordHash({ ...fired[0], sourceRef: "dexscreener-profiles" }) !== hash,
    "reattributing it to another source breaks the record hash — the credit cannot move");
  rmSync(DATA, { force: true });
}

console.log("\nWATCHER HANYA IKUT KALAU ADA KUNCINYA");
{
  // An idle source logs its own absence on every tick, which is how a log
  // becomes unreadable. It is left out entirely rather than added and ignored.
  const names = () => new Engine({ client: {}, log: () => {} }).source.sources.map(s => s.name);
  const before = process.env.HELIUS_KEY;
  delete process.env.HELIUS_KEY;
  ok(!names().includes("helius-pools"), "with no key the pool watcher is not in the list at all");
  process.env.HELIUS_KEY = "  k  ";
  ok(names().includes("helius-pools"), "with one it is — and whitespace around it is still a key");
  process.env.HELIUS_KEY = "   ";
  ok(!names().includes("helius-pools"), "a key that is only whitespace is not a key here either");
  if (before == null) delete process.env.HELIUS_KEY; else process.env.HELIUS_KEY = before;
  ok(names().includes("dexscreener-profiles") && names().includes("dexscreener-boosts"),
    "the free sources are there either way — a watcher is added, never a replacement");
}

console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);

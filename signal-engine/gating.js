/**
 * Tier latency, resolved on the server and nowhere else.
 *
 * The product sells seconds. Tier III sees a call as it fires, Tier II at +5s,
 * Tier I at +10s, everyone at +1h. Send the row to a browser and hide it in
 * the UI and the business model lasts exactly as long as it takes someone to
 * open devtools — so nothing leaves a route before its time, in any shape.
 *
 * publish_at is derived from fired_at rather than stored. A stored copy is a
 * second source of truth that can drift from the hashed record, and fired_at
 * is already frozen and inside the hash.
 */
export const PUBLIC = 0, TIER_I = 1, TIER_II = 2, TIER_III = 3;

/** Seconds after fired_at at which each tier may see a call. */
export const TIER_DELAY_S = { 3: 0, 2: 5, 1: 10, 0: 3600 };

export function publishAt(call, delays = TIER_DELAY_S) {
  const t = Date.parse(call.firedAt);
  const at = {};
  for (const tier of [3, 2, 1, 0]) at[tier] = new Date(t + delays[tier] * 1000).toISOString();
  return at;
}

/** A tier sees a call only once its own clock has passed. Nothing else. */
export function visibleTo(call, tier, now = Date.now(), delays = TIER_DELAY_S) {
  const d = delays[tier];
  if (d === undefined) return false;
  return now >= Date.parse(call.firedAt) + d * 1000;
}

export function filterForTier(rows, tier, now = Date.now(), delays = TIER_DELAY_S) {
  return rows.filter(r => visibleTo(r, tier, now, delays));
}

/** Seconds a tier still has to wait, for the countdown the prototype shows. */
export function secondsUntilVisible(call, tier, now = Date.now(), delays = TIER_DELAY_S) {
  const at = Date.parse(call.firedAt) + (delays[tier] ?? Infinity) * 1000;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

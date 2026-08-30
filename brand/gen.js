/**
 * Nekara mark geometry.
 *
 * The tympanum of a Dong Son bronze drum: a rayed sun at the centre, ringed by
 * concentric bands. Here the bands are a tick ring — one tick per entry, and
 * a closed circle so none can be taken out without the ring breaking.
 *
 * Computed rather than drawn so every ray is exactly 30 degrees from its
 * neighbour. A logo that is almost symmetrical reads as almost finished.
 */
const C = 60, R = n => Number(n.toFixed(3));
const pt = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [R(C + r * Math.cos(a)), R(C + r * Math.sin(a))];
};

// 12 rays: twelve months of a register that never resets
const RAYS = 12, R_IN = 11.5, R_OUT = 33, HALF = 7.2;
const rays = [];
for (let i = 0; i < RAYS; i++) {
  const t = i * (360 / RAYS);
  const [ax, ay] = pt(R_OUT, t);
  const [lx, ly] = pt(R_IN, t - HALF);
  const [rx, ry] = pt(R_IN, t + HALF);
  rays.push(`M${ax} ${ay}L${rx} ${ry}L${lx} ${ly}Z`);
}

// 60 ticks on the bezel, every 5th longer — a scale you can count against
const ticks = [];
for (let i = 0; i < 60; i++) {
  const t = i * 6, major = i % 5 === 0;
  const [x1, y1] = pt(major ? 44.5 : 46.8, t);
  const [x2, y2] = pt(50.5, t);
  ticks.push({ d: `M${x1} ${y1}L${x2} ${y2}`, major });
}

console.log("RAYS_PATH=" + rays.join(""));
console.log("TICKS_MAJOR=" + ticks.filter(t => t.major).map(t => t.d).join(""));
console.log("TICKS_MINOR=" + ticks.filter(t => !t.major).map(t => t.d).join(""));

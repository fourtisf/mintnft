const fs = require('fs');
const C = 60, R = n => Number(n.toFixed(2));
const pt = (r, d) => { const a = (d - 90) * Math.PI / 180; return [R(C + r*Math.cos(a)), R(C + r*Math.sin(a))]; };
const wedges = (n, rIn, rOut, half) => { const o=[];
  for (let i=0;i<n;i++){ const t=i*(360/n);
    const [ax,ay]=pt(rOut,t-half),[bx,by]=pt(rOut,t+half),[cx,cy]=pt(rIn,t+half),[dx,dy]=pt(rIn,t-half);
    o.push(`M${ax} ${ay}L${bx} ${by}L${cx} ${cy}L${dx} ${dy}Z`);} return o.join(''); };

const head = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"';
// primary: twelve rays for twelve months, inside a ring that never opens
const primary = `<svg ${head} role="img" aria-label="Nekara">
  <circle cx="60" cy="60" r="51" stroke="currentColor" stroke-width="7.5"/>
  <path d="${wedges(12, 18, 37, 4.4)}" fill="currentColor"/>
  <circle cx="60" cy="60" r="10" fill="currentColor"/>
</svg>`;
// under 24px the twelve rays fill in; eight hold the same silhouette
const compact = `<svg ${head} role="img" aria-label="Nekara">
  <circle cx="60" cy="60" r="50" stroke="currentColor" stroke-width="10"/>
  <path d="${wedges(8, 20, 36, 6.5)}" fill="currentColor"/>
  <circle cx="60" cy="60" r="12" fill="currentColor"/>
</svg>`;
fs.writeFileSync('nekara-mark.svg', primary);
fs.writeFileSync('nekara-mark-compact.svg', compact);
fs.writeFileSync('mark-inline.txt', primary.replace(/\n\s*/g, ''));
fs.writeFileSync('compact-inline.txt', compact.replace(/\n\s*/g, ''));
console.log('primary', primary.length, '· compact', compact.length);

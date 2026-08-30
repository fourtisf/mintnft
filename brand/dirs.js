const fs = require('fs');
const C = 60, R = n => Number(n.toFixed(2));
const pt = (r,d)=>{const a=(d-90)*Math.PI/180;return [R(C+r*Math.cos(a)),R(C+r*Math.sin(a))];};
const wedges=(n,rIn,rOut,half)=>{const o=[];for(let i=0;i<n;i++){const t=i*(360/n);
  const[ax,ay]=pt(rOut,t-half),[bx,by]=pt(rOut,t+half),[cx,cy]=pt(rIn,t+half),[dx,dy]=pt(rIn,t-half);
  o.push(`M${ax} ${ay}L${bx} ${by}L${cx} ${cy}L${dx} ${dy}Z`);}return o.join('');};
const svg=i=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">${i}</svg>`;

const D = {};

// 1 — EMBLEM: the nekara tympanum (current proposal)
D.emblem = svg(`<circle cx="60" cy="60" r="51" stroke="currentColor" stroke-width="7.5"/>
<path d="${wedges(12,18,37,4.4)}" fill="currentColor"/><circle cx="60" cy="60" r="10" fill="currentColor"/>`);

// 2 — LEDGER: entries stacked, one short. the short one never leaves
D.ledger = svg(`<g fill="currentColor">
<rect x="16" y="24" width="88" height="11" rx="1.5"/>
<rect x="16" y="45" width="62" height="11" rx="1.5"/>
<rect x="16" y="66" width="30" height="11" rx="1.5" opacity=".45"/>
<rect x="16" y="87" width="74" height="11" rx="1.5"/></g>`);

// 3 — CHAIN: three links, each hash carrying the one before it
D.chain = svg(`<g stroke="currentColor" stroke-width="8">
<circle cx="32" cy="60" r="22"/><circle cx="60" cy="60" r="22"/><circle cx="88" cy="60" r="22"/></g>`);

// 4 — TALLY: four strokes and the fifth struck across. counting you cannot uncount
D.tally = svg(`<g stroke="currentColor" stroke-width="9" stroke-linecap="square">
<path d="M26 26v68M46 26v68M66 26v68M86 26v68"/>
<path d="M18 88L94 32" stroke-width="9"/></g>`);

// 5 — MONOGRAM: a stencil N, cut so the counter reads as a gap that stays open
D.mono = svg(`<circle cx="60" cy="60" r="50" stroke="currentColor" stroke-width="8"/>
<g fill="currentColor"><rect x="36" y="36" width="10" height="48" rx="1"/>
<rect x="74" y="36" width="10" height="48" rx="1"/>
<path d="M36 36h10l38 48h-10z"/></g>`);

// 6 — STRATA: layers that only ever accumulate
D.strata = svg(`<circle cx="60" cy="60" r="52" stroke="currentColor" stroke-width="6"/>
<circle cx="60" cy="60" r="40" stroke="currentColor" stroke-width="1.6"/>
<circle cx="60" cy="60" r="31" stroke="currentColor" stroke-width="2.4"/>
<circle cx="60" cy="60" r="23" stroke="currentColor" stroke-width="3.2"/>
<circle cx="60" cy="60" r="13" fill="currentColor"/>`);

for (const [k,v] of Object.entries(D)) fs.writeFileSync(`dir-${k}.svg`, v);
console.log(Object.keys(D).join(' '));

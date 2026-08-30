const fs = require('fs');
const svg=i=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">${i}</svg>`;
// four upright, the fifth struck across — the oldest record-keeping there is,
// and the one gesture that cannot be taken back without leaving the strike
const bars = (x0, gap, y1, y2, w) => Array.from({length:4},(_,i)=>
  `<rect x="${x0+i*gap}" y="${y1}" width="${w}" height="${y2-y1}" rx="${w/2}"/>`).join('');

const T = {
  // free-standing, confident strike
  t1: svg(`<g fill="currentColor">${bars(24,18,28,92,10)}
    <rect x="10" y="55" width="100" height="10" rx="5" transform="rotate(-28 60 60)"/></g>`),
  // held in a ring — works as an avatar
  t2: svg(`<circle cx="60" cy="60" r="51" stroke="currentColor" stroke-width="7.5"/>
    <g fill="currentColor">${bars(33,13,38,82,7.5)}
    <rect x="26" y="56.5" width="68" height="7.5" rx="3.75" transform="rotate(-30 60 60)"/></g>`),
  // squared off, no rounding — a mark chiselled rather than written
  t3: svg(`<g fill="currentColor">${bars(24,18,26,94,11)}
    <rect x="8" y="54.5" width="104" height="11" transform="rotate(-26 60 60)"/></g>`),
};
for (const [k,v] of Object.entries(T)) fs.writeFileSync(`dir-${k}.svg`,v);
console.log(Object.keys(T).join(' '));

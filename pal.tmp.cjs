const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM(fs.readFileSync('prototype/proof.html','utf8'),
  { runScripts:'dangerously', virtualConsole:new (require('jsdom').VirtualConsole)(), url:'http://localhost/',
    beforeParse(w){ w.IntersectionObserver=class{observe(){}unobserve(){}}; w.matchMedia=()=>({matches:true});
      w.requestAnimationFrame=()=>{}; w.scrollTo=()=>{}; w.setInterval=()=>0; w.fetch=()=>Promise.reject(0); w.TextEncoder=TextEncoder; } }).window;
const want = process.argv[2] || 'Azure';
const out = [];
for (let i=1;i<=666 && out.length<14;i++){
  const t = dom.keyTraits(i);
  if (t.pal[0]===want) out.push(`#${String(i).padStart(4,'0')} hood=${t.hood} eyes=${t.eyes} mask=${t.mask} aura=${t.aura} back=${t.backdrop}`);
}
console.log(want, '\n' + out.join('\n'));

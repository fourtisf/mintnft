const fs = require('fs');
const RAW = fs.readFileSync('nekara-mark.svg', 'utf8').replace(/\n\s*/g, '');
// raster-only treatment: polished metal reads richer than flat fill.
// the core SVG stays one flat colour — this is artwork, not the mark.
const MARKG = RAW.replace(/currentColor/g, 'url(#mg)')
  .replace('<svg ', '<svg style="overflow:visible" ');

const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="mg" x1="0" y1="0" x2=".85" y2="1">
    <stop offset="0" stop-color="#A6C6F5"/><stop offset=".45" stop-color="#6C9BE0"/>
    <stop offset="1" stop-color="#3D6AB4"/></linearGradient>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/></filter>
</defs></svg>`;

const ticks = Array.from({length:150},(_,i)=>
  `<rect x="${i*10}" y="${i%5===0?0:3.5}" width=".9" height="${i%5===0?10:6}"/>`).join('');

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@200;300&family=IBM+Plex+Mono:wght@400&display=swap">`;

const BASE = `${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--navy:#060A11;--blue:#6C9BE0;--pale:#EDF2FB;--mute:#68799A}
body{background:var(--navy);overflow:hidden}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;pointer-events:none}
</style>`;

fs.writeFileSync('out-banner.html', `${BASE}<style>
body{width:1500px;height:500px;position:relative;
  background:linear-gradient(160deg,#080D16 0%,#060A11 52%,#04070C 100%)}
.glow{position:absolute;inset:0;
  background:radial-gradient(620px 500px at 76% 50%, #16305E 0%, rgba(22,48,94,.28) 44%, transparent 74%)}
.vign{position:absolute;inset:0;background:linear-gradient(90deg,#060A11 4%,rgba(6,10,17,0) 42%)}
/* engraved plate edge */
.frame{position:absolute;inset:26px;border:1px solid rgba(108,155,224,.13);border-radius:2px}
.halo{position:absolute;right:-118px;top:50%;transform:translateY(-50%);
  width:760px;height:760px;border-radius:50%;border:1px solid rgba(108,155,224,.09)}
.halo2{position:absolute;right:-16px;top:50%;transform:translateY(-50%);
  width:556px;height:556px;border-radius:50%;border:1px solid rgba(108,155,224,.13)}
.mark{position:absolute;right:112px;top:50%;transform:translateY(-50%);width:362px}
.mark svg{display:block;width:100%}
.copy{position:absolute;left:376px;top:50%;transform:translateY(-50%);
  display:flex;flex-direction:column;gap:30px;align-items:flex-start}
.word{font-family:Spectral,Georgia,serif;font-weight:200;font-size:66px;text-transform:uppercase;
  letter-spacing:.52em;color:var(--pale);line-height:1;text-indent:.52em}
.rule{width:184px;height:1px;background:linear-gradient(90deg,rgba(108,155,224,.85),rgba(108,155,224,0))}
.tag{font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.42em;
  text-transform:uppercase;color:var(--mute)}
.base{position:absolute;left:26px;right:42%;bottom:44px;height:10px;color:var(--blue);opacity:.16}
.chains{position:absolute;right:44px;bottom:41px;font-family:"IBM Plex Mono",monospace;
  font-size:10.5px;letter-spacing:.34em;color:rgba(104,121,154,.72);text-transform:uppercase}
</style>
${DEFS}
<div class="glow"></div><div class="vign"></div>
<div class="halo"></div><div class="halo2"></div>
<div class="frame"></div>
<div class="mark">${MARKG}</div>
<div class="copy">
  <h1 class="word">Nekara</h1>
  <div class="rule"></div>
  <p class="tag">Nothing is ever removed</p>
</div>
<svg class="base" viewBox="0 0 1500 10" fill="currentColor" preserveAspectRatio="none">${ticks}</svg>
<p class="chains">Robinhood Chain</p>
<svg class="grain"><rect width="100%" height="100%" filter="url(#grain)"/></svg>`);

fs.writeFileSync('out-avatar.html', `${BASE}<style>
body{width:400px;height:400px;display:flex;align-items:center;justify-content:center;position:relative;
  background:radial-gradient(290px 290px at 50% 40%, #132444 0%, #080D16 62%, #04070C 100%)}
.ring{position:absolute;width:346px;height:346px;border-radius:50%;border:1px solid rgba(108,155,224,.12)}
.mark{width:268px;position:relative}
.mark svg{display:block;width:100%}
</style>${DEFS}
<div class="ring"></div><div class="mark">${MARKG}</div>
<svg class="grain"><rect width="100%" height="100%" filter="url(#grain)"/></svg>`);
console.log('banner + avatar (english, v2)');

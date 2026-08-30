const fs = require('fs');
const MARK = fs.readFileSync('nekara-mark.svg', 'utf8').replace(/\n\s*/g, '');

// fine ticks along the base — the bezel of the mark, unrolled flat
const ticks = Array.from({length: 120}, (_, i) =>
  `<rect x="${i * 12.5}" y="${i % 5 === 0 ? 0 : 4}" width="1" height="${i % 5 === 0 ? 12 : 8}"/>`).join('');

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@200;300&family=IBM+Plex+Mono:wght@400;500&display=swap">`;

const BASE = `${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--navy:#070B13;--deep:#0C1424;--blue:#6C9BE0;--pale:#E6EDF9;--mute:#7385A0}
body{background:var(--navy);overflow:hidden}
.word{font-family:Spectral,Georgia,serif;font-weight:300;text-transform:uppercase;
  letter-spacing:.42em;color:var(--pale);line-height:1;text-indent:.42em}
.tag{font-family:"IBM Plex Mono",monospace;letter-spacing:.24em;text-transform:uppercase;color:var(--mute)}
</style>`;

fs.writeFileSync('out-banner.html', `${BASE}<style>
body{width:1500px;height:500px;position:relative}
.glow{position:absolute;inset:0;
  background:radial-gradient(680px 460px at 78% 48%, #17305C 0%, rgba(23,48,92,.34) 42%, transparent 72%)}
.vign{position:absolute;inset:0;background:linear-gradient(90deg,#070B13 6%,rgba(7,11,19,0) 46%)}
.mark{position:absolute;right:104px;top:50%;transform:translateY(-50%);width:376px;color:var(--blue)}
.mark svg{display:block;width:100%}
.copy{position:absolute;left:372px;top:50%;transform:translateY(-50%);display:flex;
  flex-direction:column;gap:26px;align-items:flex-start}
.word{font-size:62px}
.rule{width:150px;height:1px;background:linear-gradient(90deg,var(--blue),rgba(108,155,224,0))}
.tag{font-size:14px}
.base{position:absolute;left:0;right:0;bottom:26px;height:12px;color:var(--blue);opacity:.2}
</style>
<div class="glow"></div><div class="vign"></div>
<div class="mark">${MARK}</div>
<div class="copy">
  <h1 class="word">Nekara</h1>
  <div class="rule"></div>
  <p class="tag">Catatan yang tidak bisa dihapus</p>
</div>
<svg class="base" viewBox="0 0 1500 12" fill="currentColor" preserveAspectRatio="none">${ticks}</svg>`);

fs.writeFileSync('out-avatar.html', `${BASE}<style>
body{width:400px;height:400px;display:flex;align-items:center;justify-content:center;position:relative;
  background:radial-gradient(300px 300px at 50% 42%, #142544 0%, #070B13 74%)}
.mark{width:274px;color:var(--blue)}
.mark svg{display:block;width:100%}
</style><div class="mark">${MARK}</div>`);
console.log('banner + avatar html');

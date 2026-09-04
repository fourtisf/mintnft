const fs = require('fs');
const RAW = fs.readFileSync('nekara-mark.svg','utf8').replace(/\n\s*/g,'');
const MARKG = RAW.replace(/currentColor/g,'url(#mg)');
const ticks = Array.from({length:150},(_,i)=>
  `<rect x="${i*10}" y="${i%5===0?0:3.5}" width=".9" height="${i%5===0?10:6}"/>`).join('');

const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="mg" x1="0" y1="0" x2=".85" y2="1">
<stop offset="0" stop-color="#A6C6F5"/><stop offset=".45" stop-color="#6C9BE0"/>
<stop offset="1" stop-color="#3D6AB4"/></linearGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/>
<feColorMatrix type="saturate" values="0"/></filter></defs></svg>`;

const banner = `<div class="banner">
  <div class="glow"></div><div class="vign"></div>
  <div class="halo"></div><div class="halo2"></div><div class="frame"></div>
  <div class="bmark">${MARKG}</div>
  <div class="bcopy"><h2 class="word">Nekara</h2><div class="rule"></div>
    <p class="tag">Nothing is ever removed</p></div>
  <svg class="base" viewBox="0 0 1500 10" fill="currentColor" preserveAspectRatio="none">${ticks}</svg>
  <p class="chains">Robinhood Chain</p>
  <svg class="grain"><rect width="100%" height="100%" filter="url(#grain)"/></svg>
</div>`;

const html = `<title>Nekara on X</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@200;300;400&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
:root{--navy:#060A11;--panel:#0A1220;--line:#18233A;--blue:#6C9BE0;--pale:#EDF2FB;--mute:#68799A}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--navy);color:var(--pale);font-family:"IBM Plex Sans",system-ui,sans-serif;
  font-size:16px;line-height:1.66;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:0 28px}
header{padding:96px 0 14px}
section{padding:62px 0;border-top:1px solid var(--line)}
h1{font-family:Spectral,Georgia,serif;font-weight:200;font-size:46px;letter-spacing:-.012em;
  margin-bottom:18px;text-wrap:balance}
h3{font-family:Spectral,Georgia,serif;font-weight:300;font-size:25px;margin-bottom:12px}
p{max-width:60ch;margin-bottom:14px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.3em;
  text-transform:uppercase;color:var(--mute);margin-bottom:14px}
.note{color:var(--mute);font-size:14.5px}
code{font-family:"IBM Plex Mono",monospace;font-size:.9em;color:var(--blue)}

/* banner rebuilt live so it stays crisp at any width */
.banner{position:relative;width:100%;aspect-ratio:3/1;overflow:hidden;border-radius:3px;
  container-type:inline-size;background:linear-gradient(160deg,#080D16 0%,#060A11 52%,#04070C 100%)}
.banner .glow{position:absolute;inset:0;
  background:radial-gradient(41% 100% at 76% 50%, #16305E 0%, rgba(22,48,94,.28) 44%, transparent 74%)}
.banner .vign{position:absolute;inset:0;background:linear-gradient(90deg,#060A11 4%,rgba(6,10,17,0) 42%)}
.banner .frame{position:absolute;inset:1.73%;border:1px solid rgba(108,155,224,.13);border-radius:2px}
.banner .halo{position:absolute;right:-7.87%;top:50%;transform:translateY(-50%);
  width:50.67cqw;height:50.67cqw;border-radius:50%;border:1px solid rgba(108,155,224,.09)}
.banner .halo2{position:absolute;right:-1.07%;top:50%;transform:translateY(-50%);
  width:37.07cqw;height:37.07cqw;border-radius:50%;border:1px solid rgba(108,155,224,.13)}
.bmark{position:absolute;right:7.47%;top:50%;transform:translateY(-50%);width:24.13cqw}
.bmark svg{display:block;width:100%}
.bcopy{position:absolute;left:25.07%;top:50%;transform:translateY(-50%);
  display:flex;flex-direction:column;gap:2cqw;align-items:flex-start}
.word{font-family:Spectral,Georgia,serif;font-weight:200;text-transform:uppercase;
  letter-spacing:.52em;color:var(--pale);line-height:1;text-indent:.52em;font-size:4.4cqw}
.rule{width:12.27cqw;height:1px;background:linear-gradient(90deg,rgba(108,155,224,.85),rgba(108,155,224,0))}
.tag{font-family:"IBM Plex Mono",monospace;letter-spacing:.42em;text-transform:uppercase;
  color:var(--mute);font-size:.867cqw;margin:0}
.base{position:absolute;left:1.73%;right:42%;bottom:8.8%;height:2%;color:var(--blue);opacity:.16}
.chains{position:absolute;right:2.93%;bottom:8.2%;font-family:"IBM Plex Mono",monospace;
  font-size:.7cqw;letter-spacing:.34em;color:rgba(104,121,154,.72);text-transform:uppercase;margin:0}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;pointer-events:none}

/* profile mock */
.mock{background:var(--panel);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.mock .id{padding:0 24px 26px}
.pfp{width:120px;height:120px;border-radius:50%;overflow:hidden;border:4px solid var(--panel);
  margin-top:-62px;position:relative;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(72% 72% at 50% 40%,#132444 0%,#080D16 62%,#04070C 100%)}
.pfp .m{width:67%}.pfp svg{display:block;width:100%}
.pfp .rg{position:absolute;width:86%;height:86%;border-radius:50%;border:1px solid rgba(108,155,224,.12)}
.name{font-family:Spectral,Georgia,serif;font-size:24px;font-weight:300;margin-top:14px}
.handle{color:var(--mute);font-size:14.5px}
.bio{margin-top:12px;font-size:15px;max-width:54ch}
.meta{margin-top:12px;color:var(--mute);font-size:13px;font-family:"IBM Plex Mono",monospace;letter-spacing:.06em}

.sizes{display:flex;align-items:flex-end;gap:38px;flex-wrap:wrap}
.sizes figure{display:flex;flex-direction:column;align-items:center;gap:14px}
.av{border-radius:50%;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(72% 72% at 50% 40%,#132444 0%,#080D16 62%,#04070C 100%)}
.av .m{width:67%}.av svg{display:block;width:100%}
figcaption{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.22em;color:var(--mute)}

.pal{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px}
.chip{border:1px solid var(--line);border-radius:3px;overflow:hidden}
.chip .fill{height:68px}
.chip .m2{padding:11px 13px;font-family:"IBM Plex Mono",monospace;font-size:10.5px;line-height:1.8}
.chip b{display:block;font-weight:400;letter-spacing:.14em;text-transform:uppercase;font-size:9.5px;color:var(--pale)}
.chip span{color:var(--mute)}
dl{display:grid;grid-template-columns:auto 1fr;gap:10px 22px;font-family:"IBM Plex Mono",monospace;font-size:12.5px}
dt{color:var(--blue);white-space:nowrap}dd{color:var(--mute)}
@media (max-width:660px){h1{font-size:33px}.sizes{gap:24px}}
</style>
${DEFS}
<div class="wrap">
<header>
  <p class="eyebrow">Social assets</p>
  <h1>Header and profile picture</h1>
  <p class="note">The same emblem, in blue. The geometry is untouched — only the colour changed, because the mark takes <code>currentColor</code>. The metallic gradient and the grain below are treatments applied to the artwork; the mark itself stays one flat colour.</p>
</header>

<section>
  <p class="eyebrow">In place</p>
  <h3>How X stacks them</h3>
  <p class="note" style="margin-bottom:26px">The profile picture hangs over the bottom-left corner of the header. That is why the left quarter is deliberately empty — the wordmark starts after the safe zone instead of being covered by it.</p>
  <div class="mock">
    ${banner}
    <div class="id">
      <div class="pfp"><div class="rg"></div><div class="m">${MARKG}</div></div>
      <p class="name">Nekara</p>
      <p class="handle">@nekara</p>
      <p class="bio">A public register of automated trading signals. Every call is published with the exact conditions that fired it. Failed calls are never removed.</p>
      <p class="meta">Anchored on-chain · Public CSV export · Joined 2026</p>
    </div>
  </div>
</section>

<section>
  <p class="eyebrow">Header</p>
  <h3>1500 × 500</h3>
  ${banner}
  <div style="margin-top:26px"><dl>
    <dt>Size</dt><dd>1500 × 500, X's own 3:1 ratio, delivered at 2× for retina</dd>
    <dt>Safe zone</dt><dd>the left 370px carries nothing — that is where the avatar lands</dd>
    <dt>Plate edge</dt><dd>a single hairline inset from all four sides, like an engraved plate</dd>
    <dt>Baseline</dt><dd>the mark's own bezel, unrolled flat — 150 ticks, every fifth one longer</dd>
    <dt>Halos</dt><dd>two concentric hairlines echoing the drum's bands, bled off the right edge</dd>
  </dl></div>
</section>

<section>
  <p class="eyebrow">Profile picture</p>
  <h3>X crops it to a circle</h3>
  <p class="note" style="margin-bottom:28px">The mark fills 67% of the frame. Smaller and it floats inside the crop; larger and the ring touches the cut edge. Checked at the four sizes X actually renders.</p>
  <div class="sizes">
    <figure><div class="av" style="width:134px;height:134px"><div class="m">${MARKG}</div></div><figcaption>134 · PROFILE</figcaption></figure>
    <figure><div class="av" style="width:64px;height:64px"><div class="m">${MARKG}</div></div><figcaption>64 · TIMELINE</figcaption></figure>
    <figure><div class="av" style="width:40px;height:40px"><div class="m">${MARKG}</div></div><figcaption>40 · REPLIES</figcaption></figure>
    <figure><div class="av" style="width:24px;height:24px"><div class="m">${MARKG}</div></div><figcaption>24 · NOTIFICATIONS</figcaption></figure>
  </div>
</section>

<section style="padding-bottom:104px">
  <p class="eyebrow">Colour</p>
  <h3>Blue, not SaaS blue</h3>
  <p class="note" style="margin-bottom:26px">Desaturated and set on blue-black rather than bright on white. That is the difference between reading as premium and reading as a dashboard.</p>
  <div class="pal">
    <div class="chip"><div class="fill" style="background:#060A11"></div><div class="m2"><b>Navy</b><span>#060A11 · ground</span></div></div>
    <div class="chip"><div class="fill" style="background:#16305E"></div><div class="m2"><b>Glow</b><span>#16305E · gradient</span></div></div>
    <div class="chip"><div class="fill" style="background:linear-gradient(135deg,#A6C6F5,#6C9BE0 45%,#3D6AB4)"></div><div class="m2"><b>Mark</b><span>#A6C6F5 → #3D6AB4</span></div></div>
    <div class="chip"><div class="fill" style="background:#6C9BE0"></div><div class="m2"><b>Blue flat</b><span>#6C9BE0 · on dark</span></div></div>
    <div class="chip"><div class="fill" style="background:#EDF2FB"></div><div class="m2"><b>Pale</b><span>#EDF2FB · type</span></div></div>
  </div>
  <p class="note" style="margin-top:28px">The bronze palette from the brand sheet still governs print and the NFT cards. Blue is for social. One mark serves both — it is a single colour and carries no letters, so recolouring is a CSS change and a rename touches neither file.</p>
</section>
</div>`;
fs.writeFileSync('xassets.html', html);
console.log('xassets.html', html.length);

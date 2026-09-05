const fs=require('fs'), path=require('path');
const MARK=`<svg viewBox="0 0 120 120" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient></defs><circle cx="60" cy="60" r="51" stroke="url(#lg)" stroke-width="7.5"/><path d="M57.16 23.11L62.84 23.11L61.38 42.05L58.62 42.05ZM75.99 26.63L80.9 29.47L70.17 45.15L67.78 43.77ZM90.53 39.1L93.37 44.01L76.23 52.22L74.85 49.83ZM96.89 57.16L96.89 62.84L77.95 61.38L77.95 58.62ZM93.37 75.99L90.53 80.9L74.85 70.17L76.23 67.78ZM80.9 90.53L75.99 93.37L67.78 76.23L70.17 74.85ZM62.84 96.89L57.16 96.89L58.62 77.95L61.38 77.95ZM44.01 93.37L39.1 90.53L49.83 74.85L52.22 76.23ZM29.47 80.9L26.63 75.99L43.77 67.78L45.15 70.17ZM23.11 62.84L23.11 57.16L42.05 58.62L42.05 61.38ZM26.63 44.01L29.47 39.1L45.15 49.83L43.77 52.22ZM39.1 29.47L44.01 26.63L52.22 43.77L49.83 45.15Z" fill="url(#lg)"/><circle cx="60" cy="60" r="10" fill="url(#lg)"/></svg>`;

const SHOT=p=>`file://${__dirname}/shots/${p}`;

// tokens straight out of CLAUDE.md — nothing invented
const BASE=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{--bg:#08090B;--art:#090B0D;--surface:#101216;--surface-2:#14171C;--border:rgba(255,255,255,.07);
--border-hi:rgba(255,255,255,.13);--tx:#F3F4F6;--tx-2:#8C929C;--tx-3:#585E68;
--blue:#5B7CFA;--violet:#9B6DFF;--accent:#6E7BFF;--grad:linear-gradient(120deg,#5B7CFA,#9B6DFF);
--win:#3ECF8E;--dead:#E5606B;--r:11px;--display:"Inter Tight",system-ui,sans-serif;--ui:"Inter",system-ui,sans-serif;
--mono:"JetBrains Mono",ui-monospace,monospace}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--tx);font-family:var(--ui);overflow:hidden;position:relative}
.dots{position:absolute;inset:0;pointer-events:none;
 background-image:radial-gradient(circle,rgba(255,255,255,.075) 1px,transparent 1px);background-size:34px 34px;
 -webkit-mask-image:radial-gradient(ellipse 62% 52% at 50% 6%,#000,transparent 72%);
 mask-image:radial-gradient(ellipse 62% 52% at 50% 6%,#000,transparent 72%)}
.aur{position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(760px 460px at 50% -6%,rgba(110,123,255,.20),transparent 68%)}
.grain{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:.019;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
h1,h2{font-family:var(--display);font-weight:600;letter-spacing:-.032em;line-height:1.03}
.grad-tx{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.wm{display:flex;align-items:center;gap:14px}
.wm svg{width:44px;height:44px}
.wm span{font-family:var(--display);font-weight:600;letter-spacing:-.02em;font-size:34px}
.mono{font-family:var(--mono);color:var(--tx-3)}
.eyebrow{font-family:var(--mono);font-size:12.5px;font-weight:500;color:#6E747E;
 letter-spacing:.26em;text-transform:uppercase}
.rule{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent)}
.rule-l{height:1px;background:linear-gradient(90deg,rgba(255,255,255,.13),transparent)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 2px 6px rgba(0,0,0,.5),0 24px 50px -24px rgba(0,0,0,.9)}

/* a real screenshot of the site. elevation is shadow, never coloured glow */
.ui{display:block;border:1px solid var(--border-hi);border-radius:var(--r);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.055),
   0 2px 6px rgba(0,0,0,.55), 0 18px 40px -12px rgba(0,0,0,.8),
   0 70px 130px -40px rgba(0,0,0,1)}
.fade{position:absolute;left:0;right:0;pointer-events:none}
.vig{position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(125% 105% at 50% 38%,transparent 42%,rgba(0,0,0,.55))}

/* The premium vocabulary the key artwork already uses, brought to the banners:
   a key light with a rim opposite it, an engine-turned ground under everything,
   and a plate edge with registration marks. Same rule as the artwork — depth
   comes from light and shadow, never from a coloured glow behind the type. */
.keylight{position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(940px 620px at 78% -12%,rgba(155,109,255,.20),transparent 62%),
            radial-gradient(700px 520px at 8% 112%,rgba(91,124,250,.13),transparent 66%)}
.guil{position:absolute;inset:0;pointer-events:none;opacity:.055;
 background:
  repeating-linear-gradient(31deg,rgba(255,255,255,.55) 0 1px,transparent 1px 13px),
  repeating-linear-gradient(-31deg,rgba(255,255,255,.4) 0 1px,transparent 1px 13px);
 -webkit-mask-image:radial-gradient(120% 100% at 50% 20%,#000 12%,transparent 70%);
 mask-image:radial-gradient(120% 100% at 50% 20%,#000 12%,transparent 70%)}
.plate{position:absolute;pointer-events:none;border-radius:3px;
 border:1px solid rgba(255,255,255,.075);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.05), inset 0 0 0 1px rgba(0,0,0,.4)}
.reg{position:absolute;width:13px;height:13px;pointer-events:none;
 border-color:rgba(255,255,255,.16);border-style:solid;border-width:0}
/* One hairline column rule instead of three boxes. A claim in a card reads as a
   feature grid; a claim behind a rule reads as a page. */
.col{flex:1;padding-left:26px;border-left:1px solid rgba(255,255,255,.09)}
.col:first-child{padding-left:0;border-left:0}
.band{border-top:1px solid rgba(255,255,255,.09);border-bottom:1px solid rgba(255,255,255,.09)}

/* Ground, in four layers. Flat black is the cheapest thing a dark layout can
   do, and one texture over it is still a texture — depth comes from several
   very faint ones that disagree about scale and direction. Every opacity here
   is under .06 on purpose: read them one at a time and each is invisible.

   .rosette is the device on a share certificate — concentric hairlines struck
   from one centre. It is emitted by MEDALLION rather than placed by hand, so
   it shares the artwork's centre wherever the layout puts it; a rosette a few
   pixels off centre reads as a mistake and nothing else. */
.rosette{position:absolute;pointer-events:none;border-radius:50%;opacity:.062;
 background:repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.5) 0 1px,transparent 1px 9px);
 -webkit-mask-image:radial-gradient(circle,transparent 15%,#000 32%,#000 60%,transparent 82%);
 mask-image:radial-gradient(circle,transparent 15%,#000 32%,#000 60%,transparent 82%)}
/* an octave finer than .guil, and crossing it at a different angle. One pitch
   reads as a pattern; two read as a surface */
.weave{position:absolute;inset:0;pointer-events:none;opacity:.038;
 background:
  repeating-linear-gradient(63deg,rgba(255,255,255,.5) 0 1px,transparent 1px 7px),
  repeating-linear-gradient(-63deg,rgba(255,255,255,.36) 0 1px,transparent 1px 7px);
 -webkit-mask-image:linear-gradient(100deg,#000 6%,rgba(0,0,0,.35) 52%,transparent 78%);
 mask-image:linear-gradient(100deg,#000 6%,rgba(0,0,0,.35) 52%,transparent 78%)}
/* raking light, the way it falls across brushed metal */
.rake{position:absolute;inset:-20%;pointer-events:none;
 background:linear-gradient(102deg,transparent 17%,rgba(255,255,255,.030) 30%,transparent 41%,
   transparent 57%,rgba(255,255,255,.017) 67%,transparent 76%)}
/* a floor to sit on, and the hairline where it meets the field. Without it the
   medallion floats in a void of one value */
.floor{position:absolute;left:0;right:0;bottom:0;pointer-events:none;
 background:linear-gradient(180deg,transparent,rgba(255,255,255,.040) 78%,rgba(255,255,255,.028))}
</style>`;

/* The plate that frames every premium layout: a hairline inset a fixed margin
   from the trim, with a registration mark at each corner. Drawn in one place
   because four corners retyped per banner is four chances to drift. */
const PLATE = (m = 30) => `<div class="plate" style="inset:${m}px"></div>` +
  [[0, 0, '2px 0 0 2px'], [0, 1, '2px 2px 0 0'], [1, 1, '0 2px 2px 0'], [1, 0, '0 0 2px 2px']]
    .map(([b, r, bw]) => `<div class="reg" style="${b ? 'bottom' : 'top'}:${m - 7}px;${r ? 'right' : 'left'}:${m - 7}px;border-width:${bw}"></div>`)
    .join('');

const page=(w,h,inner)=>`${BASE}<style>body{width:${w}px;height:${h}px}</style>
<div class="aur"></div><div class="dots"></div>${inner}<div class="vig"></div><div class="grain"></div>`;


/* every post below is the same frame: a claim on the left, and the piece of the
   site that backs it on the right. copy is lifted from the page it came from. */
const post=(eyebrow,head,sub,right)=>page(1600,900,`
<div style="position:absolute;inset:0;padding:70px 74px;display:flex;gap:44px;align-items:center">
  <div style="width:600px;flex-shrink:0;display:flex;flex-direction:column">
    <div class="eyebrow">${eyebrow}</div>
    <div class="rule-l" style="width:170px;margin:20px 0 26px"></div>
    <h2 style="font-size:46px;line-height:1.09">${head}</h2>
    <p style="font-size:18px;line-height:1.64;color:var(--tx-2);margin-top:24px">${sub}</p>
    <div class="wm" style="margin-top:46px">${MARK}<span>Nekara</span></div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;gap:24px;min-width:0">${right}</div>
</div>`);

/* 1 — X header. Left 380px stays clear for the avatar; the register card
      leans in from the right so the profile shows the product, not a texture. */
/* X header. Two things learned from seeing it on a live profile: the avatar
   is far bigger than the guides suggest — it covers x 39-399 from y 295 down —
   and the profile already prints the name under it, so a wordmark up here is
   the same word twice. The statement gets the space instead, at a size that
   survives the crop. */
fs.writeFileSync('brand/banners/x-header.html', page(1500,500,`
<img src="${SHOT('pv-reg.png')}" style="position:absolute;right:-90px;top:50%;transform:translateY(-50%);
  width:920px;opacity:.42;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 48%);
  mask-image:linear-gradient(90deg,transparent,#000 48%)">
<div style="position:absolute;inset:0;background:linear-gradient(90deg,#08090B 30%,rgba(8,9,11,.90) 52%,rgba(8,9,11,.66) 74%,rgba(8,9,11,.5))"></div>
<div style="position:absolute;left:470px;top:50%;transform:translateY(-50%);width:950px">
  <h1 style="font-size:46px;line-height:1.18">Signals with their reasons attached.<br><span class="grad-tx">Including the ones that failed.</span></h1>
  <div class="eyebrow" style="margin-top:30px">Robinhood Chain</div>
</div>`));

/* 2 — the introduction post: the claim, then the register making it */
fs.writeFileSync('brand/banners/b2-intro.html', page(1600,900,`
<div style="position:absolute;left:0;right:0;top:76px;display:flex;flex-direction:column;align-items:center;text-align:center">
  <div class="eyebrow">A public register of automated trading signals</div>
  <div class="rule" style="width:200px;margin:22px 0 30px"></div>
  <h1 style="font-size:66px">Signals with their reasons attached.<br><span class="grad-tx">Including the ones that failed.</span></h1>
  <p style="font-size:19px;line-height:1.62;color:var(--tx-2);max-width:760px;margin-top:26px">Every signal is published with the exact conditions that triggered it, then tracked to win, miss or dead.</p>
</div>
<img class="ui" src="${SHOT('pv-reg.png')}" style="position:absolute;left:50%;top:462px;
  transform:translateX(-50%);width:1320px">
<div class="fade" style="bottom:0;height:120px;background:linear-gradient(180deg,transparent,#08090B 82%)"></div>`));

/* 3 — the differentiator, shown rather than claimed: a win and a dead call,
      same page, same rules, both still carrying the reasons that fired them */
fs.writeFileSync('brand/banners/b3-method.html', page(1600,900,`
<div style="position:absolute;inset:0;padding:66px 74px 44px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:60px">
    <div>
      <div class="eyebrow">The register</div>
      <h2 style="font-size:55px;margin-top:20px">The win and the one that died.<br><span class="grad-tx">Same page, same rules.</span></h2>
      <p style="font-size:18px;line-height:1.62;color:var(--tx-2);max-width:790px;margin-top:22px">Both still carry the score that fired them and the exact conditions behind it. Nothing is edited after the fact, and nothing is taken down.</p>
    </div>
    <div class="wm" style="flex-shrink:0;margin-top:2px">${MARK}<span>Nekara</span></div>
  </div>
  <div style="flex:1;display:flex;align-items:center">
    <div style="width:100%;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start">
      <img class="ui" src="${SHOT('c-win.png')}" style="width:100%">
      <img class="ui" src="${SHOT('c-dead.png')}" style="width:100%">
    </div>
  </div>
  <div class="rule-l" style="margin-bottom:22px"></div>
  <div class="eyebrow">Robinhood Chain</div>
</div>`));

/* 4 — square, for Telegram and IG. One dead call, kept. */
fs.writeFileSync('brand/banners/b4-square.html', page(1080,1080,`
<div style="position:absolute;inset:0;padding:78px 64px 68px;display:flex;flex-direction:column;
  align-items:center;text-align:center">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <h1 style="font-size:53px;line-height:1.13;margin-top:46px">Every call in the order<br>it was fired.<br><span class="grad-tx">Wins, misses, and<br>the ones that died.</span></h1>
  <img class="ui" src="${SHOT('c-dead.png')}" style="width:100%;margin-top:58px">
  <div class="rule" style="width:280px;margin:auto 0 22px"></div>
  <div class="eyebrow">Failed calls are never removed</div>
</div>`));
/* ── keys ──────────────────────────────────────────────────────────────── */

/* A key is access, not an asset, and the site says so in those words. These
   carry no price, no supply counter and no mint button: no contract is
   deployed, so any of those would be advertising a sale that does not exist. */
fs.writeFileSync('brand/banners/k1-keys.html', page(1600,900,`
<div style="position:absolute;inset:0;background:url('${SHOT('k-gallery.png')}') center 42%/150% auto no-repeat"></div>
<div style="position:absolute;inset:0;background:linear-gradient(90deg,#08090B 40%,rgba(8,9,11,.80) 56%,rgba(8,9,11,.28) 78%,transparent)"></div>
<div style="position:absolute;left:74px;top:50%;transform:translateY(-50%);width:700px">
  <div class="eyebrow">Keys</div>
  <div class="rule-l" style="width:170px;margin:20px 0 26px"></div>
  <h2 style="font-size:52px;line-height:1.08">Every holder gets<br>the same calls.<br><span class="grad-tx">Tier only changes<br>how early.</span></h2>
  <p style="font-size:18px;line-height:1.64;color:var(--tx-2);margin-top:26px">666 keys, each drawn from its own token number — the same line geometry used on banknotes. What a key buys is not a position. It is seconds.</p>
  <div class="wm" style="margin-top:44px">${MARK}<span>Nekara</span></div>
</div>
<div class="eyebrow" style="position:absolute;left:74px;bottom:52px">Access to a feed · not an investment</div>`));

fs.writeFileSync('brand/banners/k2-keys-square.html', page(1080,1080,`
<div style="position:absolute;inset:0;padding:76px 64px 66px;display:flex;flex-direction:column;align-items:center;text-align:center">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <h1 style="font-size:48px;line-height:1.13;margin-top:40px">Every holder gets<br>the same calls.<br><span class="grad-tx">Tier only changes<br>how early.</span></h1>
  <img class="ui" src="${SHOT('k-gallery.png')}" style="width:100%;height:498px;object-fit:cover;object-position:center 36%;margin-top:44px">
  <div class="rule" style="width:280px;margin:auto 0 22px"></div>
  <div class="eyebrow">666 keys · access to a feed · not an investment</div>
</div>`));

/* ── scoreboard ────────────────────────────────────────────────────────── */

/* the format every call channel posts: a grid of results with the multiple as
   the hero. the difference is the fourth cell. peak sits next to now in every
   one of them, because peak alone is the number nobody sold at. */
const fmt=n=>n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(n);
const mins=s=>s<60?s+"s":Math.floor(s/60)+"m "+(s%60?s%60+"s":"");
const CALLS=[
  {t:"BRASS", n:"Brass Monkey", ch:"BASE", src:"clanker",  key:288, e:31800,  pk:214000, now:168400, two:840},
  {t:"TOUCH", n:"Touchstone",   ch:"SOL",  src:"pump.fun", key:113, e:8900,   pk:31200,  now:27400,  two:198},
  {t:"CRUC",  n:"Crucible",     ch:"ETH",  src:"uniswap",  key:401, e:126000, pk:388000, now:341000, two:1512},
  {t:"FINE",  n:"Fineness",     ch:"BASE", src:"clanker",  key:522, e:16800,  pk:19200,  now:1300,   two:null},
];
const cell=(c,i)=>{
  const pk=c.pk/c.e, now=c.now/c.e, dead=now<1;
  const hue=dead?"var(--dead)":"#9AA6FF";
  return `<div class="card" style="position:relative;overflow:hidden;padding:24px 28px;
    background:var(--art);display:flex;flex-direction:column;justify-content:space-between">
    <img src="${SHOT('key-'+c.key+'.png')}" style="position:absolute;right:-52px;top:50%;
      transform:translateY(-50%);height:138%;width:auto;opacity:${dead?".6":".92"};
      -webkit-mask-image:linear-gradient(90deg,transparent,#000 46%);
      mask-image:linear-gradient(90deg,transparent,#000 46%)">
    <div style="position:relative">
      <div class="mono" style="font-size:11px;letter-spacing:.22em;color:var(--tx-3)">0${i+1}</div>
      <div style="font-family:var(--display);font-weight:600;letter-spacing:-.028em;font-size:27px;margin-top:9px">$${c.t}</div>
      <div class="mono" style="font-size:12.5px;margin-top:6px">${c.ch} · ${c.src}</div>
    </div>
    <div style="position:relative;display:flex;align-items:center;gap:18px">
      <div style="font-family:var(--display);font-weight:600;letter-spacing:-.045em;font-size:80px;line-height:.88;
        ${dead?"color:var(--dead)":"background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent"}">${pk.toFixed(2)}×</div>
      <div>
        <div class="mono" style="font-size:10.5px;letter-spacing:.22em;color:var(--tx-3)">PEAK</div>
        <div class="mono" style="font-size:16px;color:${hue};margin-top:7px">${now.toFixed(2)}× now</div>
      </div>
      <div class="mono" style="font-size:10.5px;letter-spacing:.14em;padding:5px 10px;border-radius:5px;
        border:1px solid ${dead?"rgba(229,96,107,.42)":"rgba(110,123,255,.42)"};color:${hue};align-self:flex-end;margin-bottom:6px">${dead?"DEAD":"WIN"}</div>
    </div>
    <div class="mono" style="position:relative;font-size:12.5px;color:var(--tx-3)">
      Entry ${fmt(c.e)} · ${c.two?"2× in "+mins(c.two):"never reached 2×"}</div>
  </div>`;
};

fs.writeFileSync('brand/banners/s1-scoreboard.html', page(1600,900,`
<div style="position:absolute;inset:0;padding:50px 54px 44px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:24px;
    border-bottom:1px solid var(--border-hi)">
    <div>
      <div class="eyebrow">Nekara // on record</div>
      <h2 style="font-size:52px;margin-top:16px">The last four calls.<br><span class="grad-tx">One of them died.</span></h2>
    </div>
    <div class="wm" style="padding-bottom:6px">${MARK}<span>Nekara</span></div>
  </div>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:22px;margin:24px 0 20px">
    ${CALLS.map(cell).join("")}
  </div>
  <div class="eyebrow" style="text-align:center">Every call stays on the record — including the ones that died</div>
</div>`));

/* square: the same board as four rows, for Telegram and Instagram */
const row=(c,i)=>{
  const pk=c.pk/c.e, now=c.now/c.e, dead=now<1;
  const hue=dead?"var(--dead)":"#9AA6FF";
  return `<div class="card" style="position:relative;overflow:hidden;background:var(--art);
    flex:1;padding:20px 24px;display:flex;align-items:center;gap:20px">
    <div class="mono" style="font-size:11px;letter-spacing:.2em;color:var(--tx-3);flex-shrink:0">0${i+1}</div>
    <img src="${SHOT('key-'+c.key+'.png')}" style="width:118px;height:118px;object-fit:cover;object-position:center 26%;
      border-radius:9px;flex-shrink:0;opacity:${dead?".7":"1"}">
    <div style="min-width:0">
      <div style="font-family:var(--display);font-weight:600;letter-spacing:-.028em;font-size:26px">$${c.t}</div>
      <div class="mono" style="font-size:12px;margin-top:6px">${c.ch} · ${c.two?"2× in "+mins(c.two):"never reached 2×"}</div>
    </div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:18px">
      <div style="text-align:right">
        <div style="font-family:var(--display);font-weight:600;letter-spacing:-.04em;font-size:52px;line-height:.9;
          ${dead?"color:var(--dead)":"background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent"}">${pk.toFixed(2)}×</div>
        <div class="mono" style="font-size:13px;color:${hue};margin-top:8px">${now.toFixed(2)}× now</div>
      </div>
      <div class="mono" style="font-size:10px;letter-spacing:.14em;padding:5px 9px;border-radius:5px;
        border:1px solid ${dead?"rgba(229,96,107,.42)":"rgba(110,123,255,.42)"};color:${hue}">${dead?"DEAD":"WIN"}</div>
    </div>
  </div>`;
};

fs.writeFileSync('brand/banners/s2-scoreboard-square.html', page(1080,1080,`
<div style="position:absolute;inset:0;padding:60px 58px 52px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:24px;
    border-bottom:1px solid var(--border-hi)">
    <div>
      <div class="eyebrow">Nekara // on record</div>
      <h2 style="font-size:44px;margin-top:16px">The last four calls.<br><span class="grad-tx">One of them died.</span></h2>
    </div>
    <div style="width:56px;flex-shrink:0;margin-top:4px">${MARK}</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;gap:16px;margin:22px 0 20px">
    ${CALLS.map(row).join("")}
  </div>
  <div class="eyebrow" style="text-align:center">Peak sits next to now — nobody sold the top</div>
</div>`));

/* p6 — the leaderboard, and the two columns it refuses to carry. the table
      needs the full width to stay readable, so this one breaks the split. */
fs.writeFileSync('brand/banners/p6-callers.html', page(1600,900,`
<div style="position:absolute;inset:0;padding:60px 70px 52px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:60px">
    <div>
      <div class="eyebrow">Hindsight</div>
      <h2 style="font-size:50px;margin-top:18px">Ranked on every call they ever made.<br><span class="grad-tx">Not on the best one.</span></h2>
      <p style="font-size:18px;line-height:1.62;color:var(--tx-2);max-width:900px;margin-top:20px">One 200× does not make a caller, and a table sorted on it only rewards whoever got luckiest once. So the ranking is hit rate with the misses still in the denominator.</p>
    </div>
    <div class="wm" style="flex-shrink:0;margin-top:2px">${MARK}<span>Nekara</span></div>
  </div>
  <div style="flex:1;display:flex;align-items:center;margin-top:30px">
    <img class="ui" src="${SHOT('q-leaders.png')}" style="width:100%">
  </div>
</div>`));

/* ── live ──────────────────────────────────────────────────────────────── */

/* The desk started firing on Robinhood Chain, and the post that says so has one
   job: show what actually lands in the channel. Not a claim about the product —
   the message itself, with the reasons in it, because the reasons are the whole
   difference between this and every other call channel.

   Every figure is call #0055 as it was actually published, down to the address
   and the three reasons the scorer wrote. A banner is a screenshot the moment
   it is posted and can never be corrected afterwards, so mixing one call's
   numbers under another call's name is the one thing it must not do — and the
   first draft of this did exactly that. Its score is 22 and it stays 22: a
   register whose marketing quietly picks a better number than the record is
   the thing this was built to replace. */
const alertRow = (k, v, mono) => `<div style="display:flex;justify-content:space-between;gap:24px;padding:9px 0">
  <span style="font-family:var(--mono);font-size:15px;color:var(--tx-3);letter-spacing:.02em">${k}</span>
  <span style="font-family:var(--mono);font-size:15px;color:${mono || 'var(--tx)'}">${v}</span></div>`;

const alertCard = `<div class="card" style="padding:30px 32px 26px;width:100%">
  <div style="display:flex;align-items:center;gap:11px">
    <span style="width:9px;height:9px;border-radius:50%;background:var(--win);
      box-shadow:0 0 0 4px rgba(62,207,142,.14)"></span>
    <span style="font-family:var(--mono);font-size:16px;letter-spacing:.12em;color:var(--win)">SIGNAL</span>
    <span style="font-family:var(--mono);font-size:16px;color:var(--tx-3)">#0055</span>
    <span style="font-family:var(--display);font-weight:600;font-size:22px;letter-spacing:-.02em;margin-left:2px">$STAQ</span>
  </div>
  <div style="font-family:var(--mono);font-size:13.5px;color:var(--tx-3);margin-top:9px;letter-spacing:.04em">
    ROBINHOOD &middot; uniswap</div>

  <div style="margin-top:22px;padding:16px 18px;border-radius:9px;background:var(--surface-2);
    border:1px solid var(--border)">
    ${alertRow('Entry MC', '$193K')}
    ${alertRow('Liquidity', '$41K')}
    ${alertRow('Volume 1h', '$11K')}
    ${alertRow('Score', '22/100')}
  </div>

  <div class="eyebrow" style="margin-top:24px;font-size:11.5px">Why it fired</div>
  <div style="margin-top:13px;display:flex;flex-direction:column;gap:11px">
    ${['Liquidity $41K \u2014 deep enough to get back out',
       'Climbing steadily \u2014 +4.1% on 5m, +47.2% on the hour',
       '30 active boosts \u2014 someone is paying for eyes on it']
      .map(r => `<div style="display:flex;gap:12px;align-items:baseline">
        <span style="width:5px;height:5px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>
        <span style="font-size:16.5px;line-height:1.45;color:#C9CED6">${r}</span></div>`).join('')}
  </div>

  <div class="rule-l" style="margin:24px 0 16px"></div>
  <div style="font-family:var(--mono);font-size:13px;color:var(--tx-3);word-break:break-all;line-height:1.5">
    0xB553607D0c418223afFd765143c26Cf327495d06</div>
</div>`;

const live = (w, h) => page(w, h, `
<div class="dots"></div><div class="aur"></div>
<div style="position:absolute;inset:0;padding:${h > 1000 ? 76 : 64}px ${h > 1000 ? 64 : 74}px ${h > 1000 ? 62 : 48}px;
  display:flex;flex-direction:${h > 1000 ? 'column' : 'row'};gap:${h > 1000 ? 44 : 68}px;
  align-items:${h > 1000 ? 'stretch' : 'center'}">
  <div style="flex:1;min-width:0">
    <div class="wm">${MARK}<span>Nekara</span></div>
    <div class="eyebrow" style="margin-top:${h > 1000 ? 40 : 46}px">Now live &middot; Robinhood Chain</div>
    <h2 style="font-size:${h > 1000 ? 58 : 54}px;margin-top:20px">Signals, in the channel,<br><span class="grad-tx">the moment they fire.</span></h2>
    <p style="font-size:${h > 1000 ? 20 : 19}px;line-height:1.64;color:var(--tx-2);max-width:640px;margin-top:24px">Every call arrives with the exact conditions that triggered it, then stays on a public register that is tracked to win, miss or dead. The ones that fail are never removed.</p>
    <div style="display:flex;align-items:center;gap:14px;margin-top:${h > 1000 ? 36 : 40}px">
      <div style="padding:13px 22px;border-radius:var(--r);background:var(--grad);
        font-family:var(--display);font-weight:600;font-size:18px;letter-spacing:-.01em;color:#fff">t.me/nekarasignals</div>
      <div class="mono" style="font-size:15px">nekara.xyz</div>
    </div>
  </div>
  <div style="width:${h > 1000 ? '100%' : '520px'};flex-shrink:0">${alertCard}</div>
</div>
<div class="grain"></div>`);

fs.writeFileSync('brand/banners/x1-live.html', live(1600, 900));
fs.writeFileSync('brand/banners/x2-live-square.html', live(1080, 1080));

/* ── the first post ────────────────────────────────────────────────────── */

/* the account's opening post. the rest of the set argues the product; this one
   only has to land the name and say it is not open yet, so the mark carries it
   and the "coming soon" marker is the site's own nav chip rather than a badge
   invented for a banner. */
const intro=(w,h,markPx,wordPx,headPx)=>`${BASE}<style>body{width:${w}px;height:${h}px}</style>
<div style="position:absolute;inset:0;background:url('${SHOT('pv-reg.png')}') center 58%/${h>1000?"175%":"138%"} auto no-repeat"></div>
<div style="position:absolute;inset:0;background:radial-gradient(94% 88% at 50% 50%,rgba(8,9,11,.955) 22%,rgba(8,9,11,.90) 58%,rgba(8,9,11,.74))"></div>
<div class="aur" style="opacity:.55"></div>
<div style="position:absolute;inset:0;padding:${h>1000?84:72}px 74px ${h>1000?66:58}px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="width:${markPx}px;filter:drop-shadow(0 18px 46px rgba(0,0,0,.85))">${MARK}</div>
  <div style="font-family:var(--display);font-weight:600;letter-spacing:-.03em;
    font-size:${wordPx}px;margin-top:26px">Nekara</div>
  <div class="rule" style="width:220px;margin:${h>1000?42:36}px 0"></div>
  <h1 style="font-size:${headPx}px;line-height:1.1">A public register of<br><span class="grad-tx">automated trading signals.</span></h1>
  <p style="font-size:${h>1000?20:19}px;line-height:1.64;color:var(--tx-2);max-width:${h>1000?860:830}px;margin-top:28px">Every signal is published with the exact conditions that triggered it, then tracked to win, miss or dead — so you can judge the reasoning, not just the result.</p>
</div>
<div class="grain"></div>`;

fs.writeFileSync('brand/banners/p0-intro.html', intro(1600,900,116,66,44));
fs.writeFileSync('brand/banners/p0-intro-square.html', intro(1080,1080,124,72,45));

/* ── posts ─────────────────────────────────────────────────────────────── */

/* p1 — the rejections. the only way to show a filter is actually strict. */
fs.writeFileSync('brand/banners/p1-triage.html', post(
  'Triage',
  'Every rejection<br>is published,<br><span class="grad-tx">with the gate<br>that killed it.</span>',
  'The rejections matter more than the signals — they are the only way to see whether the filter is actually strict.',
  `<img class="ui" src="${SHOT('t-rejects.png')}" style="width:100%">`));

/* p2 — the record cannot be quietly edited, and you can check that yourself */
fs.writeFileSync('brand/banners/p2-custody.html', post(
  'Custody',
  'Remove one call,<br><span class="grad-tx">and every hash<br>after it breaks.</span>',
  'The head is recomputed from the full register in your browser, and published on-chain once a day. That makes the record checkable by anyone, not only by us.',
  `<img class="ui" src="${SHOT('v-head.png')}" style="width:100%">
   <img class="ui" src="${SHOT('v-broken.png')}" style="width:100%">`));

/* p3 — peak is a number nobody actually sold at */
fs.writeFileSync('brand/banners/p3-hindsight.html', post(
  'Hindsight',
  'Peak × is a ceiling<br><span class="grad-tx">nobody sold at.</span>',
  'So the register applies a real exit rule to every call in it, takes 5% round-trip cost off each one, and plots the running result. Losses included, obviously.',
  `<img class="ui" src="${SHOT('h-sim.png')}" style="width:100%">`));

/* p4 — the vetoes run before anything is scored */
fs.writeFileSync('brand/banners/p4-gates.html', post(
  'The filter',
  'Eight hard vetoes,<br><span class="grad-tx">before anything<br>is scored.</span>',
  'Liquidity, age, cap, depth, sell pressure, entry angle, identity, quote. Every threshold is published, so the filter can be argued with.',
  `<img class="ui" src="${SHOT('t-gates.png')}" style="width:100%">`));

fs.writeFileSync('brand/banners/p5-scan.html', page(1080,1080,`
<div style="position:absolute;inset:0;padding:76px 64px 66px;display:flex;flex-direction:column;
  align-items:center;text-align:center">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <h1 style="font-size:50px;line-height:1.13;margin-top:44px">What the screener is doing,<br><span class="grad-tx">and what it passed on.</span></h1>
  <img class="ui" src="${SHOT('t-counts.png')}" style="width:100%;margin-top:56px">
  <div class="rule" style="width:280px;margin:auto 0 22px"></div>
  <div class="eyebrow">Four schedules · one process · no manual step</div>
</div>`));
/* ── X profile ─────────────────────────────────────────────────────────── */

/* the avatar renders inside a circle, so nothing may live in the corners and
   the mark needs enough air that the crop never touches it. it also has to
   survive 48px in a timeline, which is what sets the mark's weight here. */
fs.writeFileSync('brand/banners/x-avatar.html', `${BASE}<style>body{width:1000px;height:1000px}</style>
<div style="position:absolute;inset:0;background:radial-gradient(660px 560px at 50% -4%,rgba(110,123,255,.22),transparent 66%)"></div>
<div class="dots" style="opacity:.55;-webkit-mask-image:radial-gradient(circle at 50% 30%,#000,transparent 70%);mask-image:radial-gradient(circle at 50% 30%,#000,transparent 70%)"></div>
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
  <div style="width:660px;filter:drop-shadow(0 24px 60px rgba(0,0,0,.9))">${MARK}</div>
</div>
<div style="position:absolute;inset:0;background:radial-gradient(115% 100% at 50% 40%,transparent 46%,rgba(0,0,0,.6))"></div>
<div class="grain"></div>`);

/* ── the mint ──────────────────────────────────────────────────────────── */

/* The address is on these because it is the one thing a reader can check
   against something that is not a banner. Read from out/keys.4663.json rather
   than typed: a hand-copied address on artwork sent to strangers is the worst
   place for a typo, and the record already holds the real one. */
const DEPLOYED = (() => {
  try { return JSON.parse(fs.readFileSync('out/keys.4663.json', 'utf8')); }
  catch { return null; }
})();
const CA = DEPLOYED?.keys ?? null;
const CA_SHOWN = CA ?? 'belum di-deploy';

/* Closed is the honest state to advertise while the phase is closed: a banner
   that says mint now, next to a contract that refuses, is the one thing this
   product exists not to do. Change the word when the phase changes. */
const MINT_STATE = process.env.MINT_STATE ?? 'Phase 1 · Coming soon';

/* The art is the product, so nothing is laid over it and nothing is cropped
   out of it. These come from the site's own renderer rather than a screenshot
   of it: the engraved number plate sits at the far left of the square, and any
   crop that makes a screenshot fit a card cuts it in half. */
let PROTO = null;
const proto = () => PROTO ??= new (require('jsdom').JSDOM)(
  fs.readFileSync(path.join(__dirname, '..', 'prototype', 'proof.html'), 'utf8'),
  { runScripts: 'dangerously', virtualConsole: new (require('jsdom').VirtualConsole)(),
    url: 'http://localhost/', beforeParse(w) {
      w.IntersectionObserver = class { observe() {} unobserve() {} };
      w.matchMedia = () => ({ matches: true });
      w.requestAnimationFrame = () => {}; w.scrollTo = () => {}; w.setInterval = () => 0;
      w.fetch = () => Promise.reject(0); w.TextEncoder = TextEncoder;
    } }).window;

/* The plate engraves a tier drawn from the sample seed. The season seed is not
   out, and a banner carries no caption saying so — so it is blanked here, once,
   and every surface that draws a key goes through this. The backdrop on the
   token banner used keySVG directly and printed TIER I, which is the same
   mis-selling as a wrong price: a reader has no way to know the draw has not
   run. Never call keySVG from a banner; call this. */
const keyBody = id => proto().keySVG(id, 'full').body.replace(/(>TIER )[IVX]+(<)/, '$1\u2014$2');

const KEY = (id, w) => {
  const body = keyBody(id);
  return `<div style="width:${w}px;height:${w}px;border-radius:14px;overflow:hidden;
    border:1px solid rgba(255,255,255,.13);
    box-shadow:0 24px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.045)">
    <svg viewBox="0 0 600 600" width="${w}" height="${w}"
      xmlns="http://www.w3.org/2000/svg">${body}</svg></div>`;
};

const PILL = `<span style="font-family:var(--mono);font-size:11px;letter-spacing:.18em;
  text-transform:uppercase;padding:5px 11px;border-radius:999px;border:1px solid var(--border-hi);
  color:var(--tx-2)">${MINT_STATE}</span>`;
const SPEC = (label, value, size = 23) => `<div><div class="eyebrow" style="font-size:10.5px">${label}</div>
  <div style="font-family:var(--mono);font-size:${size}px;margin-top:7px">${value}</div></div>`;
const LADDER = size => `${SPEC('Phase 1','$2',size)}${SPEC('Phase 2','$5',size)}${SPEC('Phase 3','$10',size)}${SPEC('Max / wallet','5',size)}`;

/* Type across the top, the art given the whole band under it. Nothing is laid
   over the keys and nothing competes with them, which is the only reason they
   can be this big in a 900px frame. */
fs.writeFileSync('brand/banners/m1-mint.html', page(1600,900,`
<div style="position:absolute;inset:0;padding:54px 74px 46px;display:flex;flex-direction:column">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="display:flex;align-items:center;gap:13px">
        <span class="eyebrow">Proof Keys · Season 1</span>${PILL}
      </div>
      <h2 style="font-size:44px;line-height:1.09;margin-top:16px">666 keys.
        <span class="grad-tx">Every one drawn from its own number.</span></h2>
    </div>
    <div class="wm" style="flex-shrink:0;margin-left:40px">${MARK}<span>Nekara</span></div>
  </div>
  <div style="display:flex;gap:18px;justify-content:center;margin:auto 0">
    ${KEY(1,348)}${KEY(3,348)}${KEY(16,348)}${KEY(13,348)}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div style="display:flex;gap:44px">${LADDER(22)}</div>
    <div style="text-align:right">
      <div class="eyebrow" style="font-size:10.5px">Robinhood Chain · 4663</div>
      <div class="mono" style="font-size:12.5px;margin-top:6px;color:var(--tx-2)">${CA_SHOWN}</div>
    </div>
  </div>
</div>`));

fs.writeFileSync('brand/banners/m2-mint-square.html', page(1080,1080,`
<div style="position:absolute;inset:0;padding:56px;display:flex;flex-direction:column;align-items:center;text-align:center">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <div style="display:flex;align-items:center;gap:13px;margin-top:24px">
    <span class="eyebrow">Proof Keys · Season 1</span>${PILL}
  </div>
  <h2 style="font-size:42px;line-height:1.1;margin-top:18px">666 keys.<br>
    <span class="grad-tx">Every one drawn from its own number.</span></h2>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin:auto 0">
    ${KEY(1,360)}${KEY(3,360)}${KEY(16,360)}${KEY(13,360)}
  </div>
  <div style="display:flex;gap:46px">${LADDER(21)}</div>
  <div class="eyebrow" style="font-size:10px;margin-top:26px">Robinhood Chain · access to a feed · not an investment</div>
  <div class="mono" style="font-size:11px;margin-top:9px">${CA_SHOWN}</div>
</div>`));

/* ── launch ────────────────────────────────────────────────────────────── */

/* The launch post. Three claims, and each one is a thing the product actually
   does rather than a thing it aspires to — the register cannot delete a miss
   because the schema refuses the statement, the keys buy seconds rather than
   tips, and the reasons ship with the call. A launch banner that promises a
   roadmap is a launch banner that has nothing to show. */
const launch = (w, h) => page(w, h, `
<div class="keylight"></div><div class="guil"></div><div class="dots" style="opacity:.5"></div>
<div style="position:absolute;right:${h > 1000 ? -210 : -190}px;top:${h > 1000 ? '58%' : '52%'};
  transform:translateY(-50%);width:${h > 1000 ? 660 : 740}px;opacity:.028;pointer-events:none">${MARK}</div>
<div style="position:absolute;inset:0;padding:${h > 1000 ? 96 : 84}px ${h > 1000 ? 76 : 92}px ${h > 1000 ? 88 : 76}px;
  display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:40px">
    <div class="wm">${MARK}<span style="font-size:${h > 1000 ? 38 : 34}px">Nekara</span></div>
    <div style="display:flex;align-items:center;gap:10px">
      <span style="width:8px;height:8px;border-radius:50%;background:var(--win);
        box-shadow:0 0 0 5px rgba(62,207,142,.12)"></span>
      <span class="eyebrow" style="color:var(--win)">Live now</span>
    </div>
  </div>

  <div style="margin-top:auto">
    <h1 style="font-size:${h > 1000 ? 74 : 72}px;line-height:1.03;max-width:${h > 1000 ? 900 : 1120}px">A public register of<br>
      <span class="grad-tx">automated trading signals.</span></h1>
    <p style="font-size:${h > 1000 ? 21 : 20}px;line-height:1.6;color:var(--tx-2);
      max-width:${h > 1000 ? 820 : 760}px;margin-top:26px">Firing on Robinhood Chain. Every call is published with the exact conditions that triggered it, then tracked to win, miss or dead.</p>
  </div>

  <div class="band" style="display:flex;gap:${h > 1000 ? 26 : 40};margin-top:${h > 1000 ? 56 : 62}px;padding:${h > 1000 ? 30 : 34}px 0">
    ${[['The reasons ship with the call',
        'Score, liquidity, volume and the rule that fired \u2014 inside the message.'],
       ['A miss cannot be deleted',
        'Append-only. The database refuses the statement, so the losses stay beside the wins.'],
       ['666 keys buy seconds, not tips',
        'A key moves you up the queue on the same call everyone gets. Nothing else.']]
      .map(([t, d]) => `<div class="col">
        <div style="font-family:var(--display);font-weight:600;font-size:${h > 1000 ? 20 : 20}px;letter-spacing:-.022em">${t}</div>
        <div style="font-size:${h > 1000 ? 15.5 : 15.5}px;line-height:1.56;color:var(--tx-2);margin-top:10px">${d}</div>
      </div>`).join('')}
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between;gap:30px;margin-top:${h > 1000 ? 34 : 32}px">
    <div style="display:flex;align-items:center;gap:16px">
      <div style="padding:13px 24px;border-radius:var(--r);background:var(--grad);
        font-family:var(--display);font-weight:600;font-size:18px;color:#fff">nekara.xyz</div>
      <div class="mono" style="font-size:15px">t.me/nekarasignals</div>
    </div>
    <div class="eyebrow" style="font-size:10.5px">Robinhood Chain &middot; 4663</div>
  </div>
</div>
${PLATE(h > 1000 ? 40 : 38)}
<div class="vig" style="opacity:.7"></div><div class="grain"></div>`);

fs.writeFileSync('brand/banners/x3-launch.html', launch(1600, 900));
fs.writeFileSync('brand/banners/x3-launch-square.html', launch(1080, 1080));

/* ── phase 1 ───────────────────────────────────────────────────────────── */

/* The one banner in this set that is a claim about a contract rather than about
   the product, so it is the one that can be wrong in a way nobody can take
   back. Posting it says the phase is open; the contract is the only thing that
   decides whether that is true. Check before it goes out:
     node contracts/keys.js state
   The odds are printed rather than counts, because the draw is probabilistic
   and a fixed count would be a different contract. */
/* Four keys the same size is a catalogue. At the width X actually renders a
   timeline card, four 336px squares of very dark artwork are four grey smudges,
   and the one thing worth showing — that the engraving is drawn per token — is
   the first thing lost. So: one key at a size where the plate and the engraving
   are legible, and three beside it to say there are 665 more. Hierarchy is the
   whole edit; nothing else here changed its mind. */
const mint = (w, h) => page(w, h, `
<div class="keylight"></div><div class="guil"></div><div class="dots" style="opacity:.45"></div>
<div style="position:absolute;inset:0;padding:${h > 1000 ? 74 : 78}px ${h > 1000 ? 66 : 88}px ${h > 1000 ? 66 : 72}px;
  display:flex;flex-direction:${h > 1000 ? 'column' : 'row'};gap:${h > 1000 ? 34 : 62}px;align-items:${h > 1000 ? 'stretch' : 'center'}">

  <div style="flex:1;min-width:0;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:24px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--win);
          box-shadow:0 0 0 5px rgba(62,207,142,.12)"></span>
        <span class="eyebrow" style="color:var(--win)">Phase 1 &middot; Live now</span>
      </div>
      ${h > 1000 ? `<div class="wm">${MARK}<span style="font-size:30px">Nekara</span></div>` : ''}
    </div>

    <h2 style="font-size:${h > 1000 ? 50 : 58}px;line-height:1.05;margin-top:${h > 1000 ? 22 : 24}px">${h > 1000
      ? 'Proof Keys, Season 1.<br><span class="grad-tx">666, and the draw is public.</span>'
      : 'Proof Keys,<br>Season 1.<br><span class="grad-tx">666, and the draw<br>is public.</span>'}</h2>

    <p style="font-size:${h > 1000 ? 18 : 18.5}px;line-height:1.62;color:var(--tx-2);
      max-width:${h > 1000 ? 880 : 580}px;margin-top:${h > 1000 ? 20 : 28}px">A key buys latency on the feed — the same call everyone gets, further up the queue. The tier is drawn from a seed nobody could grind, on odds you can check yourself.</p>

    <div class="band" style="display:flex;gap:${h > 1000 ? 34 : 40}px;padding:${h > 1000 ? 28 : 28}px 0;
      margin-top:${h > 1000 ? 32 : 34}px">
      ${[['Phase 1', '$2'], ['Supply', '666'], ['Max / wallet', '5']]
        .map(([k, v]) => `<div>
          <div class="eyebrow" style="font-size:10.5px">${k}</div>
          <div style="font-family:var(--mono);font-size:${h > 1000 ? 30 : 32}px;margin-top:8px">${v}</div>
        </div>`).join('')}
      <div style="min-width:0">
        <div class="eyebrow" style="font-size:10.5px">Tier odds</div>
        <div style="font-family:var(--mono);font-size:${h > 1000 ? 19 : 19}px;margin-top:14px;white-space:nowrap">9.91 / 30.03 / 60.06</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;margin-top:${h > 1000 ? 34 : 32}px">
      <div style="padding:14px 26px;border-radius:var(--r);background:var(--grad);
        font-family:var(--display);font-weight:600;font-size:19px;color:#fff">nekara.xyz/mint</div>
      <div>
        <div class="eyebrow" style="font-size:10px">Robinhood Chain &middot; 4663</div>
        <div class="mono" style="font-size:11.5px;margin-top:5px;color:var(--tx-2)">${CA_SHOWN}</div>
      </div>
    </div>
  </div>

  <div style="flex-shrink:0;display:flex;gap:${h > 1000 ? 18 : 20}px;align-items:center;
    ${h > 1000 ? 'order:-1;justify-content:center;' : ''}">
    ${KEY(3, h > 1000 ? 384 : 516)}
    <div style="display:flex;flex-direction:column;gap:${h > 1000 ? 10 : 14}px">
      ${[1, 16, 13].map(id => KEY(id, h > 1000 ? 120 : 162)).join('')}
    </div>
  </div>

  ${h > 1000 ? '' : `<div class="wm" style="position:absolute;right:88px;top:70px">${MARK}<span style="font-size:31px">Nekara</span></div>`}
</div>
<div class="eyebrow" style="position:absolute;left:0;right:0;bottom:${h > 1000 ? 30 : 32}px;
  text-align:center;font-size:10px">A key buys latency on the feed &middot; access, not an investment</div>
${PLATE(h > 1000 ? 40 : 38)}
<div class="vig" style="opacity:.6"></div><div class="grain"></div>`);

fs.writeFileSync('brand/banners/x4-mint-live.html', mint(1600, 900));
fs.writeFileSync('brand/banners/x4-mint-live-square.html', mint(1080, 1080));

/* ── token ─────────────────────────────────────────────────────────────── */

/* The first version put the wordmark in the top-left third and let the key run
   off the right edge behind a flat scrim, which left the middle of the frame
   empty and turned the artwork to mud. Three things fix it and they are the
   whole difference:

   - the key is composed as a medallion — concentric hairlines and an
     engine-turned halo around it — so it reads as an engraved instrument
     rather than a texture someone forgot to crop
   - the palette is chosen, not defaulted. Key 3 renders Verdant, and a green
     figure behind a blue-to-violet wordmark is two brands in one frame
   - the empty middle carries a spec band. Four facts, all structural and all
     checkable — nothing that moves, because a banner cannot be corrected once
     it is on a timeline */

const TOKEN_KEY = 5;          // Azure · Hood · Visor · Ring — agrees with --grad
const SPECS = [
  ['Robinhood Chain', 'chain id 4663'],
  ['Append-only', 'no call is ever deleted'],
  ['14 hard vetoes', 'before anything is scored'],
  ['666 keys', 'season 1, odds published'],
];

/* concentric hairlines and a turned halo, drawn once for both sizes */
const MEDALLION = d => `
<div style="position:relative;width:${d}px;height:${d}px;flex-shrink:0">
  <div class="rosette" style="inset:${-d * 1.5}px"></div>
  <div style="position:absolute;inset:${-d * .30}px;border-radius:50%;opacity:.16;
    background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.55) 0 .3deg,transparent .3deg 1.5deg);
    -webkit-mask-image:radial-gradient(circle,transparent 44%,#000 58%,transparent 78%);
    mask-image:radial-gradient(circle,transparent 44%,#000 58%,transparent 78%)"></div>
  <div style="position:absolute;inset:${-d * .175}px;border-radius:50%;
    border:1px dashed rgba(255,255,255,.085)"></div>
  <div style="position:absolute;inset:${-d * .075}px;border-radius:50%;
    border:1px solid rgba(255,255,255,.10);
    box-shadow:0 0 0 1px rgba(0,0,0,.55) inset"></div>
  <div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;
    border:1px solid rgba(255,255,255,.15);
    box-shadow:inset 0 2px 0 rgba(255,255,255,.07),0 50px 110px -34px rgba(0,0,0,1)">
    <svg viewBox="50 12 500 500" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"
      style="display:block;filter:brightness(1.42) contrast(1.04)">${keyBody(TOKEN_KEY)}</svg>
    <div style="position:absolute;inset:0;
      background:radial-gradient(76% 62% at 50% 34%,rgba(110,123,255,.16),transparent 68%)"></div>
    <div style="position:absolute;inset:0;
      background:radial-gradient(112% 100% at 50% 26%,transparent 40%,rgba(8,9,11,.72))"></div>
  </div>
</div>`;

const specCell = (a, b, fs1, fs2) => `<div class="col" style="text-align:left">
  <div style="font-family:var(--display);font-weight:600;font-size:${fs1}px;letter-spacing:-.022em">${a}</div>
  <div class="mono" style="font-size:${fs2}px;margin-top:7px;letter-spacing:.01em">${b}</div>
</div>`;

/* one row of four on the wide frame, two rows of two on the square — four
   columns across 936px would set the mono line at a size nobody reads */
const specBand = (rows, fs1, fs2) => `
<div class="band" style="width:100%;padding:${fs1 > 15 ? 22 : 19}px 0">
  ${rows.map((r, i) => `<div style="display:flex;${i ? 'margin-top:20px' : ''}">
    ${r.map(([a, b]) => specCell(a, b, fs1, fs2)).join('')}
  </div>`).join('')}
</div>`;

const token = (w, h) => {
  const sq = h > 1000;
  const d = sq ? 336 : 430;
  return page(w, h, `
<div style="position:absolute;inset:0;background:
  radial-gradient(128% 96% at 86% -12%,rgba(124,88,224,.17),transparent 58%),
  radial-gradient(116% 84% at 2% 110%,rgba(56,84,186,.13),transparent 60%)"></div>
<div class="keylight" style="opacity:.7"></div>
<div class="weave"></div>
<div class="guil" style="opacity:.05"></div>
<div class="rake"></div>
<div class="floor" style="height:${sq ? 300 : 250}px"></div>

<div style="position:absolute;inset:0;padding:${sq ? '64px 72px 58px' : '66px 84px 62px'};
  display:flex;flex-direction:column;align-items:${sq ? 'center' : 'stretch'};
  text-align:${sq ? 'center' : 'left'}">

  <div style="display:flex;align-items:center;justify-content:space-between;gap:40px;width:100%">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="width:8px;height:8px;border-radius:50%;background:var(--win);
        box-shadow:0 0 0 5px rgba(62,207,142,.12)"></span>
      <span class="eyebrow" style="color:var(--win)">Live now</span>
    </div>
    <div class="wm">${MARK}<span style="font-size:${sq ? 32 : 31}px">Nekara</span></div>
  </div>

  ${sq ? `
  <div style="margin:auto 0;display:flex;flex-direction:column;align-items:center">
    ${MEDALLION(d)}
    <div class="mono" style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;
      color:var(--tx-2);margin-top:${d * .21}px">Nekara Keys · Season 1</div>
    <div style="font-family:var(--display);font-weight:600;letter-spacing:-.045em;
      font-size:100px;line-height:1;margin-top:22px;
      text-shadow:0 24px 70px rgba(0,0,0,.9)" class="grad-tx">$NEKARA</div>
    <p style="font-size:19px;line-height:1.6;color:var(--tx-2);max-width:700px;margin-top:20px">
      The register's own token. Every call it makes is published with the conditions
      that fired it — including the ones that failed.</p>
  </div>`
  : `
  <div style="margin:auto 0;display:flex;align-items:center;gap:74px;width:100%">
    <div style="flex:1;min-width:0">
      <div style="font-family:var(--display);font-weight:600;letter-spacing:-.045em;
        font-size:132px;line-height:1;text-shadow:0 24px 70px rgba(0,0,0,.9)" class="grad-tx">$NEKARA</div>
      <div class="rule-l" style="width:220px;margin:30px 0 26px"></div>
      <p style="font-size:20.5px;line-height:1.62;color:var(--tx-2);max-width:600px">
        The register's own token. Every call it makes is published with the conditions
        that fired it — including the ones that failed.</p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
      ${MEDALLION(d)}
      <div class="mono" style="font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;
        color:var(--tx-2);margin-top:${d * .215}px">Nekara Keys · Season 1</div>
    </div>
  </div>`}

  ${specBand(sq ? [SPECS.slice(0, 2), SPECS.slice(2)] : [SPECS], sq ? 18 : 17, sq ? 12.5 : 12)}

  <div style="display:flex;align-items:center;justify-content:${sq ? 'center' : 'space-between'};
    gap:18px;width:100%;margin-top:${sq ? 24 : 26}px">
    <div style="display:flex;align-items:center;gap:18px">
      <div style="padding:14px 28px;border-radius:var(--r);background:var(--grad);
        font-family:var(--display);font-weight:600;font-size:19px;color:#fff;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 10px 26px -10px rgba(91,124,250,.7)">nekara.xyz</div>
      <div class="mono" style="font-size:15px">t.me/nekarasignals</div>
    </div>
    ${sq ? '' : `<div class="mono" style="font-size:12.5px;letter-spacing:.2em;text-transform:uppercase">
      Signals · Hindsight · Triage · Custody</div>`}
  </div>
</div>
${PLATE(sq ? 40 : 38)}
<div class="grain"></div>`);
};

fs.writeFileSync('brand/banners/x5-token.html', token(1600, 900));
fs.writeFileSync('brand/banners/x5-token-square.html', token(1080, 1080));


if (!CA) console.error('  peringatan: out/keys.4663.json tidak terbaca — banner mint tanpa alamat kontrak');

console.log('24 banner + 1 avatar ditulis');

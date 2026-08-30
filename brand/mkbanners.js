const fs=require('fs');
const MARK=`<svg viewBox="0 0 120 120" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient></defs><circle cx="60" cy="60" r="51" stroke="url(#lg)" stroke-width="7.5"/><path d="M57.16 23.11L62.84 23.11L61.38 42.05L58.62 42.05ZM75.99 26.63L80.9 29.47L70.17 45.15L67.78 43.77ZM90.53 39.1L93.37 44.01L76.23 52.22L74.85 49.83ZM96.89 57.16L96.89 62.84L77.95 61.38L77.95 58.62ZM93.37 75.99L90.53 80.9L74.85 70.17L76.23 67.78ZM80.9 90.53L75.99 93.37L67.78 76.23L70.17 74.85ZM62.84 96.89L57.16 96.89L58.62 77.95L61.38 77.95ZM44.01 93.37L39.1 90.53L49.83 74.85L52.22 76.23ZM29.47 80.9L26.63 75.99L43.77 67.78L45.15 70.17ZM23.11 62.84L23.11 57.16L42.05 58.62L42.05 61.38ZM26.63 44.01L29.47 39.1L45.15 49.83L43.77 52.22ZM39.1 29.47L44.01 26.63L52.22 43.77L49.83 45.15Z" fill="url(#lg)"/><circle cx="60" cy="60" r="10" fill="url(#lg)"/></svg>`;

const SHOT=p=>`file://${__dirname}/shots/${p}`;

// tokens straight out of CLAUDE.md — nothing invented
const BASE=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{--bg:#08090B;--surface:#101216;--surface-2:#14171C;--border:rgba(255,255,255,.07);
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
.pill{display:inline-flex;align-items:center;gap:9px;height:34px;padding:0 14px;
 border:1px solid var(--border-hi);border-radius:999px;background:rgba(255,255,255,.035);
 font-size:14px;color:var(--tx-2)}
.pill i{width:7px;height:7px;border-radius:50%;background:var(--win);display:block}
.mono{font-family:var(--mono);color:var(--tx-3)}
.url{font-family:var(--mono);font-size:15px;color:var(--tx-3);letter-spacing:.02em}

/* a real screenshot of the site, framed the way the site frames its own surfaces */
.ui{display:block;border:1px solid var(--border-hi);border-radius:var(--r);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 40px 90px -30px rgba(0,0,0,.95),0 0 0 1px rgba(0,0,0,.4)}
.fade{position:absolute;left:0;right:0;pointer-events:none}
</style>`;

const page=(w,h,inner)=>`${BASE}<style>body{width:${w}px;height:${h}px}</style>
<div class="aur"></div><div class="dots"></div>${inner}<div class="grain"></div>`;

/* 1 — X header. Left 380px stays clear for the avatar; the register card
      leans in from the right so the profile shows the product, not a texture. */
fs.writeFileSync('brand/banners/b1-x-header.html', page(1500,500,`
<img class="ui" src="${SHOT('c-win.png')}" style="position:absolute;left:950px;top:50%;
  transform:translateY(-50%);width:640px;
  -webkit-mask-image:linear-gradient(100deg,transparent,#000 30%,#000 80%,transparent);
  mask-image:linear-gradient(100deg,transparent,#000 30%,#000 80%,transparent);border:0;box-shadow:none">
<div style="position:absolute;inset:0;background:linear-gradient(90deg,#08090B 58%,rgba(8,9,11,.50) 71%,transparent 84%)"></div>
<div style="position:absolute;left:400px;top:50%;transform:translateY(-50%);width:530px;display:flex;flex-direction:column;gap:22px">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <h1 style="font-size:38px;line-height:1.14">Signals with their<br>reasons attached.<br><span class="grad-tx">Including the ones<br>that failed.</span></h1>
  <div class="url">nekara.xyz</div>
</div>`));

/* 2 — the introduction post: headline, then the register itself running below it */
fs.writeFileSync('brand/banners/b2-intro.html', page(1600,900,`
<div style="position:absolute;left:0;right:0;top:64px;display:flex;flex-direction:column;
  align-items:center;text-align:center;gap:24px">
  <div class="pill"><i></i>A public register of automated trading signals</div>
  <h1 style="font-size:68px">Signals with their reasons attached.<br><span class="grad-tx">Including the ones that failed.</span></h1>
  <p style="font-size:20px;line-height:1.6;color:var(--tx-2);max-width:900px">Every signal is published with the exact conditions that triggered it, then tracked to win, miss or dead.</p>
</div>
<img class="ui" src="${SHOT('pv-reg.png')}" style="position:absolute;left:50%;top:424px;
  transform:translateX(-50%);width:1300px">
<div class="fade" style="bottom:0;height:150px;background:linear-gradient(180deg,transparent,#08090B 58%)"></div>
<div style="position:absolute;left:0;right:0;bottom:26px;text-align:center" class="url">nekara.xyz</div>`));

/* 3 — the differentiator, shown rather than claimed: a win and a dead call,
      same page, same rules, both still carrying the reasons that fired them */
fs.writeFileSync('brand/banners/b3-method.html', page(1600,900,`
<div style="position:absolute;inset:0;padding:62px 70px 46px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:60px">
    <div>
      <div class="mono" style="font-size:13px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:16px">The register</div>
      <h2 style="font-size:58px">The win and the one that died.<br><span class="grad-tx">Same page, same rules.</span></h2>
      <p style="font-size:19px;line-height:1.6;color:var(--tx-2);max-width:820px;margin-top:22px">Both still carry the score that fired them and the exact conditions behind it. Nothing is edited after the fact, and nothing is taken down.</p>
    </div>
    <div class="wm" style="flex-shrink:0;margin-top:4px">${MARK}<span>Nekara</span></div>
  </div>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:center">
    <img class="ui" src="${SHOT('c-win.png')}" style="width:100%">
    <img class="ui" src="${SHOT('c-dead.png')}" style="width:100%">
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div class="url">nekara.xyz</div>
    <div class="mono" style="font-size:13px">SOLANA · BASE · BNB · ETHEREUM</div>
  </div>
</div>`));

/* 4 — square, for Telegram and IG. One dead call, kept. */
fs.writeFileSync('brand/banners/b4-square.html', page(1080,1080,`
<div style="position:absolute;inset:0;padding:76px 64px;display:flex;flex-direction:column;
  align-items:center;text-align:center">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <h1 style="font-size:54px;line-height:1.13;margin-top:40px">Every call in the order<br>it was fired.<br><span class="grad-tx">Wins, misses, and<br>the ones that died.</span></h1>
  <img class="ui" src="${SHOT('c-dead.png')}" style="width:100%;margin-top:52px">
  <div class="pill" style="margin-top:44px"><i></i>Failed calls are never removed</div>
  <div class="url" style="margin-top:auto">nekara.xyz</div>
</div>`));
console.log('4 banner html ditulis');

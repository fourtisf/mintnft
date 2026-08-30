const fs=require('fs');
const MARK=`<svg viewBox="0 0 120 120" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient></defs><circle cx="60" cy="60" r="51" stroke="url(#lg)" stroke-width="7.5"/><path d="M57.16 23.11L62.84 23.11L61.38 42.05L58.62 42.05ZM75.99 26.63L80.9 29.47L70.17 45.15L67.78 43.77ZM90.53 39.1L93.37 44.01L76.23 52.22L74.85 49.83ZM96.89 57.16L96.89 62.84L77.95 61.38L77.95 58.62ZM93.37 75.99L90.53 80.9L74.85 70.17L76.23 67.78ZM80.9 90.53L75.99 93.37L67.78 76.23L70.17 74.85ZM62.84 96.89L57.16 96.89L58.62 77.95L61.38 77.95ZM44.01 93.37L39.1 90.53L49.83 74.85L52.22 76.23ZM29.47 80.9L26.63 75.99L43.77 67.78L45.15 70.17ZM23.11 62.84L23.11 57.16L42.05 58.62L42.05 61.38ZM26.63 44.01L29.47 39.1L45.15 49.83L43.77 52.22ZM39.1 29.47L44.01 26.63L52.22 43.77L49.83 45.15Z" fill="url(#lg)"/><circle cx="60" cy="60" r="10" fill="url(#lg)"/></svg>`;

// tokens straight out of CLAUDE.md — nothing invented
const BASE=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{--bg:#08090B;--surface:#101216;--surface-2:#14171C;--border:rgba(255,255,255,.07);
--border-hi:rgba(255,255,255,.13);--tx:#F3F4F6;--tx-2:#8C929C;--tx-3:#585E68;
--blue:#5B7CFA;--violet:#9B6DFF;--accent:#6E7BFF;--grad:linear-gradient(120deg,#5B7CFA,#9B6DFF);
--win:#3ECF8E;--r:11px;--display:"Inter Tight",system-ui,sans-serif;--ui:"Inter",system-ui,sans-serif;
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
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 18px 50px -22px rgba(0,0,0,.9)}
.url{font-family:var(--mono);font-size:15px;color:var(--tx-3);letter-spacing:.02em}
.shot{position:absolute;inset:0;background:url('file:///home/user/mintnft/brand/shots/grid.png') center/cover no-repeat}
.scrim{position:absolute;inset:0}
</style>`;

const page=(w,h,inner,scrim,shot='')=>`${BASE}<style>body{width:${w}px;height:${h}px}</style>
<div class="shot" style="opacity:.85;${shot}"></div>
<div class="scrim" style="background:${scrim}"></div>
<div class="aur"></div><div class="dots" style="opacity:.5"></div>${inner}<div class="grain"></div>`;

/* 1 — X header, left 380px kept clear for the avatar */
fs.writeFileSync('brand/banners/b1-x-header.html', page(1500,500,`
<div style="position:absolute;left:390px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:26px">
  <div class="wm">${MARK}<span>Nekara</span></div>
  <h1 style="font-size:47px">Signals with their reasons attached.<br><span class="grad-tx">Including the ones that failed.</span></h1>
  <div class="url">nekara.xyz</div>
</div>
<div style="position:absolute;right:56px;bottom:40px" class="mono">SOLANA · BASE · BNB · ETHEREUM</div>`,
'linear-gradient(90deg,#08090B 18%,rgba(8,9,11,.90) 44%,rgba(8,9,11,.55) 76%,rgba(8,9,11,.42))'));

/* 2 — the introduction post */
fs.writeFileSync('brand/banners/b2-intro.html', page(1600,900,`
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px;gap:34px">
  <div class="pill"><i></i>A public register of automated trading signals</div>
  <h1 style="font-size:82px;max-width:1220px">Signals with their reasons attached.<br><span class="grad-tx">Including the ones that failed.</span></h1>
  <p style="font-size:23px;line-height:1.6;color:var(--tx-2);max-width:820px">Every signal is published with the exact conditions that triggered it, then tracked to win, miss or dead — so you can judge the reasoning, not just the result.</p>
  <div class="wm" style="margin-top:16px">${MARK}<span>Nekara</span></div>
  <div class="url">nekara.xyz</div>
</div>`,
'radial-gradient(120% 100% at 50% 50%,rgba(8,9,11,.70) 28%,rgba(8,9,11,.90) 74%)'));

/* 3 — the method, copy lifted from the site */
const M=[["Eight hard vetoes first","Liquidity floor, age window, cap ceiling, liquidity-to-cap ratio, sell pressure, no vertical entries, real socials, sane quote."],
["Peak sits next to now","Peak alone is how track records get faked — nobody actually sold there. The current multiple is always shown beside it."],
["The reasoning is published","Every signal carries the conditions that fired it, scored out of 100. Anyone can check which reasons actually earn their place."]];
fs.writeFileSync('brand/banners/b3-method.html', page(1600,900,`
<div style="position:absolute;inset:0;padding:86px 96px;display:flex;flex-direction:column;gap:52px">
  <div style="display:flex;align-items:flex-end;justify-content:space-between">
    <div>
      <div class="mono" style="font-size:13px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:18px">The method</div>
      <h2 style="font-size:62px">Three measurements.<br><span class="grad-tx">No exceptions.</span></h2>
    </div>
    <div class="wm">${MARK}<span>Nekara</span></div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:26px;align-items:start;flex:1;align-content:center">
    ${M.map(([t,d],i)=>`<div class="card" style="padding:34px 32px;display:flex;flex-direction:column;gap:16px">
      <div class="mono" style="font-size:13px;color:var(--accent)">0${i+1}</div>
      <div style="font-family:var(--display);font-weight:600;font-size:27px;letter-spacing:-.028em">${t}</div>
      <p style="font-size:17px;line-height:1.62;color:var(--tx-2)">${d}</p></div>`).join('')}
  </div>
  <div class="url">nekara.xyz</div>
</div>`,
'linear-gradient(180deg,rgba(8,9,11,.90) 40%,rgba(8,9,11,.96))'));

/* 4 — square, for Telegram and IG */
fs.writeFileSync('brand/banners/b4-square.html', page(1080,1080,`
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 92px;gap:38px">
  <div style="width:112px">${MARK}</div>
  <h1 style="font-size:60px;line-height:1.14">Signals with their<br>reasons attached.<br><span class="grad-tx">Including the ones<br>that failed.</span></h1>
  <div class="pill"><i></i>Failed calls are never removed</div>
  <div class="url" style="margin-top:10px">nekara.xyz</div>
</div>`,
'radial-gradient(110% 90% at 50% 46%,rgba(8,9,11,.70) 26%,rgba(8,9,11,.93) 72%)',
'background-size:150% auto;background-position:center 62%'));
console.log('4 banner html ditulis');

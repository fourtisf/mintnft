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
</style>`;

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

const KEY = (id, w) => {
  // The plate engraves a tier drawn from the sample seed. The season seed is
  // not out, and a banner carries no caption saying so.
  const body = proto().keySVG(id, 'full').body.replace(/(>TIER )[IVX]+(<)/, '$1\u2014$2');
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

if (!CA) console.error('  peringatan: out/keys.4663.json tidak terbaca — banner mint tanpa alamat kontrak');

console.log('18 banner + 1 avatar ditulis');

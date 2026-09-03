/* ═══════ data ═══════ */
const CC={SOL:"#9945FF",BASE:"#2E6BFF",BSC:"#F0B90B",ETH:"#8A93B2"};
const MIN=60000,T0=Date.now();
const RID=["volume_acceleration","buy_pressure","sweet_spot_age","depth",
  "trader_growth","steady_climb","paid_attention"];
const RMAP={"Volume running":"volume_acceleration","trades were buys":"buy_pressure",
  "past the snipers":"sweet_spot_age","deep enough":"depth",
  "Trade count accelerating":"trader_growth","Climbing steadily":"steady_climb",
  "active boosts":"paid_attention"};
const ridsOf=rs=>rs.map(r=>{for(const k in RMAP)if(r.includes(k))return RMAP[k];return null}).filter(Boolean);
const REASONS=[
 ["Volume running 3.4× the hourly pace","78% of the last 96 trades were buys","2.1h old — past the snipers, before the crowd"],
 ["Volume running 1.9× the hourly pace","Liquidity $41K — deep enough to get back out"],
 ["Volume running 5.2× the hourly pace","84% of the last 140 trades were buys","Trade count accelerating 2.8× against the hour","4 active boosts — someone is paying for eyes on it"],
 ["Climbing steadily — +6.1% on 5m, +19% on the hour","Liquidity $88K — deep enough to get back out"],
 ["Volume running 2.2× the hourly pace","71% of the last 58 trades were buys"],
 ["Volume running 4.1× the hourly pace","Trade count accelerating 2.2× against the hour","3.4h old — past the snipers, before the crowd"],
 ["Climbing steadily — +4.4% on 5m, +12% on the hour","Liquidity $62K — deep enough to get back out"],
 ["Volume running 6.8× the hourly pace","91% of the last 172 trades were buys","1.6h old — past the snipers, before the crowd"],
 ["Volume running 1.7× the hourly pace","66% of the last 44 trades were buys"],
 ["Volume running 4.6× the hourly pace","Trade count accelerating 3.1× against the hour","Liquidity $210K — deep enough to get back out"],
 ["Volume running 2.0× the hourly pace","Climbing steadily — +3.2% on 5m, +9% on the hour"],
 ["Volume running 3.8× the hourly pace","80% of the last 118 trades were buys","2.9h old — past the snipers, before the crowd"],
];
const DEMO=location.protocol==="file:";
const SEED=DEMO?[
 {n:"Save The Whales",t:"WHALES",c:"SOL",by:"desk",e:24100,p:58400,w:41200,ago:11,s:"pump.fun",ca:"9PE5pQ7x…pump",two:372},
 {n:"Chucho",t:"CHUCHO",c:"SOL",by:"nightbell",e:15400,p:22100,w:9800,ago:64,s:"pump.fun",ca:"4Hn2kLm9…pump",two:null},
 {n:"Brass Monkey",t:"BRASS",c:"BASE",by:"desk",e:31800,p:214000,w:168400,ago:96,s:"clanker",ca:"0x7fa2…9c41",two:840},
 {n:"Foundry",t:"FNDRY",c:"ETH",by:"orwell",e:82000,p:96500,w:71300,ago:143,s:"uniswap",ca:"0x1b8e…44a0",two:null},
 {n:"Kiln Dog",t:"KILN",c:"BSC",by:"nightbell",e:11200,p:47600,w:5100,ago:188,s:"four.meme",ca:"0x93cd…7e12",two:1260},
 {n:"Hallmark",t:"HLMK",c:"SOL",by:"desk",e:19700,p:41300,w:36900,ago:221,s:"pump.fun",ca:"BqW4rT1z…pump",two:604},
 {n:"Cupel",t:"CUPEL",c:"BASE",by:"orwell",e:44600,p:52800,w:14200,ago:1560,s:"clanker",ca:"0xc44a…21f8",two:null},
 {n:"Touchstone",t:"TOUCH",c:"SOL",by:"vault7",e:8900,p:31200,w:27400,ago:1880,s:"pump.fun",ca:"Ge8mNp3v…pump",two:198},
 {n:"Bullion Cat",t:"BULL",c:"BSC",by:"desk",e:27300,p:33100,w:29600,ago:2240,s:"four.meme",ca:"0x2ef7…b039",two:null},
 {n:"Crucible",t:"CRUC",c:"ETH",by:"vault7",e:126000,p:388000,w:341000,ago:2900,s:"uniswap",ca:"0x5d10…8ac2",two:1512},
 {n:"Fineness",t:"FINE",c:"BASE",by:"nightbell",e:16800,p:19200,w:1300,ago:3400,s:"clanker",ca:"0xa87b…3d55",two:null},
 {n:"Ingot",t:"INGOT",c:"SOL",by:"orwell",e:52400,p:143000,w:88700,ago:4100,s:"pump.fun",ca:"7Kd9sXe2…pump",two:466},
] : [];
function mkPath(e,p,w,n){const a=[],pk=Math.floor(n*(.28+Math.random()*.4));
  for(let i=0;i<n;i++){let v;
    if(i<=pk){const r=pk?i/pk:1;v=e+(p-e)*Math.pow(r,.62)}
    else{const r=(i-pk)/(n-1-pk||1);v=p+(w-p)*Math.pow(r,.75)}
    a.push(Math.max(v*(1+(Math.random()-.5)*.05),e*.02))}
  a[pk]=p;a[0]=e;a[n-1]=w;return a}
const calls=SEED.map((s,i)=>({id:"r"+i,reasons:REASONS[i%REASONS.length],
  rids:ridsOf(REASONS[i%REASONS.length]),
  score:[66,61,100,72,68,84,63,96,60,88,64,79][i%12],name:s.n,tick:s.t,chain:s.c,by:s.by,src:s.s,ca:s.ca,
  entry:s.e,peak:s.p,nowMc:s.w,liq:Math.round(s.e*.28),vol:Math.round(s.e*.45),
  twoIn:s.two,at:T0-s.ago*MIN,live:s.ago<1440,path:mkPath(s.e,s.p,s.w,48),flash:false}));

/* Names, symbols, dex ids and links come from a price API and end up inside
   innerHTML. A token called <img onerror=...> is a memecoin away, and this
   page renders whatever the provider says. Escape at the point of use. */
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const LINK_LABEL={site:"website",website:"website",twitter:"X",x:"X",telegram:"Telegram",
  discord:"Discord",tiktok:"TikTok",youtube:"YouTube",instagram:"Instagram",
  medium:"Medium",github:"GitHub",link:"link"};
/* The card gets the chart and nothing else — its footer already carries the
   address, the state and the share button. The detail page gets everything the
   token publishes, which is where a reader goes to look into it. */
const linkRow=(c,all)=>[
  c.pair?`<a class="lnk" href="${esc(DEX+c.chainId+"/"+c.pair)}" target="_blank" rel="noopener noreferrer">chart</a>`:"",
  ...(all?(c.links??[]):[]).map(l=>
    `<a class="lnk" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(LINK_LABEL[l.kind]??l.kind)}</a>`),
].join("");

/* What the chain said when the call fired.
   Every row here is either a fact the RPC stated or an admission that it did
   not. There is deliberately no third rendering: a check the engine could not
   run has to look different from one it ran and passed, or the panel is worth
   less than showing nothing, because a reader would read silence as safety. */
const ONCHAIN=[
  ["mint_revoked","mintAuthority","Mint authority",r=>r.mintAuthority==null?"revoked":"LIVE"],
  ["freeze_revoked","freezeAuthority","Freeze authority",r=>r.freezeAuthority==null?"revoked":"LIVE"],
  ["holder_concentration","topHolderPct","Largest wallet",r=>(r.topHolderPct*100).toFixed(1)+"% of supply"],
  ["holder_spread","top10Pct","Top 10 wallets",r=>(r.top10Pct*100).toFixed(1)+"% of supply"],
  ["lp_burned","lpBurnedPct","LP burned",r=>(r.lpBurnedPct*100).toFixed(1)+"%"],
];
function chainPanel(c){
  const r=c.onchain,have=Array.isArray(r?.have)?r.have:[];
  const sub=!r
    ?`Nothing was read on-chain for this call — no node was configured when it fired. Not checked is not the same as clean.`
    :have.length===0
      ?`The node answered nothing usable when this call fired. Every line below is unread, not passed.`
      :`Read from the chain at the moment it fired, and kept on the call. A line reading “not checked” was never established, and is not a pass.`;
  const rows=ONCHAIN.map(([,field,label,val])=>{
    const read=have.includes(field);
    return `<div class="gate${read?"":" unread"}"><span class="m">${read?"✓":"·"}</span>`
      +`<span class="g" style="font-size:13px;line-height:1.5">${label}</span>`
      +`<span class="t${read?"":" unread"}">${read?esc(val(r)):"not checked"}</span></div>`;
  }).join("");
  return `<h3 style="margin-top:24px">On-chain at fire</h3><p class="sub">${sub}</p>${rows}`;
}

const fmt=v=>v>=1e9?(v/1e9).toFixed(2)+"B":v>=1e6?(v/1e6).toFixed(2)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":Math.round(v);
const mult=c=>c.peak/c.entry, nx=c=>c.nowMc/c.entry;
/* The engine decides the verdict, and it records death separately on purpose:
   a call that reached 2× and later went to zero is a win that died, and the
   register keeps both marks rather than replacing one with the other. Deriving
   the verdict here instead printed DEAD on a card while /api/stats counted the
   same call as a win — the page contradicting the record it publishes. The
   rules below are the fallback for the demo set, which carries no verdict. */
const deadOf=c=>c.isDead??(c.nowMc<c.entry*.1);
const win=c=>c.verdict?c.verdict==="win":mult(c)>=2;
const vrd=c=>c.verdict??(deadOf(c)?"dead":win(c)?"win":c.live?"open":"miss");
/* One badge has to carry both marks: a win stays a win however it ended, and
   anything else that died reads DEAD. The card dims and the footer says which. */
const badgeOf=c=>{const v=vrd(c);return v==="win"?"win":deadOf(c)?"dead":v};
/* A call that reached 2× and later went to zero carries both marks, and both
   have to be visible at once. WIN alone over a token at 8% of entry reads as
   the register flattering itself, and the death was a scroll away — the engine
   keeps the two facts side by side and so should the badge. Anything that died
   without winning already badges DEAD on its own. */
const alsoDead=c=>deadOf(c)&&vrd(c)==="win"?'<span class="badge dead">DEAD</span>':"";
const LBL={win:"WIN",miss:"MISS",open:"LIVE",dead:"DEAD"};
function ago(ts){const m=Math.floor((Date.now()-ts)/MIN);if(m<1)return"just now";if(m<60)return m+"m ago";
  const h=Math.floor(m/60);return h<24?h+"h ago":Math.floor(h/24)+"d ago"}
const clock=ts=>new Date(ts).toISOString().slice(11,16)+" UTC";
const utc=ts=>{const d=new Date(ts);return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"})+" · "+d.toISOString().slice(11,19)+" UTC"};
const secs=s=>s<60?s+"s":s<7200?Math.floor(s/60)+"m "+(s%60)+"s":(s/3600).toFixed(1)+"h";

/* ═══════ sparkline with 2x threshold ═══════ */
function spark(c){
  const p=c.path,W=620,H=54,two=c.entry*2;
  const mn=Math.min(...p,two*.72),mx=Math.max(...p,two*1.06),r=(mx-mn)||1;
  const X=i=>i/(p.length-1)*W, Y=v=>H-((v-mn)/r)*(H-8)-4;
  const v=vrd(c);
  const col=deadOf(c)?"var(--dead)":v==="open"?"var(--win)":v==="win"?"#7E8CFF":"var(--tx-3)";
  const d=p.map((y,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(y).toFixed(1)).join("");
  const g="g"+c.id,cl="c"+c.id,yT=Y(two).toFixed(1);
  return{yT,html:`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
      <clipPath id="${cl}"><rect x="0" y="0" width="${W}" height="${yT}"/></clipPath></defs>
    <path d="${d}L${W} ${H}L0 ${H}Z" fill="url(#${g})"/>
    <line class="thresh" x1="0" y1="${yT}" x2="${W}" y2="${yT}"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" opacity=".45"/>
    <path d="${d}" fill="none" stroke="#8E9AFF" stroke-width="1.8" stroke-linejoin="round" clip-path="url(#${cl})"/></svg>`};
}
/* The fourth cell on a card. A call that reached 2x is asked how fast; one that
   died is asked how long it lasted - the number that decides whether any of
   this is tradeable at all - and one still running is asked how far it has
   slipped off its peak. */
function cell4(c){
  if(c.twoIn)return["Reached 2\u00d7 in",secs(c.twoIn)];
  if(c.deadAt)return["Died after",secs(Math.max(0,Math.round((c.deadAt-c.at)/1000)))];
  return["Off peak",((c.nowMc/c.peak-1)*100).toFixed(1)+"%"];
}
const DEX="https://dexscreener.com/";
function card(c,i,mini){
  const v=badgeOf(c),n=nx(c),off=(c.nowMc/c.peak-1)*100,sp=spark(c),[k4,v4]=cell4(c);
  // A dead call's story is where it ended; a settled one's is how far it got.
  // Keying this off the badge instead printed the peak on a dead call, so a
  // token sitting at 4% of entry headlined "1.00×" — it never rose, and that
  // read as breaking even.
  const head=(c.live||deadOf(c)?n:mult(c)).toFixed(2)+"×";
  const bg=deadOf(c)?"d":v==="win"?"w":v==="open"?"":"m";
  return `<article class="rec ${deadOf(c)?"dead":""}" data-id="${c.id}" style="animation-delay:${Math.min(i*34,300)}ms">
    <div class="rh"><div class="tok">${esc(c.tick[0])}</div>
      <div class="rh-id"><h3>${esc(c.name)}</h3>
        <div class="rh-meta"><span class="tk">$${esc(c.tick)}</span><span class="dotsep"></span>${esc(c.chain)}<span class="dotsep"></span>${esc(c.src)}<span class="dotsep"></span>${c.by==="desk"?"house desk":"@"+esc(c.by)}</div></div>
      <div class="mx"><div class="big ${bg}" data-mx="${c.id}">${head}</div><span class="badge ${v}">${LBL[v]}</span>${alsoDead(c)}</div></div>
    <div class="spark">${sp.html}<span class="thresh-lbl" style="top:${sp.yT/54*100}%">2×</span></div>
    ${mini?"":`<div class="why"><span class="why-h">Why it fired<b>${c.score}</b></span>
      ${c.reasons.map(r=>`<span class="wchip">${esc(r)}</span>`).join("")}</div>`}
    <div class="rf">
      <div><div class="k">Entry MC</div><div class="v mut">${fmt(c.entry)}</div></div>
      <div><div class="k">Peak MC</div><div class="v">${fmt(c.peak)}</div></div>
      <div><div class="k">Now MC</div><div class="v ${n>=1?"up":"dn"}" data-now="${c.id}">${fmt(c.nowMc)}</div></div>
      <div><div class="k" data-xk="${c.id}">${k4}</div><div class="v mut" data-x="${c.id}">${v4}</div></div></div>
    ${mini?"":`<div class="rft"><span>${utc(c.at)}</span>
      <button class="ca" data-ca="${esc(c.addr||c.ca)}">${esc(c.ca)}<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.6" y="3.6" width="7" height="7" rx="1.4"/><path d="M8.4 1.4h-7v7"/></svg></button>
      ${linkRow(c)}
      <span class="live-tag">${deadOf(c)?'<span style="color:var(--dead)">Died</span>'
        :c.live?'<span class="pulse"></span>Live':'<span style="color:var(--tx-3)">Settled</span>'}</span>
      <button class="shbtn" data-share="${c.id}">
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 6.5h4M6 4.5v4M2 2h8v8H2z"/></svg>Share</button></div>`}
  </article>`;
}

/* ═══════ GUILLOCHÉ KEY ART ═══════ */
function rnd(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
/* r(θ) = A + B·cos(nθ+φ) + C·cos(mθ+ψ) — the rosette formula used on banknote engraving */
function rose(A,B,n,ph,C,m,ps,steps){
  let d="";
  for(let i=0;i<=steps;i++){
    const t=i/steps*Math.PI*2;
    const r=A+B*Math.cos(n*t+ph)+C*Math.cos(m*t+ps);
    const x=300+Math.cos(t)*r, y=300+Math.sin(t)*r;
    d+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);
  }
  return d+"Z";
}

function mul32(a,b){return Math.imul(a,b)>>>0}
function nextR(s){
  s=(s+0x6D2B79F5)>>>0;
  let t=mul32(s^(s>>>15),(1|s)>>>0);
  t=((t+mul32(t^(t>>>7),(61|t)>>>0))>>>0)^t;
  return [s,(t^(t>>>14))>>>0];
}

/* ── seed derivation, mirroring ProofRenderer._seed32 ── */
const SEASON_SEED=0x7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7fn;
function seedFor(id){
  let x=SEASON_SEED,f=0;
  for(let i=0;i<8;i++){f=(f^Number(x&0xffffffffn))>>>0;x>>=32n}
  let s=(f+Math.imul(id,2654435761))>>>0;
  for(let i=0;i<3;i++) s=nextR(s)[0];
  return s;
}

const ROMAN=["","I","II","III"];


/* Mirrors ProofRenderer.traits() exactly: same seed, same stream, same
   integer arithmetic, same guard rules. Verified token by token. */
const W_HOOD=[20,16,14,13,12,10,9,6],W_EYES=[18,16,15,13,12,11,9,6],
      W_MASK=[24,20,17,15,13,11],W_FIT=[24,20,17,15,13,11],
      W_PAL=[14,13,12,11,10,9,8,7,5,3],W_BG=[23,20,17,15,14,11],
      W_AURA=[38,28,22,12],W_TONE=[34,28,22,16];
const HOOD_N=["Hood","Visorhelm","Cap","Bare","Horned","Halo","Antenna","Crown"];
const EYES_N=["Visor","Dots","Slits","Cyclops","Scanline","Cross","Wide","Hollow"];
const MASK_N=["None","Respirator","Scarf","Grill","Bandana","Rebreather"];
const FIT_N =["Plain","Collar","Plated","Straps","Zipped","Cloak"];
const BG_N  =["Chamber","Halation","Monolith","Aperture","Nightfall","Ashfall"];
const AURA_N=["None","Glow","Ring","Static"];
const TONE_N=["Slate","Ash","Ink","Steel"];
const TONE_C=["#232830","#2C323B","#171B21","#39414C"];
const PAL=[["Azure","#5B7CFA","#7E8CFF"],["Iris","#7E8CFF","#9B6DFF"],
  ["Prism","#B39BFF","#6FD8FF"],["Cyan","#4FD1C5","#5B7CFA"],
  ["Orchid","#9B6DFF","#FF6FB5"],["Glacier","#6FD8FF","#A8FFEA"],
  ["Verdant","#3ECF8E","#6FD8FF"],["Ember","#FFB86F","#FF6F91"],
  ["Platinum","#C0C6D4","#8C929C"],["Gilt","#FFD86F","#FF9F6F"]];
const P32=4294967296;
function wpickI(v,w){
  const tot=w.reduce((a,b)=>a+b,0);let x=v*tot,cum=0;
  for(let i=0;i<w.length;i++){cum+=w[i];if(x<cum*P32)return i}
  return w.length-1;
}
const idxI=(v,len)=>Math.floor(v*len/P32);

const TRAIT_CACHE={};
function keyTraits(id){
  if(TRAIT_CACHE[id])return TRAIT_CACHE[id];
  let s=seedFor(id),v;
  [s,v]=nextR(s); const roll=Math.floor(v*10000/P32);
  const tier=roll<991?3:roll<3994?2:1;
  let hood,eyes,mask,fit,pal,bg,aura,tone,ph;
  [s,v]=nextR(s); hood=wpickI(v,W_HOOD);
  [s,v]=nextR(s); eyes=wpickI(v,W_EYES);
  [s,v]=nextR(s); mask=wpickI(v,W_MASK);
  [s,v]=nextR(s); fit =wpickI(v,W_FIT);
  [s,v]=nextR(s); pal =wpickI(v,W_PAL);
  [s,v]=nextR(s); bg  =wpickI(v,W_BG);
  [s,v]=nextR(s); aura=wpickI(v,W_AURA);
  [s,v]=nextR(s); tone=wpickI(v,W_TONE);
  [s,v]=nextR(s); ph  =Math.floor(v*1000/P32);
  /* guards: combinations that render as a shapeless dark blob */
  if(hood===3&&eyes===7&&bg===4) bg=0;          // bare head, hollow eyes, dark backdrop
  if(bg>=4&&aura===0&&fit===0) aura=1;          // nothing to separate figure from ground
  if(hood===1&&mask===1) mask=0;                // helmet already covers the mouth
  if(hood===5&&aura===2) aura=1;                // halo plus ring reads as one blob
  const t={tier,
    hoodI:hood,hood:HOOD_N[hood], eyesI:eyes,eyes:EYES_N[eyes],
    maskI:mask,mask:MASK_N[mask], fitI:fit,fit:FIT_N[fit],
    palI:pal,pal:PAL[pal],        bgI:bg,bg:BG_N[bg],
    auraI:aura,aura:AURA_N[aura], toneI:tone,tone:TONE_N[tone],
    toneC:TONE_C[tone], ph};
  TRAIT_CACHE[id]=t;return t;
}

/* ─────────── character renderer ───────────
   A hooded operator, built from flat vector layers: background, aura,
   shoulders, head, hood, eyes, mask, headgear. Simple shapes on purpose -
   they read at 128px and they port to Solidity far cheaper than curves. */

function keySVG(id,detail){
  const t=keyTraits(id),grid=detail==="grid";
  const uid=detail[0]+id,[palName,hA,hB]=t.pal;
  /* SMIL, not CSS: the motion is part of the artwork, so it survives being
     served from a data URI or read straight off the chain. */
  const A=!grid;
  const sp=(base)=>(base+((t.ph%37)/37)*1.3).toFixed(2)+"s";   // desync per token
  const off=(-(t.ph%50)/10).toFixed(1)+"s";
  const skin=t.toneC, dark="#12161B", deep="#0B0E12";
  const sw=grid?2.4:1.5;
  /* Head sits dead centre. The old +-4px nudge was invisible and it forced
     every shape to be recomputed rather than being a constant string, which
     matters a great deal once this has to run inside a contract. */
  const hx=300;

  /* ── background ──
     Flat fills and hard grids are what made these read cheap. Everything here
     is a gradient with a vignette, so the figure sits in depth instead of
     being pasted onto a colour. */
  const G=`
    <linearGradient id="fl${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hA}" stop-opacity="0"/>
      <stop offset="1" stop-color="${hA}" stop-opacity=".13"/></linearGradient>
    <radialGradient id="ch${uid}" cx="50%" cy="26%" r="72%">
      <stop offset="0" stop-color="${hA}" stop-opacity=".17"/>
      <stop offset="1" stop-color="${hA}" stop-opacity="0"/></radialGradient>
    <linearGradient id="mo${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hA}" stop-opacity=".16"/>
      <stop offset="1" stop-color="${hB}" stop-opacity=".02"/></linearGradient>
    <linearGradient id="nf${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hB}" stop-opacity=".15"/>
      <stop offset=".55" stop-color="${hA}" stop-opacity=".04"/>
      <stop offset="1" stop-color="#05070A" stop-opacity=".9"/></linearGradient>
    <radialGradient id="vg${uid}" cx="50%" cy="42%" r="70%">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".72"/></radialGradient>`;

  let bg=`<rect width="600" height="600" fill="#090B0D"/>`;   // === --art in the CSS
  if(t.bgI===0){                                   // Chamber — studio falloff
    bg+=`<rect width="600" height="600" fill="url(#ch${uid})"/>
         <rect y="392" width="600" height="208" fill="url(#fl${uid})"/>`;
  }else if(t.bgI===1){                             // Halation — bloom behind the head
    bg+=`<circle cx="${hx}" cy="238" r="268" fill="url(#ch${uid})"/>
         <ellipse cx="${hx}" cy="238" rx="150" ry="150" fill="${hA}" opacity=".07"/>`;
  }else if(t.bgI===2){                             // Monolith — a slab it stands against
    bg+=`<rect x="150" y="46" width="300" height="470" rx="26" fill="url(#mo${uid})"/>
         <rect x="150" y="46" width="300" height="470" rx="26" fill="none"
               stroke="${hA}" stroke-width="${grid?2:1.1}" opacity=".3"/>`;
  }else if(t.bgI===3){                             // Aperture — partial arcs, not full rings
    for(let i=0;i<3;i++){const r=170+i*54;
      bg+=`<path d="M${300-r} 300A${r} ${r} 0 0 1 ${300+r} 300" fill="none" stroke="${hA}"
             stroke-width="${grid?2.2:1.2}" opacity="${(.26-i*.06).toFixed(2)}"
             stroke-linecap="round" transform="rotate(${-24+i*16} 300 300)"/>`}
    bg+=`<rect width="600" height="600" fill="url(#ch${uid})" opacity=".55"/>`;
  }else if(t.bgI===4){                             // Nightfall — horizon behind the shoulders
    bg+=`<rect width="600" height="600" fill="url(#nf${uid})"/>
         <line x1="0" y1="408" x2="600" y2="408" stroke="${hA}" stroke-width="${grid?1.6:.9}" opacity=".26"/>`;
  }else{                                           // Ashfall — drifting particles
    for(let i=0;i<26;i++){
      const x=((t.ph*7+i*97)%580)+10, y=((t.ph*3+i*151)%560)+20, r=(i%4)*.7+1.1;
      bg+=`<circle cx="${x}" cy="${y}" r="${(r*(grid?1.9:1)).toFixed(1)}" fill="${hB}" opacity="${(.06+(i%5)*.035).toFixed(3)}">${
        A?`<animate attributeName="cy" values="${y};${y+38};${y}" dur="${sp(7+i%5)}" repeatCount="indefinite"/>`:""}</circle>`}
    bg+=`<rect width="600" height="600" fill="url(#ch${uid})" opacity=".6"/>`;
  }
  /* Vignette on every backdrop. This single layer is most of the difference. */
  bg+=`<rect width="600" height="600" fill="url(#vg${uid})"/>`;
  /* Ground shadow so the figure is standing in the frame, not floating on it. */
  bg+=`<ellipse cx="${hx}" cy="588" rx="212" ry="34" fill="#000" opacity=".5"/>`;

  /* ── aura behind the figure ── */
  let aura="";
  if(t.auraI===1) aura=`<circle cx="${hx}" cy="255" r="185" fill="url(#au${uid})">${A?`<animate attributeName="opacity" values="1;.55;1" dur="${sp(4.4)}" repeatCount="indefinite"/>`:""}</circle>`;
  else if(t.auraI===2) aura=`<circle cx="${hx}" cy="255" r="172" fill="none" stroke="${hA}" stroke-width="${grid?3.4:2.2}" opacity=".42" stroke-dasharray="26 14">${A?`<animateTransform attributeName="transform" type="rotate" from="0 ${hx} 255" to="360 ${hx} 255" dur="${sp(22)}" repeatCount="indefinite"/>`:""}</circle>`;
  else if(t.auraI===3){let d="";for(let i=0;i<26;i++){const ang=i*13.8*Math.PI/180,r1=176,r2=176+(i%3?9:20);
      d+=`M${(hx+Math.cos(ang)*r1).toFixed(0)} ${(255+Math.sin(ang)*r1).toFixed(0)}L${(hx+Math.cos(ang)*r2).toFixed(0)} ${(255+Math.sin(ang)*r2).toFixed(0)}`}
    aura=`<g opacity=".45">${A?`<animateTransform attributeName="transform" type="rotate" from="360 ${hx} 255" to="0 ${hx} 255" dur="${sp(30)}" repeatCount="indefinite"/>`:""}<path d="${d}" stroke="${hA}" stroke-width="${grid?3:2}"/></g>`}

  /* ── shoulders and outfit ── */
  let body=`<path d="M96 600C96 500 176 434 ${hx} 434C${hx+120} 434 504 500 504 600Z" fill="${dark}"/>`;
  if(t.fitI===1) body+=`<path d="M${hx-74} 452L${hx-40} 540L${hx} 470L${hx+40} 540L${hx+74} 452" fill="none" stroke="${hA}" stroke-width="${sw*1.5}" opacity=".8"/>`;
  else if(t.fitI===2) body+=`<path d="M110 596C118 512 168 468 214 452L232 520Z" fill="${skin}" opacity=".85"/><path d="M490 596C482 512 432 468 386 452L368 520Z" fill="${skin}" opacity=".85"/><path d="M110 596C118 512 168 468 214 452M490 596C482 512 432 468 386 452" fill="none" stroke="${hA}" stroke-width="${sw}" opacity=".6"/>`;
  else if(t.fitI===3) body+=`<path d="M${hx-88} 470L${hx+62} 600M${hx+88} 470L${hx-62} 600" stroke="${hA}" stroke-width="${sw*2.4}" opacity=".5"/>`;
  else if(t.fitI===4) body+=`<path d="M${hx} 448V600" stroke="${hA}" stroke-width="${sw*1.4}" opacity=".55" stroke-dasharray="${grid?"10 8":"7 7"}"/>`;
  else if(t.fitI===5) body+=`<path d="M96 600C96 494 172 430 ${hx} 430C${hx+124} 430 504 494 504 600Z" fill="none" stroke="${hA}" stroke-width="${sw*1.3}" opacity=".45"/><path d="M${hx-56} 436L${hx-96} 600M${hx+56} 436L${hx+96} 600" stroke="${hA}" stroke-width="${sw}" opacity=".3"/>`;

  /* ── neck and head ── */
  let head=`<rect x="${hx-34}" y="330" width="68" height="86" rx="18" fill="${skin}" opacity=".82"/>`;
  head+=`<rect x="${hx-92}" y="146" width="184" height="212" rx="56" fill="${skin}"/>`;
  head+=`<rect x="${hx-92}" y="146" width="184" height="212" rx="56" fill="none" stroke="${hA}" stroke-width="${grid?1.6:.9}" opacity=".28"/>`;
  head+=`<rect x="${hx-72}" y="196" width="144" height="128" rx="34" fill="${deep}" opacity=".92"/>`;
  /* Rim light down the left edge. One thin stroke, and the head stops looking flat. */
  head+=`<path d="M${hx-92} 302V202A56 56 0 0 1 ${hx-36} 146" fill="none" stroke="${hB}"
    stroke-width="${grid?3:1.8}" opacity=".5" stroke-linecap="round"/>`;

  /* ── hood / headgear ── */
  let hood="",over="";
  if(t.hoodI===0) hood=`<path d="M${hx-124} 400C${hx-140} 250 ${hx-92} 118 ${hx} 118C${hx+92} 118 ${hx+140} 250 ${hx+124} 400C${hx+96} 344 ${hx+92} 214 ${hx} 214C${hx-92} 214 ${hx-96} 344 ${hx-124} 400Z" fill="${dark}"/><path d="M${hx-124} 400C${hx-140} 250 ${hx-92} 118 ${hx} 118C${hx+92} 118 ${hx+140} 250 ${hx+124} 400" fill="none" stroke="${hA}" stroke-width="${sw}" opacity=".55"/>`;
  else if(t.hoodI===1){hood=`<path d="M${hx-100} 300V206C${hx-100} 150 ${hx-56} 118 ${hx} 118C${hx+56} 118 ${hx+100} 150 ${hx+100} 206V300Z" fill="${dark}"/><rect x="${hx-84}" y="236" width="168" height="52" rx="16" fill="${deep}"/><path d="M${hx-100} 300V206C${hx-100} 150 ${hx-56} 118 ${hx} 118C${hx+56} 118 ${hx+100} 150 ${hx+100} 206V300" fill="none" stroke="${hA}" stroke-width="${sw}" opacity=".6"/>`;}
  else if(t.hoodI===2) hood=`<path d="M${hx-104} 190C${hx-104} 138 ${hx-58} 112 ${hx} 112C${hx+58} 112 ${hx+104} 138 ${hx+104} 190Z" fill="${dark}"/><rect x="${hx-134}" y="186" width="268" height="20" rx="10" fill="${dark}"/><rect x="${hx-134}" y="186" width="268" height="20" rx="10" fill="none" stroke="${hA}" stroke-width="${grid?1.6:1}" opacity=".5"/>`;
  else if(t.hoodI===4) over=`<path d="M${hx-92} 168C${hx-136} 128 ${hx-150} 74 ${hx-138} 44C${hx-104} 68 ${hx-84} 112 ${hx-78} 152M${hx+92} 168C${hx+136} 128 ${hx+150} 74 ${hx+138} 44C${hx+104} 68 ${hx+84} 112 ${hx+78} 152" fill="none" stroke="${hA}" stroke-width="${sw*2.2}" stroke-linecap="round" opacity=".85"/>`;
  else if(t.hoodI===5) over=`<ellipse cx="${hx}" cy="108" rx="86" ry="18" fill="none" stroke="${hA}" stroke-width="${sw*2}" opacity=".8">${A?`<animate attributeName="cy" values="108;98;108" dur="${sp(3.9)}" calcMode="spline" keyTimes="0;.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/>`:""}</ellipse>`;
  else if(t.hoodI===6) over=`<path d="M${hx+52} 152L${hx+86} 74" stroke="${hA}" stroke-width="${sw*1.6}" opacity=".8"/><circle cx="${hx+86}" cy="66" r="${grid?13:10}" fill="${hA}">${A?`<animate attributeName="opacity" values="1;.15;1;1" keyTimes="0;.12;.3;1" dur="${sp(1.6)}" repeatCount="indefinite"/>`:""}</circle>`;
  else if(t.hoodI===7) over=`<path d="M${hx-88} 152L${hx-66} 88L${hx-30} 128L${hx} 66L${hx+30} 128L${hx+66} 88L${hx+88} 152Z" fill="none" stroke="${hA}" stroke-width="${sw*1.6}" stroke-linejoin="round" opacity=".9"/>`;

  /* ── eyes: the focal point ── */
  const ey=262; let eyes="";
  const blink=A?`<animate attributeName="opacity" values="1;1;.05;1;1;.7;1"
    keyTimes="0;0.62;0.645;0.67;0.88;0.925;1" dur="${sp(5.6)}" repeatCount="indefinite"/>`:"";
  const glow=(inner)=>`<g opacity=".35">${inner.replace(/__W__/g,String(grid?9:7))}</g>${inner.replace(/__W__/g,String(grid?4:3))}`;
  if(t.eyesI===0) eyes=`<rect x="${hx-62}" y="${ey-13}" width="124" height="26" rx="13" fill="${hA}" opacity=".28"/><rect x="${hx-56}" y="${ey-8}" width="112" height="16" rx="8" fill="${hB}"/>`;
  else if(t.eyesI===1) eyes=`<circle cx="${hx-32}" cy="${ey}" r="${grid?17:14}" fill="${hA}" opacity=".3"/><circle cx="${hx+32}" cy="${ey}" r="${grid?17:14}" fill="${hA}" opacity=".3"/><circle cx="${hx-32}" cy="${ey}" r="${grid?10:8}" fill="${hB}"/><circle cx="${hx+32}" cy="${ey}" r="${grid?10:8}" fill="${hB}"/>`;
  else if(t.eyesI===2) eyes=`<path d="M${hx-62} ${ey-10}L${hx-14} ${ey+2}M${hx+62} ${ey-10}L${hx+14} ${ey+2}" stroke="${hA}" stroke-width="${grid?16:13}" stroke-linecap="round" opacity=".3"/><path d="M${hx-60} ${ey-9}L${hx-18} ${ey+1}M${hx+60} ${ey-9}L${hx+18} ${ey+1}" stroke="${hB}" stroke-width="${grid?8:6}" stroke-linecap="round"/>`;
  else if(t.eyesI===3) eyes=`<circle cx="${hx}" cy="${ey}" r="${grid?38:32}" fill="${hA}" opacity=".26"/><circle cx="${hx}" cy="${ey}" r="${grid?24:20}" fill="${hB}"/><circle cx="${hx}" cy="${ey}" r="${grid?10:8}" fill="${deep}"/>`;
  else if(t.eyesI===4){eyes=`<rect x="${hx-64}" y="${ey-15}" width="128" height="30" rx="6" fill="${hA}" opacity=".22"/>`;
    for(let i=0;i<7;i++)eyes+=`<rect x="${hx-58+i*17}" y="${ey-10}" width="${grid?9:7}" height="20" rx="3" fill="${hB}" opacity="${(.55+((i+t.ph)%3)*.22).toFixed(2)}"/>`}
  else if(t.eyesI===5) eyes=`<path d="M${hx-46} ${ey-14}L${hx-18} ${ey+14}M${hx-46} ${ey+14}L${hx-18} ${ey-14}M${hx+18} ${ey-14}L${hx+46} ${ey+14}M${hx+18} ${ey+14}L${hx+46} ${ey-14}" stroke="${hB}" stroke-width="${grid?9:7}" stroke-linecap="round"/>`;
  else if(t.eyesI===6) eyes=`<rect x="${hx-64}" y="${ey-16}" width="52" height="32" rx="7" fill="${hA}" opacity=".3"/><rect x="${hx+12}" y="${ey-16}" width="52" height="32" rx="7" fill="${hA}" opacity=".3"/><rect x="${hx-59}" y="${ey-11}" width="42" height="22" rx="5" fill="${hB}"/><rect x="${hx+17}" y="${ey-11}" width="42" height="22" rx="5" fill="${hB}"/>`;
  else eyes=`<ellipse cx="${hx-32}" cy="${ey}" rx="${grid?20:17}" ry="${grid?24:21}" fill="#05070A"/><ellipse cx="${hx+32}" cy="${ey}" rx="${grid?20:17}" ry="${grid?24:21}" fill="#05070A"/><circle cx="${hx-32}" cy="${ey+4}" r="${grid?6:4}" fill="${hB}"/><circle cx="${hx+32}" cy="${ey+4}" r="${grid?6:4}" fill="${hB}"/>`;

  /* ── mask ── */
  const my=316; let mask="";
  if(t.maskI===1){mask=`<rect x="${hx-52}" y="${my-16}" width="104" height="52" rx="18" fill="${dark}" stroke="${hA}" stroke-width="${sw}" opacity=".95"/>`;
    for(let i=0;i<3;i++)mask+=`<rect x="${hx-30+i*22}" y="${my-2}" width="${grid?9:7}" height="24" rx="3" fill="${hA}" opacity=".55"/>`}
  else if(t.maskI===2) mask=`<path d="M${hx-84} ${my-4}C${hx-40} ${my+30} ${hx+40} ${my+30} ${hx+84} ${my-4}L${hx+84} ${my+32}C${hx+40} ${my+58} ${hx-40} ${my+58} ${hx-84} ${my+32}Z" fill="${dark}" stroke="${hA}" stroke-width="${sw}" opacity=".9"/>`;
  else if(t.maskI===3){mask=`<rect x="${hx-46}" y="${my-8}" width="92" height="42" rx="8" fill="${deep}"/>`;
    for(let i=0;i<5;i++)mask+=`<rect x="${hx-38+i*18}" y="${my-4}" width="${grid?7:5}" height="34" rx="2" fill="${hA}" opacity=".7"/>`}
  else if(t.maskI===4) mask=`<path d="M${hx-80} ${my-8}L${hx+80} ${my-8}L${hx} ${my+56}Z" fill="${dark}" stroke="${hA}" stroke-width="${sw}" opacity=".9"/>`;
  else if(t.maskI===5) mask=`<circle cx="${hx}" cy="${my+8}" r="${grid?30:26}" fill="${dark}" stroke="${hA}" stroke-width="${sw}"/><circle cx="${hx}" cy="${my+8}" r="${grid?13:11}" fill="${hA}" opacity=".5"/><path d="M${hx+26} ${my+18}C${hx+70} ${my+34} ${hx+88} ${my+60} ${hx+92} ${my+92}" fill="none" stroke="${hA}" stroke-width="${sw*1.6}" opacity=".6"/>`;

  const label=grid?"":`<rect x="34" y="514" width="152" height="52" rx="10" fill="#0A0C0E" stroke="${hA}" stroke-width=".9" opacity=".94"/>
    <text x="50" y="538" font-family="JetBrains Mono,monospace" font-size="15" font-weight="600" fill="${hA}">${String(id).padStart(4,"0")}</text>
    <text x="50" y="554" font-family="JetBrains Mono,monospace" font-size="8" letter-spacing="1.6" fill="#585E68">TIER ${ROMAN[t.tier]}</text>`;

  eyes=`<g>${blink}${eyes}</g>`;

  /* scan sweep inside the face recess */
  const scan=A?`<rect x="${hx-72}" y="196" width="144" height="3" fill="${hB}">
    <animate attributeName="y" values="200;318;200" dur="${sp(3.8)}" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;.55;0;0" keyTimes="0;.3;.62;1" dur="${sp(3.8)}" repeatCount="indefinite"/></rect>`:"";

  /* monitor scanlines over everything - the thing that reads as "feed" */
  const crt=A?`<rect width="600" height="600" fill="url(#sl${uid})" opacity=".085">
    <animateTransform attributeName="patternTransform" type="translate" values="0 0;0 7" dur="1.1s" repeatCount="indefinite"/></rect>`:"";

  /* the whole figure breathes */
  const breathe=A?`<animateTransform attributeName="transform" type="translate"
    values="0 0;0 -7;0 0" dur="${sp(4.6)}" calcMode="spline"
    keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/>`:"";

  return{tier:t.tier,traits:t,body:`<defs>${G}
      <pattern id="sl${uid}" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="2.4" fill="#9FB4C8"/></pattern>
      <radialGradient id="au${uid}"><stop offset="0" stop-color="${hA}" stop-opacity=".4"/><stop offset="1" stop-color="${hA}" stop-opacity="0"/></radialGradient>
    </defs>${bg}${aura}<g>${breathe}${body}${head}${hood}${scan}${eyes}${mask}${over}</g>${crt}${label}`};
}

const RARITY=(()=>{
  const c={hood:{},eyes:{},mask:{},fit:{},palette:{},bg:{},aura:{},tone:{},tier:{}};
  for(let i=1;i<=666;i++){const t=keyTraits(i);
    const v={hood:t.hood,eyes:t.eyes,mask:t.mask,fit:t.fit,palette:t.pal[0],
             bg:t.bg,aura:t.aura,tone:t.tone,tier:"Tier "+ROMAN[t.tier]};
    for(const k in v)c[k][v[k]]=(c[k][v[k]]||0)+1}
  return c;
})();
/* Combined rarity: sum of 1/frequency across every trait, then ranked.
   Per-trait percentages alone don't tell a collector what they hold. */
const RANK=(()=>{
  const score=id=>{const t=keyTraits(id);
    return 1/RARITY.hood[t.hood]+1/RARITY.eyes[t.eyes]+1/RARITY.mask[t.mask]
      +1/RARITY.fit[t.fit]+1/RARITY.palette[t.pal[0]]+1/RARITY.bg[t.bg]
      +1/RARITY.aura[t.aura]+1/RARITY.tone[t.tone]+1/RARITY.tier["Tier "+ROMAN[t.tier]]};
  const a=[];for(let i=1;i<=666;i++)a.push([i,score(i)]);
  a.sort((x,y)=>y[1]-x[1]);
  const m={};a.forEach(([id],i)=>m[id]=i+1);return m;
})();

function renderTraits(id){
  const t=keyTraits(id);
  const rows=[["Headwear",t.hood,RARITY.hood[t.hood]],
    ["Eyes",t.eyes,RARITY.eyes[t.eyes]],
    ["Mask",t.mask,RARITY.mask[t.mask]],
    ["Outfit",t.fit,RARITY.fit[t.fit]],
    ["Palette",t.pal[0],RARITY.palette[t.pal[0]]],
    ["Backdrop",t.bg,RARITY.bg[t.bg]],
    ["Aura",t.aura,RARITY.aura[t.aura]],
    ["Tier","Tier "+ROMAN[t.tier],RARITY.tier["Tier "+ROMAN[t.tier]]]];
  document.getElementById("traits").innerHTML=rows.map(([k,v,n])=>
    `<div class="tr"><div class="k">${k}</div><div class="v">${v}</div>
      <div class="p">${(n/666*100).toFixed(1)}% have this</div></div>`).join("");
}

/* Before ProofKeys.reveal() the seed does not exist yet, so neither does the
   artwork. The site must read revealed() from the contract - showing finished
   art on a sealed collection would be a lie.

   It said exactly that and then started at true anyway, so a live sale showed
   every visitor a finished key with a tier and a rarity rank for a season whose
   seed had not been drawn. The toggle beside it is a preview control and stays
   one; what the chain says is what it opens on. */
let revealed=true;
// Until /api/keys/state answers, nothing has been established either way, and
// a visitor who has already chosen a preview state keeps it.
let revealedKnown=false;

function setRevealedFromChain(is){
  if(revealedKnown)return;
  revealedKnown=true;
  if(revealed===is)return;
  revealed=is;
  document.querySelectorAll("#revealSeg button").forEach(b=>
    b.classList.toggle("on",(b.dataset.r==="1")===is));
  drawKey(preview);renderMarquee();renderColl(true);
}
function sealedSVG(id,detail){
  const grid=detail==="grid";
  return {tier:0,traits:null,sealed:true,body:`
    <rect width="600" height="600" fill="#0A0C0E"/>
    <circle cx="300" cy="300" r="176" fill="none" stroke="#5B7CFA" stroke-width="${grid?2.4:1.3}" stroke-dasharray="7 11" opacity=".45"/>
    <circle cx="300" cy="300" r="142" fill="none" stroke="#5B7CFA" stroke-width="${grid?1.6:.8}" opacity=".18"/>
    <circle cx="300" cy="300" r="108" fill="none" stroke="#5B7CFA" stroke-width="${grid?1.2:.6}" opacity=".1"/>
    ${grid?"":'<text x="300" y="306" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="16" letter-spacing="5" fill="#5B7CFA">SEALED</text>'}
    <text x="300" y="${grid?332:344}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="${grid?46:11}" fill="#585E68">#${String(id).padStart(4,"0")}</text>`};
}
const ART=(id,d)=>revealed?keySVG(id,d):sealedSVG(id,d);

function drawKey(id){
  const k=ART(id,"full"),el=document.getElementById("keyArt");
  el.innerHTML=k.body;
  el.classList.remove("blooming");void el.offsetWidth;el.classList.add("blooming");
  document.getElementById("keyLbl").textContent="#"+String(id).padStart(4,"0");
  if(k.sealed){
    document.getElementById("keyTier").textContent="Sealed until reveal";
    document.getElementById("traits").innerHTML=
      `<div class="tr" style="grid-column:1/-1"><div class="k">Traits</div>
        <div class="v">Not derivable yet</div>
        <div class="p">The season seed is published after minting closes</div></div>`;
  }else{
    document.getElementById("keyTier").textContent=k.traits.hood+" · Rank "+RANK[id]+" / 666";
    renderTraits(id);
  }
}
/* Pick keys that actually look unlike each other: spread across all four
   forms, and avoid repeating a palette inside the same mosaic. */
function diverseKeys(want){
  const byForm={};HOOD_N.forEach(f=>byForm[f]=[]);
  for(let id=1;id<=666;id++) byForm[keyTraits(id).hood].push(id);
  for(const f in byForm) byForm[f].sort(()=>Math.random()-.5);
  const forms=Object.keys(byForm),out=[],pal=new Set();
  for(let pass=0;pass<3&&out.length<want;pass++){
    for(const f of forms){
      if(out.length>=want)break;
      const pool=byForm[f];
      let i=pool.findIndex(id=>!pal.has(keyTraits(id).pal[0]));
      if(i<0){if(pass<2)continue;i=0}
      const id=pool.splice(i,1)[0];
      if(id){out.push(id);pal.add(keyTraits(id).pal[0])}
    }
  }
  // top up if the diversity constraints could not fill the request
  for(let id=1;id<=666&&out.length<want;id++) if(!out.includes(id)) out.push(id);
  return out;
}
function heroTile(id){
  const k=ART(id,"card");
  return `<button class="hgk" data-key="${id}" title="${k.sealed?"Sealed until reveal":k.traits.hood+" · "+k.traits.eyes+" · "+k.traits.pal[0]}">
    <svg viewBox="0 0 600 600">${k.body}</svg>
    <span class="n">#${String(id).padStart(4,"0")}</span>
    <span class="f">${k.sealed?"sealed":k.traits.eyes}</span></button>`;
}
function renderMarquee(){
  const ids=diverseKeys(20);   // spread across all headwear types and palettes
  const cell=id=>{const k=ART(id,"card");
    return `<button class="keycard" data-key="${id}"><svg viewBox="0 0 600 600">${k.body}</svg>
      <span class="meta"><span>#${String(id).padStart(4,"0")}</span><span>Tier ${ROMAN[k.tier]}</span></span></button>`};
  const a=ids.slice(0,10).map(cell).join(""),b=ids.slice(10).map(cell).join("");
  document.getElementById("marq1").innerHTML=a+a;
  document.getElementById("marq2").innerHTML=b+b;
}

/* ═══════ render ═══════ */
const S={f:"all",sort:"recent",chain:null,q:"",minMc:0,minVol:0,hours:0};
let total=0;                          // how many the register holds under this filter
const PAGE=60;
function vis(){
  let a=calls.filter(c=>{
    if(S.chain&&c.chain!==S.chain)return false;
    if(S.q){const q=S.q.toLowerCase();
      // The full address as well as the abbreviated one. The box says it
      // searches contracts, and pasting a contract found nothing: the row only
      // ever kept "6d2ttx…Hs2XB", which no one has to hand.
      const hay=[c.name,c.tick,c.ca,c.addr??""].join(" ").toLowerCase();
      if(!hay.includes(q))return false}
    // Both are the figures at the moment it fired, not now: filtering the
    // register by what a token became would answer a different question than
    // the one a reader is asking, which is what we were looking at.
    if(S.minMc&&!(c.entry>=S.minMc))return false;
    if(S.minVol&&!(c.vol>=S.minVol))return false;
    if(S.hours&&c.at<Date.now()-S.hours*3600e3)return false;
    // A call can be in both Wins and Dead. That is the record, not a bug.
    return S.f==="live"?c.live:S.f==="win"?vrd(c)==="win":S.f==="dead"?deadOf(c):true});
  if(S.sort==="peak")a.sort((x,y)=>mult(y)-mult(x));
  else if(S.sort==="now")a.sort((x,y)=>nx(y)-nx(x));
  else a.sort((x,y)=>y.at-x.at);
  return a;
}
/* An empty list has three different meanings and the page has to say which one
   it is. "No calls match this filter" over a dead engine is how an outage
   spends a week looking like a quiet market. */
const behind=s=>s>=3600?Math.round(s/3600)+"h":s>=60?Math.round(s/60)+"m":s+"s";
function emptyLine(){
  if(!DEMO&&CONN.state==="boot")return "Reading the register…";
  if(!DEMO&&CONN.state==="offline")
    return "The engine is not answering, so nothing is shown. Rather that than something invented.";
  // A call written before the engine recorded volume cannot answer a volume
  // filter. Saying "no match" would blame the market for our own missing field.
  if(calls.length&&S.minVol&&calls.some(c=>c.vol==null))
    return "No calls match this filter. Calls fired before the engine began recording volume cannot answer it.";
  if(calls.length)return "No calls match this filter.";
  // "nothing has fired" and "nothing has reached you yet" are different
  // sentences, and only the engine knows which one is true for this reader.
  if(CONN.delay===0)return "Nothing on the register yet. You are reading the desk as it fires.";
  if(CONN.delay>0)return `Nothing on the register yet — this view runs ${behind(CONN.delay)} behind the desk.`;
  return "Nothing on the register yet.";
}
function renderFeed(){
  const a=vis();
  document.getElementById("feed").innerHTML=a.length?a.map((c,i)=>card(c,i)).join(""):`<div class="empty">${emptyLine()}</div>`;
  // Held versus what the register actually holds under this filter. "60 / 60"
  // read as the whole story; it was the first page of it.
  // What the register holds under this filter, not what the page happens to
  // have: with paging those are different numbers, and only one is honest.
  const held=DEMO?a.length:total;
  document.getElementById("cnt").textContent=a.length+" of "+held;
  const more=document.getElementById("loadMoreCalls");
  if(more)more.classList.toggle("hide",DEMO||calls.length>=total);
}
function renderPreview(){
  const a=[...calls].sort((x,y)=>y.at-x.at).slice(0,3);
  document.getElementById("pvBody").innerHTML=a.length
    ?a.map((c,i)=>card(c,i,true)).join("")
    :`<div class="empty">${emptyLine()}</div>`;
}
/* Each figure counts up over 850ms. A render that lands mid-count has to be
   able to stop the one in flight, or an engine going away is followed by the
   old number animating back over the "—" that replaced it. */
const animSeq=new WeakMap();
const animStop=el=>{animSeq.set(el,(animSeq.get(el)??0)+1);return el};
function anim(id,to,dec,suf){
  const el=document.getElementById(id);if(!el)return;
  const my=(animSeq.get(el)??0)+1;animSeq.set(el,my);
  const paint=k=>{el.innerHTML=(to*k).toFixed(dec)+(suf?`<span>${suf}</span>`:"")};
  if(matchMedia("(prefers-reduced-motion:reduce)").matches)return paint(1);
  const t0=performance.now();
  (function s(t){
    if(animSeq.get(el)!==my)return;          // a newer render owns this cell
    const k=Math.min((t-t0)/850,1);
    paint(1-Math.pow(1-k,3));
    if(k<1)requestAnimationFrame(s);
  })(t0);
}
/* Every published number comes from the engine's stats(), which counts misses
   in every denominator. Recomputing them here from the 60 rows this page holds
   would quietly answer a different question than the heading asks — and would
   drift the moment the page pages. Two windows, because the two headings ask
   two questions: home says "on record", the signals page says "7D". */
let statsAll=null,stats7=null,sim7=null;
const localStats=()=>{
  const ms=calls.map(mult).sort((a,b)=>a-b),n=ms.length;
  return{calls:n,hitRate:n?calls.filter(win).length/n:0,
    medianPeak:!n?0:n%2?ms[(n-1)/2]:(ms[n/2-1]+ms[n/2])/2,
    bestPeak:n?ms[n-1]:0,live:calls.filter(c=>c.live).length};
};
function renderStats(){
  const all=DEMO?localStats():statsAll, wk=DEMO?localStats():stats7;
  // No answer is not zero. Zero is a claim, and we would not have the numbers.
  const put=(ids,s)=>{
    if(!s)return ids.forEach(id=>{const el=document.getElementById(id);if(el)animStop(el).textContent="—"});
    const v=[[s.calls,0,""],[Math.round(s.hitRate*100),0,"%"],[s.medianPeak,2,"×"],[s.bestPeak,1,"×"]];
    ids.forEach((id,i)=>anim(id,v[i][0],v[i][1],v[i][2]));
  };
  put(["mCalls","mHit","mMed","mBest"],all);
  put(["rCalls","rHit","rMed","rBest"],wk);
  // Peak is a ceiling nobody sold at; this is what the rule beside it returned.
  // They sit next to each other because the gap between them is the point.
  const re=document.getElementById("rReal");
  if(re){
    if(!sim7)animStop(re).textContent="—";
    else{
      const pct=sim7.returnPct*100;
      animStop(re).innerHTML=(pct>=0?"+":"−")+Math.abs(pct).toFixed(0)+"<span>%</span>";
      re.style.color=pct>=0?"var(--win)":"var(--dead)";
    }
  }
  document.getElementById("pillCount").textContent=all?all.calls+" calls":"—";
}
/* These two panels publish hit rates, so they may not be computed from the
   rows the page is holding: under the Wins filter that arithmetic reads 100%
   for every desk and every chain, which is a statistic with the misses taken
   out of it. They come from the engine's analytics over the whole window, and
   go blank rather than answer from a filtered list. */
let anaCallers=null,anaChains=null;
const CALLER_NAME=id=>id===1?"House desk":"Caller "+id;
function renderCallers(){
  const rows=DEMO
    ?Object.entries(calls.reduce((g,c)=>((g[c.by]??=[]).push(c),g),{})).map(([k,v])=>{
        const ms=v.map(mult).sort((a,b)=>a-b);
        return{label:k==="desk"?"House desk":"@"+k,n:v.length,rate:v.filter(win).length/v.length,
               med:ms[Math.floor(ms.length/2)]}})
    :(anaCallers??[]).map(r=>({label:CALLER_NAME(r.callerId),n:r.n,rate:r.hitRate,med:r.medianPeak}));
  document.getElementById("callers").innerHTML=rows.length
    ?rows.sort((a,b)=>b.rate-a.rate).map(r=>`<div class="lrow"><div><div class="who">${esc(r.label)}</div>
      <div class="sub">${r.n} calls · med ${r.med.toFixed(2)}×</div><div class="mini"><i style="width:${(r.rate*100).toFixed(0)}%"></i></div></div>
      <span class="pct">${Math.round(r.rate*100)}%</span></div>`).join("")
    :`<p class="sub" style="margin:0">${CONN.state==="offline"?"Engine not answering.":"Nothing settled in this window yet."}</p>`;
}
function renderChains(){
  const rows=DEMO
    ?Object.entries(calls.reduce((g,c)=>((g[c.chain]??=[]).push(c),g),{})).map(([k,v])=>
        ({k,n:v.length,rate:v.filter(win).length/v.length,
          avg:v.reduce((s,c)=>s+mult(c),0)/v.length}))
    :(anaChains??[]).map(r=>({k:CHAIN[r.chain]??String(r.chain).toUpperCase(),n:r.n,rate:r.hitRate,avg:r.avgPeak}));
  document.getElementById("chains").innerHTML=rows.length
    ?rows.sort((a,b)=>b.rate-a.rate).map(r=>`<button class="crow ${S.chain===r.k?"on":""}" data-chain="${esc(r.k)}">
      <span class="cdot" style="background:${CC[r.k]}"></span>
      <span><span class="cn">${r.k}</span><span class="cs">${r.n} calls · avg ${r.avg.toFixed(2)}×</span></span>
      <span class="pc" style="color:${r.rate>=.5?"var(--win)":"var(--tx-2)"}">${Math.round(r.rate*100)}%</span></button>`).join("")
    :`<p class="sub" style="margin:0">${CONN.state==="offline"?"Engine not answering.":"Nothing settled in this window yet."}</p>`;
}
/* Reference prices are invented and drift on a timer, so they run in the
   file:// demo and nowhere else. A made-up BTC print sitting next to a real
   register is the one thing this strip cannot carry. */
const MKT=[{k:"BTC",v:77680,d:-2.0},{k:"ETH",v:2438,d:-2.2},{k:"SOL",v:103.4,d:-2.5},{k:"BNB",v:688,d:-2.5}];
function renderTicker(){
  const s=DEMO?localStats():statsAll;
  const figs=s
    ?[["on record",s.calls],["hit ≥2×",Math.round(s.hitRate*100)+"%"],
      ["median peak",s.medianPeak.toFixed(2)+"×"],["live",s.live]]
    :[["register",CONN.state==="offline"?"engine offline":"reading…"]];
  document.getElementById("tkrIn").innerHTML=
    figs.map(([k,v])=>`<span class="ti br"><k>${k}</k><v>${v}</v></span>`).join("")+
    (DEMO?MKT.map(m=>`<span class="ti"><k>${m.k}</k><v>$${m.v>=1000?(m.v/1000).toFixed(2)+"K":m.v.toFixed(2)}</v><d class="${m.d>=0?"up":"dn"}">${m.d>=0?"+":""}${m.d.toFixed(1)}%</d></span>`).join(""):"");
}

/* ═══════ demo motion ═══════
   The prototype's random walk. It runs from a file:// URL and nowhere else: on
   the deployed site every number on this page arrives from the engine or stays
   blank, and nothing here invents movement. */
let last=Date.now();
function tick(){
  if(!DEMO)return;
  let changed=false;
  calls.forEach(c=>{
    if(!c.live)return;
    c.nowMc=Math.max(c.nowMc*(1+(Math.random()-.485)*.07),c.entry*.015);
    if(c.nowMc>c.peak){const was=win(c);c.peak=c.nowMc;
      if(!was&&win(c)){c.flash=true;changed=true;if(!c.twoIn)c.twoIn=Math.round((Date.now()-c.at)/1000)}}
    c.path.push(c.nowMc);if(c.path.length>48)c.path.shift()});
  MKT.forEach(m=>{const d=(Math.random()-.5)*.0016;m.v*=1+d;m.d+=d*100});
  last=Date.now();renderTicker();
  if(changed){
    renderFeed();renderPreview();renderStats();renderCallers();renderChains();
    calls.filter(c=>c.flash).forEach(c=>{
      document.querySelectorAll(`.rec[data-id="${c.id}"]`).forEach(el=>{el.classList.add("flash");setTimeout(()=>el.classList.remove("flash"),1600)});
      c.flash=false});
  }else{
    calls.forEach(c=>{if(!c.live)return;
      const v=vrd(c),n=nx(c);
      document.querySelectorAll(`[data-now="${c.id}"]`).forEach(el=>{el.textContent=fmt(c.nowMc);el.className="v "+(n>=1?"up":"dn")});
      if(v==="open")document.querySelectorAll(`[data-mx="${c.id}"]`).forEach(el=>el.textContent=n.toFixed(2)+"×");
      if(!c.twoIn)document.querySelectorAll(`[data-x="${c.id}"]`).forEach(el=>el.textContent=((c.nowMc/c.peak-1)*100).toFixed(1)+"%")});
  }
}
if(DEMO)setInterval(tick,2600);

/* ═══════ mint panel ═══════ */
/* Every number here comes off the chain through /api/keys/state. The page used
   to open on "Phase 2 · OPEN", "412 / 666 minted, 62%", and a Claim button that
   waited a second and reported success — a sale that never happened, for a
   thing that did not exist. So the rule in this block is: when we do not know,
   say we do not know. No contract, a dead RPC and a real "0 minted" must never
   render the same way, because a reader cannot tell them apart and one of them
   would have them signing a transaction that cannot succeed. */

let qty=1,preview=Math.floor(Math.random()*666)+1;
const MINT={id:null,state:null,busy:false};

const wei=v=>{try{return BigInt(v)}catch{return 0n}};
/* Wei is 18 digits; a double loses the tail. Format from the string so the
   figure on the button is the figure in the transaction. */
function eth(v,dp=4){
  const n=wei(v),whole=n/10n**18n,frac=(n%10n**18n).toString().padStart(18,"0").slice(0,dp);
  return dp?`${whole}.${frac}`:String(whole);
}
const hexQ=n=>"0x"+BigInt(n).toString(16);
/* The public price steps up partway through the season, so a basket can cost
   more than quantity times the price on screen. The contract charges per key
   and refuses anything else, so the total here is the sum of the actual next
   prices — never one price multiplied out. */
function dueFor(st,n,unit){
  const list=st?.nextPrices;
  if(!Array.isArray(list)||list.length<n)return unit*BigInt(n);
  let t=0n;for(let i=0;i<n;i++)t+=wei(list[i]);return t;
}
const w256=v=>BigInt(v).toString(16).padStart(64,"0");
/* mintPublic(uint256). The selector comes from the engine, which derives it
   from the signature — one typed in here would go on matching a function
   after it was renamed. */
function calldata(sel,q){
  return sel+w256(q);
}

function paintMsg(text,kind){
  const el=document.getElementById("mintMsg");
  if(!el)return;
  el.className="mintmsg"+(kind?" "+kind:"");
  el.innerHTML=text??"";
  el.hidden=!text;
}
/* A line about a transaction has to outlive the next re-render. "Sent — 0x…"
   was being wiped by the refresh that followed it, a tenth of a second after
   the only moment it mattered, so the reader saw their key vanish. */
function notice(text,kind){MINT.notice=text?{text,kind}:null;paintMsg(text,kind)}
/* Anything derived from state yields to a notice that is still standing. */
function derived(text,kind){if(!MINT.notice)paintMsg(text,kind)}

const PHASE_LABEL={closed:"NOT OPEN",one:"PHASE 1",two:"PHASE 2",three:"PHASE 3"};

function syncMint(){
  const st=MINT.state,cfg=MINT.id;
  const cap=st?.seasonCap??666,minted=st?.totalMinted??0;
  const max=st?.remaining??st?.maxPerWallet??5;
  if(qty>Math.max(1,max))qty=Math.max(1,max);

  const unit=st?wei(st.unitPrice??st.price):wei("1700000000000000");
  document.getElementById("qVal").textContent=qty;
  document.getElementById("unitPrice").textContent=eth(unit);
  document.getElementById("total").textContent=eth(dueFor(st,qty,unit))+" ETH";
  document.getElementById("qMinus").disabled=qty<=1;
  document.getElementById("qPlus").disabled=qty>=max;

  // Three cases, and they must not look alike. Deployed and read: the real
  // numbers. Not deployed: nothing exists, so nothing is minted — 0 is a fact,
  // not a guess. Deployed but unreadable: we do not know, and saying zero
  // there would be inventing a sold-nothing mint out of a dead RPC.
  const unknown=cfg?.configured&&!st;
  const pct=cap?Math.round(minted/cap*100):0;
  document.getElementById("supTxt").textContent=unknown?"supply unknown":`${minted} / ${cap} minted`;
  document.getElementById("supPct").textContent=unknown?"—":pct+"%";
  document.getElementById("supBar").style.width=(unknown?0:pct)+"%";
  document.getElementById("ksMinted").textContent=unknown?"—":minted;

  const pill=document.getElementById("mintState");
  if(pill)pill.textContent=st?(PHASE_LABEL[st.phaseName]??"UNKNOWN"):"NOT OPEN";

  const btn=document.getElementById("mintBtn");
  if(!btn)return;
  if(!cfg||!cfg.configured){
    btn.disabled=true;btn.textContent="Minting is not open";
    return derived(cfg?"No contract is deployed yet. Nothing here can be bought.":"");
  }
  if(!st){
    btn.disabled=true;btn.textContent="Can't reach the chain";
    return derived("The mint contract could not be read just now, so this panel is showing nothing rather than guessing. Try again in a moment.","bad");
  }
  // canMint is only present when the engine was told which address to answer
  // for. Its absence means nobody has connected — not that nobody may mint.
  if(st.canMint===undefined){
    btn.disabled=false;btn.textContent="Connect a wallet";
    return derived(st.phaseName==="closed"?"Minting is closed.":"");
  }
  if(st.canMint){
    btn.disabled=MINT.busy;
    btn.textContent=MINT.busy?"Confirm in your wallet…":`Mint ${qty} · ${eth(dueFor(st,qty,unit))} ETH`;
    if(!MINT.busy)derived("");
    return;
  }
  btn.disabled=true;btn.textContent="Can't mint";
  derived(st.why?st.why[0].toUpperCase()+st.why.slice(1)+".":"");
}

async function loadMintState(){
  if(DEMO)return;
  try{
    if(!MINT.id)MINT.id=await(await fetch(API+"/keys",noStore())).json();
    if(!MINT.id?.configured){MINT.state=null;return syncMint()}
    const who=MINT.wallet??SESSION.address;
    const r=await fetch(API+"/keys/state"+(who?"?address="+who:""),noStore());
    const j=await r.json();
    MINT.state=j.state??null;
    if(MINT.state)setRevealedFromChain(!!MINT.state.revealed);
  }catch{
    // Unreachable is a state, not a zero.
    MINT.state=null;
  }
  syncMint();
}

/* The wallet has to be on the right chain before anything is signed. Sending a
   Base transaction to whatever network happens to be selected is how people
   lose gas on a chain where the contract does not exist. */
async function onRightChain(eth_){
  const want=hexQ(MINT.id.chainId);
  const have=await eth_.request({method:"eth_chainId"});
  if(have===want)return true;
  try{
    await eth_.request({method:"wallet_switchEthereumChain",params:[{chainId:want}]});
    return true;
  }catch(e){
    notice(`Switch your wallet to chain ${MINT.id.chainId} to mint.`,"bad");
    return false;
  }
}

/* ── which wallet ─────────────────────────────────────────────────────────
   window.ethereum is whichever extension won a race to define it. With two or
   three installed — and a Solana-only one among them — the page can end up
   asking a wallet that has no Ethereum account at all. What the reader sees is
   "Unable to find any account for 60", which names a BIP-44 coin type and
   tells them nothing they can act on.

   EIP-6963 has every extension announce itself instead, so the reader picks.
   The picker appears whenever more than one answered: remembering silently
   would be one fewer click and no way back out of a wrong choice. */
const WALLETS=new Map();
addEventListener("eip6963:announceProvider",e=>{
  const d=e.detail;
  if(d?.info?.uuid&&d.provider)WALLETS.set(d.info.uuid,d);
});
dispatchEvent(new Event("eip6963:requestProvider"));

const LAST_WALLET="nekara.wallet";
const lastWallet=()=>{try{return localStorage.getItem(LAST_WALLET)}catch{return null}};
const rememberWallet=r=>{try{localStorage.setItem(LAST_WALLET,r)}catch{}};

/* Names and icons come from browser extensions, so they are text from outside
   this page. The name is escaped; the icon is only rendered when it is a data
   URI, which is what the spec requires and what keeps this from becoming a
   pixel that reports who opened the page. */
function walletRow(w){
  const icon=/^data:image\//.test(w.info.icon??"")
    ? `<img src="${esc(w.info.icon)}" alt="">`
    : `<img src="data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'><rect width='26' height='26' rx='6' fill='%2314171C'/></svg>")}" alt="">`;
  return `<button class="wopt" type="button" data-uuid="${esc(w.info.uuid)}">${icon}`
    + `<span>${esc(w.info.name)}</span><span class="rd">${esc(w.info.rdns??"")}</span></button>`;
}

function chooseWallet(){
  const list=[...WALLETS.values()];
  // Nothing announced: either an older wallet that only sets window.ethereum,
  // or none at all. Both are handled by the caller, differently.
  if(!list.length)return Promise.resolve(window.ethereum??null);
  if(list.length===1)return Promise.resolve(list[0].provider);

  const last=lastWallet();
  list.sort((a,b)=>(b.info.rdns===last)-(a.info.rdns===last));

  const box=document.getElementById("walletPick");
  if(!box)return Promise.resolve(list[0].provider);
  document.getElementById("wpickList").innerHTML=list.map(walletRow).join("");

  return new Promise(resolve=>{
    const close=v=>{
      box.classList.remove("on");scrim.classList.remove("on");box.setAttribute("aria-hidden","true");
      box.onclick=null;document.getElementById("wpickCancel").onclick=null;
      scrim.removeEventListener("click",cancel);removeEventListener("keydown",key);
      resolve(v);
    };
    const cancel=()=>close(null);
    const key=e=>{if(e.key==="Escape")cancel()};
    box.onclick=e=>{
      const b=e.target.closest(".wopt");if(!b)return;
      const w=WALLETS.get(b.dataset.uuid);if(!w)return cancel();
      rememberWallet(w.info.rdns??"");
      close(w.provider);
    };
    document.getElementById("wpickCancel").onclick=cancel;
    scrim.addEventListener("click",cancel);
    addEventListener("keydown",key);
    box.classList.add("on");scrim.classList.add("on");box.setAttribute("aria-hidden","false");
    box.querySelector(".wopt")?.focus();
  });
}

async function doMint(){
  if(MINT.busy)return;
  notice(null);
  const eth_=await chooseWallet();
  if(!eth_)return notice(WALLETS.size?"No wallet chosen.":"No wallet found in this browser.","bad");
  try{
    const [addr]=await eth_.request({method:"eth_requestAccounts"});
    if(!addr)return notice("No account.","bad");
    MINT.wallet=addr.toLowerCase();
    await loadMintState();
    const st=MINT.state;
    if(!st)return;
    if(!st.canMint)return;
    if(!await onRightChain(eth_))return;

    const due=dueFor(st,qty,wei(st.unitPrice));
    const data=calldata(MINT.id.selectors.public,qty);

    MINT.busy=true;syncMint();
    notice("Waiting for your wallet…");
    const hash=await eth_.request({method:"eth_sendTransaction",params:[{
      from:addr,to:MINT.id.contract,value:hexQ(due),data,
    }]});
    const link=MINT.id.explorer?`<a href="${MINT.id.explorer}/tx/${hash}" target="_blank" rel="noopener">${hash.slice(0,10)}…</a>`:hash.slice(0,10)+"…";
    notice(`Sent — ${link}. The key appears once it confirms.`,"good");
  }catch(e){
    const m=String(e?.message??e);
    notice(/denied|reject/i.test(m)?"Cancelled.":m.slice(0,180),"bad");
  }finally{
    MINT.busy=false;
    // Re-read rather than assume it landed: the chain decides, not this page.
    setTimeout(loadMintState,4000);
    syncMint();
  }
}

document.getElementById("qMinus").addEventListener("click",()=>{if(qty>1){qty--;syncMint()}});
document.getElementById("qPlus").addEventListener("click",()=>{qty++;syncMint()});
document.getElementById("reroll").addEventListener("click",()=>{preview=Math.floor(Math.random()*666)+1;drawKey(preview)});
document.getElementById("mintBtn").addEventListener("click",doMint);
// The first read is booted at the bottom of this file, not here: API and
// SESSION are declared further down and a const is not readable before its
// own line runs.

/* ═══════ collection grid — lazy, paged ═══════ */
const COLL_PAGE=48;
let collFilter=0,collShown=0;
const keyIO=new IntersectionObserver(es=>es.forEach(en=>{
  if(!en.isIntersecting)return;
  const el=en.target,id=+el.dataset.lazy;
  el.innerHTML=`<svg viewBox="0 0 600 600">${ART(id,"grid").body}</svg>`;
  el.classList.remove("skel");el.removeAttribute("data-lazy");
  keyIO.unobserve(el);
}),{rootMargin:"300px 0px"});

function collIds(){
  // Every key in the season, as a preview. It listed 1..minted and called them
  // "minted so far", which on a mint that has not opened was 412 keys nobody
  // owns. The art is real and drawn here; the ownership was not.
  const out=[];
  for(let i=1;i<=666;i++) if(!collFilter||(revealed&&keyTraits(i).tier===collFilter)) out.push(i);
  return out;
}
function renderColl(reset){
  const ids=collIds(),host=document.getElementById("coll");
  if(reset){collShown=0;host.innerHTML=""}
  const slice=ids.slice(collShown,collShown+COLL_PAGE);
  host.insertAdjacentHTML("beforeend",slice.map(id=>{
    return `<button class="gk" data-key="${id}">
      <span class="gk-art skel" data-lazy="${id}"></span>
      <span class="gk-meta"><span>#${String(id).padStart(4,"0")}</span>
        <b>${revealed?"T"+ROMAN[keyTraits(id).tier]:"—"}</b></span></button>`;
  }).join(""));
  collShown+=slice.length;
  document.getElementById("loadMore").classList.toggle("hide",collShown>=ids.length);
  document.getElementById("collCount").textContent=
    ids.length?`showing ${collShown} of ${ids.length} keys · previews, none minted yet`
              :"no keys in this tier";
  document.querySelectorAll("[data-lazy]").forEach(el=>keyIO.observe(el));
}
document.getElementById("loadMore").addEventListener("click",()=>renderColl(false));
document.getElementById("revealSeg").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  revealed=b.dataset.r==="1";
  revealedKnown=true;      // a deliberate choice outlives the next poll
  [...e.currentTarget.children].forEach(x=>x.classList.toggle("on",x===b));
  drawKey(preview);renderMarquee();renderColl(true);
});
document.getElementById("collSeg").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  collFilter=+b.dataset.t;
  [...e.currentTarget.children].forEach(x=>x.classList.toggle("on",x===b));
  renderColl(true);
});

/* ═══════ nav + interactions ═══════ */
/* One path per view.
   The whole site lived at "/". Clicking Signals changed what was on screen and
   nothing else: the page could not be linked to, a reload dropped the reader
   back on Home, and the browser's back button did nothing at all — on a site
   whose entire pitch is "go and check for yourself". Only /call/:seq had an
   address, because a share post needed one.
   Method is an overlay rather than a view, so it rides on whatever is beneath
   it and takes its own path only while it is open. */
const VIEW_PATH={home:"/",reg:"/signals",quant:"/hindsight",ops:"/triage",vault:"/custody",mint:"/mint"};
/* /keys is not a redirect, it is an address that was published and cannot be
   withdrawn: contractURI() carries it on-chain, in a contract with no setter.
   Every wallet and marketplace that reads the collection reads that link. */
const PATH_VIEW={...Object.fromEntries(Object.entries(VIEW_PATH).map(([v,p])=>[p,v])),"/keys":"mint"};
let VIEW="home";

function go(v,hash,push=true){
  VIEW=v;
  if(v!=="call")pushUrl(push);
  ["home","reg","quant","ops","vault","mint","call"].forEach(k=>document.getElementById("v-"+k).classList.toggle("hide",k!==v));
  document.getElementById("tkr").classList.toggle("hide",v!=="reg");
  document.body.style.paddingBottom=v==="reg"?"36px":"0";
  document.querySelectorAll("#navLinks a").forEach(a=>a.classList.toggle("on",a.dataset.v===v));
  if(v==="quant"){renderQuant();renderSim();renderLeaders();pullQuant()} if(v==="ops")renderOps();
  // Opening Custody re-reads the chain rather than showing a minute-old answer
  // about integrity, which is the one thing nobody should read stale.
  if(v==="vault"){renderVault();pullVerify()}
  if(hash){const t=document.querySelector(hash);if(t)setTimeout(()=>t.scrollIntoView({behavior:"smooth"}),40)}else scrollTo(0,0);
  setTimeout(reveal,60);
}
const menu=document.getElementById("menu");
document.getElementById("menuBtn").addEventListener("click",e=>{e.stopPropagation();menu.classList.toggle("on")});
document.getElementById("menuMethod").addEventListener("click",e=>{
  e.preventDefault();e.stopPropagation();menu.classList.remove("on");openD(true)});

document.addEventListener("click",e=>{
  if(!e.target.closest("#menu")&&!e.target.closest("#menuBtn"))menu.classList.remove("on");
  const kc=e.target.closest("[data-key]");
  if(kc){preview=+kc.dataset.key;go("mint");drawKey(preview);return}
  const v=e.target.closest("[data-v]");
  if(v){e.preventDefault();menu.classList.remove("on");go(v.dataset.v,v.dataset.hash);return}
  const ca=e.target.closest(".ca");
  if(ca){navigator.clipboard?.writeText(ca.dataset.ca);
    const o=ca.firstChild.nodeValue;ca.classList.add("ok");ca.firstChild.nodeValue="Copied ";
    setTimeout(()=>{ca.classList.remove("ok");ca.firstChild.nodeValue=o},1200);return}
  const ch=e.target.closest(".crow");
  if(ch){S.chain=S.chain===ch.dataset.chain?null:ch.dataset.chain;
    const cp=document.getElementById("chipChain");
    cp.classList.toggle("hide",!S.chain);cp.textContent=S.chain?S.chain+"  ✕":"";
    renderChains();applyFilters();return}
});
document.getElementById("chipChain").addEventListener("click",()=>{
  S.chain=null;document.getElementById("chipChain").classList.add("hide");renderChains();applyFilters()});
document.getElementById("seg").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;S.f=b.dataset.f;
  [...e.currentTarget.children].forEach(x=>x.classList.toggle("on",x===b));applyFilters()});
document.getElementById("sortSel").addEventListener("change",e=>{S.sort=e.target.value;applyFilters()});
document.getElementById("mcSel").addEventListener("change",e=>{S.minMc=+e.target.value;applyFilters()});
document.getElementById("volSel").addEventListener("change",e=>{S.minVol=+e.target.value;applyFilters()});
document.getElementById("timeSel").addEventListener("change",e=>{S.hours=+e.target.value;applyFilters()});
// Typing is filtered locally on every keystroke and asked of the engine once
// the typing stops, rather than a request per character.
let qTimer=null;
document.getElementById("q").addEventListener("input",e=>{
  S.q=e.target.value.trim();renderFeed();
  clearTimeout(qTimer);qTimer=setTimeout(applyFilters,250)});
document.getElementById("loadMoreCalls").addEventListener("click",()=>{
  loadRegister(true).then(renderAll).catch(()=>{})});

const drw=document.getElementById("drw"),scrim=document.getElementById("scrim");
const openD=o=>{drw.classList.toggle("on",o);scrim.classList.toggle("on",o);drw.setAttribute("aria-hidden",!o)};
document.getElementById("navMethod").addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openD(true)});
document.getElementById("drwX").addEventListener("click",()=>openD(false));
scrim.addEventListener("click",()=>{openD(false);closeShare()});
addEventListener("keydown",e=>{if(e.key==="Escape"){openD(false);closeShare()}});

/* cursor spotlight on cards */
document.addEventListener("mousemove",e=>{
  const c=e.target.closest(".card");if(!c)return;
  const r=c.getBoundingClientRect();
  c.style.setProperty("--mx",(e.clientX-r.left)+"px");
  c.style.setProperty("--my",(e.clientY-r.top)+"px");
});

/* scroll reveal */
const io=new IntersectionObserver(es=>es.forEach((en,i)=>{
  if(en.isIntersecting){en.target.style.transitionDelay=Math.min(i*70,280)+"ms";
    en.target.classList.add("in");io.unobserve(en.target)}}),{threshold:.12,rootMargin:"0px 0px -8% 0px"});
function reveal(){document.querySelectorAll(".rv:not(.in)").forEach(el=>io.observe(el))}



/* ═══════ call detail ═══════ */
function cdChart(c){
  const W=1000,H=280,two=c.entry*2,dead=c.entry*.1;
  // Marks are not evenly spaced in time — the poll misses beats and the series
  // is thinned as it grows — so spacing them evenly draws a gap as motion.
  // With timestamps the x axis is time; without them it is index, and the
  // labels below say which by naming the two ends.
  const S=Array.isArray(c.series)&&c.series.length>1?c.series:null;
  const p=S?S.map(([,mc])=>mc):c.path;
  const t0=S?S[0][0]:0,span=S?(S[S.length-1][0]-t0)||1:1;
  const mn=Math.min(...p,dead*.9),mx=Math.max(...p,two*1.08),r=(mx-mn)||1;
  const X=S?i=>(S[i][0]-t0)/span*W:i=>i/(p.length-1)*W, Y=v=>H-((v-mn)/r)*(H-24)-12;
  const v=vrd(c);
  const col=deadOf(c)?"var(--dead)":v==="open"?"var(--win)":v==="win"?"#8E9AFF":"var(--tx-3)";
  const d=p.map((y,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(y).toFixed(1)).join("");
  const pk=p.indexOf(Math.max(...p));
  // Labels as positioned HTML, not SVG text: this chart stretches to the panel
  // width with preserveAspectRatio="none", which would smear any text in it.
  const at=v=>(Y(v)/H*100).toFixed(2);
  const axis=[[c.entry,"entry"],[two,"2×"],[dead,"dead"]]
    .map(([v,k])=>`<span class="ax" style="top:${at(v)}%">${k} ${fmt(v)}</span>`).join("")
    +(S?`<span class="ax bot" style="left:6px;right:auto">${clock(S[0][0]*1000)}</span>
        <span class="ax bot">${clock(S[S.length-1][0]*1000)}</span>`:"");
  return axis+`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".2"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
      <clipPath id="cc"><rect x="0" y="0" width="${W}" height="${Y(two).toFixed(1)}"/></clipPath></defs>
    <line x1="0" y1="${Y(c.entry).toFixed(1)}" x2="${W}" y2="${Y(c.entry).toFixed(1)}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <line x1="0" y1="${Y(two).toFixed(1)}" x2="${W}" y2="${Y(two).toFixed(1)}" stroke="#8E9AFF" stroke-width="1" stroke-dasharray="4 6" opacity=".7"/>
    <line x1="0" y1="${Y(dead).toFixed(1)}" x2="${W}" y2="${Y(dead).toFixed(1)}" stroke="#E5606B" stroke-width="1" stroke-dasharray="2 7" opacity=".5"/>
    <path d="${d}L${W} ${H}L0 ${H}Z" fill="url(#cg)"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2" opacity=".5"/>
    <path d="${d}" fill="none" stroke="#8E9AFF" stroke-width="2.4" clip-path="url(#cc)"/>
    <circle cx="${X(pk).toFixed(1)}" cy="${Y(Math.max(...p)).toFixed(1)}" r="4" fill="${col}"/>
    <circle cx="${W}" cy="${Y(c.nowMc).toFixed(1)}" r="4" fill="${col}" opacity=".8"/></svg>`;
}
/* Every share template ends with nekara.xyz/call/<seq>. The site had no such
   route: one page at /, and that link 404ed for everyone who clicked it. The
   call opens from the path now, and from ?call= where a path rewrite is not
   in place. Opening one writes the address, so the link in the browser bar is
   the link worth sending. */
async function openCallBySeq(seq){
  let c=calls.find(x=>x.seq===seq);
  if(!c&&!DEMO){
    try{
      const r=await fetch(`${API}/call/${seq}`,noStore());
      if(r.ok)c=upsert(await r.json());
    }catch{}
  }
  // A call that is not ours to see yet answers exactly like one that does not
  // exist, so there is nothing to say beyond going back to the list.
  if(c)openCall(c.id); else go("reg");
}
function callFromUrl(){
  const m=location.pathname.match(/^\/call\/(\d+)/)||location.search.match(/[?&]call=(\d+)/);
  return m?+m[1]:null;
}
function openCall(id){
  const c=calls.find(x=>x.id===id); if(!c)return;
  // The real sequence number when there is one. The +1 below is the demo set,
  // which is indexed from zero and has no chain position of its own.
  const v=badgeOf(c),n=nx(c),seq=c.seq??+c.id.slice(1)+1;
  const f=(k,val,cls="")=>`<div><div class="k eyebrow">${k}</div><div class="v ${cls}" style="font-family:var(--mono);font-size:17px;font-weight:500;margin-top:6px">${val}</div></div>`;
  document.getElementById("cdBody").innerHTML=`
    <div class="cd-top">
      <div class="tok" style="width:52px;height:52px;font-size:19px">${c.tick[0]}</div>
      <div class="cd-id"><h1>${esc(c.name)}</h1>
        <div class="cd-meta"><span class="tk">$${esc(c.tick)}</span><span class="dotsep"></span>${esc(c.chain)}
          <span class="dotsep"></span>${esc(c.src)}<span class="dotsep"></span>${utc(c.at)}
          <span class="dotsep"></span>${ago(c.at)}</div>
        <div class="cd-keys">
          <span><b>First call MC</b>${fmt(c.entry)}</span>
          <span><b>Now MC</b>${fmt(c.nowMc)}</span>
          <span class="mx">${n.toFixed(2)}× from entry</span>
        </div>
        <div class="cd-links">
          <button class="ca" data-ca="${esc(c.addr||c.ca)}">${esc(c.ca)}<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.6" y="3.6" width="7" height="7" rx="1.4"/><path d="M8.4 1.4h-7v7"/></svg></button>
          ${linkRow(c,true)}
        </div></div>
      <div class="cd-mx"><div class="big" style="${v==="win"&&!deadOf(c)?"background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent":v==="dead"?"color:var(--dead)":v==="miss"?"color:var(--tx-3)":""}">${(c.live||deadOf(c)?n:mult(c)).toFixed(2)}×</div>
        <div style="margin-top:8px"><span class="badge ${v}">${LBL[v]}</span>${alsoDead(c)}</div></div>
    </div>
    <div class="cd-chart"><div id="cdChartSvg">${cdChart(c)}</div>
      <div class="cd-lg">
        <span><i style="background:rgba(255,255,255,.25)"></i>entry</span>
        <span><i style="background:#8E9AFF"></i>2× threshold</span>
        <span><i style="background:#E5606B"></i>dead line, 10% of entry</span>
        <span style="margin-left:auto">peak ${fmt(c.peak)} · now ${fmt(c.nowMc)}</span>
      </div></div>
    <div class="cols c2" style="padding:20px 0 60px">
      <div class="box">
        <h3>Marks</h3><p class="sub">Entry is frozen at insert. Peak stops at settle; now keeps moving, so a win can still be marked dead.</p>
        <div class="rf" style="border-top:none;padding-top:0;margin-top:0">
          ${f("Entry MC",fmt(c.entry),"mut")}${f("Peak MC",fmt(c.peak))}
          ${f("Now MC",fmt(c.nowMc),n>=1?"up":"dn")}${f(cell4(c)[0],cell4(c)[1],"mut")}
        </div>
        <div class="stat" style="margin-top:18px"><span class="l">Score at fire</span><span class="v">${c.score}</span></div>
        <div class="stat"><span class="l">State</span><span class="v">${c.live?"Live":"Settled"}</span></div>
        <div class="stat"><span class="l">Liquidity at fire</span><span class="v">${c.liq?fmt(c.liq):"—"}</span></div>
        ${c.real==null?"":`<div class="stat"><span class="l">Sold at 2×, after 5% costs</span><span class="v" style="color:${c.real>=0?"var(--win)":"var(--dead)"}">${c.real>=0?"+":"−"}${Math.abs(c.real*100).toFixed(0)}%</span></div>`}
        <button class="btn btn-s btn-full" style="margin-top:16px" data-share="${c.id}">Post templates</button>
      </div>
      <div class="box">
        <h3>Why it fired</h3><p class="sub">The exact conditions, recorded at the moment of the call and never edited.</p>
        ${(c.reasons||[]).map(r=>`<div class="gate"><span class="g" style="font-size:13px;line-height:1.5">${r}</span></div>`).join("")}
        ${chainPanel(c)}
        <h3 style="margin-top:24px">Verification</h3>
        <p class="sub">The record hash as stored, and the same hash recomputed here from this call's own fields.</p>
        <div class="hash vfy" id="cdHash">—</div>
        <div class="stat" style="margin-top:12px"><span class="l">Recomputed in your browser</span><span class="v" id="cdCalc">—</span></div>
        <div class="stat"><span class="l">Position in chain</span><span class="v">seq ${seq}</span></div>
        <div class="stat"><span class="l">Anchored</span><span class="v" id="cdAnchor">—</span></div>
      </div>
    </div>
    <a class="back" href="#" data-v="reg">← Back to the signals</a>`;
  // The stored hash next to one recomputed here over the same fields the chain
  // hashes. A match is a real check; the old panel hashed six fields of the
  // page's own choosing and could never have disagreed with anything.
  const raw=c.raw;
  const hEl=document.getElementById("cdHash"),cEl=document.getElementById("cdCalc");
  if(raw?.recordHash){
    const calc=recomputeHash(raw),same=calc===raw.recordHash;
    hEl.textContent=raw.recordHash;
    // A row from a newer engine cannot be checked here. Printing "does not
    // match" would accuse the record of an edit that never happened.
    cEl.textContent=calc==null?`hash version ${raw.hashVersion} — this page is older than the record`
      :same?"matches":"DOES NOT MATCH";
    cEl.style.color=calc==null?"var(--tx-3)":same?"var(--win)":"var(--dead)";
  }else{
    hEl.textContent=sha(canon(c));
    cEl.textContent=DEMO?"demo data — no record behind it":"unavailable";
  }
  if(!DEMO&&c.seq!=null&&history.replaceState)history.replaceState(null,"","/call/"+c.seq);
  // Anchoring is the one claim this page cannot make on its own.
  const a=verifyState?.latestAnchor;
  document.getElementById("cdAnchor").textContent=
    !verifyState?"—"
    :verifyState.anchored&&verifyState.anchoredThrough>=seq&&a
      ?`${utc(Date.parse(a.at)).split(" · ")[0]} · tx ${String(a.txHash).slice(0,10)}…`
      :"Not yet — the register has never been published on-chain";
  go("call");
  // The whole observed series for the big chart. The list route sends a thinned
  // one; here is where someone looks to see that the peak was a mark we saw.
  if(!DEMO&&c.seq!=null)fetch(`${API}/call/${c.seq}`,noStore())
    .then(r=>r.ok?r.json():null)
    .then(d=>{
      if(!d?.samples?.length||d.samples.length<2)return;
      if(document.getElementById("v-call").classList.contains("hide"))return;
      c.path=d.samples.map(([,mc])=>mc);
      c.series=d.samples;
      const host=document.getElementById("cdChartSvg");
      if(host)host.innerHTML=cdChart(c);
    })
    .catch(()=>{});
}

/* ═══════ performance simulator ═══════
   Peak x is a ceiling nobody sold at. This applies a real exit rule and a
   round-trip cost, so the number on screen is what a person would have kept. */
const FEE=0.05;
let simX="2x",simSize=100;
/* A trailing stop walked over the observed samples, not 75% of the final peak
   handed out on every call — which is what this used to do, and which turned a
   losing register into +426% on the page that says peak is a ceiling nobody
   sold at. No series means no simulated exit, so the call falls back to where
   it actually ended. */
const TRAIL_DROP=.25;
function trailExit(c,drop=TRAIL_DROP){
  const now=nx(c),entry=c.entryMc,path=Array.isArray(c.spark)?c.spark:null;
  if(!entry||!path||path.length<2)return{x:now,simulated:false};
  let high=1;
  for(const mc of path){
    const x=mc/entry;
    if(x>high)high=x;
    if(x<=high*(1-drop))return{x,simulated:true};
  }
  return{x:now,simulated:true};
}
function exitMultiple(c,rule){
  const p=mult(c),n=nx(c);
  if(rule==="hold")  return n;
  if(rule==="2x")    return p>=2   ? 2   : n;
  if(rule==="1.5x")  return p>=1.5 ? 1.5 : n;
  return trailExit(c).x;
}
function simulate(rule,size){
  const rows=[...calls].sort((a,b)=>a.at-b.at);
  let eq=0,peak=0,dd=0,simulated=0; const curve=[0],pnl=[];
  for(const c of rows){
    if(rule==="trail"&&trailExit(c).simulated)simulated++;
    const net=size*exitMultiple(c,rule)*(1-FEE)-size;
    eq+=net; pnl.push({c,net}); curve.push(eq);
    if(eq>peak)peak=eq;
    if(peak-eq>dd)dd=peak-eq;
  }
  const invested=size*pnl.length;
  return {curve,result:eq,drawdown:dd,wins:pnl.filter(x=>x.net>0).length,n:pnl.length,
          simulated:rule==="trail"?simulated:null,
          invested,returnPct:invested?eq/invested:0,
          avgPeak:rows.length?rows.reduce((a,c)=>a+mult(c),0)/rows.length:0};
}
function renderSim(){
  const r=DEMO?simulate(simX,simSize):simNow;
  if(!r||!r.n){
    document.getElementById("simEq").innerHTML="";
    document.getElementById("simStat").innerHTML=
      `<div class="k" style="color:var(--tx-3)">${CONN.state==="offline"?"Engine not answering.":"No settled calls to run a rule over yet."}</div>`;
    document.getElementById("simGap").textContent="";
    return;
  }
  const W=1000,H=190;
  const mn=Math.min(...r.curve,0),mx=Math.max(...r.curve,0),sp=(mx-mn)||1;
  const X=i=>i/(r.curve.length-1)*W, Y=v=>H-((v-mn)/sp)*(H-20)-10;
  const d=r.curve.map((v,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)).join("");
  const pos=r.result>=0,col=pos?"#3ECF8E":"#E5606B";
  document.getElementById("simEq").innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <line class="zero" x1="0" y1="${Y(0).toFixed(1)}" x2="${W}" y2="${Y(0).toFixed(1)}"/>
    <path d="${d}L${W} ${Y(mn).toFixed(1)}L0 ${Y(mn).toFixed(1)}Z" fill="url(#eg)"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
  const money=v=>(v<0?"−$":"$")+Math.abs(Math.round(v)).toLocaleString();
  document.getElementById("simStat").innerHTML=[
    ["Result",money(r.result),r.result>=0?"up":"dn"],
    ["Return",(r.returnPct*100).toFixed(1)+"%",r.result>=0?"up":"dn"],
    ["Profitable calls",r.wins+" / "+r.n,""],
    ["Worst drawdown",money(-r.drawdown),"dn"]].map(([k,v,c])=>
    `<div><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`).join("");
  const avgPeak=r.avgPeak;
  document.getElementById("simGap").innerHTML=
    `Average peak across the register is <b style="color:var(--tx)">${avgPeak.toFixed(2)}×</b>, which reads like a
     ${((avgPeak-1)*100).toFixed(0)}% return. Under this exit rule it actually returned
     <b style="color:${pos?"var(--win)":"var(--dead)"}">${(r.returnPct*100).toFixed(1)}%</b>.
     That gap is why peak and now are always shown together — nobody sells the top, and 5% round-trip
     cost across ${r.n} calls is real money.`;
}

/* the leaderboard the multi-caller schema was always for. ranked on hit rate
   over every call, never on the single best one, and the return column names
   the exit rule it assumes instead of quoting an unqualified number. */
let lbMin=1, lbWin=0;
function renderLeaders(){
  const now=Date.now(), cut=lbWin?now-lbWin*24*60*MIN:0;
  const rows=(DEMO
    ?Object.entries(calls.filter(c=>c.at>=cut).reduce((g,c)=>((g[c.by]??=[]).push(c),g),{}))
      .map(([by,v])=>{
        const mid=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
        const chains={};v.forEach(c=>chains[c.chain]=(chains[c.chain]||0)+1);
        return {who:by==="desk"?"House desk":"@"+by,n:v.length,
          d7:v.filter(c=>c.at>=now-7*24*60*MIN).length,
          d30:v.filter(c=>c.at>=now-30*24*60*MIN).length,
          rate:v.filter(win).length/v.length,
          medPk:mid(v.map(mult)),medNow:mid(v.map(nx)),
          ret:v.reduce((a,c)=>a+(exitMultiple(c,simX)*(1-FEE)-1),0)/v.length,
          chain:Object.entries(chains).sort((a,b)=>b[1]-a[1])[0][0],
          last:[...v].sort((a,b)=>b.at-a.at).slice(0,5).map(c=>badgeOf(c))};
      })
    :(anaLeaders??[]).map(r=>({
        who:CALLER_NAME(r.callerId),n:r.n,d7:r.d7,d30:r.d30,rate:r.hitRate,
        medPk:r.medianPeak,medNow:r.medianNow,ret:r.returnPct,
        chain:CHAIN[r.topChain]??r.topChain??"—",
        // The engine sends the verdict and the death; the badge rule is the same
        // one the cards use, so a form line cannot disagree with a card.
        last:(r.last??[]).map(m=>m.verdict==="win"?"win":m.isDead?"dead":m.verdict)})))
    .filter(r=>r.n>=lbMin).sort((a,b)=>b.rate-a.rate||b.ret-a.ret);

  document.getElementById("qCallers").innerHTML = rows.length ? rows.map((r,i)=>
    `<tr><td class="n" style="text-align:left;color:var(--tx-3)">${i+1}</td>
      <td class="k">${esc(r.who)}</td>
      <td class="n">${r.d7} / ${r.d30} / ${r.n}</td>
      <td class="n" style="color:var(--tx)">${Math.round(r.rate*100)}%</td>
      <td class="n">${r.medPk.toFixed(2)}×</td>
      <td class="n" style="color:${r.medNow>=1?"var(--tx-2)":"var(--dead)"}">${r.medNow.toFixed(2)}×</td>
      <td class="n" style="color:${r.ret>=0?"var(--win)":"var(--dead)"}">${r.ret>=0?"+":"−"}${Math.abs(r.ret*100).toFixed(0)}%</td>
      <td><span class="vdots">${r.last.map(v=>`<i class="${esc(v)}"></i>`).join("")}${
        Array.from({length:Math.max(0,5-r.last.length)},()=>"<i></i>").join("")}</span></td>
      <td>${r.chain}</td></tr>`).join("")
    : `<tr><td colspan="9" style="color:var(--tx-3);padding:16px 0">No caller has that many calls in this window yet.</td></tr>`;
}
document.getElementById("lbMin").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;lbMin=+b.dataset.m;
  [...e.currentTarget.children].forEach(x=>x.classList.toggle("on",x===b));renderLeaders();});
document.getElementById("lbWin").addEventListener("change",e=>{lbWin=+e.target.value;renderLeaders();pullQuant()});
document.getElementById("simExit").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;simX=b.dataset.x;
  [...e.currentTarget.children].forEach(x=>x.classList.toggle("on",x===b));renderSim();renderLeaders();pullQuant();});
document.getElementById("simSize").addEventListener("change",e=>{simSize=+e.target.value;renderSim();pullQuant()});

/* ═══════ Hindsight · Triage · Vault ═══════
   Every number below comes from the engine's analytics over the whole window,
   not from the rows this page is holding — those are whatever the Signals
   filter last asked for, and a hit rate computed over them answers a different
   question than the heading above it.
   Same functions as analytics.js on the server. */

const settledRows=()=>calls.filter(c=>!c.live);

function reasonPerf(){
  const rows=settledRows();
  if(!rows.length)return{base:0,list:[]};
  const base=rows.filter(win).length/rows.length,b={};
  rows.forEach(r=>(r.rids||[]).forEach(id=>{
    const e=b[id]||(b[id]={id,n:0,w:0,pk:[]});
    e.n++;if(win(r))e.w++;e.pk.push(mult(r))}));
  const list=Object.values(b).map(e=>{
    const s=e.pk.sort((x,y)=>x-y);
    const med=s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;
    return{id:e.id,n:e.n,hit:e.w/e.n,lift:base?(e.w/e.n)/base:0,med};
  }).sort((x,y)=>y.lift-x.lift);
  return{base,list};
}
function bands(w=20){
  const g={};
  settledRows().forEach(r=>{const lo=Math.floor((r.score||0)/w)*w;
    const e=g[lo]||(g[lo]={lo,hi:lo+w,n:0,w:0});e.n++;if(win(r))e.w++});
  return Object.values(g).sort((a,b)=>a.lo-b.lo).map(e=>({...e,hit:e.n?e.w/e.n:0}));
}
/* Every number on this page was computed in the browser over `calls` — which,
   since the register filters on the server, is whatever the Signals page was
   last asked for. Open it under ?f=win and Hindsight quietly answered "of the
   wins, how many won". The engine has had these endpoints all along. */
let anaBands=null,anaReasons=null,anaLeaders=null,simNow=null;
async function pullQuant(){
  if(DEMO)return;
  [anaBands,anaReasons,anaLeaders,simNow]=await Promise.all([
    readJson("/analytics/bands"),
    readJson("/analytics/reasons"),
    readJson(`/analytics/callers?exit=${simX}${lbWin?`&days=${lbWin}`:""}`),
    readJson(`/analytics/simulate?exit=${simX}&size=${simSize}`)]);
  renderQuant();renderSim();renderLeaders();
}

/* Wilson score interval — the range a hit rate could really be, given how few
   calls produced it. On n=2 it covers most of the axis, and drawing that is the
   difference between a chart that reports 50% and one that admits it knows
   nothing yet. */
function wilson(k,n,z=1.96){
  if(!n)return[0,1];
  const p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,
        m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return[Math.max(0,c-m),Math.min(1,c+m)];
}
/* Below this a single outcome moves a band by ten points or more, so the band
   is drawn but not asked to mean anything. */
const THIN_BAND=10;

function drawBands(bs){
  const host=document.getElementById("qBands"),key=document.getElementById("qBandKey");
  if(!host)return;
  host.classList.toggle("no-data",!bs.length);
  if(!bs.length){
    host.innerHTML=`<div class="empty">No settled calls yet — nothing to score.</div>`;
    if(key)key.innerHTML="";
    return;
  }
  const N=bs.reduce((a,b)=>a+b.n,0),W=bs.reduce((a,b)=>a+b.wins,0),base=N?W/N:0;
  const pct=v=>(v*100).toFixed(1);

  host.innerHTML=
    `<span class="base"><i style="bottom:${pct(base)}%"></i>`+
    `<em style="bottom:${pct(base)}%">all calls ${(base*100).toFixed(0)}%</em></span>`+
    bs.map(b=>{
      const [lo,hi]=wilson(b.wins,b.n),thin=b.n<THIN_BAND;
      const tip=`Score ${b.lo}-${b.hi}: ${b.wins} of ${b.n} settled calls won `
        +`(${(b.hit*100).toFixed(0)}%). With ${b.n} call${b.n===1?"":"s"} the true rate `
        +`is somewhere between ${(lo*100).toFixed(0)}% and ${(hi*100).toFixed(0)}%.`;
      // Self-contained: the prototype has no esc() and this must render there too.
      return `<div class="bd${thin?" thin":""}" title="${tip.replace(/"/g,"&quot;")}">
        <span class="col">
          <i style="height:${pct(b.hit)}%"></i>
          <u style="bottom:${pct(lo)}%;height:${pct(hi-lo)}%"></u>
        </span>
        <span class="lb">
          <em>${b.lo}–${b.hi}</em>
          <b>${(b.hit*100).toFixed(0)}%</b>
          <i>${b.n} call${b.n===1?"":"s"}${thin?"<br>too few":""}</i>
        </span>
      </div>`;
    }).join("");

  if(!key)return;
  const thinCount=bs.filter(b=>b.n<THIN_BAND).length;
  key.innerHTML=
    `<p>The line is <b>every settled call together — ${(base*100).toFixed(0)}%</b>. `
    +`A band only tells you something if it sits clearly away from it.</p>`
    +`<p>The whisker on each bar is the range the real rate could be, given how `
    +`few calls that band has. Wide whisker, nothing proven.</p>`
    +(thinCount?`<p><b>${thinCount} of ${bs.length} bands</b> have fewer than ${THIN_BAND} `
      +`calls and are dimmed. One more win or loss swings them by ten points or more.</p>`:"")
    +`<p>${N} settled call${N===1?"":"s"} in total. These bands are worth `
    +`retuning the threshold on at around 100.</p>`;
}

function renderQuant(){
  // wins, not just the rate: the interval needs the count it came from.
  const bs=DEMO
    ? bands().map(b=>({lo:b.lo,hi:b.hi,n:b.n,wins:b.w,hit:b.hit}))
    : (anaBands??[]).map(b=>({lo:b.lo,hi:b.hi,n:b.n,
        wins:b.wins??Math.round((b.hitRate??0)*b.n),hit:b.hitRate}));
  drawBands(bs);

  const rp=DEMO?reasonPerf()
    :{list:(anaReasons?.reasons??[]).map(r=>({id:r.id,n:r.n,hit:r.hitRate,lift:r.lift}))};
  document.getElementById("qReasons").innerHTML=rp.list.map(r=>
    `<tr><td class="k">${r.id.replace(/_/g," ")}</td><td class="n">${r.n}</td>
      <td class="n">${(r.hit*100).toFixed(0)}%</td>
      <td><span class="lift"><i class="${r.lift<1?"low":""}" style="width:${Math.min(72,r.lift*46)}px"></i>
        <span class="mono" style="font-size:11.5px;color:${r.lift>=1?"var(--accent)":"var(--tx-3)"}">${r.lift.toFixed(2)}</span></span></td></tr>`).join("")
    ||`<tr><td colspan="4" style="color:var(--tx-3)">Not enough settled calls.</td></tr>`;

  const cg=DEMO
    ?Object.entries(calls.reduce((g,c)=>{const e=g[c.chain]||(g[c.chain]={n:0,w:0,p:[]});
        e.n++;if(win(c))e.w++;e.p.push(mult(c));return g},{}))
       .map(([k,e])=>({k,n:e.n,hit:e.w/e.n,avg:e.p.reduce((a,b)=>a+b,0)/e.p.length}))
    :(anaChains??[]).map(r=>({k:CHAIN[r.chain]??String(r.chain).toUpperCase(),
        n:r.n,hit:r.hitRate,avg:r.avgPeak}));
  document.getElementById("qChains").innerHTML=cg
    .sort((a,b)=>b.hit-a.hit).map(r=>
    `<tr><td class="k">${r.k}</td><td class="n">${r.n}</td>
      <td class="n" style="color:${r.hit>=.5?"var(--win)":"var(--tx-2)"}">${(r.hit*100).toFixed(0)}%</td>
      <td class="n">${r.avg.toFixed(2)}×</td></tr>`).join("");

  const rows=settledRows();
  document.getElementById("qSweep").innerHTML=[50,60,70,80,90].map(t=>{
    const f=rows.filter(r=>(r.score||0)>=t);
    const h=f.length?f.filter(win).length/f.length:0;
    return `<tr><td class="k">${t}${t===60?' <span style="color:var(--accent);font-size:10.5px">current</span>':""}</td>
      <td class="n">${f.length}</td><td class="n">${f.length?(h*100).toFixed(0)+"%":"—"}</td></tr>`}).join("");
}

const JOBS=[["Discovery","screen candidates, write signals that clear the bar","60s",14],
  ["Hot scorer","refresh every live call, move peak and verdict","20s",6],
  ["Warm scorer","settled calls, only to catch a later death","5m",92],
  ["Anchor","publish the chain head on-chain","24h",8400]];
const REJECTS=[
  ["$PONZI","Liquidity $4.2K is under the $15K floor","LIQ"],
  ["$MOONX","Already +214% in five minutes — this is the top, not the entry","PUMP"],
  ["$AISHIB","Selling into it — 412 sells against 96 buys in the last hour","DUMP"],
  ["$NOBODY","No socials and no site — nothing behind the ticker","ID"],
  ["$WHALE2","Liquidity is only 1.6% of cap — too thin to exit","TRAP"],
  ["$FRESH","Only 4m old — inside the sniper window","AGE"],
  ["$BIGCAP","Market cap $11.4M is above the $2.00M ceiling","CAP"],
  ["$WEIRD","Quoted in PEPE2, not a major","QUOTE"],
  ["$SLEEPY","Cleared the gates but only scored 24/100","SCORE"],
];
const GATES=[["Liquidity floor","$15K"],["Age window","20m – 72h"],["Cap window","$30K – $2M"],
  ["Liquidity / cap","≥ 4%"],["Sell pressure","≤ 2.2× buys"],["Not vertical","5m ≤ +60%"],
  ["Has identity","socials or site"],["Sane quote","SOL / ETH / BNB / USDC"]];

/* Triage reads the engine. Before it did, this page printed 412 scanned and
   325 killed from the prototype's seed next to a real count of signals fired —
   invented telemetry on the one page whose job is to prove the filter is
   strict. Numbers here now come from /api/triage or they do not appear. */
let triage=null;
async function pullTriage(){
  if(DEMO)return;
  try{
    const r=await fetch(API+"/triage",noStore());
    if(r.ok){triage=await r.json();renderOps()}
  }catch(e){}
}
const GATE_LABEL={priceable:"Unmeasurable",liquidity_floor:"Liquidity",age_window:"Age",
  cap_window:"Cap",liquidity_ratio:"Depth",sell_pressure:"Sell pressure",not_vertical:"Vertical",
  has_identity:"Identity",sane_quote:"Quote",dust_flow:"Dust",wash_pattern:"Wash",
  fading_bid:"Fading bid",cooldown:"Cooldown",score:"Score",
  // chain.js — these refuse on what the chain states, not on the tape
  mint_revoked:"Mint authority",freeze_revoked:"Freeze authority",
  holder_concentration:"Concentration",holder_spread:"Top 10",lp_burned:"LP"};
/* The engine's own source names. An id with no label here still renders — it is
   printed as the engine gave it, rather than dropped for being unrecognised. */
const SOURCE_LABEL={"dexscreener-profiles":"Dexscreener profiles","dexscreener-boosts":"Dexscreener boosts",
  "helius-pools":"Helius, new Solana pools","unattributed":"Unattributed"};
const usdShort=n=>n>=1e6?"$"+(n/1e6).toFixed(0)+"M":n>=1e3?"$"+(n/1e3).toFixed(0)+"K":"$"+n;

function renderOps(){
  document.getElementById("oJobs").innerHTML=JOBS.map(([n,d,iv,ago])=>
    `<div class="job"><span class="dot"></span>
      <span><span class="nm">${n}</span><div class="de">${d}</div></span>
      <span class="iv">${iv}</span><span class="ago">${ago<60?ago+"s ago":ago<3600?Math.round(ago/60)+"m ago":Math.round(ago/3600)+"h ago"}</span></div>`).join("");

  const t=DEMO?null:triage;
  const counts=DEMO
    ? [["Candidates scanned",412],["Killed at the gates",Math.round(412*0.79)],
       ["Cleared gates, scored low",Math.round(412*0.18)],["Signals fired",calls.length],
       ["Pass rate",(calls.length/412*100).toFixed(1)+"%"]]
    : t
    ? [["Candidates scanned",t.scanned],["Killed at the gates",t.killed],
       ["Cleared gates, scored low",t.scoredLow],["Signals fired",t.fired],
       // A rate over nothing scanned is unanswerable, not zero.
       ["Pass rate",t.passRate===null?"—":(t.passRate*100).toFixed(1)+"%"]]
    : null;

  // How close the ones that cleared every gate came. A threshold argument
  // without this is a guess — candidates sitting at 74 and candidates sitting
  // at 40 produce the same "scored low" count.
  const cs=t?.clearedScores;
  const near=cs?.n?[["Best score, gates cleared",cs.best+" / "+(g?.scoreToFire??100)],
                    ["Median score, gates cleared",cs.median]]:[];
  document.getElementById("oCounts").innerHTML = counts
    ? counts.concat(near).map(([l,v])=>`<div class="stat"><span class="l">${l}</span><span class="v">${v}</span></div>`).join("")
    : `<p class="sub" style="margin:0">Waiting for the screener to report its first pass.</p>`;

  const rejects=DEMO?REJECTS:(t?.rejects??[]).map(r=>["$"+r.symbol,r.why,GATE_LABEL[r.gate]??r.gate]);
  document.getElementById("oRejects").innerHTML = rejects.length
    ? rejects.map(([tk,r,g])=>`<div class="rej"><span class="tk">${tk}</span><span class="rs">${r}</span><span class="tag">${g}</span></div>`).join("")
    : `<p class="sub" style="margin:0">Nothing refused yet in this window.</p>`;

  /* Where the candidates came from, and whether each source ever produced one
     that cleared. Adding a source always raises the scanned count; only these
     two numbers together say whether the extra ones were worth a key. */
  const srcEl=document.getElementById("oSources");
  if(srcEl){
    const rows=DEMO?[]:(t?.sources??[]);
    srcEl.innerHTML=rows.length
      ?rows.map(r=>{
        // A source that ran and failed every time is not a source with nothing
        // to report, and the difference is the whole reason this panel exists.
        const broken=r.errors>0&&r.errors>=(r.runs??0);
        const state=broken
          ?`failing — ${esc(String(r.lastError??"no reason given").slice(0,60))}`
          :`${r.scanned} scanned · ${r.fired} fired`
            +`${r.passRate==null?"":" · "+(r.passRate*100).toFixed(1)+"%"}`
            +`${r.errors?" · "+r.errors+" of "+r.runs+" calls failed":""}`;
        return `<div class="gate${broken?" unread":""}"><span class="g">${esc(SOURCE_LABEL[r.id]??r.id)}</span>`
          +`<span class="t${broken?" unread":""}">${state}</span></div>`;
      }).join("")
      :`<p class="sub" style="margin:0">${CONN.state==="offline"?"Engine not answering."
        :"No candidates in this window yet."}</p>`;
  }

  const g=t?.gateConfig;
  const gates=DEMO||!g?GATES:[
    ["Liquidity floor",usdShort(g.minLiquidityUsd)],
    ["Age window",g.minAgeMinutes+"m – "+g.maxAgeHours+"h"],
    ["Cap window",usdShort(g.minMarketCap)+" – "+usdShort(g.maxMarketCap)],
    ["Liquidity / cap","≥ "+(g.minLiqToMcRatio*100).toFixed(0)+"%"],
    ["Sell pressure","≤ "+g.maxSellPressure+"× buys"],
    ["Not vertical","5m ≤ +"+g.maxRecentPumpPct+"% · 1h ≤ +"+g.maxHourPumpPct+"%"],
    ["Has identity","socials or site"],
    ["Sane quote",g.quoteWhitelist.slice(0,4).join(" / ")]];
  document.getElementById("oGates").innerHTML=gates.map(([n,v])=>
    `<div class="gate"><span class="g">${n}</span><span class="t">${v}</span></div>`).join("");
}

/* ── Vault: a real hash chain, computed in the browser ── */
/* SHA-256 in plain JS on purpose. crypto.subtle only exists in a secure
   context, so it is undefined when this file is opened over file:// — which
   is exactly how a prototype gets opened. */
const K256=(()=>{const k=[],p=[];let n=2;
  while(k.length<64){let ok=true;for(let i=2;i*i<=n;i++)if(n%i===0){ok=false;break}
    if(ok){p.push(n);k.push(Math.floor((Math.cbrt(n)%1)*4294967296)>>>0)}n++}
  return k})();
const H256=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
function sha(str){
  const bytes=[...new TextEncoder().encode(str)];
  const bitLen=bytes.length*8;
  bytes.push(0x80); while(bytes.length%64!==56)bytes.push(0);
  for(let i=7;i>=0;i--)bytes.push((bitLen/Math.pow(2,i*8))&0xff);
  const H=H256.slice(),w=new Array(64);
  const rr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
  for(let off=0;off<bytes.length;off+=64){
    for(let i=0;i<16;i++)w[i]=((bytes[off+i*4]<<24)|(bytes[off+i*4+1]<<16)|
      (bytes[off+i*4+2]<<8)|bytes[off+i*4+3])>>>0;
    for(let i=16;i<64;i++){
      const s0=(rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3))>>>0;
      const s1=(rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10))>>>0;
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const S1=(rr(e,6)^rr(e,11)^rr(e,25))>>>0;
      const ch=((e&f)^(~e&g))>>>0;
      const t1=(h+S1+ch+K256[i]+w[i])>>>0;
      const S0=(rr(a,2)^rr(a,13)^rr(a,22))>>>0;
      const mj=((a&b)^(a&c)^(b&c))>>>0;
      const t2=(S0+mj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)>>>0);
  }
  return H.map(x=>x.toString(16).padStart(8,"0")).join("");
}
/* integrity.js, field for field, version for version. The page used to hash six
   fields of its own choosing and present the result as the record hash: a
   number that looks like proof, computed over something the chain never
   hashed. If these lists drift from SCHEMES the check below starts failing
   loudly, which is the point — so they are copied, never derived, and a row is
   rehashed under the scheme it was written with, exactly as the engine does. */
const V2=["hashVersion","callerId","chain","tokenAddress","pairAddress","symbol",
  "firedAt","entryPriceUsd","entrySupply","entryMc","entrySupplySource",
  "liquidityUsd","score","reasonIds","sourceKind","sourceRef"];
const SCHEMES={2:V2,3:[...V2,"entryVolumeH1","entryVolumeM5"]};
function canonRecord(row){
  const version=row.hashVersion??2, fields=SCHEMES[version];
  if(!fields)return null;      // written by a newer engine: unverifiable here, not wrong
  const o={};
  for(const k of [...fields].sort()){
    const v=k==="hashVersion"?version:row[k];
    o[k]=Array.isArray(v)?v.map(String):typeof v==="number"?String(v):v==null?null:String(v);
  }
  return JSON.stringify(o);
}
const recomputeHash=row=>{const c=canonRecord(row);return c==null?null:sha(c)};

function canon(c){
  return JSON.stringify({chain:c.chain,entryMc:String(c.entry),firedAt:new Date(c.at).toISOString(),
    score:String(c.score),symbol:c.tick,tokenAddress:c.ca});
}
let VCHAIN=[],VTAMPER=null;
function buildChain(){
  const src=(VTAMPER==="delete")?calls.filter((_,i)=>i!==2):calls;
  let prev="0".repeat(64);VCHAIN=[];
  for(let i=0;i<src.length;i++){
    const c=VTAMPER==="edit"&&i===1?{...src[i],entry:1}:src[i];
    const rec=sha(canon(c));
    prev=sha(prev+rec);
    VCHAIN.push({seq:i+1,rec,link:prev,sym:c.tick});
  }
  return prev;
}
let VBASE=null;
/* This page states facts about the chain, so it may not compute them itself.
   It printed a head recomputed from whatever rows the browser held, a last
   anchor date and an anchor network — for a register the engine correctly
   reports as never published. The engine answers now, or the page says it
   cannot. The demonstration below keeps its own numbers, clearly labelled. */
function renderVault(){
  const demoHead=buildChain();
  if(!VBASE&&!VTAMPER)VBASE=demoHead;
  const V=(!DEMO&&verifyState)?verifyState:null;
  document.getElementById("vHead").textContent=V?V.head:(DEMO?demoHead:"—");
  const stats=V
    ?[["Calls on record",V.count],["Genesis","0000…0000"],
      ["Chain check",V.ok?"intact — recomputed by the engine":"BROKEN — "+(V.why??"see /api/verify")],
      ["Anchored",V.anchored?`through seq ${V.anchoredThrough}`:"never published on-chain"]]
    :DEMO
    ?[["Calls on record",VCHAIN.length],["Genesis","0000…0000"],
      ["Chain check","demo data"],["Anchored","demo data"]]
    :[["Calls on record","—"],["Genesis","0000…0000"],
      ["Chain check","engine not answering"],["Anchored","—"]];
  document.getElementById("vStats").innerHTML=
    stats.map(([l,v])=>`<div class="stat"><span class="l">${l}</span><span class="v">${v}</span></div>`).join("");

  const box=document.getElementById("vResult");
  if(!VTAMPER){box.className="vres ok";
    box.innerHTML="Chain intact — every record hash matches and every link checks out.";
  }else{box.className="vres bad";
    box.innerHTML=(VTAMPER==="edit"
      ? "<b>Detected at seq 2.</b> One stored entry MC was changed. Its record hash no longer matches, and because every later link is built on it, all "+(VCHAIN.length-1)+" hashes after it changed too."
      : "<b>Detected at seq 3.</b> A call was removed. The chain head moved, which is exactly what a published anchor would catch.")
      +`<div style="margin-top:9px;font-family:var(--mono);font-size:11px;opacity:.85">was ${(VBASE||"").slice(0,28)}…<br>now ${head.slice(0,28)}…</div>`;
  }
  // Real anchors or none. The three rows here were built from calls.length —
  // a publication history invented on a register nothing has ever published.
  const a=V?.latestAnchor;
  document.getElementById("vAnchors").innerHTML = a
    ? `<tr><td class="k">${utc(Date.parse(a.at)).split(" · ")[0]}</td><td class="n">${a.seqTo}</td>
       <td class="n" style="font-size:11px">${String(a.chainHead??"").slice(0,14)}…</td></tr>`
    : `<tr><td colspan="3" class="k" style="padding:14px 2px">${
        V?"Nothing published yet — /api/verify reports the register as unanchored."
         :DEMO?"Demo page — no engine behind it.":"—"}</td></tr>`;
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tamper]");if(!t)return;
  VTAMPER=t.dataset.tamper==="reset"?null:t.dataset.tamper;
  renderVault();
});
document.getElementById("vCsv").addEventListener("click",()=>{
  // The engine's export is the canonical one: the whole register at this
  // reader's tier, and the exact file verify.js recomputes the chain from.
  // Building it here from the rows this page holds produced something that
  // called itself the full register, renumbered every call from 1, and could
  // not be checked against anything.
  if(!DEMO){location.href=API+"/export.csv";return}
  const cols=["seq","firedAt","chain","symbol","entryMc","peakMc","nowMc","peakX","verdict","score"];
  const body=calls.map((c,i)=>[c.seq??i+1,new Date(c.at).toISOString(),c.chain,c.tick,
    Math.round(c.entry),Math.round(c.peak),Math.round(c.nowMc),mult(c).toFixed(3),vrd(c),c.score].join(","));
  const blob=new Blob([[cols.join(","),...body].join("\n")],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download="nekara-register.csv";a.click();
});


/* ═══════ share templates ═══════
   Built from the call record so a post can never quietly disagree with the
   register. Wins and losses both get one — publishing the failures is the
   whole differentiator, and nobody does it. */
function tplX(c){
  const v=badgeOf(c), m=(v==="open"?nx(c):mult(c)).toFixed(2);
  const head=v==="win"?`$${c.tick} · WIN ${m}×${deadOf(c)?" · then died":""}`
    :v==="dead"?`$${c.tick} · DEAD · peaked ${mult(c).toFixed(2)}×`
    :v==="miss"?`$${c.tick} · MISS · peaked ${mult(c).toFixed(2)}×`
    :`$${c.tick} · LIVE ${m}×`;
  return [head,"",
    `Called at ${fmt(c.entry)} on ${c.chain}.`,
    `Peak ${fmt(c.peak)} · now ${fmt(c.nowMc)}.`,"",
    "Why it fired:",
    ...(c.reasons||[]).slice(0,2).map(r=>`· ${r}`),"",
    v==="win"?"On the register with every miss we've ever posted."
      :"Still on the register. We don't take the bad ones down.",
    `nekara.xyz/call/${c.id.replace("r","")}`].join("\n");
}
function tplTG(c){
  const v=badgeOf(c);
  const tag=v==="win"?(deadOf(c)?"✅ WIN · ⚰️ then died":"✅ WIN"):v==="dead"?"⚰️ DEAD":v==="miss"?"❌ MISS":"🟢 LIVE";
  return [`${tag} · $${c.tick}  ·  ${c.chain} · ${c.src}`,
    `Score ${c.score}/100`,"",
    `Entry MC    ${fmt(c.entry)}`,
    `Peak MC     ${fmt(c.peak)}  (${mult(c).toFixed(2)}×)`,
    `Now MC      ${fmt(c.nowMc)}  (${nx(c).toFixed(2)}×)`,
    c.twoIn?`Reached 2×  ${secs(c.twoIn)}`:`Reached 2×  never`,"",
    "Why it fired",
    ...(c.reasons||[]).map(r=>`  • ${r}`),"",
    `CA: ${c.ca}`,"",
    "Peak is not a realized return. Every call — win, miss or dead — stays on the public register.",
    `nekara.xyz/call/${c.id.replace("r","")}`].join("\n");
}
const ICO_X='<svg viewBox="0 0 24 24"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.7L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z"/></svg>';
const ICO_TG='<svg viewBox="0 0 24 24"><path d="M21.9 4.3 18.9 19c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7L18.2 6c.4-.3-.1-.5-.6-.2L7.1 12.4l-4.5-1.4c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.5 1.5Z"/></svg>';
const shareDrw=document.getElementById("shareDrw");
function openShare(id){
  const c=calls.find(x=>x.id===id); if(!c)return;
  const x=tplX(c),tg=tplTG(c);
  document.getElementById("shareTitle").textContent=`$${c.tick} · ${LBL[badgeOf(c)]}`;
  document.getElementById("shareBody").innerHTML=`
    <div class="tpl"><div class="th">${ICO_X}X post<span class="n">${x.length} chars</span></div>
      <pre id="tx">${x.replace(/</g,"&lt;")}</pre>
      <div class="tf"><button class="btn btn-s" data-copy="tx">Copy</button></div></div>
    <div class="tpl"><div class="th">${ICO_TG}Telegram post<span class="n">${tg.length} chars</span></div>
      <pre id="ttg">${tg.replace(/</g,"&lt;")}</pre>
      <div class="tf"><button class="btn btn-s" data-copy="ttg">Copy</button></div></div>`;
  shareDrw.classList.add("on");scrim.classList.add("on");shareDrw.setAttribute("aria-hidden","false");
}
function closeShare(){shareDrw.classList.remove("on");scrim.classList.remove("on");
  shareDrw.setAttribute("aria-hidden","true")}
document.getElementById("shareX").addEventListener("click",closeShare);
document.addEventListener("click",e=>{
  const sh=e.target.closest("[data-share]");
  if(sh){e.stopPropagation();openShare(sh.dataset.share);return}
  const rec=e.target.closest(".rec");
  if(rec&&rec.dataset.id&&!e.target.closest(".ca,.lnk,.shbtn,.pv-body")){openCall(rec.dataset.id);return}
  const cp=e.target.closest("[data-copy]");
  if(cp){const el=document.getElementById(cp.dataset.copy);
    navigator.clipboard?.writeText(el.textContent);
    const o=cp.textContent;cp.textContent="Copied";
    setTimeout(()=>cp.textContent=o,1200);return}
});

/* ═══════ live signals ═══════
   Socket first, poll second. The socket is the point — a signal reaches this
   page the moment its tier's timer fires on the server — and the 20s poll only
   backfills whatever the socket missed while it was down.

   Which tier a socket joins is decided by the engine from the signed session
   and from nothing this file sends, so there is no gating logic here to get
   wrong: the page renders what it is given and asks for nothing else.

   The other half of the job is saying what state we are actually in. The old
   header counted seconds since a timer last ran and called it "synced", which
   read identically whether the engine was answering, refusing or gone. */
const API=(location.protocol==="file:"?"http://localhost:8787":"")+"/api";
// The auth routes are at the root, not under /api. Asking for them under
// /api/auth/nonce reaches a static file server, which answers 404 to a
// sign-in and looks exactly like a wallet refusing.
const AUTH=API.replace(/\/api$/,"");
const FEED=(location.protocol==="file:"?"ws://localhost:8787"
  :(location.protocol==="https:"?"wss://":"ws://")+location.host)+"/feed";
const CHAIN={solana:"SOL",base:"BASE",bsc:"BSC",ethereum:"ETH"};

/* ── the session ──────────────────────────────────────────────────────────
   The engine has had SIWE, four gated websocket rooms and a tier read from the
   key contract since the first commit. The site had a Connect button with no
   handler behind it, so every reader was public tier forever and the paid half
   of the product had no door at all.

   Nothing here decides a tier. The wallet proves an address to the engine, the
   engine reads that address against the key contract, and the token it returns
   is the only thing that changes what arrives — exactly as it must be, or the
   latency is a suggestion. Sessions last five minutes and are refreshed while
   the page is open, so selling a key ends its access on the next refresh.

   Held in sessionStorage: a reload should not cost another signature, and a
   closed tab should not leave a token behind. */
const SESSION={token:null,tier:0,address:null};
const readJson=async path=>{
  try{const r=await fetch(API+path,noStore());return r.ok?await r.json():null}
  catch{return null}
};
/* A request that hangs is worse than one that fails: the header keeps saying
   "polling" and the page keeps showing figures nobody re-read. A machine whose
   network path blackholes instead of refusing does exactly this, and it is the
   same failure as an empty register reading like a quiet market — the page has
   to be able to tell it is no longer being answered. Ten seconds is four times
   the slowest honest response and half the poll interval, so a timed-out poll
   is resolved before the next one starts. */
const noStore=()=>({cache:"no-store",signal:AbortSignal.timeout(10000),
  headers:SESSION.token?{authorization:"Bearer "+SESSION.token}:{}});
const SHORT=a=>a?a.slice(0,6)+"…"+a.slice(-4):"";
const TIER_NAME=["Public","Tier I","Tier II","Tier III"];

const CONN={state:DEMO?"demo":"boot",read:0,delay:null};   // delay: this reader's own latency, learned from the socket
const CONN_TX={live:"live",polling:"polling",offline:"engine offline",boot:"connecting…",demo:"demo data"};
const renderAll=()=>{renderFeed();renderPreview();renderStats();renderCallers();renderChains();renderTicker()};

function setConn(s){
  if(CONN.state===s)return;
  CONN.state=s;paintConn();renderFeed();renderTicker();
}
function paintConn(){
  const t=document.getElementById("syncTxt"),d=document.getElementById("syncDot");
  if(t){
    const age=Math.round((Date.now()-CONN.read)/1000);
    t.textContent=CONN.read&&(CONN.state==="polling"||CONN.state==="offline")
      ?CONN_TX[CONN.state]+" · "+(age<60?age+"s":Math.round(age/60)+"m")
      :CONN_TX[CONN.state];
  }
  if(d)d.className="pulse hide-sm"+(CONN.state==="live"||CONN.state==="demo"?""
    :CONN.state==="offline"?" down":" warn");
}

/* ── register rows ─────────────────────────────────────────────────────────
   The engine publishes the points it actually observed — entry, the highest
   mark it saw, the last mark — and no path between them, because there is no
   candle source to draw one from. The prototype filled the gap with a
   plausible curve; a plausible curve is a picture of a price that never
   happened. A live card plots the points we have and grows as marks arrive. */
const shortCa=a=>!a?"":a.length<=12?a:a.slice(0,6)+"…"+a.slice(-4);
function seedPath(d){
  const e=d.entryMc,now=d.nowMc??e,pk=d.peakMc??e,p=[e];
  if(pk>e&&pk!==now)p.push(pk);
  p.push(now);
  return p;
}
/* Some tokens list the dollar inside the symbol — "$TAP" — and every surface
   here adds one. The record keeps what the provider said; the page strips it
   once, on the way in, so the card, the avatar letter, the detail page and both
   share templates all agree. */
const tickerOf=s=>String(s??"").replace(/^\$+/,"")||"?";
function rowToCall(d){
  return{id:"r"+d.seq,seq:d.seq,name:d.name||d.symbol,tick:tickerOf(d.symbol),
    chain:CHAIN[d.chain]||String(d.chain||"").toUpperCase(),
    by:d.callerName||"screener",src:d.dex,ca:shortCa(d.tokenAddress),
    addr:d.tokenAddress||"",          // the card shows the short form; search needs the whole one

    entry:d.entryMc,peak:d.peakMc??d.entryMc,nowMc:d.nowMc??d.entryMc,
    liq:d.liquidityUsd??0,vol:d.entryVolumeH1??null,   // null = fired before we recorded it
    real:typeof d.realised2x==="number"?d.realised2x:null,  // the rule's answer, from the engine
    links:Array.isArray(d.links)?d.links:[],
    chainId:d.chain,pair:d.pairAddress??"",             // the pair it fired on, for the chart link
    onchain:d.chainChecks??null,        // null = nothing was read, which is not the same as clean
    deadAt:d.deadAt?Date.parse(d.deadAt):null,
    raw:d,                              // the row as the engine wrote it, for verification
    verdict:d.verdict,isDead:d.isDead??false,
    twoIn:d.secondsTo2x,at:Date.parse(d.firedAt),live:d.state!=="settled",
    reasons:d.reasons||[],score:d.score,flash:false,
    // The marks the poller actually saw, when the engine has them. seedPath is
    // the fallback for a row written before it kept a series: three points it
    // can stand behind, rather than a curve invented between them.
    path:Array.isArray(d.spark)&&d.spark.length>1?d.spark.slice():seedPath(d)};
}
function upsert(row){
  const c=rowToCall(row),i=calls.findIndex(x=>x.seq===c.seq);
  if(i<0){calls.push(c);return c}
  // Keep whichever series is longer: ours grows with every mark the socket
  // delivers, the engine's spans everything from before this page was opened.
  if(calls[i].path.length>c.path.length)c.path=calls[i].path;
  c.flash=calls[i].flash;
  calls[i]=c;
  return c;
}
let dirty=false;                      // a verdict changed, so the card has to be redrawn
function applyMark(seq,m){
  const c=calls.find(x=>x.seq===seq);
  if(!c)return false;                 // a mark for a call this tier cannot see yet
  const was=badgeOf(c),wasDead=deadOf(c);
  if(m.nowMc!=null)c.nowMc=m.nowMc;
  if(m.peakMc!=null&&m.peakMc>c.peak)c.peak=m.peakMc;
  if(m.secondsTo2x!=null)c.twoIn=m.secondsTo2x;
  if(m.verdict)c.verdict=m.verdict;
  if(m.isDead!=null)c.isDead=m.isDead;
  if(m.deadAt&&!c.deadAt)c.deadAt=Date.parse(m.deadAt);
  if(Array.isArray(m.links)&&m.links.length)c.links=m.links;
  if(m.state)c.live=m.state!=="settled";
  c.path.push(c.nowMc);if(c.path.length>48)c.path.shift();
  // Flash is for reaching 2×. A call turning dead redraws without celebrating.
  if(was!=="win"&&vrd(c)==="win")c.flash=true;
  if(was!==badgeOf(c)||wasDead!==deadOf(c))dirty=true;
  return true;
}
function flashCards(){
  calls.filter(c=>c.flash).forEach(c=>{
    document.querySelectorAll(`.rec[data-id="${c.id}"]`).forEach(el=>{
      el.classList.add("flash");setTimeout(()=>el.classList.remove("flash"),1600)});
    c.flash=false});
}
/* A mark moves numbers, not the shape of the page — patch the cells in place so
   a settling call does not re-render the list out from under the reader. */
function paintMarks(){
  calls.forEach(c=>{
    const n=nx(c),v=vrd(c);
    document.querySelectorAll(`[data-now="${c.id}"]`).forEach(el=>{
      el.textContent=fmt(c.nowMc);el.className="v "+(n>=1?"up":"dn")});
    document.querySelectorAll(`[data-mx="${c.id}"]`).forEach(el=>
      el.textContent=(c.live||deadOf(c)?n:mult(c)).toFixed(2)+"×");
    // Both halves: which question the cell answers can change under a mark.
    const[k4,v4]=cell4(c);
    document.querySelectorAll(`[data-xk="${c.id}"]`).forEach(el=>el.textContent=k4);
    document.querySelectorAll(`[data-x="${c.id}"]`).forEach(el=>el.textContent=v4);
  });
  if(dirty||calls.some(c=>c.flash)){dirty=false;renderAll();flashCards()}
}

/* ── the socket ───────────────────────────────────────────────────────────
   "live" waits for the engine's own joined frame rather than for the upgrade,
   so a proxy answering in front of a dead engine cannot pass for a feed. */
let sock=null,wait=1000,gen=0;
/* Deliberately dropping the socket to rejoin on another tier cannot wait for
   the close event: a close is a round trip, and the reader has already changed
   what they are allowed to see. Bumping the generation orphans the old
   attempt so its late close cannot schedule a second socket behind this one. */
function reconnect(){
  gen++;
  const s=sock;sock=null;
  try{s?.close()}catch{}
  wait=1000;
  connectFeed();
}
function connectFeed(){
  if(DEMO||typeof WebSocket==="undefined")return;
  const my=++gen;
  let s;
  try{s=new WebSocket(SESSION.token?`${FEED}?token=${encodeURIComponent(SESSION.token)}`:FEED)}
  catch{return retryFeed()}
  sock=s;
  s.onmessage=e=>{
    let m;try{m=JSON.parse(e.data)}catch{return}
    // A socket that has just come up may have been down while calls were
    // fired, and it carries no history — so a connect is also a backfill.
    if(m.type==="joined"){wait=1000;CONN.delay=m.delaySeconds??null;setConn("live");renderFeed();pullLive();pullVerify();return}
    if(m.type==="call"&&m.call){upsert(m.call).flash=true;renderAll();flashCards();return}
    if(m.type==="mark"&&m.mark&&applyMark(m.seq,m.mark))paintMarks();
  };
  // Whichever of error and close lands first schedules exactly one retry.
  // Waiting on close alone loses the reconnect wherever a failed connection
  // only errors, and the page then sits on a socket that will never come back.
  let done=false;
  const gone=()=>{
    if(done||my!==gen)return;         // an orphaned attempt retries nothing
    done=true;
    if(sock===s)sock=null;
    try{s.close()}catch{}
    if(CONN.state==="live")setConn(CONN.read?"polling":"offline");
    retryFeed();
  };
  s.onerror=gone;
  s.onclose=gone;
}
function retryFeed(){setTimeout(connectFeed,wait);wait=Math.min(wait*2,30000)}

/* ── the poll ─────────────────────────────────────────────────────────────
   An empty register is an answer, not an outage. Treating the two the same is
   what let an engine that had stopped look exactly like a quiet market. */
let verifyState=null;
/* The integrity pages state facts about the chain. They now come from the
   engine, which recomputes it, rather than from whatever rows the browser has
   in hand. An unreachable engine leaves them blank rather than optimistic. */
async function pullVerify(){
  if(DEMO)return;
  try{
    const r=await fetch(API+"/verify",noStore());
    // 409 is a real answer: the chain is broken and says so.
    verifyState=(r.ok||r.status===409)?await r.json():null;
  }catch{ verifyState=null }
  renderVault();
}

const CHAIN_ID={SOL:"solana",BASE:"base",BSC:"bsc",ETH:"ethereum"};
/* The filter runs on the server. The same predicate lives in vis() above, but
   only as a guard on rows the socket pushes in between polls — the register is
   whatever the engine says matches, not whatever this page happens to hold. */
function registerQuery(offset){
  const p=new URLSearchParams();
  if(S.f==="win")p.set("verdict","win");
  else if(S.f==="dead")p.set("dead","1");
  else if(S.f==="live")p.set("live","1");
  if(S.chain&&CHAIN_ID[S.chain])p.set("chain",CHAIN_ID[S.chain]);
  if(S.q)p.set("q",S.q);
  if(S.minMc)p.set("min_mc",S.minMc);
  if(S.minVol)p.set("min_vol",S.minVol);
  if(S.hours)p.set("hours",S.hours);
  if(S.sort!=="recent")p.set("sort",S.sort);
  p.set("limit",PAGE);
  if(offset)p.set("offset",offset);
  return p.toString();
}
async function loadRegister(append){
  const r=await fetch(`${API}/register?${registerQuery(append?calls.length:0)}`,noStore());
  if(!r.ok)throw new Error("register answered "+r.status);
  const rows=await r.json();
  if(!Array.isArray(rows))throw new Error("register did not answer with a list");
  total=Number(r.headers.get("x-total-count"))||rows.length;
  if(!append)calls.length=0;          // the engine decides what matches, not us
  rows.forEach(upsert);
  CONN.read=Date.now();
}

/* Filters live in the URL, so a view can be sent to someone and survives a
   reload. Nothing else on the page reads the query string. */
function pushUrl(push=false){
  if(DEMO||!history.replaceState)return;
  const p=new URLSearchParams();
  if(S.f!=="all")p.set("f",S.f);
  if(S.sort!=="recent")p.set("sort",S.sort);
  if(S.chain)p.set("chain",S.chain);
  if(S.q)p.set("q",S.q);
  if(S.minMc)p.set("mc",S.minMc);
  if(S.minVol)p.set("vol",S.minVol);
  if(S.hours)p.set("h",S.hours);
  const qs=p.toString();
  /* The filters belong to the Signals list and to nothing else, so they are
     only written while that is the view — otherwise leaving a filtered list
     carried "?f=win" onto Custody. Reading location.pathname here is what kept
     /call/9 in the address after leaving the call it belonged to. */
  const base=VIEW_PATH[VIEW]??"/";
  const url=VIEW==="reg"&&qs?base+"?"+qs:base;
  // A view change is a place the reader can go back from; a filter change is
  // not — otherwise four taps on the segmented control cost four taps of Back.
  if(push&&location.pathname+location.search!==url)history.pushState(null,"",url);
  else history.replaceState(null,"",url);
}
function syncControls(){
  [...document.getElementById("seg").children].forEach(b=>b.classList.toggle("on",b.dataset.f===S.f));
  document.getElementById("sortSel").value=S.sort;
  document.getElementById("mcSel").value=String(S.minMc);
  document.getElementById("volSel").value=String(S.minVol);
  document.getElementById("timeSel").value=String(S.hours);
  document.getElementById("q").value=S.q;
  const cp=document.getElementById("chipChain");
  cp.classList.toggle("hide",!S.chain);
  cp.textContent=S.chain?S.chain+"  ✕":"";
}
function readUrl(){
  const p=new URLSearchParams(location.search);
  if(![...p.keys()].length)return false;
  const pick=(k,ok,d)=>ok.includes(p.get(k))?p.get(k):d;
  S.f=pick("f",["all","live","win","dead"],"all");
  S.sort=pick("sort",["recent","peak","now"],"recent");
  S.chain=CHAIN_ID[p.get("chain")]?p.get("chain"):null;
  S.q=(p.get("q")??"").slice(0,64);
  S.minMc=Math.max(0,+p.get("mc")||0);
  S.minVol=Math.max(0,+p.get("vol")||0);
  S.hours=Math.max(0,+p.get("h")||0);
  syncControls();
  return true;
}
/* One path for every control: show what we hold immediately, then ask the
   engine. Without the first half a filter feels broken on a slow connection. */
function applyFilters(){
  pushUrl();
  renderFeed();
  if(!DEMO)pullLive();
}

async function pullLive(){
  if(DEMO)return;
  try{
    await loadRegister(false);
    // Statistics are a separate question from the register. An engine that
    // serves rows but not this route is behind, not down, and the figures go
    // blank on their own without taking the feed with them.
    const readStats=async q=>{
      try{const r=await fetch(API+"/stats"+q,noStore());return r.ok?await r.json():null}
      catch{return null}
    };
    [statsAll,stats7,anaCallers,anaChains]=await Promise.all([
      readStats("?days=all"),readStats(""),
      // The windows the two panels are labelled with, so the headings are true.
      readJson("/analytics/callers?days=30"),readJson("/analytics/chains?days=7")]);
    // The same seven days the figures above it cover, under the default rule.
    sim7=await readJson("/analytics/simulate?days=7&exit=2x&size=100");
    setConn(sock&&sock.readyState===1&&CONN.state==="live"?"live":"polling");
    renderAll();
  }catch(e){
    // Rows already read stay on the page — they are the record, and the header
    // says how stale they are. The statistics do not: those we no longer know.
    statsAll=stats7=anaCallers=anaChains=sim7=null;
    // A live socket outranks a failed poll: the feed is demonstrably up, so the
    // header keeps saying live and only the figures go blank.
    if(!(sock&&sock.readyState===1&&CONN.state==="live"))setConn("offline");
    renderAll();
  }
}

// A link carrying filters, a call, or a view opens where it belongs.
const deepCall=callFromUrl();
const bootView=PATH_VIEW[location.pathname.replace(/\/+$/,"")||"/"];
if(readUrl()||deepCall)go("reg",null,false);
else if(bootView&&bootView!=="home")go(bootView,null,false);

/* Back and forward move between views rather than leaving the site. Without
   this the first Back press on /signals left nekara.xyz entirely, which reads
   as the site having no history at all. */
addEventListener("popstate",()=>{
  const seq=callFromUrl();
  if(seq!=null){openCallBySeq(seq);return}
  readUrl();
  go(PATH_VIEW[location.pathname.replace(/\/+$/,"")||"/"]??"home",null,false);
});
/* The brand links, in one place. They pointed at "#" on a live site, which is
   worse than no icon: a reader who clicks one learns the page is unfinished.
   Fill these in and they work; leave one empty and it does not appear. */
const SOCIAL={x:"https://x.com/Nekaraxyz",tg:"https://t.me/nekaraxyz"};
document.querySelectorAll("[data-social]").forEach(a=>{
  const url=SOCIAL[a.dataset.social];
  if(url){a.href=url;a.target="_blank";a.rel="noopener noreferrer"}
  else a.classList.add("hide");
});

/* ── sign in ─────────────────────────────────────────────────────────────── */
function paintSession(){
  const b=document.getElementById("connectBtn");
  if(!b)return;
  b.textContent=SESSION.token?`${TIER_NAME[SESSION.tier]} · ${SHORT(SESSION.address)}`:"Connect";
  b.title=SESSION.token?"Signed in. Click to sign out.":"Sign in with the wallet holding your key";
  b.classList.toggle("on",!!SESSION.token);
}
function saveSession(){
  try{
    if(SESSION.token)sessionStorage.setItem("nekara.session",JSON.stringify(SESSION));
    else sessionStorage.removeItem("nekara.session");
  }catch{}
}
function signOut(){
  SESSION.token=null;SESSION.tier=0;SESSION.address=null;
  saveSession();paintSession();
  // Drop the socket so it rejoins as public: keeping a Tier III room open after
  // signing out would hand the reader latency they no longer hold.
  reconnect();
  pullLive();
}
function signInError(msg){
  const b=document.getElementById("connectBtn");
  if(!b)return;
  b.textContent=msg;
  setTimeout(paintSession,3200);
}
async function connect(){
  const eth=await chooseWallet();
  if(!eth)return signInError(WALLETS.size?"No wallet chosen":"No wallet found");
  try{
    const [address]=await eth.request({method:"eth_requestAccounts"});
    if(!address)return signInError("No account");
    const n=await (await fetch(AUTH+"/auth/nonce",noStore())).json();
    // The domain has to be the engine's own, not this page's guess at it: a
    // message signed for the wrong domain is refused, and should be.
    const message=[
      `${n.domain} wants you to sign in with your Ethereum account:`,
      address,
      "",
      "Sign in to read the register at the latency your key holds.",
      "This proves the address holds a key. It authorises no transaction and moves no funds.",
      "",
      `URI: ${location.origin}`,
      "Version: 1",
      `Chain ID: ${MINT.id?.chainId??4663}`,
      `Nonce: ${n.nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");
    const signature=await eth.request({method:"personal_sign",params:[message,address]});
    const r=await fetch(AUTH+"/auth/verify",{method:"POST",signal:AbortSignal.timeout(10000),
      headers:{"content-type":"application/json"},body:JSON.stringify({message,signature})});
    const body=await r.json().catch(()=>({}));
    if(!r.ok)return signInError(body.error??"Refused");
    SESSION.token=body.token;SESSION.tier=body.tier??0;SESSION.address=body.address??address;
    saveSession();paintSession();
    reconnect();          // rejoin on the room this token allows
    pullLive();
  }catch(e){
    // A refused signature is the reader saying no, not an error to shout about.
    signInError(/denied|reject/i.test(String(e?.message))?"Cancelled":"Sign-in failed");
  }
}
/* The tier is re-read from the chain on every refresh, which is the only bound
   on a session that outlives the key it was bought with. */
async function refreshSession(){
  if(!SESSION.token)return;
  try{
    const r=await fetch(AUTH+"/auth/refresh",noStore());
    if(!r.ok)return signOut();
    const s=await r.json();
    const moved=s.tier!==SESSION.tier;
    SESSION.token=s.token;SESSION.tier=s.tier;SESSION.address=s.address;
    saveSession();paintSession();
    if(moved){reconnect();pullLive();}
  }catch{}
}
document.getElementById("connectBtn")?.addEventListener("click",()=>
  SESSION.token?signOut():connect());
if(!DEMO){
  try{
    const kept=JSON.parse(sessionStorage.getItem("nekara.session")||"null");
    if(kept?.token){Object.assign(SESSION,kept);}
  }catch{}
  paintSession();
  setInterval(refreshSession,240_000);   // the token lives 300s
}

paintConn();
renderAll();
drawKey(preview);renderMarquee();syncMint();renderColl(true);reveal();
if(!DEMO){
  connectFeed();
  loadMintState(); setInterval(loadMintState,30000);
  pullLive();  setInterval(pullLive,20000);
  pullTriage();setInterval(pullTriage,20000);
  pullVerify();setInterval(pullVerify,60000);
  if(deepCall)openCallBySeq(deepCall);
  setInterval(paintConn,1000);
}

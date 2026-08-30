/* Captures the banner source imagery from the site itself.
   Served over file:// so app.js takes its DEMO branch and the register has
   rows in it — a banner of the empty production register would show nothing.
   Needs playwright and a chromium at CHROME (see brand/README.md). */
const {chromium}=require('playwright');
const fs=require('fs'),os=require('os'),path=require('path');
const CHROME=process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SITE=path.join(__dirname,'..','site');
const OUT=path.join(__dirname,'shots');

// site/index.html links its assets from the web root, which file:// cannot resolve
const stage=()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'nekara-shots-'));
  fs.cpSync(SITE,d,{recursive:true});
  const i=path.join(d,'index.html');
  fs.writeFileSync(i,fs.readFileSync(i,'utf8').replace(/"\/assets\//g,'"assets/'));
  return d;
};

(async()=>{
  const dir=stage();
  const b=await chromium.launch({executablePath:CHROME});
  const p=await b.newPage({viewport:{width:1180,height:1000},deviceScaleFactor:3});
  await p.goto('file://'+path.join(dir,'index.html'));
  await p.waitForTimeout(2500);
  if(!await p.evaluate(()=>document.fonts.check('600 40px "Inter Tight"')))
    throw new Error('Inter Tight tidak termuat — banner akan salah tipografinya');

  const settle=()=>p.evaluate(()=>{
    document.querySelectorAll(".cols").forEach(c=>c.style.alignItems="start");
    document.querySelectorAll(".rec,.box").forEach(e=>{
      e.style.animation="none";e.style.opacity=1;e.style.transform="none"});
  });
  const shot=async(sel,name,i=0)=>{
    const e=(await p.$(sel))[i];
    await e.scrollIntoViewIfNeeded();await p.waitForTimeout(250);
    await e.screenshot({path:path.join(OUT,name)});console.log(name);
  };

  await p.evaluate(()=>go("reg"));await p.waitForTimeout(1500);await settle();
  await shot('#v-reg .rec','c-win.png');
  await p.click('#seg button[data-f="dead"]');await p.waitForTimeout(1200);await settle();
  await shot('#v-reg .rec','c-dead.png');

  await p.evaluate(()=>go("ops"));await p.waitForTimeout(1500);await settle();
  await shot('#v-ops .box','t-counts.png',1);
  await shot('#v-ops .box','t-rejects.png',2);
  await shot('#v-ops .box','t-gates.png',3);

  await p.evaluate(()=>go("vault"));await p.waitForTimeout(1500);await settle();
  await shot('#v-vault .box','v-head.png');
  await p.click('[data-tamper="delete"]');await p.waitForTimeout(900);await settle();
  await shot('#v-vault .box','v-broken.png',1);

  await p.evaluate(()=>go("quant"));await p.waitForTimeout(1700);await settle();
  await shot('#v-quant .box','h-sim.png',1);

  // the full page sits behind a headline in the intro banner, so 2x is enough
  const full=await b.newPage({viewport:{width:1440,height:920},deviceScaleFactor:2});
  await full.goto('file://'+path.join(dir,'index.html'));
  await full.waitForTimeout(2500);
  await full.evaluate(()=>go("reg"));await full.waitForTimeout(1500);
  await full.screenshot({path:path.join(OUT,'pv-reg.png')});console.log('pv-reg.png');

  await b.close();
  fs.rmSync(dir,{recursive:true,force:true});
})();

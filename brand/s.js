const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport:{width:1100,height:820}, deviceScaleFactor:1.3 });
  await p.goto('file:///home/user/mintnft/site/index.html'); await p.waitForTimeout(2400);
  await p.screenshot({ path:'c1.png' });
  await b.close(); console.log('ok');
})();

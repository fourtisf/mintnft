/* banners/*.html -> banners/*.png at 2x.
   Referenced by README since the launch set was made and then missing from the
   tree, which is why those PNGs could not be regenerated after the artwork
   changed. Needs playwright and a chromium at CHROME (see brand/README.md). */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DIR = path.join(__dirname, 'banners');
const only = process.argv.slice(2);

/* The size lives in the page's own body rule, so nothing here restates it —
   two copies of a banner's dimensions is one banner rendered at the wrong one. */
const sizeOf = html => {
  const m = /body\{width:(\d+)px;height:(\d+)px\}/.exec(html);
  return m ? { width: +m[1], height: +m[2] } : null;
};

(async () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'))
    .filter(f => !only.length || only.some(o => f.includes(o)));
  if (!files.length) return console.error('tidak ada .html yang cocok di brand/banners');

  const b = await chromium.launch({ executablePath: CHROME });
  let done = 0, skipped = [];
  for (const f of files) {
    const html = fs.readFileSync(path.join(DIR, f), 'utf8');
    const size = sizeOf(html);
    // A page with no body size would render at the viewport default and look
    // fine at a glance while being the wrong asset. Say so instead.
    if (!size) { skipped.push(f); continue; }

    const p = await b.newPage({ viewport: size, deviceScaleFactor: 2 });
    await p.goto('file://' + path.join(DIR, f));
    // Webfonts arrive after load, and a banner rendered in the fallback face is
    // a banner in the wrong typeface — which is exactly what CLAUDE.md forbids.
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    const out = f.replace(/\.html$/, '.png');
    await p.screenshot({ path: path.join(DIR, out) });
    await p.close();
    console.log(`  ${out}  ${size.width}x${size.height} @2x`);
    done++;
  }
  await b.close();

  console.log(`\n${done} png ditulis`);
  if (skipped.length) {
    console.error(`${skipped.length} dilewati — tidak menyebutkan ukurannya: ${skipped.join(', ')}`);
    process.exitCode = 1;
  }
})();

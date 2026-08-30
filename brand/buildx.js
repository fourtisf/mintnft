const fs = require('fs');
const MARK = fs.readFileSync('nekara-mark.svg', 'utf8').replace(/\n\s*/g, '');
const ticks = Array.from({length:120},(_,i)=>
  `<rect x="${i*12.5}" y="${i%5===0?0:4}" width="1" height="${i%5===0?12:8}"/>`).join('');

// the banner, rebuilt in the page so it stays crisp at any width
const banner = `<div class="banner">
  <div class="glow"></div><div class="vign"></div>
  <div class="bmark">${MARK}</div>
  <div class="bcopy"><h2 class="word">Nekara</h2><div class="rule"></div>
    <p class="tag">Catatan yang tidak bisa dihapus</p></div>
  <svg class="base" viewBox="0 0 1500 12" fill="currentColor" preserveAspectRatio="none">${ticks}</svg>
</div>`;

const html = `<title>Nekara on X</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@200;300;400&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--navy:#070B13;--panel:#0C1424;--line:#1B2740;--blue:#6C9BE0;--deepblue:#2C4E86;
  --pale:#E6EDF9;--mute:#7385A0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--navy);color:var(--pale);font-family:"IBM Plex Sans",system-ui,sans-serif;
  font-size:16px;line-height:1.62;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:0 28px}
header{padding:72px 0 10px}
section{padding:50px 0;border-top:1px solid var(--line)}
h1{font-family:Spectral,Georgia,serif;font-weight:300;font-size:38px;letter-spacing:-.015em;margin-bottom:14px}
h3{font-family:Spectral,Georgia,serif;font-weight:400;font-size:22px;margin-bottom:10px}
p{max-width:62ch;margin-bottom:12px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--mute);margin-bottom:10px}
.note{color:var(--mute);font-size:14.5px}
.word{font-family:Spectral,Georgia,serif;font-weight:300;text-transform:uppercase;
  letter-spacing:.42em;color:var(--pale);line-height:1;text-indent:.42em}
.tag{font-family:"IBM Plex Mono",monospace;letter-spacing:.24em;text-transform:uppercase;color:var(--mute)}

/* banner, drawn at 3:1 and scaled by container width */
.banner{position:relative;width:100%;aspect-ratio:3/1;overflow:hidden;background:var(--navy);
  border-radius:3px;container-type:inline-size}
.banner .glow{position:absolute;inset:0;
  background:radial-gradient(45% 92% at 78% 48%, #17305C 0%, rgba(23,48,92,.34) 42%, transparent 72%)}
.banner .vign{position:absolute;inset:0;background:linear-gradient(90deg,#070B13 6%,rgba(7,11,19,0) 46%)}
.bmark{position:absolute;right:6.9%;top:50%;transform:translateY(-50%);width:25.1%;color:var(--blue)}
.bmark svg{display:block;width:100%}
.bcopy{position:absolute;left:24.8%;top:50%;transform:translateY(-50%);
  display:flex;flex-direction:column;gap:1.73cqw;align-items:flex-start}
.bcopy .word{font-size:4.13cqw}
.bcopy .rule{width:10cqw;height:1px;background:linear-gradient(90deg,var(--blue),rgba(108,155,224,0))}
.bcopy .tag{font-size:.94cqw}
.base{position:absolute;left:0;right:0;bottom:5.2%;height:2.4%;color:var(--blue);opacity:.2}

/* profile mock */
.mock{background:var(--panel);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.mock .id{padding:0 22px 22px;position:relative}
.pfp{width:118px;height:118px;border-radius:50%;overflow:hidden;border:4px solid var(--panel);
  margin-top:-60px;position:relative;background:radial-gradient(70% 70% at 50% 42%,#142544 0%,#070B13 74%);
  display:flex;align-items:center;justify-content:center}
.pfp .m{width:68%;color:var(--blue)}.pfp svg{display:block;width:100%}
.name{font-family:Spectral,Georgia,serif;font-size:23px;font-weight:400;margin-top:12px}
.handle{color:var(--mute);font-size:14.5px}
.bio{margin-top:10px;font-size:15px;max-width:52ch}
.meta{margin-top:10px;color:var(--mute);font-size:13.5px;font-family:"IBM Plex Mono",monospace;letter-spacing:.04em}

/* avatar sizes */
.sizes{display:flex;align-items:flex-end;gap:34px;flex-wrap:wrap}
.sizes figure{display:flex;flex-direction:column;align-items:center;gap:12px}
.av{border-radius:50%;overflow:hidden;background:radial-gradient(70% 70% at 50% 42%,#142544 0%,#070B13 74%);
  display:flex;align-items:center;justify-content:center}
.av .m{width:68%;color:var(--blue)}.av svg{display:block;width:100%}
figcaption{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.16em;color:var(--mute)}

.pal{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.chip{border:1px solid var(--line);border-radius:3px;overflow:hidden}
.chip .fill{height:70px}
.chip .meta2{padding:11px 13px;font-family:"IBM Plex Mono",monospace;font-size:11px;line-height:1.7}
.chip b{display:block;font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px}
.chip span{color:var(--mute)}
dl{display:grid;grid-template-columns:auto 1fr;gap:9px 18px;font-family:"IBM Plex Mono",monospace;font-size:12.5px}
dt{color:var(--blue);white-space:nowrap}dd{color:var(--mute)}
</style>
<div class="wrap">
<header>
  <p class="eyebrow">Aset X</p>
  <h1>Banner dan foto profil</h1>
  <p class="note">Emblem yang sama, biru. Geometri marka tidak berubah sedikit pun — hanya warnanya, karena marka mewarisi <code>currentColor</code>.</p>
</header>

<section>
  <p class="eyebrow">Di tempatnya</p>
  <h3>Bagaimana X menumpuknya</h3>
  <p class="note" style="margin-bottom:22px">Foto profil menimpa kiri bawah banner. Karena itu sepertiga kiri banner sengaja dikosongkan — wordmark baru mulai setelah zona aman.</p>
  <div class="mock">
    ${banner}
    <div class="id">
      <div class="pfp"><div class="m">${MARK}</div></div>
      <p class="name">Nekara</p>
      <p class="handle">@nekara</p>
      <p class="bio">Register publik untuk panggilan trading otomatis. Setiap sinyal terbit dengan syarat yang memicunya. Yang gagal tidak pernah dihapus.</p>
      <p class="meta">Dijangkar on-chain · CSV publik · Bergabung 2026</p>
    </div>
  </div>
</section>

<section>
  <p class="eyebrow">Banner</p>
  <h3>1500 × 500</h3>
  ${banner}
  <div style="margin-top:22px"><dl>
    <dt>Ukuran</dt><dd>1500 × 500 px, rasio 3:1 — ukuran resmi X</dd>
    <dt>Zona aman</dt><dd>kiri 370 px dikosongkan untuk foto profil</dd>
    <dt>Berkas</dt><dd>dikirim sebagai PNG 3000 × 1000 (2×) agar tajam di layar retina</dd>
    <dt>Garis dasar</dt><dd>bezel marka, digelar mendatar — 120 tik, tiap kelima lebih panjang</dd>
  </dl></div>
</section>

<section>
  <p class="eyebrow">Foto profil</p>
  <h3>Dipotong bulat oleh X</h3>
  <p class="note" style="margin-bottom:24px">Marka mengisi 68% lebar bingkai. Lebih kecil dari itu ia mengambang; lebih besar, cincinnya tersentuh tepi potongan.</p>
  <div class="sizes">
    <figure><div class="av" style="width:132px;height:132px"><div class="m">${MARK}</div></div><figcaption>132 · PROFIL</figcaption></figure>
    <figure><div class="av" style="width:64px;height:64px"><div class="m">${MARK}</div></div><figcaption>64 · TIMELINE</figcaption></figure>
    <figure><div class="av" style="width:40px;height:40px"><div class="m">${MARK}</div></div><figcaption>40 · BALASAN</figcaption></figure>
    <figure><div class="av" style="width:24px;height:24px"><div class="m">${MARK}</div></div><figcaption>24 · NOTIF</figcaption></figure>
  </div>
</section>

<section style="padding-bottom:84px">
  <p class="eyebrow">Warna</p>
  <h3>Biru, bukan biru SaaS</h3>
  <p class="note" style="margin-bottom:22px">Birunya diturunkan saturasinya dan dipasang di atas biru-hitam, bukan biru terang di atas putih. Itu bedanya terbaca mahal dan terbaca dasbor.</p>
  <div class="pal">
    <div class="chip"><div class="fill" style="background:#070B13"></div><div class="meta2"><b>Navy</b><span>#070B13 · dasar</span></div></div>
    <div class="chip"><div class="fill" style="background:#17305C"></div><div class="meta2"><b>Kilau</b><span>#17305C · gradien</span></div></div>
    <div class="chip"><div class="fill" style="background:#6C9BE0"></div><div class="meta2"><b>Biru marka</b><span>#6C9BE0 · di atas gelap</span></div></div>
    <div class="chip"><div class="fill" style="background:#2C4E86"></div><div class="meta2"><b>Biru dalam</b><span>#2C4E86 · di atas terang</span></div></div>
    <div class="chip"><div class="fill" style="background:#E6EDF9"></div><div class="meta2"><b>Pucat</b><span>#E6EDF9 · teks</span></div></div>
  </div>
  <p class="note" style="margin-top:24px">Palet perunggu di brand sheet sebelumnya tetap berlaku untuk cetak dan kartu NFT. Biru ini untuk kanal sosial. Marka yang sama melayani keduanya karena ia satu warna dan tanpa huruf.</p>
</section>
</div>`;
fs.writeFileSync('xassets.html', html);
console.log('xassets.html', html.length);

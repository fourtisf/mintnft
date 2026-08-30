const fs = require('fs');
const S = k => fs.readFileSync(`dir-${k}.svg`, 'utf8').replace(/\n\s*/g, '');

const dirs = [
  ['emblem','Emblem','Tympanum nekara — dua belas raya di dalam cincin tertutup.','lolos',
   'Punya identitas, tahan sampai 16px, dan tidak terikat nama.'],
  ['ledger','Ledger','Entri bertumpuk, satu lebih pendek dan tetap tinggal.','gugur',
   'Terbaca sebagai ikon rata-kiri di toolbar. Sudah jadi ikon UI, bukan logo.'],
  ['chain','Chain','Tiga mata rantai — setiap hash memikul yang sebelumnya.','gugur',
   'Terbaca <strong>Audi</strong> dalam sepersekian detik. Tabrakan fatal, tidak bisa diperbaiki.'],
  ['tally','Tally','Empat tegak, kelima dicoret menyilang.','lanjut',
   'Ide paling tajam, eksekusi awal masih mentah. Dirapikan di bawah.'],
  ['mono','Monogram','Huruf N di dalam cincin.','gugur',
   'Bersih tapi generik — N dalam lingkaran ada ribuan. Dan ia mengunci logo ke nama: nama ganti, logo mati.'],
  ['strata','Strata','Lapisan yang hanya pernah bertambah.','gugur',
   'Elegan, tapi jatuh jadi bullseye Target. Di 15px tinggal satu titik.'],
];

const tallies = [
  ['t1','T1 · Bebas','Ujung membulat, berdiri sendiri. Paling ringan, tapi terbaca agak santai.'],
  ['t2','T2 · Cincin','Ditahan cincin. Satu-satunya yang langsung jadi avatar bulat.'],
  ['t3','T3 · Pahat','Ujung siku, coretan lebih berat. Paling berkarakter, paling permanen.'],
];

const card = ([k, name, desc, verdict, note]) => `
  <article class="card">
    <div class="art"><div class="mark">${S(k)}</div>
      <div class="mini"><div>${S(k)}</div><div>${S(k)}</div><div>${S(k)}</div></div></div>
    <div class="body">
      <h3>${name} <span class="tag ${verdict}">${verdict}</span></h3>
      <p class="desc">${desc}</p>
      <p class="note">${note}</p>
    </div>
  </article>`;

const tcard = ([k, name, note]) => `
  <article class="card">
    <div class="art"><div class="mark">${S(k)}</div>
      <div class="mini"><div>${S(k)}</div><div>${S(k)}</div><div>${S(k)}</div></div></div>
    <div class="body"><h3>${name}</h3><p class="note">${note}</p></div>
  </article>`;

const html = `<title>Arah Logo Nekara</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@200;300;400&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--ground:#E9E6E0;--panel:#FFFFFF;--fg:#1A1713;--mute:#6E675E;--line:#D2CDC4;
  --bronze:#8C6234;--ok:#4E6B61;--no:#8E4A3C}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#12100D;--panel:#191712;--fg:#E7E2D8;--mute:#948C80;--line:#2C2822;
  --bronze:#C08F52;--ok:#7A9A8E;--no:#C4796A}}
:root[data-theme="dark"]{--ground:#12100D;--panel:#191712;--fg:#E7E2D8;--mute:#948C80;
  --line:#2C2822;--bronze:#C08F52;--ok:#7A9A8E;--no:#C4796A}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--fg);font-family:"IBM Plex Sans",system-ui,sans-serif;
  font-size:16px;line-height:1.62;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 30px}
header{padding:78px 0 8px}
section{padding:54px 0;border-top:1px solid var(--line)}
h1{font-family:Spectral,Georgia,serif;font-weight:300;font-size:40px;margin:0 0 16px;
  letter-spacing:-.015em;text-wrap:balance}
h2{font-family:Spectral,Georgia,serif;font-weight:300;font-size:27px;margin:0 0 12px;text-wrap:balance}
h3{font-family:Spectral,Georgia,serif;font-weight:400;font-size:19px;margin:0 0 6px;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap}
p{margin:0 0 12px;max-width:64ch}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--mute);margin:0 0 10px}
.lede{color:var(--mute);font-size:17px;max-width:60ch}
.note{color:var(--mute);font-size:14.5px;margin:0}
.desc{font-size:15px;margin:0 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:3px;overflow:hidden;
  display:flex;flex-direction:column}
.art{padding:34px 28px 26px;display:flex;flex-direction:column;align-items:center;gap:22px;
  border-bottom:1px solid var(--line);color:var(--bronze)}
.art .mark{width:88px}
.mini{display:flex;align-items:center;gap:14px;color:var(--fg)}
.mini>div:nth-child(1){width:30px}.mini>div:nth-child(2){width:20px}.mini>div:nth-child(3){width:14px}
.body{padding:20px 24px 24px}
.tag{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;
  padding:3px 8px;border-radius:2px;border:1px solid currentColor}
.tag.lolos{color:var(--ok)}.tag.lanjut{color:var(--bronze)}.tag.gugur{color:var(--no)}
.duel{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.duel .card .art{padding:44px 28px 34px}.duel .card .art .mark{width:112px}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:9px 18px;
  font-family:"IBM Plex Mono",monospace;font-size:12.5px}
dt{color:var(--bronze);white-space:nowrap}dd{margin:0;color:var(--mute)}
@media (max-width:720px){.duel{grid-template-columns:1fr}h1{font-size:31px}}
</style>
<div class="wrap">
<header>
  <p class="eyebrow">Referensi arah</p>
  <h1>Enam arah logo, empat gugur</h1>
  <p class="lede">Semua marka di halaman ini saya gambar, bukan diambil dari web — sesi ini tidak punya akses jaringan keluar, jadi tidak ada tangkapan layar merek lain di sini. Setiap arah dirender dulu dan dinilai pada ukuran sebenarnya, karena logo yang bagus di 400px dan lumer di 16px bukan logo.</p>
</header>

<section>
  <p class="eyebrow">Arah</p>
  <h2>Yang berdiri dan yang tidak</h2>
  <p class="note" style="margin-bottom:26px">Baris kecil di bawah tiap marka adalah 30, 20, dan 14 piksel — ukuran favicon dan avatar.</p>
  <div class="grid">${dirs.map(card).join('')}</div>
</section>

<section>
  <p class="eyebrow">Perbaikan</p>
  <h2>Tally, dirapikan</h2>
  <p>Empat garis tegak dan yang kelima dicoret menyilang adalah cara mencatat paling tua yang ada, dan satu-satunya gestur yang tidak bisa ditarik kembali tanpa meninggalkan bekas coretan. Terbaca lintas budaya, termasuk di Indonesia, dan belum ada yang memakainya di crypto.</p>
  <div class="grid" style="margin-top:24px">${tallies.map(tcard).join('')}</div>
</section>

<section>
  <p class="eyebrow">Keputusan</p>
  <h2>Dua yang tersisa</h2>
  <p>Keduanya tahan di 16px, keduanya jadi avatar bulat, dan keduanya tidak memuat satu huruf pun — jadi nama boleh berubah tanpa menyentuh marka.</p>
  <div class="duel" style="margin-top:24px">
    <article class="card">
      <div class="art"><div class="mark">${S('emblem')}</div>
        <div class="mini"><div>${S('emblem')}</div><div>${S('emblem')}</div><div>${S('emblem')}</div></div></div>
      <div class="body"><h3>Emblem</h3>
        <dl><dt>Bicara soal</dt><dd>asal-usul dan umur panjang</dd>
        <dt>Kuat di</dt><dd>ukuran besar, cetak, kartu NFT</dd>
        <dt>Lemah di</dt><dd>butuh ruang; ramai di bawah 20px</dd>
        <dt>Risiko</dt><dd>bisa terbaca matahari generik oleh yang tak tahu nekara</dd></dl></div>
    </article>
    <article class="card">
      <div class="art"><div class="mark">${S('t2')}</div>
        <div class="mini"><div>${S('t2')}</div><div>${S('t2')}</div><div>${S('t2')}</div></div></div>
      <div class="body"><h3>Tally</h3>
        <dl><dt>Bicara soal</dt><dd>hitungan yang tidak bisa dibatalkan</dd>
        <dt>Kuat di</dt><dd>langsung dimengerti tanpa penjelasan</dd>
        <dt>Lemah di</dt><dd>lebih dingin, tanpa akar Nusantara</dd>
        <dt>Risiko</dt><dd>coretan bisa terbaca &ldquo;dicoret&rdquo; alias dihapus</dd></dl></div>
    </article>
  </div>
</section>

<section style="padding-bottom:88px">
  <p class="eyebrow">Cara memilih</p>
  <h2>Satu pertanyaan saja</h2>
  <p><strong>Emblem</strong> kalau yang dijual adalah <em>janji</em> — catatan ini akan bertahan lebih lama dari kita semua. <strong>Tally</strong> kalau yang dijual adalah <em>mekanisme</em> — setiap panggilan dihitung, termasuk yang gagal.</p>
  <p class="note">Nama Nekara sendiri belum final dan belum diperiksa merek dagangnya. Kedua marka sengaja dibuat tanpa huruf, jadi keputusan nama dan keputusan logo tidak saling mengunci.</p>
</section>
</div>`;
fs.writeFileSync('references.html', html);
console.log('references.html', html.length, 'bytes');

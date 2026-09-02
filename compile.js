// Every contract, with its deployed size against the 24KB limit.
const fs = require('fs');
const { compile, artifact } = require('./contracts/build.js');

// .sol only: contracts/ also holds the build helper, the allowlist generator
// and the test suite, and handing those to solc is a parser error, not a
// compile failure — which reads like the contracts are broken when they are not.
const files = fs.readdirSync('contracts').filter(f => f.endsWith('.sol'));

let out;
try { out = compile(files); }
catch (e) { console.log(e.message); process.exit(1); }

(out.errors || []).filter(e => e.severity !== 'error').slice(0, 4)
  .forEach(w => console.log('warn:', w.message.split('\n')[0]));

console.log('\n=== KOMPILASI BERHASIL ===');
let over = 0;
for (const f of files) {
  for (const name of Object.keys(out.contracts['contracts/' + f] || {})) {
    const sz = artifact(out, f, name).deployedSize;
    if (!sz) continue;
    if (sz > 24576) over++;
    console.log(`${name.padEnd(16)} ${(sz / 1024).toFixed(1)} KB  ${sz > 24576 ? '!! LEWAT BATAS 24KB' : 'ok (batas 24KB)'}`);
  }
}
process.exit(over ? 1 : 0);

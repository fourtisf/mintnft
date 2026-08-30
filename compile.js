const solc=require('solc'),fs=require('fs'),path=require('path');
const sources={};
for(const f of fs.readdirSync('contracts')) sources['contracts/'+f]={content:fs.readFileSync('contracts/'+f,'utf8')};
function findImports(p){
  const tries=[path.join('node_modules',p), p];
  for(const t of tries) if(fs.existsSync(t)) return {contents:fs.readFileSync(t,'utf8')};
  return {error:'not found: '+p};
}
const out=JSON.parse(solc.compile(JSON.stringify({
  language:'Solidity', sources,
  settings:{optimizer:{enabled:true,runs:200},viaIR:true,outputSelection:{'*':{'*':['evm.bytecode.object']}}}
}),{import:findImports}));
const errs=(out.errors||[]).filter(e=>e.severity==='error');
(out.errors||[]).filter(e=>e.severity!=='error').slice(0,4).forEach(w=>console.log('warn:',w.message.split('\n')[0]));
if(errs.length){errs.forEach(e=>console.log('\nERROR:',e.formattedMessage));process.exit(1);}
console.log('\n=== KOMPILASI BERHASIL ===');
for(const f in out.contracts) for(const c in out.contracts[f]){
  const sz=out.contracts[f][c].evm.bytecode.object.length/2;
  if(sz>0) console.log(`${c.padEnd(16)} ${(sz/1024).toFixed(1)} KB  ${sz>24576?'!! LEWAT BATAS 24KB':'ok (batas 24KB)'}`);
}

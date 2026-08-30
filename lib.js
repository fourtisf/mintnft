const solc=require('solc'),fs=require('fs'),path=require('path');
function findImports(p){const t=path.join('node_modules',p);
  return fs.existsSync(t)?{contents:fs.readFileSync(t,'utf8')}:{error:'nf '+p}}
function build(runs=200){
  const sources={'c.sol':{content:fs.readFileSync('contracts/ProofRenderer.sol','utf8')}};
  const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,
    settings:{optimizer:{enabled:true,runs},viaIR:true,
      outputSelection:{'*':{'*':['evm.bytecode.object']}}}}),{import:findImports}));
  const errs=(out.errors||[]).filter(e=>e.severity==='error');
  if(errs.length){errs.forEach(e=>console.log(e.formattedMessage));process.exit(1)}
  return out.contracts['c.sol'].ProofRenderer.evm.bytecode.object;
}
module.exports={build};

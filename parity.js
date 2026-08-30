const solc=require('solc'),fs=require('fs'),path=require('path');
const {VM}=require('@ethereumjs/vm');const {Common,Chain,Hardfork}=require('@ethereumjs/common');
const {Address,keccak256}=require('ethereumjs-util');
const {JSDOM,VirtualConsole}=require('jsdom');
const outDir=path.join(__dirname,'out');fs.mkdirSync(outDir,{recursive:true});
function findImports(p){const t=path.join(__dirname,'node_modules',p);
  return fs.existsSync(t)?{contents:fs.readFileSync(t,'utf8')}:{error:'nf '+p}}
const sources={};
for(const f of ['ProofParts.sol','ProofRenderer.sol']) sources['contracts/'+f]={content:fs.readFileSync(path.join(__dirname,'contracts',f),'utf8')};
const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,
  settings:{optimizer:{enabled:true,runs:200},viaIR:true,outputSelection:{'*':{'*':['evm.bytecode.object']}}}}),{import:findImports}));
const P=out.contracts['contracts/ProofParts.sol'].ProofParts.evm.bytecode.object;
const R=out.contracts['contracts/ProofRenderer.sol'].ProofRenderer.evm.bytecode.object;
const seed=Buffer.from('7f'.repeat(32),'hex');

(async()=>{
  const vm=await VM.create({common:new Common({chain:Chain.Mainnet,hardfork:Hardfork.Shanghai})});
  const from=Address.fromString('0x'+'11'.repeat(20));
  const dp=await vm.evm.runCall({caller:from,to:undefined,gasLimit:BigInt(60e6),data:Buffer.from(P,'hex')});
  const partsAddr=dp.createdAddress;
  const ctor=Buffer.concat([Buffer.from(R,'hex'),
    Buffer.from(partsAddr.toString().slice(2).padStart(64,'0'),'hex')]);
  const dr=await vm.evm.runCall({caller:from,to:undefined,gasLimit:BigInt(60e6),data:ctor});
  if(dr.execResult.exceptionError) return console.log('DEPLOY GAGAL',dr.execResult.exceptionError);
  const addr=dr.createdAddress;
  const selT=keccak256(Buffer.from('traits(uint256,bytes32)')).slice(0,4);
  const selU=keccak256(Buffer.from('tokenURI(uint256,bytes32)')).slice(0,4);
  const call=(sel,id,gas=900e6)=>vm.evm.runCall({caller:from,to:addr,gasLimit:BigInt(gas),
    data:Buffer.concat([sel,Buffer.from(BigInt(id).toString(16).padStart(64,'0'),'hex'),seed])});

  // trait on-chain untuk seluruh 666
  const chain=[];
  for(let id=1;id<=666;id++){
    const r=await call(selT,id);
    if(r.execResult.exceptionError){console.log('traits gagal di',id);return}
    const rv=r.execResult.returnValue,w=[];
    for(let i=0;i<10;i++) w.push(Number('0x'+rv.slice(i*32,(i+1)*32).toString('hex')));
    chain.push({id,tier:w[0],hood:w[1],eyes:w[2],mask:w[3],fit:w[4],pal:w[5],bg:w[6],aura:w[7],tone:w[8],ph:w[9]});
  }

  // trait di browser
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'prototype','proof.html'),'utf8'),
   {runScripts:'dangerously',virtualConsole:new VirtualConsole(),url:'http://localhost/',beforeParse(w){
    w.IntersectionObserver=class{observe(){}unobserve(){}};w.matchMedia=()=>({matches:true});
    w.requestAnimationFrame=()=>{};w.scrollTo=()=>{};w.setInterval=()=>0;
    w.fetch=()=>Promise.reject(0);w.TextEncoder=TextEncoder;}});
  const W=dom.window;
  let ok=0,bad=[];
  for(const c of chain){
    const t=W.keyTraits(c.id);
    const same=t.tier===c.tier&&t.hoodI===c.hood&&t.eyesI===c.eyes&&t.maskI===c.mask&&
      t.fitI===c.fit&&t.palI===c.pal&&t.bgI===c.bg&&t.auraI===c.aura&&t.toneI===c.tone;
    if(same)ok++;else if(bad.length<3)bad.push([c,t]);
  }
  console.log(`UJI PARITAS  ${ok} / 666 token cocok persis`);
  bad.forEach(([c,t])=>console.log(`  #${c.id} chain[hood=${c.hood} eyes=${c.eyes} bg=${c.bg}] browser[hood=${t.hoodI} eyes=${t.eyesI} bg=${t.bgI}]`));

  // gas kasus terburuk
  console.log('\ngas tokenURI:');
  let worst=0,wid=0;
  for(const id of [1,42,137,264,412,666]){
    const r=await call(selU,id);
    if(r.execResult.exceptionError){console.log(`  #${id} GAGAL ${r.execResult.exceptionError}`);continue}
    const g=Number(r.execResult.executionGasUsed)/1e6;
    if(g>worst){worst=g;wid=id}
    const rv=r.execResult.returnValue,len=Number('0x'+rv.slice(32,64).toString('hex'));
    const j=JSON.parse(Buffer.from(rv.slice(64,64+len).toString().split(',')[1],'base64').toString());
    const svg=Buffer.from(j.image.split(',')[1],'base64').toString();
    const tr=j.attributes.map(a=>a.value).join('/');
    console.log(`  #${String(id).padStart(4,'0')}  ${g.toFixed(2)}M  SVG ${(svg.length/1024).toFixed(1)}KB  ${tr}`);
    if(id===264) fs.writeFileSync(path.join(outDir,'onchain-0264.svg'),svg);
  }
  console.log(`\n  terburuk ${worst.toFixed(2)}M (#${wid})  ${worst<10?'di bawah 10M':'LEWAT 10M'}`);
})();

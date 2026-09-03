const fs=require('fs'),path=require('path');
const {VM}=require('@ethereumjs/vm');const {Common,Chain,Hardfork}=require('@ethereumjs/common');
const {Address,keccak256}=require('ethereumjs-util');
const {JSDOM,VirtualConsole}=require('jsdom');
// One compiler config, shared with contracts/test-keys.js. viaIR in particular
// has to be identical in both harnesses or they are testing different bytecode.
const {compile,artifact}=require('./contracts/build.js');
const outDir=path.join(__dirname,'out');fs.mkdirSync(outDir,{recursive:true});
const out=compile(['ProofParts.sol','ProofRenderer.sol']);
const P=artifact(out,'ProofParts.sol','ProofParts').bytecode;
const R=artifact(out,'ProofRenderer.sol','ProofRenderer').bytecode;
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

  // The state every buyer sees for the whole season: the engraving is already
  // final, the tier has not been drawn. If a zero seed ever moved a single
  // trait, the key someone bought would change under them at reveal.
  const zero=Buffer.alloc(32);
  const callZ=id=>vm.evm.runCall({caller:from,to:addr,gasLimit:BigInt(900e6),
    data:Buffer.concat([selT,Buffer.from(BigInt(id).toString(16).padStart(64,'0'),'hex'),zero])});
  let same=0,drawn=0;
  for(const c of chain){
    const r=await callZ(c.id);
    const rv=r.execResult.returnValue,w=[];
    for(let i=0;i<10;i++) w.push(Number('0x'+rv.slice(i*32,(i+1)*32).toString('hex')));
    if(w[0]!==0)drawn++;
    if(w[1]===c.hood&&w[2]===c.eyes&&w[3]===c.mask&&w[4]===c.fit&&w[5]===c.pal&&
       w[6]===c.bg&&w[7]===c.aura&&w[8]===c.tone&&w[9]===c.ph)same++;
  }
  console.log(`SEBELUM REVEAL  ${same} / 666 ukiran sama persis, ${drawn} tier tertarik`);
  if(same!==666||drawn!==0){
    console.log('GAGAL: ukiran harus sudah final sebelum reveal, dan tier belum ditarik');
    process.exitCode=1;
  }
  bad.forEach(([c,t])=>console.log(`  #${c.id} chain[hood=${c.hood} eyes=${c.eyes} bg=${c.bg}] browser[hood=${t.hoodI} eyes=${t.eyesI} bg=${t.bgI}]`));

  // gas kasus terburuk
  /* The engraving itself, not just its traits. traits() matching proved the two
     sides agree on what a key is; it could never see that the drift on chain
     was six bright dots where the page drew a field of eighteen faint ones,
     because both called it Ashfall. This compares the drawing.

     Two things are normalised away, and they are the whole of what still
     differs: dur=, because the page desyncs each token's animation by its
     phase and threading that into every part signature is a wider change than
     it earns; and font-family=, because the page can name JetBrains Mono and a
     wallet cannot. Anything else that differs is the art differing. */
  const selS=keccak256(Buffer.from('svg(uint256,bytes32)')).slice(0,4);
  const norm=(x,uid)=>x
    .replace(new RegExp('(#|id=")(fl|ch|mo|nf|vg|kl|rl|rf|cn|gu|gv|gr|au|sl)'+uid,'g'),'$1$2')
    .replace(/ dur="[^"]*"/g,'').replace(/ font-family="[^"]*"/g,'')
    // ".8" and "0.8" are one number spelled two ways; both sides get the same
    // spelling so a real difference in the digits still shows
    .replace(/(^|[^0-9])0\./g,'$1.')
    .replace(/\s+/g,' ').replace(/> </g,'><').trim();
  let svgOk=0;const svgBad=[];
  for(let id=1;id<=666;id++){
    const r=await vm.evm.runCall({caller:from,to:addr,gasLimit:BigInt(900e6),
      data:Buffer.concat([selS,Buffer.from(BigInt(id).toString(16).padStart(64,'0'),'hex'),seed])});
    if(r.execResult.exceptionError){svgBad.push([id,'svg() gagal',String(r.execResult.exceptionError)]);continue}
    const rv=r.execResult.returnValue,len=Number('0x'+rv.slice(32,64).toString('hex'));
    const c=norm(rv.slice(64,64+len).toString('utf8')
      .replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,''),'k');
    const b=norm(W.keySVG(id,'full').body,'f'+id);
    if(c===b){svgOk++;continue}
    const A=c.split('><'),B=b.split('><');
    let k=0;while(k<A.length&&A[k]===B[k])k++;
    if(svgBad.length<4)svgBad.push([id,A[k]||'(habis)',B[k]||'(habis)']);
  }
  console.log(`UKIRAN         ${svgOk} / 666 SVG sama persis (dur dan font-family dikecualikan)`);
  if(svgOk!==666){
    console.log('GAGAL: kontrak menggambar kunci yang berbeda dari yang dilihat pembeli');
    svgBad.forEach(([id,a,b])=>console.log(`  #${id}\n    kontrak ${a.slice(0,150)}\n    situs   ${b.slice(0,150)}`));
    process.exitCode=1;
  }

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

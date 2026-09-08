import {checkBuffer} from './files.js';

export function shellArguments(text){
  let i=0,first='';
  if(text[0]==='"'){i++;while(i<text.length&&text[i]!=='"')first+=text[i++];if(text[i]==='"')i++;}
  else{while(i<text.length&&text.charCodeAt(i)>32)first+=text[i++];if(i<text.length)i++;}
  const args=[first],space=c=>c===' '||c==='\t';
  while(i<text.length){
    while(space(text[i]))i++;if(i===text.length)break;
    let value='',quotes=0;
    while(i<text.length&&(quotes||!space(text[i]))){
      let slashes=0;while(text[i]==='\\'){slashes++;i++;}
      if(text[i]==='"'){
        value+='\\'.repeat(Math.floor(slashes/2));
        if(slashes%2){value+='"';i++;continue;}
        while(text[i]==='"'){i++;quotes++;if(quotes===3){value+='"';quotes=0;}}
        if(quotes===2)quotes=0;
      }else{value+='\\'.repeat(slashes);if(!quotes&&space(text[i]))break;if(i<text.length)value+=text[i++];}
    }
    args.push(value);
  }
  return args;
}
export function installCommandLineParsing(api){
  const p=api.p,m=api.m;
  api.add('shell32.dll','CommandLineToArgvW',2,(src,countOut)=>{
    if(!src||!countOut)return api.fail(87);checkBuffer(m,countOut,4);
    const text=m.wstr(src),args=text?shellArguments(text):[p.exePath.replaceAll('/','\\')];
    const pointerBytes=(args.length+1)*4,size=pointerBytes+args.reduce((n,s)=>n+(s.length+1)*2,0);
    const block=p.heap.alloc(size,true);let next=block+pointerBytes;
    args.forEach((s,i)=>{m.w32(block+i*4,next);m.string(next,s,true);next+=(s.length+1)*2;});
    m.w32(countOut,args.length);return block;
  });
}

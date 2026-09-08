import {checkBuffer} from './files.js';

function parseInteger(text,signed){
  const match=/^ *(-?)([0-9]+)/.exec(text);
  if(!match||match[1]&&!signed)return [0,0];
  const negative=!!match[1],magnitude=BigInt(match[2]);
  const limit=signed?(negative?2147483648n:2147483647n):4294967295n;
  if(magnitude>limit)return [0,0];
  const value=Number(negative?-magnitude:magnitude)>>>0;
  return [value,+(match[0].length===text.length&&!(signed&&negative&&magnitude===2147483648n))];
}

export function installDialogIntegers(gui){
  const {api:a,p,m}=gui;
  a.add('user32.dll','GetDlgItemInt',4,(h,id,translated,signed)=>{
    if(translated){checkBuffer(m,translated,4);m.w32(translated,0);}
    const child=gui.dialogItem(h,id);if(!child)return 0;
    const buffer=p.heap.alloc(94,true);
    try {return gui.send(child,13,47,buffer,true,count=>{
      try {
        let text='';for(let i=0;i<46;i++){const unit=m.u16(buffer+i*2);if(!unit)break;text+=String.fromCharCode(unit);}
        const [value,success]=count?parseInteger(text,signed):[0,0];
        if(translated)m.w32(translated,success);return value;
      }finally{p.heap.free(buffer);}
    });}catch(error){p.heap.free(buffer);throw error;}
  });
}

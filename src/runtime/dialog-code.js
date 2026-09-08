import {RuntimeFault} from './errors.js';

const buttonCodes=[0x2020,0x2010,0x2000,0x2000,0x2040,0x2000,0x2000,0x100,0x2020,0x2040,0x2020,0x2000];
export function dialogCode(w){
  switch(w.className.toUpperCase()){
    case 'STATIC':return 0x100;
    case 'EDIT':return w.style&4?0x8d:0x89;
    case 'BUTTON':{
      const code=buttonCodes[w.style&15];
      if(code===undefined)throw new RuntimeFault('UNSUPPORTED_GUI','Dialog codes for extended button types are not implemented.');
      return code;
    }
    default:return 0;
  }
}

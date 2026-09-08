// DOM buttons: left=1, right=2, middle=4, back=8, forward=16.
export function mouseMessage(event){
 const buttons=event.buttons>>>0;
 let keys=(buttons&3)|((buttons&4)<<2)|((buttons&24)<<2)|(event.shiftKey?4:0)|(event.ctrlKey?8:0);
 if(event.event==='move')return {message:0x200,wParam:keys};
 if(event.event!=='down'&&event.event!=='up')return null;
 const button=event.button??0,base=[0x201,0x207,0x204,0x20b,0x20b][button];
 if(base===undefined)return null;
 if(button>=3)keys|=(button-2)<<16;
 return {message:base+(event.event==='up'?1:0),wParam:keys};
}

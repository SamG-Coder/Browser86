export function buttonCheck(gui,w,message,value){
  if(message===0xf0)return w.checkState||0;
  const type=w.style&15,maximum=[5,6].includes(type)?2:[2,3,4,9].includes(type)?1:0;
  const state=Math.min(value>>>0,maximum),oldStyle=w.style;
  if(type===4||type===9)w.style=(state?w.style|0x10000:w.style&~0x10000)>>>0;
  const changed=(w.checkState||0)!==state||oldStyle!==w.style;
  w.checkState=state;if(changed)gui.notify(w);return 0;
}

export function buttonClick(gui,w,queued=false){
  const type=w.style&15;
  if(type===3||type===6)buttonCheck(gui,w,0xf1,((w.checkState||0)+1)%(type===6?3:2));
  if(!w.parent)return 0;
  if(queued){gui.p.postMessage(w.parent,0x111,w.id&65535,w.hwnd);return 0;}
  return gui.send(w.parent,0x111,w.id&65535,w.hwnd,w.wide,()=>0);
}

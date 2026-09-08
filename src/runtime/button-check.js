export function buttonCheck(gui,w,message,value){
  if(message===0xf0)return w.checkState||0;
  const type=w.style&15,maximum=[5,6].includes(type)?2:[2,3,4,9].includes(type)?1:0;
  const state=Math.min(value>>>0,maximum),oldStyle=w.style;
  if(type===4||type===9)w.style=(state?w.style|0x10000:w.style&~0x10000)>>>0;
  const changed=(w.checkState||0)!==state||oldStyle!==w.style;
  w.checkState=state;if(changed)gui.notify(w);return 0;
}

export function buttonStyle(gui,w,value,redraw){
  w.style=((w.style&~15)|(value&15))>>>0;
  if(redraw&65535)gui.notify(w);
  return 0;
}

export function buttonClick(gui,w,queued=false){
  const type=w.style&15;
  if(type===3||type===6)buttonCheck(gui,w,0xf1,((w.checkState||0)+1)%(type===6?3:2));
  if(type===9){
    const siblings=[...gui.windows.values()].filter(c=>(c.style&0x40000000)&&c.parent===w.parent),index=siblings.indexOf(w);
    let start=index,end=index+1;
    while(start>0&&!(siblings[start].style&0x20000))start--;
    while(end<siblings.length&&!(siblings[end].style&0x20000))end++;
    for(let i=Math.max(0,start);i<end;i++){const c=siblings[i];if(c!==w&&c.builtin&&!c.proc&&c.className.toUpperCase()==='BUTTON'&&[4,9].includes(c.style&15)&&c.visible&&c.enabled)buttonCheck(gui,c,0xf1,0);}
    buttonCheck(gui,w,0xf1,1);
  }
  if(!w.parent)return 0;
  if(queued){gui.p.postMessage(w.parent,0x111,w.id&65535,w.hwnd);return 0;}
  return gui.send(w.parent,0x111,w.id&65535,w.hwnd,w.wide,()=>0);
}

export function installRadioChecks(gui){
  gui.api.add('user32.dll','CheckRadioButton',4,(parent,first,last,selected)=>{
    if(!gui.window(parent))return gui.api.fail(1400);
    first|=0;last|=0;selected|=0;
    const children=[...gui.windows.values()].filter(w=>(w.style&0x40000000)&&w.parent===(parent>>>0)).map(w=>w.hwnd);
    let index=0;
    const advance=()=>{
      while(index<children.length){
        const w=gui.window(children[index++]);if(!w)continue;
        const id=w.id|0;if(id<first||id>last)continue;
        const result=gui.send(w.hwnd,0xf1,+(id===selected),0,true);
        if(result?.call){const finish=value=>value?.call?{...value,then:reply=>finish(value.then(reply))}:advance();return finish(result);}
      }
      return 1;
    };
    return advance();
  });
}

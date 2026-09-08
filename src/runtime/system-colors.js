// Fixed Browser86 color profile; desktop themes and SetSysColors are separate capabilities.
export function installSystemColors(gui){
  const brushes=new Map(),valid=index=>(index>>>0)<=30;
  const color=index=>valid(index)?({5:0xffffff,8:0,15:0xf0f0f0,18:0}[index]??0xf0f0f0):0;
  gui.api.add('user32.dll','GetSysColor',1,color);
  gui.api.add('user32.dll','GetSysColorBrush',1,index=>{
    if(!valid(index))return 0;
    if(!brushes.has(index))brushes.set(index,gui.p.handle('gdi',{kind:'brush',color:color(index),system:true}));
    return brushes.get(index);
  });
}

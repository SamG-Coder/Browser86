// USER32's built-in classes paint with the same drawing commands as guest GDI calls.
export function paintControl(gui,w){
  if(!w.builtin||w.proc)return;
  const type=w.className.toUpperCase(),draw=command=>gui.draw(w.dc,command),width=w.width,height=w.height;
  const text=(value,x,y,maxWidth)=>draw({op:'text',x,y,text:value,color:w.enabled?0:0x808080,font:{height:14,face:'Arial',weight:400},maxWidth,align:0});
  const box=(x,y,width,height,fill,round=false)=>draw({op:round?'ellipse':'rectangle',x,y,width,height,pen:{color:0x777777,width:1},brush:{color:fill}});
  draw({op:'fill',x:0,y:0,width,height,color:type==='EDIT'?0xffffff:0xf0f0f0});
  if(type==='BUTTON'){
    const style=w.style&15,checkable=[2,3,4,5,6,9].includes(style),radio=style===4||style===9,state=w.checkState||0;
    if(checkable){const y=Math.max(1,Math.floor((height-14)/2));box(2,y,14,14,0xffffff,radio);if(state){if(radio)draw({op:'ellipse',x:6,y:y+4,width:6,height:6,pen:{null:true},brush:{color:0}});else if(state===2)draw({op:'fill',x:5,y:y+3,width:8,height:8,color:0x777777});else{draw({op:'line',x:5,y:y+7,x2:8,y2:y+10,pen:{color:0,width:2}});draw({op:'line',x:8,y:y+10,x2:13,y2:y+4,pen:{color:0,width:2}});}}text(w.title.replace(/&(?=[^&])/g,''),22,Math.max(0,(height-14)/2),width-24);}
    else{box(0,0,width,height,0xe8e8e8);text(w.title.replace(/&(?=[^&])/g,''),Math.max(4,(width-w.title.length*7)/2),Math.max(0,(height-14)/2),width-8);}
  }else if(type==='EDIT'){box(0,0,width,height,0xffffff);text(w.style&0x20?'*'.repeat(w.title.length):w.title,3,3,width-6);}
  else if(type==='STATIC')text(w.title,0,0,width);
}

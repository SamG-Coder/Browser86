const element=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const color=value=>`rgb(${value&255},${(value>>>8)&255},${(value>>>16)&255})`;
export class GuestDisplay {
  constructor(root,input){this.root=root;this.input=input;this.windows=new Map();this.z=10;}
  cursor(css){this.cursorCSS=css;for(const w of this.windows.values())(w.canvas||w.element).style.cursor=css;}
  reset(){this.cursorCSS=undefined;for(const w of this.windows.values())w.element.remove();this.windows.clear();for(const modal of this.root.querySelectorAll('.guest-modal-overlay'))modal.remove();}
  window({op,window:w}){
    if(op==='destroy'){this.windows.get(w.hwnd)?.element.remove();this.windows.delete(w.hwnd);return;}
    let record=this.windows.get(w.hwnd);
    if(!record){
      if((w.style&0x40000000)&&w.parent&&this.windows.has(w.parent)){const parent=this.windows.get(w.parent),type=w.className.toUpperCase(),node=element(type==='BUTTON'?'button':type==='EDIT'?'input':'div','guest-control '+(type==='BUTTON'?'button':type==='EDIT'?'edit':'static'));if(type==='BUTTON')node.addEventListener('click',()=>this.input({kind:'click',hwnd:w.hwnd}));if(type==='EDIT')node.addEventListener('input',()=>this.input({kind:'edit',hwnd:w.hwnd,text:node.value}));(parent.client||parent.element).append(node);record={element:node,control:true,type};}
      else {const node=element('div','guest-window'),bar=element('div','guest-titlebar'),title=element('span','',w.title),close=element('button','','×'),client=element('div','guest-client'),canvas=element('canvas');close.title='Close guest window';close.addEventListener('click',()=>this.input({kind:'close',hwnd:w.hwnd}));bar.append(title,close);canvas.tabIndex=0;canvas.setAttribute('aria-label',w.title+' display');client.append(canvas);node.append(bar,client);this.root.append(node);const context=canvas.getContext('2d',{alpha:false});record={element:node,client,canvas,context,title};
        node.addEventListener('pointerdown',()=>node.style.zIndex=String(++this.z));
        let drag=null;bar.addEventListener('pointerdown',e=>{if(e.target===close)return;drag={x:e.clientX-node.offsetLeft,y:e.clientY-node.offsetTop};bar.setPointerCapture(e.pointerId);e.preventDefault();});bar.addEventListener('pointermove',e=>{if(drag){node.style.left=Math.max(0,e.clientX-drag.x)+'px';node.style.top=Math.max(0,e.clientY-drag.y)+'px';}});bar.addEventListener('pointerup',()=>drag=null);
        for(const [dom,type]of [['mousedown','down'],['mouseup','up'],['mousemove','move']])canvas.addEventListener(dom,e=>{const rect=canvas.getBoundingClientRect();if(type==='down')canvas.focus();this.input({kind:'mouse',event:type,hwnd:w.hwnd,x:Math.floor((e.clientX-rect.left)*canvas.width/rect.width),y:Math.floor((e.clientY-rect.top)*canvas.height/rect.height),timeStamp:e.timeStamp,button:e.button,buttons:e.buttons,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey});});
        canvas.addEventListener('contextmenu',e=>e.preventDefault());
        for(const [dom,down]of [['keydown',true],['keyup',false]])canvas.addEventListener(dom,e=>{if(['F5','F11','F12'].includes(e.key)||e.ctrlKey&&['r','l'].includes(e.key.toLowerCase()))return;e.preventDefault();this.input({kind:'key',hwnd:w.hwnd,down,code:e.keyCode,char:e.key.length===1?e.key:e.key==='Enter'?'\r':e.key==='Backspace'?'\b':''});});
      }
      if(this.cursorCSS!==undefined)(record.canvas||record.element).style.cursor=this.cursorCSS;
      this.windows.set(w.hwnd,record);
    }
    const node=record.element;node.hidden=!w.visible;node.style.left=w.x+'px';node.style.top=w.y+'px';node.style.width=w.width+'px';node.style.zIndex=String(++this.z);
    if(record.control){node.style.height=w.height+'px';node.disabled=!w.enabled;if(record.type==='EDIT'){node.readOnly=!!(w.style&0x800);if(node!==document.activeElement||node.readOnly)node.value=w.title;}else if(record.type==='BUTTON'){
      const type=w.style&15,checkable=[2,3,4,5,6,9].includes(type),radio=type===4||type===9,state=w.checkState||0;
      node.classList.toggle('checkable',checkable);node.tabIndex=w.style&0x10000?0:-1;
      if(checkable){node.setAttribute('role',radio?'radio':'checkbox');node.setAttribute('aria-checked',state===2&&!radio?'mixed':state?'true':'false');const mark=element('span','check-mark',radio?(state?'\u25c9':'\u25cb'):state===2?'\u25a3':state?'\u2611':'\u2610');mark.setAttribute('aria-hidden','true');node.replaceChildren(mark,element('span','check-label',w.title));}
      else{node.removeAttribute('role');node.removeAttribute('aria-checked');node.textContent=w.title;}
    }else node.textContent=w.title;}
    else{record.title.textContent=w.title;record.client.style.width=w.width+'px';record.client.style.height=w.height+'px';if(record.canvas.width!==w.width||record.canvas.height!==w.height){record.canvas.width=w.width;record.canvas.height=w.height;record.context.fillStyle='#ffffff';record.context.fillRect(0,0,w.width,w.height);}}
    document.getElementById('desktop-empty').hidden=this.windows.size>0;
  }
  draw(commands){for(const c of commands){const record=this.windows.get(c.hwnd);if(!record?.context)continue;const ctx=record.context;ctx.save();try{
      if(c.clip){ctx.beginPath();for(const [l,t,r,b] of c.clip){const x=Math.max(0,l),y=Math.max(0,t),right=Math.min(ctx.canvas.width,r),bottom=Math.min(ctx.canvas.height,b);if(right>x&&bottom>y)ctx.rect(x,y,right-x,bottom-y);}ctx.clip();}
      if(c.pen?.geometric){ctx.lineCap=c.pen.lineCap;ctx.lineJoin=c.pen.lineJoin;ctx.miterLimit=c.pen.miterLimit;ctx.setLineDash(c.pen.dash||[]);}
      if(c.op==='fill'){ctx.fillStyle=color(c.color);ctx.fillRect(c.x,c.y,c.width,c.height);}
      else if(c.op==='invert'){
        // Clip in binary64 before Canvas narrows huge coordinates and loses the visible endpoint.
        const x=Math.max(0,c.x),y=Math.max(0,c.y),right=Math.min(ctx.canvas.width,c.x+c.width),bottom=Math.min(ctx.canvas.height,c.y+c.height);
        if(right>x&&bottom>y){ctx.globalCompositeOperation='difference';ctx.fillStyle='#ffffff';ctx.fillRect(x,y,right-x,bottom-y);}
      }
      else if(c.op==='text'){const font=c.font||{height:16,weight:400,face:'Arial'};const face=String(font.face).replace(/["\\;]/g,'');ctx.font=`${font.weight||400} ${Math.max(1,Math.min(512,font.height))}px "${face}", Arial, sans-serif`;ctx.textBaseline='top';ctx.textAlign=(c.align&6)===6?'center':(c.align&2)?'right':'left';const metrics=ctx.measureText(c.text);if(c.opaque){ctx.fillStyle=color(c.background);ctx.fillRect(c.x-((c.align&6)===6?metrics.width/2:(c.align&2)?metrics.width:0),c.y,metrics.width,font.height+2);}ctx.fillStyle=color(c.color);if(c.maxWidth>0)ctx.fillText(c.text,c.x,c.y,c.maxWidth);else ctx.fillText(c.text,c.x,c.y);}
      else if(['line','rectangle','ellipse','roundrect'].includes(c.op)){const pen=c.pen||{color:0,width:1},brush=c.brush||{null:true};ctx.beginPath();if(c.op==='line'){ctx.moveTo(c.x,c.y);ctx.lineTo(c.x2,c.y2);}else if(c.op==='ellipse'){if(c.width>0&&c.height>0)ctx.ellipse(c.x+c.width/2,c.y+c.height/2,c.width/2,c.height/2,0,0,Math.PI*2);}else if(c.op==='roundrect'&&ctx.roundRect)ctx.roundRect(c.x,c.y,c.width,c.height,Math.max(0,Math.min(c.width/2,c.height/2,(c.rx||12)/2)));else ctx.rect(c.x,c.y,c.width,c.height);if(!brush.null&&c.op!=='line'){ctx.fillStyle=color(brush.color);ctx.fill();}if(!pen.null){ctx.strokeStyle=color(pen.color);ctx.lineWidth=pen.width||1;ctx.stroke();}}
      else if(c.op==='polydraw'){
        ctx.beginPath();for(const op of c.ops){if(op.kind==='move')ctx.moveTo(...op.points[0]);else if(op.kind==='line')ctx.lineTo(...op.points[0]);else if(op.kind==='bezier')ctx.bezierCurveTo(...op.points[0],...op.points[1],...op.points[2]);else if(op.kind==='close')ctx.closePath();}
        if(c.pen&&!c.pen.null){ctx.strokeStyle=color(c.pen.color);ctx.lineWidth=c.pen.width||1;ctx.stroke();}
      }
      else if(c.op==='bezier'){
        ctx.beginPath();ctx.moveTo(...c.points[0]);for(let i=1;i<c.points.length;i+=3)ctx.bezierCurveTo(...c.points[i],...c.points[i+1],...c.points[i+2]);
        if(c.pen&&!c.pen.null){ctx.strokeStyle=color(c.pen.color);ctx.lineWidth=c.pen.width||1;ctx.stroke();}
      }
      else if(c.op==='polygon'||c.op==='polyline'||c.op==='polypolygon'){
        const closed=c.op!=='polyline';ctx.beginPath();
        for(const points of c.paths||[c.points]){points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(closed)ctx.closePath();}
        if(closed&&c.brush&&!c.brush.null){ctx.fillStyle=color(c.brush.color);ctx.fill(c.fillMode===2?'nonzero':'evenodd');}
        if(c.pen&&!c.pen.null){ctx.strokeStyle=color(c.pen.color);ctx.lineWidth=c.pen.width||1;ctx.stroke();}
      }
      else if(c.op==='pixels'){const temp=document.createElement('canvas');temp.width=c.pixelWidth;temp.height=c.pixelHeight;const bytes=new Uint8ClampedArray(c.rgba.buffer,c.rgba.byteOffset,c.rgba.byteLength);temp.getContext('2d').putImageData(new ImageData(bytes,c.pixelWidth,c.pixelHeight),0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(temp,c.sourceX,c.sourceY,c.sourceWidth,c.sourceHeight,c.x,c.y,c.width,c.height);}
    }finally{ctx.restore();}}}
  dialog(dialog){const overlay=element('div','guest-modal-overlay'),modal=element('section','guest-modal'),title=element('h3','',dialog.caption||'Application'),text=element('p','',dialog.text),actions=element('div','guest-modal-actions');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',dialog.caption||'Application message');for(const [label,result]of dialog.buttons){const button=element('button','',label);button.addEventListener('click',()=>{overlay.remove();this.input({kind:'dialog',id:dialog.id,result});});actions.append(button);}modal.append(title,text,actions);overlay.append(modal);this.root.append(overlay);actions.firstElementChild?.focus();}
}

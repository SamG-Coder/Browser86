// WinForms compatibility bridge. Managed CIL drives the existing USER32/GDI canvas backend.
// No application-specific UI, DOM controls, or translated replacement applications.
import {NOT_HANDLED,Real,raw,number,i32,copy,deref,display} from './values.js';
import {RuntimeFault,requireThat} from '../errors.js';
const colours={Black:0xff000000,White:0xffffffff,Red:0xffff0000,Green:0xff008000,Blue:0xff0000ff,Yellow:0xffffff00,Gray:0xff808080,LightGray:0xffd3d3d3,DarkGray:0xffa9a9a9,Orange:0xffffa500,Purple:0xff800080,Transparent:0x00ffffff,Control:0xfff0f0f0,ControlText:0xff000000,Window:0xffffffff,WindowText:0xff000000};
const colorRef=argb=>((argb>>>16)&255)|(argb&0xff00)|((argb&255)<<16);
const supportedEvents=new Set(['Click','TextChanged','Paint','Load','Shown','FormClosed','CheckedChanged','Resize']);
const basicClasses={'System.Windows.Forms.Button':'BUTTON','System.Windows.Forms.CheckBox':'BUTTON','System.Windows.Forms.RadioButton':'BUTTON','System.Windows.Forms.Label':'STATIC','System.Windows.Forms.TextBox':'EDIT','System.Windows.Forms.Panel':'Browser86.Managed','System.Windows.Forms.Form':'Browser86.Managed'};
export class FormsBridge {
 constructor(p){this.p=p;this.controls=new Map();this.nextId=100;this.timers=new Set();this.registered=false;this.applicationForm=null;}
 get gui(){return this.p.apis.gui;}
 isControl(type){for(let t=type,n=0;t&&n<64;t=this.p.baseType(t),n++)if(t.name==='System.Windows.Forms.Control')return true;return false;}
 baseControl(type){for(let t=type,n=0;t&&n<64;t=this.p.baseType(t),n++)if(basicClasses[t.name])return t.name;throw new RuntimeFault('CLR_WINFORMS_CONTROL','Unsupported WinForms control class: '+type?.name);}
 init(obj){if(obj.control)return obj.control;const type=this.baseControl(obj.__type),form=type==='System.Windows.Forms.Form';obj.control={obj,type,text:'',x:form?40:0,y:form?40:0,width:form?640:100,height:form?420:24,visible:true,enabled:true,children:[],events:new Map(),parent:null,hwnd:0,id:this.nextId++,checked:false,backColor:0xfff0f0f0,foreColor:0xff000000,name:'',tabIndex:0,suspended:0};return obj.control;}
 native(dll,name,...args){const api=this.p.apis.lookup(dll,name);requireThat(api?.fn,'CLR_WINFORMS_NATIVE','Missing native rendering service '+name);const result=api.fn(...args);requireThat(!result?.call&&!result?.wait,'CLR_WINFORMS_NATIVE','Unexpected native callback/wait from '+name);return result;}
 stringCall(name,args,strings){const pointers=[];try{for(const [index,value]of strings){const ptr=this.p.heap.string(String(value),true);pointers.push(ptr);args[index]=ptr;}return this.native('user32.dll',name,...args);}finally{for(const ptr of pointers)this.p.heap.free(ptr);}}
 register(){if(this.registered)return;const name=this.p.heap.string('Browser86.Managed',true),data=this.p.heap.alloc(40,true);try{this.p.memory.w32(data+36,name);this.p.memory.w32(data+28,16);const atom=this.native('user32.dll','RegisterClassW',data);requireThat(atom,'CLR_WINFORMS_NATIVE','Could not register managed window class.');this.registered=true;}finally{this.p.heap.free(name);this.p.heap.free(data);}}
 ensure(obj,parent=0){const c=this.init(obj);if(c.hwnd&&this.gui.window(c.hwnd))return c.hwnd;this.register();const cls=basicClasses[c.type];let style=(parent?0x40000000:0x00cf0000)|(c.visible?0x10000000:0)|(c.enabled?0:0x08000000);
  if(c.type==='System.Windows.Forms.CheckBox')style|=3;if(c.type==='System.Windows.Forms.RadioButton')style|=9;if(c.type==='System.Windows.Forms.TextBox')style|=0x00800000|(c.multiline?4:0)|(c.readOnly?0x800:0);
  const hwnd=this.stringCall('CreateWindowExW',[0,0,0,style>>>0,c.x,c.y,c.width,c.height,parent,parent?c.id:0,this.p.main.base,0],[[1,cls],[2,c.text]]);requireThat(hwnd,'CLR_WINFORMS_NATIVE','Native window creation failed.',{type:c.type,error:this.p.lastError});c.hwnd=hwnd;this.controls.set(hwnd,obj);
  if(c.checked)this.gui.send(hwnd,0xf1,1,0,true);
  for(const child of c.children)this.ensure(child,hwnd);return hwnd;
 }
 update(obj,property){const c=this.init(obj);if(!c.hwnd)return;const w=this.gui.window(c.hwnd);if(!w)return;
  if(property==='Text')this.stringCall('SetWindowTextW',[c.hwnd,0],[[1,c.text]]);
  else if(property==='Visible')this.native('user32.dll','ShowWindow',c.hwnd,c.visible?5:0);
  else if(property==='Enabled'){w.enabled=c.enabled;w.style=(c.enabled?w.style&~0x08000000:w.style|0x08000000)>>>0;this.gui.notify(w);}
  else if(property==='Checked'){this.gui.send(c.hwnd,0xf1,c.checked?1:0,0,true);}
  else if(property==='BackColor'||property==='ForeColor')this.gui.queuePaint(w);
  else this.native('user32.dll','MoveWindow',c.hwnd,c.x,c.y,c.width,c.height,1);
 }
 event(obj,name,args){const c=this.init(obj),handlers=c.events.get(name)||[];for(const delegate of handlers)this.p.enqueueDelegate(delegate,args||[obj,this.p.emptyEventArgs??=this.p.newObject(this.p.hostType('System.EventArgs'))]);}
 add(parent,child){this.p.nonNull(child);requireThat(this.isControl(child.__type),'CLR_WINFORMS_CONTROL','Controls.Add requires a Control.');const c=this.init(child),pc=this.init(parent);for(let p=parent;p;p=this.init(p).parent)requireThat(p!==child,'CLR_WINFORMS_CONTROL','Control parenting cycle.');if(c.parent){const old=this.init(c.parent);old.children=old.children.filter(x=>x!==child);}c.parent=parent;if(!pc.children.includes(child))pc.children.push(child);if(pc.hwnd){if(c.hwnd){this.native('user32.dll','SetParent',c.hwnd,pc.hwnd);}else this.ensure(child,pc.hwnd);} }
 close(obj){const c=this.init(obj);if(c.closed)return;c.closed=true;const hwnd=c.hwnd;if(hwnd){const descendants=[...this.controls.entries()].filter(([,o])=>{for(let x=o;x;x=this.init(x).parent)if(x===obj)return true;return false;});this.gui.destroy(hwnd);for(const [h,o]of descendants){this.init(o).hwnd=0;this.controls.delete(h);}}
  const args=this.p.newObject(this.p.hostType('System.Windows.Forms.FormClosedEventArgs'));args.closeReason=3;this.event(obj,'FormClosed',[obj,args]);
 }
 graphics(hwnd){const value=this.p.newObject(this.p.hostType('System.Drawing.Graphics'));value.hwnd=hwnd;value.hdc=this.gui.window(hwnd)?.dc;value.disposed=false;return value;}
 paint(obj){const c=this.init(obj),w=this.gui.window(c.hwnd);if(!w)return;w.paintPending=false;
  if(!w.builtin)this.gui.draw(w.dc,{op:'fill',x:0,y:0,width:w.width,height:w.height,color:colorRef(c.backColor)});
  if(c.events.has('Paint')){const e=this.p.newObject(this.p.hostType('System.Windows.Forms.PaintEventArgs'));e.graphics=this.graphics(c.hwnd);e.clipRectangle=this.shape('Rectangle',[0,0,c.width,c.height]);this.event(obj,'Paint',[obj,e]);}
 }
 poll(){let count=0;while(this.p.messageQueue.length&&count++<2048){const msg=this.p.messageQueue.shift(),obj=this.controls.get(msg.hwnd);if(!obj)continue;const c=this.init(obj);
   if(msg.message===0x111){const child=this.controls.get(msg.lParam);if(!child)continue;const cc=this.init(child),code=msg.wParam>>>16;if(code===0x300){cc.text=this.gui.window(cc.hwnd)?.title||'';this.event(child,'TextChanged');}else if(code===0){const w=this.gui.window(cc.hwnd),previous=cc.checked;cc.checked=!!w?.checkState;if(previous!==cc.checked)this.event(child,'CheckedChanged');this.event(child,'Click');}}
   else if(msg.message===15)this.paint(obj);else if(msg.message===16)this.close(obj);else if(msg.message===5)this.event(obj,'Resize');
   else this.gui.defWindow(msg.hwnd,msg.message,msg.wParam,msg.lParam,true);
  }
  const now=performance.now();for(const timer of this.timers)if(timer.enabled&&now>=timer.next){timer.next=now+timer.interval;for(const d of timer.handlers)this.p.enqueueDelegate(d,[timer.obj,this.p.emptyEventArgs??=this.p.newObject(this.p.hostType('System.EventArgs'))]);}
 }
 shape(name,values){const value=this.p.newObject(this.p.hostType('System.Drawing.'+name));this.setShape(value,name,values);return value;}
 setShape(value,name,args){if(name==='Size'||name==='SizeF'){value.width=number(args[0]||0);value.height=number(args[1]||0);}else if(name==='Point'||name==='PointF'){value.x=number(args[0]||0);value.y=number(args[1]||0);}else{value.x=number(args[0]||0);value.y=number(args[1]||0);value.width=number(args[2]||0);value.height=number(args[3]||0);}}
 color(argb){const obj=this.p.newObject(this.p.hostType('System.Drawing.Color'));obj.argb=argb>>>0;return obj;}
 invoke(m,all){
  const p=this.p,owner=m.owner.name,name=m.name,instance=m.signature.hasThis,self=instance?deref(all[0]):null,args=instance?all.slice(1):all;
  if(owner==='System.Windows.Forms.Application'){
   if(name==='EnableVisualStyles'&&!args.length)return; // Native compatibility controls already select the supported theme.
   if(name==='SetCompatibleTextRenderingDefault'&&args.length===1){requireThat(!raw(args[0]),'CLR_WINFORMS_TEXT','Only GDI-style text rendering is supported.');return;}
   if(name==='Run'&&args.length===1){requireThat(!this.applicationForm,'CLR_WINFORMS_LOOP','Only one main managed message loop is supported.');const form=p.nonNull(args[0]);requireThat(this.init(form).type==='System.Windows.Forms.Form','CLR_WINFORMS_LOOP','Application.Run requires Form.');this.applicationForm=form;this.ensure(form);this.event(form,'Load');this.event(form,'Shown');return {wait:()=>this.init(form).closed&&!p.pendingEvents.length&&!p.eventActive?0:undefined,reason:'WinForms message loop'};}
   if(name==='Exit'&&!args.length){if(this.applicationForm)this.close(this.applicationForm);return;}
   if(name==='get_StartupPath')return p.exePath.slice(0,p.exePath.lastIndexOf('/')).replaceAll('/','\\');
   if(name==='get_ExecutablePath')return p.exePath.replaceAll('/','\\');
  }
  if(owner==='System.Windows.Forms.Control+ControlCollection'){
   if(name==='Add'&&args.length===1){this.add(self.owner,args[0]);return;}
   if(name==='AddRange'&&args[0]?.__array){for(const child of args[0].items)this.add(self.owner,child);return;}
   if(name==='get_Count')return this.init(self.owner).children.length;
   if(name==='get_Item'&&typeof args[0]==='number'){const item=this.init(self.owner).children[i32(args[0])];if(!item)p.throwException('System.ArgumentOutOfRangeException','Control index.');return item;}
  }
  if(this.isControl(m.owner)||self?.__type&&this.isControl(self.__type)){
   const c=this.init(self);
   if(name==='.ctor'&&!args.length)return;
   if(name==='get_Controls'){if(!c.collection){c.collection=p.newObject(p.hostType('System.Windows.Forms.Control+ControlCollection'));c.collection.owner=self;}return c.collection;}
   if(name.startsWith('add_')||name.startsWith('remove_')){const event=name.slice(name.indexOf('_')+1);if(!supportedEvents.has(event))return NOT_HANDLED;let list=c.events.get(event)||[];if(name.startsWith('add_')){requireThat(list.length<1024,'CLR_EVENT_LIMIT','Too many control event subscriptions.');list.push(args[0]);}else{const at=list.findLastIndex(x=>x===args[0]||x.method===args[0]?.method&&x.target===args[0]?.target);if(at>=0)list.splice(at,1);}c.events.set(event,list);return;}
   if(name.startsWith('set_')){const key=name.slice(4),v=deref(args[0]);
    switch(key){case 'Text':{const previous=c.text;c.text=v||'';this.update(self,key);if(c.text!==previous)this.event(self,'TextChanged');return;}
     case 'Location':c.x=number(v.x);c.y=number(v.y);break;
     case 'Size':case 'ClientSize':c.width=number(v.width);c.height=number(v.height);break;
     case 'Bounds':c.x=number(v.x);c.y=number(v.y);c.width=number(v.width);c.height=number(v.height);break;
     case 'Left':c.x=number(v);break;case 'Top':c.y=number(v);break;case 'Width':c.width=number(v);break;case 'Height':c.height=number(v);break;
     case 'Enabled':c.enabled=!!raw(v);break;case 'Visible':c.visible=!!raw(v);break;
     case 'Checked':{const old=c.checked;c.checked=!!raw(v);this.update(self,key);if(old!==c.checked)this.event(self,'CheckedChanged');return;}
     case 'BackColor':c.backColor=v.argb;break;case 'ForeColor':c.foreColor=v.argb;break;
     case 'Name':c.name=v;return;case 'TabIndex':c.tabIndex=i32(v);return;
     case 'ReadOnly':c.readOnly=!!raw(v);if(c.hwnd){const w=this.gui.window(c.hwnd);w.style=(c.readOnly?w.style|0x800:w.style&~0x800)>>>0;this.gui.notify(w);}return;
     case 'Multiline':requireThat(!c.hwnd,'CLR_WINFORMS_HANDLE','Set Multiline before handle creation.');c.multiline=!!raw(v);return;
     case 'Parent':if(v)this.add(v,self);else return NOT_HANDLED;return;
     default:return NOT_HANDLED;
    }
    requireThat([c.x,c.y,c.width,c.height].every(Number.isFinite),'CLR_WINFORMS_BOUNDS','Nonfinite control geometry.');c.width=Math.max(1,Math.min(1920,c.width));c.height=Math.max(1,Math.min(1080,c.height));if(!c.suspended)this.update(self,key);return;
   }
   if(name.startsWith('get_')){const key=name.slice(4);
    switch(key){case 'Text':return c.hwnd?this.gui.window(c.hwnd)?.title??c.text:c.text;case 'Location':return this.shape('Point',[c.x,c.y]);case 'Size':case 'ClientSize':return this.shape('Size',[c.width,c.height]);case 'Bounds':return this.shape('Rectangle',[c.x,c.y,c.width,c.height]);case 'ClientRectangle':return this.shape('Rectangle',[0,0,c.width,c.height]);case 'Left':return c.x;case 'Top':return c.y;case 'Width':return c.width;case 'Height':return c.height;case 'Visible':return c.visible?1:0;case 'Enabled':return c.enabled?1:0;case 'Checked':return c.checked?1:0;case 'Name':return c.name;case 'TabIndex':return c.tabIndex;case 'Handle':return this.ensure(self,c.parent?this.ensure(c.parent):0);case 'Parent':return c.parent;case 'IsDisposed':return c.closed?1:0;case 'IsHandleCreated':return c.hwnd?1:0;case 'BackColor':return this.color(c.backColor);case 'ForeColor':return this.color(c.foreColor);}
   }
   if(name==='SuspendLayout'){c.suspended++;return;}if(name==='ResumeLayout'){c.suspended=Math.max(0,c.suspended-1);if(!c.suspended)this.update(self,'Bounds');return;}
   if(name==='PerformLayout'&&!args.length){this.update(self,'Bounds');return;}
   if(name==='Show'&&!args.length){c.visible=true;this.ensure(self,c.parent?this.ensure(c.parent):0);this.update(self,'Visible');return;}
   if(name==='Hide'&&!args.length){c.visible=false;this.update(self,'Visible');return;}
   if(name==='Close'&&!args.length){this.close(self);return;}
   if(name==='Dispose'&&args.length<=1){this.close(self);return;}
   if(name==='Invalidate'&&args.length<=1){const w=this.gui.window(c.hwnd);if(w)this.gui.queuePaint(w);return;}
   if(name==='Refresh'&&!args.length){this.paint(self);return;}
   if(name==='CreateGraphics'&&!args.length)return this.graphics(this.ensure(self,c.parent?this.ensure(c.parent):0));
   if(name==='PerformClick'&&!args.length){if(c.enabled)this.event(self,'Click');return;}
   if(name==='Focus'&&!args.length){this.ensure(self,c.parent?this.ensure(c.parent):0);this.native('user32.dll','SetFocus',c.hwnd);return 1;}
   if(name==='SelectAll'&&c.type==='System.Windows.Forms.TextBox'){this.ensure(self,c.parent?this.ensure(c.parent):0);this.gui.window(c.hwnd).editSelectAll=true;return;}
  }
  if(/^System\.Drawing\.(Point|Size|Rectangle)(F)?$/.test(owner)){
   const kind=owner.slice(owner.lastIndexOf('.')+1);
   if(name==='.ctor'){if(args.length===2&&args[0]?.x!==undefined&&args[1]?.width!==undefined)this.setShape(self,kind,[args[0].x,args[0].y,args[1].width,args[1].height]);else this.setShape(self,kind,args);return;}
   const props={X:'x',Y:'y',Width:'width',Height:'height',Left:'x',Top:'y'};
   if(name.startsWith('get_')&&props[name.slice(4)]){const v=self[props[name.slice(4)]]||0;return kind.endsWith('F')?new Real(v):v;}
   if(name.startsWith('set_')&&props[name.slice(4)]){self[props[name.slice(4)]]=number(args[0]);return;}
   if(name==='get_Right')return (self.x||0)+(self.width||0);if(name==='get_Bottom')return (self.y||0)+(self.height||0);
   if(name==='get_Empty')return this.shape(kind,[]);
  }
  if(owner==='System.Drawing.Color'||owner==='System.Drawing.SystemColors'){
   if(name.startsWith('get_')&&Object.hasOwn(colours,name.slice(4)))return this.color(colours[name.slice(4)]);
   if(name==='FromArgb'){
    if(args.length===1)return this.color(i32(args[0]));const values=args.map(number),alpha=args.length===4?values.shift():255;requireThat(values.length===3,'CLR_DRAWING_COLOR','Unsupported Color.FromArgb overload.');if([alpha,...values].some(v=>!Number.isInteger(v)||v<0||v>255))p.throwException('System.ArgumentException','Color component outside 0..255.');return this.color(((alpha<<24)|(values[0]<<16)|(values[1]<<8)|values[2])>>>0);
   }
   if(name==='ToArgb')return self.argb|0;if(name==='get_A')return self.argb>>>24;if(name==='get_R')return (self.argb>>>16)&255;if(name==='get_G')return (self.argb>>>8)&255;if(name==='get_B')return self.argb&255;
  }
  if(owner==='System.Drawing.SolidBrush'||owner==='System.Drawing.Pen'){
   if(name==='.ctor'&&(args.length===1||args.length===2)){const color=args[0]?.argb!==undefined?args[0].argb:args[0]?.argb;requireThat(color!==undefined&&(color>>>24)===255,'CLR_DRAWING_ALPHA','Only opaque solid GDI colors are supported.');self.argb=color;self.width=args.length===2?number(args[1]):1;self.gdi=this.native('gdi32.dll',owner.endsWith('Pen')?'CreatePen':'CreateSolidBrush',...(owner.endsWith('Pen')?[0,Math.max(1,Math.round(self.width)),colorRef(color)]:[colorRef(color)]));return;}
   if(name==='Dispose'){if(self.gdi)this.native('gdi32.dll','DeleteObject',self.gdi);self.gdi=0;self.disposed=true;return;}
   if(name==='get_Color')return this.color(self.argb);
  }
  if(owner==='System.Drawing.Font'){
   if(name==='.ctor'&&args.length>=2&&args.length<=3&&typeof args[0]==='string'){self.face=args[0];self.height=number(args[1])*96/72;self.weight=(number(args[2]||0)&1)?700:400;return;}
   if(name==='Dispose'){self.disposed=true;return;}
  }
  if(owner==='System.Windows.Forms.PaintEventArgs'){if(name==='get_Graphics')return self.graphics;if(name==='get_ClipRectangle')return copy(self.clipRectangle);}
  if(owner==='System.Windows.Forms.FormClosedEventArgs'&&name==='get_CloseReason')return self.closeReason;
  if(owner==='System.Drawing.Graphics'){
   if(name==='Dispose'){self.disposed=true;return;}
   requireThat(!self.disposed&&this.gui.dc(self.hdc),'CLR_DRAWING_DISPOSED','Graphics object is disposed or its window has closed.');
   const draw=command=>this.gui.draw(self.hdc,command);
   if(name==='Clear'&&args.length===1){const w=this.gui.window(self.hwnd);draw({op:'fill',x:0,y:0,width:w.width,height:w.height,color:colorRef(args[0].argb)});return;}
   if(['FillRectangle','DrawRectangle','FillEllipse','DrawEllipse'].includes(name)){
    const tool=p.nonNull(args[0]);requireThat(!tool.disposed,'CLR_DRAWING_DISPOSED','Drawing resource is disposed.');const rect=args.length===2?args[1]:{x:number(args[1]),y:number(args[2]),width:number(args[3]),height:number(args[4])};const fill=name.startsWith('Fill');draw({op:name.endsWith('Ellipse')?'ellipse':'rectangle',x:rect.x,y:rect.y,width:rect.width,height:rect.height,pen:fill?{null:true}:{color:colorRef(tool.argb),width:tool.width||1},brush:fill?{color:colorRef(tool.argb)}:{null:true}});return;
   }
   if(name==='DrawLine'&&args.length===5){draw({op:'line',x:number(args[1]),y:number(args[2]),x2:number(args[3]),y2:number(args[4]),pen:{color:colorRef(args[0].argb),width:args[0].width||1}});return;}
   if(name==='DrawString'&&(args.length===4||args.length===5)){const [text,font,brush]=args,point=args.length===4?args[3]:{x:number(args[3]),y:number(args[4])};draw({op:'text',text:text||'',x:point.x,y:point.y,font:{height:font.height,face:font.face,weight:font.weight},color:colorRef(brush.argb),align:0});return;}
  }
  if(owner==='System.IDisposable'&&name==='Dispose'&&self?.__type?.name.startsWith('System.Drawing.')){if(self.gdi)this.native('gdi32.dll','DeleteObject',self.gdi);self.gdi=0;self.disposed=true;return;}
  if(owner==='System.Windows.Forms.Timer'){
   if(name==='.ctor'&&!args.length){self.timer={obj:self,enabled:false,interval:100,next:0,handlers:[]};this.timers.add(self.timer);return;}
   const t=self.timer;if(name==='set_Interval'){const n=i32(args[0]);if(n<1)p.throwException('System.ArgumentOutOfRangeException','Timer interval must be positive.');t.interval=n;t.next=performance.now()+n;return;}
   if(name==='get_Interval')return t.interval;if(name==='get_Enabled')return t.enabled?1:0;
   if(name==='Start'||name==='Stop'||name==='set_Enabled'){t.enabled=name==='Start'||name==='set_Enabled'&&!!raw(args[0]);t.next=performance.now()+t.interval;return;}
   if(name==='add_Tick'){t.handlers.push(args[0]);return;}if(name==='remove_Tick'){const at=t.handlers.indexOf(args[0]);if(at>=0)t.handlers.splice(at,1);return;}if(name==='Dispose'){this.timers.delete(t);return;}
  }
  return NOT_HANDLED;
 }
}

// Small WinForms binding to Browser86 USER32 and GDI. No HTML/CSS guest controls.
import {RuntimeFault,requireThat} from '../errors.js';
import {number,unref,clone,text,truth,nonnull,raise} from './values.js';
const NOT_HANDLED=Symbol('not handled');
const controlNames=new Set(['Form','Control','Button','Label','TextBox','Panel','CheckBox','RadioButton']);
const colorNames={Black:0x000000,White:0xffffff,Red:0x0000ff,Green:0x008000,Blue:0xff0000,Yellow:0x00ffff,Gray:0x808080,LightGray:0xd3d3d3,DarkGray:0xa9a9a9,Orange:0x00a5ff,Purple:0x800080,WhiteSmoke:0xf5f5f5};
export class ManagedForms {
  static NOT_HANDLED=NOT_HANDLED;
  constructor(vm){this.vm=vm;this.p=vm.p;this.gui=vm.p.apis.gui;this.controls=new Map();this.events=[];this.active=false;this.baseDepth=0;this.timers=new Set();this.nextId=2000;}
  api(dll,name,...args){const fn=this.p.apis.lookup(dll,name)?.fn;requireThat(fn,'CLR_GUI_API','Required USER32/GDI function is unavailable.',{dll,name});const result=fn(...args);requireThat(!result?.call&&!result?.wait,'CLR_GUI_CALLBACK','Managed GUI binding encountered an unsupported native callback.');return result;}
  temporaryStrings(strings,action){const pointers=strings.map(s=>this.p.heap.string(s,true));try{return action(...pointers);}finally{for(const p of pointers)this.p.heap.free(p);}}
  initialize(obj,kind){if(obj.host)return;obj.host='forms:'+kind;obj.props={Text:'',Left:kind==='Form'?40:0,Top:kind==='Form'?40:0,Width:kind==='Form'?640:100,Height:kind==='Form'?420:26,Visible:true,Enabled:true,Checked:false,ReadOnly:false,Multiline:false};obj.children=[];obj.events=new Map();obj.hwnd=0;}
  queueEvent(obj,name,args){const handlers=obj.events?.get(name)||[];for(const h of handlers){requireThat(this.events.length<8192,'CLR_EVENT_LIMIT','Managed event queue exceeded.');this.events.push({delegate:h,args:args||[obj,this.vm.library.emptyEvent]});}}
  mount(obj,parent=0){if(obj.hwnd)return obj.hwnd;const kind=obj.host?.slice(6);requireThat(kind&&controlNames.has(kind),'CLR_FORMS_CONTROL','Only explicitly implemented WinForms controls can be created.');
    const root=kind==='Form',className=root||kind==='Panel'?'Browser86.Managed.'+kind:kind==='Button'||kind==='CheckBox'||kind==='RadioButton'?'BUTTON':kind==='TextBox'?'EDIT':'STATIC';
    if(root||kind==='Panel')this.gui.classes.set(className.toLowerCase(),{name:className,atom:this.gui.nextAtom++,proc:0,wide:true,windowExtra:0,background:this.gui.stockObject(0),instance:0});
    let style=(root?0x00cf0000:0x40000000)|(obj.props.Visible?0x10000000:0)|(obj.props.Enabled?0:0x08000000);
    if(kind==='TextBox')style|=0x00800000|(obj.props.ReadOnly?0x800:0)|(obj.props.Multiline?4:0);if(kind==='CheckBox')style|=3;if(kind==='RadioButton')style|=9;
    const h=this.temporaryStrings([className,text(obj.props.Text)],(cls,title)=>this.api('user32.dll','CreateWindowExW',0,cls,title,style>>>0,obj.props.Left,obj.props.Top,obj.props.Width,obj.props.Height,parent,root?0:this.nextId++,0,0));
    requireThat(h,'CLR_FORMS_CREATE','WinForms control creation failed.',{kind,lastError:this.p.lastError});obj.hwnd=h;this.controls.set(h,obj);for(const child of obj.children)this.mount(child,h);if(obj.props.Checked)this.api('user32.dll','SendMessageW',h,0xf1,1,0);return h;
  }
  update(obj){if(!obj.hwnd)return;const w=this.gui.window(obj.hwnd);if(!w)return;w.title=text(obj.props.Text);w.x=number(obj.props.Left);w.y=number(obj.props.Top);w.width=Math.max(1,Math.min(1920,number(obj.props.Width)));w.height=Math.max(1,Math.min(1080,number(obj.props.Height)));w.visible=truth(obj.props.Visible);w.enabled=truth(obj.props.Enabled);w.style=(w.style&~(0x10000000|0x08000000))|(w.visible?0x10000000:0)|(w.enabled?0:0x08000000);if(obj.host==='forms:TextBox')w.style=obj.props.ReadOnly?w.style|0x800:w.style&~0x800;this.gui.notify(w);}
  begin(form,depth,done){requireThat(!this.active,'CLR_FORMS_LOOP','Nested Application.Run loops are not supported.');this.root=form;this.baseDepth=depth;this.done=done;this.active=true;this.mount(form);this.queueEvent(form,'Load');this.queueEvent(form,'Shown');}
  close(obj){if(!obj.hwnd)return;this.queueEvent(obj,'FormClosed');const root=obj===this.root;this.api('user32.dll','DestroyWindow',obj.hwnd);for(const [h,c]of this.controls)if(!this.gui.window(h)){c.hwnd=0;this.controls.delete(h);}if(root)this.closing=true;}
  invokeDelegate(delegate,args,done){const list=[...(delegate.invocations||[delegate])];const next=()=>{const d=list.shift();if(!d)return done();requireThat(d?.method,'CLR_DELEGATE','Invalid managed delegate.');this.vm.invoke(d.method,d.method.signature.hasThis?[d.target,...args]:args,next);};next();}
  pump(){
    for(const timer of this.timers)if(timer.enabled&&performance.now()>=timer.next){timer.next=performance.now()+timer.interval;this.queueEvent(timer,'Tick');}
    const event=this.events.shift();if(event){this.invokeDelegate(event.delegate,event.args,()=>{});return true;}
    if(this.closing){this.closing=false;this.active=false;this.done();return true;}
    const message=this.p.messageQueue.shift();if(message){const obj=this.controls.get(message.hwnd);if(!obj)return true;
      if(message.message===16){this.close(obj);return true;}
      if(message.message===0x111){const child=this.controls.get(message.lParam);if(child){const w=this.gui.window(child.hwnd);if(child.host==='forms:TextBox'){child.props.Text=w.title;this.queueEvent(child,'TextChanged');}else{child.props.Checked=!!w.checkState;this.queueEvent(child,'Click');if(child.host==='forms:CheckBox'||child.host==='forms:RadioButton')this.queueEvent(child,'CheckedChanged');}}return true;}
      if(message.message===15){const w=this.gui.window(obj.hwnd);if(w){w.paintPending=false;if(!w.builtin){this.gui.draw(w.dc,{op:'fill',x:0,y:0,width:w.width,height:w.height,color:0xf0f0f0});const graphics={tag:'object',host:'drawing:Graphics',type:{fullName:'System.Drawing.Graphics'},dc:w.dc};const paint={tag:'object',host:'forms:PaintEventArgs',type:{fullName:'System.Windows.Forms.PaintEventArgs'},graphics,width:w.width,height:w.height};this.queueEvent(obj,'Paint',[obj,paint]);}}return true;}
      if(message.message===0x100||message.message===0x101){this.queueEvent(obj,message.message===0x100?'KeyDown':'KeyUp',[obj,{tag:'object',host:'forms:KeyEventArgs',type:{fullName:'System.Windows.Forms.KeyEventArgs'},key:message.wParam}]);return true;}
      return true;
    }
    this.p.waiting={reason:'Managed WinForms messages',check:()=>this.events.length||this.p.messageQueue.length||this.closing||[...this.timers].some(t=>t.enabled&&performance.now()>=t.next)?1:undefined,complete:()=>{}};return false;
  }
  color(rgb,alpha=255){return {tag:'object',valueType:true,fields:new Map(),type:{fullName:'System.Drawing.Color'},host:'drawing:Color',rgb:rgb>>>0,alpha};}
  struct(name,values){return {tag:'object',valueType:true,fields:new Map(),type:{fullName:'System.Drawing.'+name},host:'drawing:'+name,props:{...values}};}
  invoke(method,obj,a){const t=method.type.fullName,n=method.name,kind=t.split('.').at(-1);
    if(t==='System.Windows.Forms.Application'){
      if(n==='EnableVisualStyles'&&a.length===0)return; // Rendering uses Browser86's common USER32 theme.
      if(n==='SetCompatibleTextRenderingDefault'&&a.length===1&&!truth(a[0]))return;
      if(n==='Run'&&a.length===1)return {formsLoop:nonnull(a[0])};
      if((n==='Exit'||n==='ExitThread')&&a.length===0){if(this.root)this.close(this.root);return;}
    }
    if(t==='System.Windows.Forms.MessageBox'&&n==='Show'&&(a.length===1||a.length===2||a.length===3)){
      const title=a.length>1?text(a[1]):'',flags=a.length>2?number(a[2]):0;
      const pointers=[this.p.heap.string(text(a[0]),true),this.p.heap.string(title,true)];try{return this.p.apis.lookup('user32.dll','MessageBoxW').fn(0,pointers[0],pointers[1],flags);}finally{pointers.forEach(p=>this.p.heap.free(p));}
    }
    if(t==='System.Windows.Forms.Timer'||obj?.host==='forms:Timer'){
      if(n==='.ctor'){obj.host='forms:Timer';obj.events=new Map();obj.interval=100;obj.enabled=false;this.timers.add(obj);return;}
      if(n==='set_Interval'){if(number(a[0])<1)raise('ArgumentOutOfRangeException','Timer interval must be positive.');obj.interval=number(a[0]);return;}
      if(n==='get_Interval')return obj.interval;if(n==='get_Enabled')return obj.enabled;
      if(n==='Start'||n==='set_Enabled'||n==='Stop'){obj.enabled=n==='Start'||n==='set_Enabled'&&truth(a[0]);obj.next=performance.now()+obj.interval;return;}
      if(n==='Dispose'){this.timers.delete(obj);return;}
    }
    if(t==='System.Windows.Forms.Control+ControlCollection'){
      if(n==='Add'){const child=nonnull(a[0]);requireThat(child.children,'CLR_FORMS_CONTROL','Only managed Controls may be added.');if(child===obj.owner)raise('ArgumentException','A control cannot contain itself.');for(let p=obj.owner;p;p=p.parent)if(p===child)raise('ArgumentException','A control cannot contain an ancestor.');requireThat(!child.parent,'CLR_FORMS_REPARENT','Reparenting an existing control is not implemented.');obj.owner.children.push(child);child.parent=obj.owner;if(obj.owner.hwnd)this.mount(child,obj.owner.hwnd);return;}
      if(n==='AddRange'){for(const child of a[0].values)this.invoke({...method,name:'Add'},obj,[child]);return;}
      if(n==='get_Count')return obj.owner.children.length;
      if(n==='get_Item'){const child=obj.owner.children[number(a[0])];if(!child)raise('ArgumentOutOfRangeException','Control index out of bounds.');return child;}
    }
    if(n==='.ctor'&&t.startsWith('System.Windows.Forms.')&&controlNames.has(kind)&&a.length===0){this.initialize(obj,kind);return;}
    if(obj?.host?.startsWith('forms:')&&obj.events&&(n.startsWith('add_')||n.startsWith('remove_'))){const event=n.slice(n.indexOf('_')+1);requireThat(['Click','Load','Shown','Paint','TextChanged','CheckedChanged','FormClosed','KeyDown','KeyUp','Tick'].includes(event),'CLR_FORMS_EVENT','This WinForms event has no implementation.',{event});const handlers=obj.events.get(event)||[];if(n.startsWith('add_'))handlers.push(a[0]);else{const i=handlers.lastIndexOf(a[0]);if(i>=0)handlers.splice(i,1);}obj.events.set(event,handlers);return;}
    if(obj?.host?.startsWith('forms:')&&obj.children){
      const property=n.slice(4);if(n==='get_Controls')return {tag:'object',host:'forms:ControlCollection',type:{fullName:'System.Windows.Forms.Control+ControlCollection'},owner:obj};
      if(n==='get_Handle')return obj.hwnd||this.mount(obj,obj.parent?.hwnd||0);
      if(n==='set_Location'){const v=nonnull(a[0]).props;obj.props.Left=v.X;obj.props.Top=v.Y;this.update(obj);return;}
      if(n==='set_Size'||n==='set_ClientSize'){const v=nonnull(a[0]).props;obj.props.Width=v.Width;obj.props.Height=v.Height;this.update(obj);return;}
      if(n==='get_Size'||n==='get_ClientSize')return this.struct('Size',{Width:obj.props.Width,Height:obj.props.Height});if(n==='get_Location')return this.struct('Point',{X:obj.props.Left,Y:obj.props.Top});
      if(n.startsWith('set_')&&Object.hasOwn(obj.props,property)){obj.props[property]=['Visible','Enabled','Checked','ReadOnly','Multiline'].includes(property)?truth(a[0]):a[0];this.update(obj);if(property==='Checked'&&obj.hwnd)this.api('user32.dll','SendMessageW',obj.hwnd,0xf1,truth(a[0])?1:0,0);return;}
      if(n.startsWith('get_')&&Object.hasOwn(obj.props,property)){if(property==='Text'&&obj.hwnd)obj.props.Text=this.gui.window(obj.hwnd)?.title||'';return obj.props[property];}
      if(n==='SuspendLayout'||n==='ResumeLayout')return; // Fixed-coordinate subset; no layout engine is advertised.
      if(n==='SetBounds'&&a.length===4){[obj.props.Left,obj.props.Top,obj.props.Width,obj.props.Height]=a.map(number);this.update(obj);return;}
      if(n==='Invalidate'&&a.length===0){if(obj.hwnd)this.gui.queuePaint(this.gui.window(obj.hwnd));return;}
      if(n==='Show'&&a.length===0){obj.props.Visible=true;this.mount(obj,obj.parent?.hwnd||0);this.update(obj);return;}
      if(n==='Hide'){obj.props.Visible=false;this.update(obj);return;}
      if(n==='Close'||n==='Dispose'){this.close(obj);return;}
      if(n==='PerformClick'){this.queueEvent(obj,'Click');return;}
    }
    if(obj?.host==='forms:PaintEventArgs'){if(n==='get_Graphics')return obj.graphics;if(n==='get_ClipRectangle')return this.struct('Rectangle',{X:0,Y:0,Width:obj.width,Height:obj.height});}
    if(obj?.host==='forms:KeyEventArgs'){if(n==='get_KeyCode'||n==='get_KeyValue'||n==='get_KeyData')return obj.key;}
    if(['System.Drawing.Point','System.Drawing.Size','System.Drawing.Rectangle'].includes(t)){
      if(n==='.ctor'&&(a.length===2||a.length===4)){obj.valueType=true;obj.host='drawing:'+kind;obj.props=kind==='Point'?{X:number(a[0]),Y:number(a[1])}:kind==='Size'?{Width:number(a[0]),Height:number(a[1])}:{X:number(a[0]),Y:number(a[1]),Width:number(a[2]),Height:number(a[3])};return;}
      if(n.startsWith('get_')&&obj?.props&&Object.hasOwn(obj.props,n.slice(4)))return obj.props[n.slice(4)];
      if(n.startsWith('set_')&&obj?.props&&Object.hasOwn(obj.props,n.slice(4))){obj.props[n.slice(4)]=number(a[0]);return;}
    }
    if(t==='System.Drawing.Color'){
      if(n==='FromArgb'&&(a.length===3||a.length===4)){const vals=a.map(number);if(vals.some(v=>!Number.isInteger(v)||v<0||v>255))raise('ArgumentException','Color components must be in the range 0–255.');const [r,g,b]=vals.slice(-3);return this.color(r|(g<<8)|(b<<16),a.length===4?vals[0]:255);}
      if(n==='FromArgb'&&a.length===1){const v=number(a[0])>>>0;return this.color(((v>>>16)&255)|(v&0xff00)|((v&255)<<16),v>>>24);}
      if(n.startsWith('get_')&&Object.hasOwn(colorNames,n.slice(4)))return this.color(colorNames[n.slice(4)]);
      if(n==='get_A')return obj.alpha;if(n==='get_R')return obj.rgb&255;if(n==='get_G')return (obj.rgb>>>8)&255;if(n==='get_B')return obj.rgb>>>16&255;
    }
    if((t==='System.Drawing.SolidBrush'||t==='System.Drawing.Pen')&&n==='.ctor'&&(a.length===1||a.length===2)){obj.host='drawing:'+kind;obj.color=nonnull(a[0]);obj.width=a.length>1?number(a[1]):1;return;}
    if(obj?.host?.startsWith('drawing:')&&n==='Dispose'){obj.disposed=true;return;}
    if(obj?.host==='drawing:Graphics'){
      if(n==='FillRectangle'||n==='DrawRectangle'||n==='FillEllipse'||n==='DrawEllipse'){
        const tool=nonnull(a[0]);requireThat(!tool.disposed&&!obj.disposed,'CLR_DRAWING_DISPOSED','Drawing object has been disposed.');requireThat(tool.color?.alpha===255,'CLR_DRAWING_ALPHA','This GDI binding currently supports opaque brushes and pens only.');
        let rect;if(a.length===2)rect=nonnull(a[1]).props;else if(a.length===5)rect={X:number(a[1]),Y:number(a[2]),Width:number(a[3]),Height:number(a[4])};else return NOT_HANDLED;
        const {X:x,Y:y,Width:w,Height:h}=rect,fill=n.startsWith('Fill'),shape=n.endsWith('Ellipse')?'Ellipse':'Rectangle';const handle=fill?this.api('gdi32.dll','CreateSolidBrush',tool.color.rgb):this.api('gdi32.dll','CreatePen',0,Math.max(1,Math.round(tool.width)),tool.color.rgb);
        const oldTool=this.api('gdi32.dll','SelectObject',obj.dc,handle),other=this.gui.stockObject(fill?8:5),oldOther=this.api('gdi32.dll','SelectObject',obj.dc,other);
        try{this.api('gdi32.dll',shape,obj.dc,Math.trunc(x),Math.trunc(y),Math.trunc(x+w),Math.trunc(y+h));}finally{this.api('gdi32.dll','SelectObject',obj.dc,oldOther);this.api('gdi32.dll','SelectObject',obj.dc,oldTool);this.api('gdi32.dll','DeleteObject',handle);}return;
      }
      if(n==='Clear'&&a.length===1){requireThat(a[0]?.alpha===255,'CLR_DRAWING_ALPHA','Clear supports opaque colors only.');const dc=this.gui.dc(obj.dc),w=this.gui.window(dc.hwnd);this.gui.draw(obj.dc,{op:'fill',x:0,y:0,width:w.width,height:w.height,color:a[0].rgb});return;}
    }
    return NOT_HANDLED;
  }
}

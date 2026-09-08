import {installClassQueries} from './class-queries.js';
import {installWindowIdentity} from './window-identity.js';
import {installWindowProperties,releaseWindowProperties} from './window-properties.js';
import {installWindowFocus} from './window-focus.js';
import {installWindowState} from './window-state.js';
import {childRoot,setWindowOwner,installWindowHierarchy} from './window-hierarchy.js';
import {installWindowCoordinates} from './window-coordinates.js';
import {installRegions} from './regions.js';
import {installSystemColors} from './system-colors.js';
import {ansiDecode} from './memory.js';
import {sbcsTables} from './sbcs-tables.js';
import {checkBuffer} from './files.js';
import {installRectangleDrawing} from './rectangle-drawing.js';
import {installRectangles} from './rectangles.js';
import {installPolyDraw} from './poly-draw.js';
import {installPolygons} from './polygons.js';
import {installFonts} from './fonts.js';
import {installGDIObjects} from './gdi-objects.js';
import {installDCState,dcSelectsObject} from './dc-state.js';
import {RuntimeFault,requireThat} from './errors.js';
const WM_CREATE=1,WM_DESTROY=2,WM_SIZE=5,WM_PAINT=15,WM_CLOSE=16,WM_QUIT=18,WM_COMMAND=0x111;
const windowAnsiBestFit=new Map(sbcsTables[1252].encode[0]);
export class GUI {
  constructor(apis){this.api=apis;this.p=apis.p;this.m=apis.m;this.classes=new Map();this.windows=new Map();this.nextAtom=0xC000;this.stock=new Map();this.focus=0;this.keyChars=new Map();this.nextTimer=1;this.install();}
  window(h){return this.windows.get(h>>>0);}
  serialize(w){return {hwnd:w.hwnd,parent:w.parent,title:w.title,className:w.className,x:w.x,y:w.y,width:w.width,height:w.height,style:w.style,visible:w.visible,enabled:w.enabled,id:w.id};}
  notify(w,op='update'){this.p.emit('window',{op,window:this.serialize(w)});}
  dc(h){return this.p.object(h,'dc');}
  newDC(hwnd){return this.p.handle('dc',{hwnd,clipRegion:null,brushOrgX:0,brushOrgY:0,miterLimitBits:0x41200000,polyFillMode:1,dcPenColor:0,dcBrushColor:0xFFFFFF,textColor:0,background:0xFFFFFF,bkMode:2,x:0,y:0,pen:this.stockObject(7),brush:this.stockObject(0),font:this.stockObject(17),fontSize:16,align:0});}
  draw(hdc,command){const dc=this.dc(hdc);if(!dc)return 0;this.p.emit('draw',{hwnd:dc.hwnd,...command,...(dc.clipRegion?{clip:dc.clipRegion.rect?[[...dc.clipRegion.rect]]:[]}: {})});return 1;}
  drawingObject(dc,handle){const object=this.p.object(handle,'gdi');if(object?.geometric&&dc){const view=new DataView(new ArrayBuffer(4));view.setUint32(0,dc.miterLimitBits,true);const miterLimit=view.getFloat32(0,true);if(object.lineJoin==='miter'&&!Number.isFinite(miterLimit))throw new RuntimeFault('UNSUPPORTED_GDI','Nonfinite geometric miter rendering is not implemented.');return {...object,miterLimit};}return object?.dcColor&&dc?{...object,color:dc[object.dcColor]}:object;}
  stockObject(index){if(this.stock.has(index))return this.stock.get(index);let object;if(index<=5)object={kind:'brush',color:[0xFFFFFF,0xC0C0C0,0x808080,0x404040,0,0][index],null:index===5};else if(index<=8)object={kind:'pen',color:index===6?0xFFFFFF:0,width:1,null:index===8};else if([10,11,12,13,14,16,17].includes(index))object={kind:'font',height:16,face:'Arial',weight:400};else if(index===18)object={kind:'brush',color:0xFFFFFF,dcColor:'dcBrushColor'};else if(index===19)object={kind:'pen',color:0,width:1,dcColor:'dcPenColor'};else return 0;const h=this.p.handle('gdi',{...object,stock:true});this.stock.set(index,h);return h;}
  queuePaint(w){if(!w.paintPending){w.paintPending=true;this.p.postMessage(w.hwnd,WM_PAINT);}}
  msgStruct(address,message){const m=this.m;for(const [i,n]of [message.hwnd,message.message,message.wParam,message.lParam,message.time||0,message.x||0,message.y||0].entries())m.w32(address+i*4,n);}
  readMsg(a){const m=this.m;return {hwnd:m.u32(a),message:m.u32(a+4),wParam:m.u32(a+8),lParam:m.u32(a+12),time:m.u32(a+16)};}
  getMessage(out,hwnd,min,max,remove=true){const q=this.p.messageQueue;const i=q.findIndex(msg=>msg.message===WM_QUIT||((!hwnd||msg.hwnd===hwnd)&&(!min&&!max||msg.message>=min&&msg.message<=max)));if(i<0)return undefined;const msg=q[i];if(remove)q.splice(i,1);this.msgStruct(out,msg);return msg.message===WM_QUIT?0:1;}
  convertString(pointer,fromWide,toWide,temporary){
    if(!pointer||fromWide===toWide)return pointer;
    const value=this.api.str(pointer,fromWide),out=this.p.heap.alloc((value.length+1)*(toWide?2:1));temporary.push(out);
    if(toWide)this.m.string(out,value,true,value.length+1);
    else {for(let i=0;i<value.length;i++)this.m.w8(out+i,windowAnsiBestFit.get(value.charCodeAt(i))??63);this.m.w8(out+value.length,0);}
    return out;
  }
  send(hwnd,msg,wp,lp,wide=false,done=value=>value){
    const w=this.window(hwnd);if(!w)return done(0);
    if(w.proc&&msg===0x0E&&wide!==w.wide){
      const procedureWide=w.wide;
      return this.p.call(w.proc,[hwnd,msg,wp,0],length=>{
        length>>>=0;if(!length||!this.window(hwnd))return done(0);
        requireThat(length<1048576,'STRING_LIMIT','Window text length exceeds the conversion limit.');
        const buffer=this.p.heap.alloc((length+1)*(procedureWide?2:1),true);
        return this.p.call(w.proc,[hwnd,0x0D,length+1,buffer],count=>{
          try {count>>>=0;requireThat(count<=length,'CALLBACK_RESULT','WM_GETTEXT returned a count outside its buffer.');
            // CP1252 and UTF-16 conversion emits one destination unit per source unit.
            return done(count);
          } finally {this.p.heap.free(buffer);}
        });
      });
    }
    if(w.proc&&msg===0x0D&&wide!==w.wide&&lp){
      const capacity=wp>>>0;requireThat(capacity<=1048576,'STRING_LIMIT','Window text buffer exceeds the conversion limit.');
      if(capacity)checkBuffer(this.m,lp,capacity*(wide?2:1));
      const procedureWide=w.wide,procedureCapacity=capacity*(wide?2:1),buffer=this.p.heap.alloc(Math.max(1,procedureCapacity*(procedureWide?2:1)),true);
      return this.p.call(w.proc,[hwnd,msg,procedureCapacity,buffer],result=>{
        try {
          const count=result>>>0;requireThat(count<=Math.max(0,procedureCapacity-1),'CALLBACK_RESULT','WM_GETTEXT returned a count outside its buffer.');
          const copied=Math.min(capacity,count+1);if(copied)checkBuffer(this.m,lp,copied*(wide?2:1));
          for(let i=0;i<copied;i++){
            if(wide)this.m.w16(lp+i*2,ansiDecode(this.m.read(buffer+i,1)).charCodeAt(0));
            else this.m.w8(lp+i,windowAnsiBestFit.get(this.m.u16(buffer+i*2))??63);
          }
          return done(count);
        } finally {this.p.heap.free(buffer);}
      });
    }
    if(w.proc){const temporary=[];if(msg===0x0C)lp=this.convertString(lp,wide,w.wide,temporary);
      return this.p.call(w.proc,[hwnd,msg,wp,lp],result=>{for(const address of temporary)this.p.heap.free(address);return done(result);});}
    return done(this.defWindow(hwnd,msg,wp,lp,wide));
  }
  defWindow(hwnd,msg,wp,lp,wide=false){const w=this.window(hwnd);if(!w)return 0;if(msg===0x81)return 1;if(msg===WM_CLOSE)return this.destroy(hwnd);if(msg===0x0C){w.title=this.api.str(lp,wide);this.notify(w);return 1;}if(msg===0x0D){this.m.string(lp,w.title,wide,wp);return Math.min(w.title.length,Math.max(0,wp-1));}if(msg===0x0E)return w.title.length;if(msg===0x14)return this.eraseBackground(w,wp);if(msg===0x84)return 1;if(msg===WM_PAINT){w.paintPending=false;return 0;}if(msg===0xF5&&w.className.toUpperCase()==='BUTTON'){this.p.postMessage(w.parent,WM_COMMAND,w.id&65535,hwnd);return 0;}if(msg===0x30){w.font=wp;return 0;}return 0;}
  windowExtra(w,index,value){
    if(index+4>w.extraSize)return this.api.fail(1413);
    let old=0;for(let i=0;i<4;i++)old|=(w.extraBytes?.get(index+i)||0)<<(i*8);
    if(value!==undefined){w.extraBytes??=new Map();for(let i=0;i<4;i++)w.extraBytes.set(index+i,(value>>>(i*8))&255);}
    return old>>>0;
  }
  eraseBackground(w,dc){
    const brush=this.classes.get(w.className.toLowerCase())?.background||0;if(!brush)return 0;
    const rect=this.p.heap.alloc(16,true);
    try {if(this.api.lookup('gdi32.dll','GetClipBox').fn(dc,rect))this.api.lookup('user32.dll','FillRect').fn(dc,rect,brush);return 1;}
    finally {this.p.heap.free(rect);}
  }
  destroy(hwnd,done=value=>value,nonclientOnly=false){
    const w=this.window(hwnd);if(!w)return done(this.api.fail(1400));if(w.destroying)return done(0);w.destroying=true;
    const notify=(message,next)=>w.proc?this.p.call(w.proc,[hwnd,message,0,0],next):next();
    const descendants=(child,next)=>{
      const pending=[...this.windows.values()].filter(c=>c.parent===hwnd&&!!(c.style&0x40000000)===child);
      let i=0;const advance=()=>{while(i<pending.length){const c=pending[i++];if(this.window(c.hwnd)&&!c.destroying)return this.destroy(c.hwnd,advance);}return next();};return advance();
    };
    const finish=()=>{
      releaseWindowProperties(this,w);this.windows.delete(hwnd);this.p.releaseHandle(hwnd);if(w.dc)this.p.releaseHandle(w.dc);
      for(const [key,t]of this.p.timers)if(t.hwnd===hwnd)this.p.timers.delete(key);
      if(this.focus===hwnd)this.focus=0;
      this.p.emit('window',{op:'destroy',window:this.serialize(w)});return done(1);
    };
    const children=()=>descendants(true,()=>notify(0x82,finish));
    return descendants(false,()=>nonclientOnly?children():notify(WM_DESTROY,children));
  }
  input(event){const p=this.p,w=this.window(event.hwnd);if(!w)return;
    if(event.kind==='close')p.postMessage(w.hwnd,WM_CLOSE);
    else if(event.kind==='click'){if(w.parent&&w.className.toUpperCase()==='BUTTON')p.postMessage(w.parent,WM_COMMAND,w.id&65535,w.hwnd);}
    else if(event.kind==='edit'){w.title=String(event.text).slice(0,65535);if(w.parent)p.postMessage(w.parent,WM_COMMAND,((0x300<<16)|(w.id&65535))>>>0,w.hwnd);}
    else if(event.kind==='mouse'){const id=event.event==='down'?0x201:event.event==='up'?0x202:0x200,xy=((event.x&65535)|((event.y&65535)<<16))>>>0;p.postMessage(w.hwnd,id,event.buttons||0,xy);}
    else if(event.kind==='key'){const code=event.code>>>0;this.keyChars.set(code,event.char||'');p.postMessage(w.hwnd,event.down?0x100:0x101,code,event.down?1:0xC0000001);}
  }
  install(){const a=this.api,p=this.p,m=this.m;const u=(name,n,fn,cdecl=false)=>a.add('user32.dll',name,n,fn,cdecl);const g=(name,n,fn)=>a.add('gdi32.dll',name,n,fn);
    for(const wide of [false,true]){const suffix=wide?'W':'A',str=pointer=>a.str(pointer,wide);
      for(const extended of [false,true])u('RegisterClass'+(extended?'Ex':'')+suffix,1,pointer=>{const o=extended?4:0;if(extended&&m.u32(pointer)!==48)return a.fail(87);checkBuffer(m,pointer,extended?48:40,'r');if(m.u32(pointer+o)&~0x0803feeb)return a.fail(87);if(m.i32(pointer+o+8)<0||m.i32(pointer+o+12)<0)return a.fail(87);const proc=m.u32(pointer+o+4),name=str(m.u32(pointer+o+36));if(!name)return a.fail(87);if(this.classes.has(name.toLowerCase()))return a.fail(1410);const menu=m.u32(pointer+o+32),menuName=menu>=65536?str(menu):null;const atom=this.nextAtom++;this.classes.set(name.toLowerCase(),{name,atom,proc,style:m.u32(pointer+o),classExtra:m.u32(pointer+o+8),windowExtra:m.u32(pointer+o+12),icon:m.u32(pointer+o+20),cursor:m.u32(pointer+o+24),menu,menuName,smallIcon:extended?m.u32(pointer+44):0,instance:m.u32(pointer+o+16),background:m.u32(pointer+o+28),wide});return atom;});
      u('UnregisterClass'+suffix,2,(name,instance)=>{
        name>>>=0;if(!name)return a.fail(87);
        const atom=name<65536,cls=atom?[...this.classes.values()].find(c=>c.atom===name):this.classes.get(str(name).toLowerCase());
        if(!cls)return a.fail(atom&&name>=0xC000?6:1411);
        if((instance||p.main.base)!==(cls.instance||p.main.base))return a.fail(1411);
        const key=cls.name.toLowerCase();if([...this.windows.values()].some(w=>w.className.toLowerCase()===key))return a.fail(1412);
        this.classes.delete(key);
        for(const pointer of Object.values(cls.menuBuffers||{}))p.heap.free(pointer);
        const background=p.object(cls.background,'gdi');
        if(background?.kind==='brush'&&!background.stock&&!background.system)p.releaseHandle(cls.background);
        return 1;
      });
      u('CreateWindowEx'+suffix,12,(exStyle,className,title,style,x,y,width,height,parent,menu,instance,param)=>{const cls=className<65536?[...this.classes.values()].find(c=>c.atom===className):this.classes.get(str(className).toLowerCase());const name=cls?.name||(className>=65536?str(className):'');if(!cls&&!['BUTTON','STATIC','EDIT'].includes(name.toUpperCase()))return a.fail(1407);
        if(parent&&!this.window(parent))return a.fail(1400);const requestedParent=parent;if(parent&&!(style&0x40000000))parent=childRoot(this,parent);const text=str(title),hwnd=p.handle('window',{});const w={hwnd,instance:instance>>>0,className:name,title:text,parent,id:menu,proc:cls?.proc||0,wide:cls?.wide??wide,style,exStyle,x:x===0x80000000?40:x|0,y:y===0x80000000?40:y|0,width:width===0x80000000?640:Math.max(1,Math.min(1920,width|0)),height:height===0x80000000?420:Math.max(1,Math.min(1080,height|0)),visible:!!(style&0x10000000),enabled:!(style&0x08000000),paintPending:false,extraSize:cls?.windowExtra||0,dc:0};
        w.dc=this.newDC(hwnd);this.windows.set(hwnd,w);this.notify(w,'create');
        const temporary=[];
        const creationString=(pointer,atom=false)=>{
          if(!pointer||wide===w.wide||(atom&&pointer<65536))return pointer;
          return this.convertString(pointer,wide,w.wide,temporary);
        };
        const creationTitle=creationString(title),creationClass=creationString(className,true),cs=p.heap.alloc(48,true);temporary.push(cs);
        [param,instance,menu,requestedParent,w.height,w.width,w.y,w.x,style,creationTitle,creationClass,exStyle].forEach((v,i)=>m.w32(cs+i*4,v));
        const release=()=>{for(const address of temporary)p.heap.free(address);};
        const finish=()=>{release();if(!this.window(hwnd))return 0;if(w.visible)this.queuePaint(w);return hwnd;};
        const reject=nonclientOnly=>{const done=()=>{release();return 0;};return this.window(hwnd)?this.destroy(hwnd,done,nonclientOnly):done();};
        if(!w.proc)return finish();return p.call(w.proc,[hwnd,0x81,0,cs],accepted=>!this.window(hwnd)?reject(true):accepted?p.call(w.proc,[hwnd,WM_CREATE,0,cs],result=>(result>>>0)===0xFFFFFFFF?reject(false):finish()):reject(true));});
      u('DefWindowProc'+suffix,4,(h,msg,wp,lp)=>this.defWindow(h,msg,wp,lp,wide));
      u('CallWindowProc'+suffix,5,(proc,h,msg,wp,lp)=>p.call(proc,[h,msg,wp,lp]));
      u('GetMessage'+suffix,4,(out,hwnd,min,max)=>{if(hwnd&&hwnd!==0xFFFFFFFF&&!this.window(hwnd))return a.fail(1400,0xFFFFFFFF);const result=this.getMessage(out,hwnd,min,max,true);return result!==undefined?result:p.wait(()=>this.getMessage(out,hwnd,min,max,true),'Window messages');});
      u('PeekMessage'+suffix,5,(out,hwnd,min,max,flags)=>{const r=this.getMessage(out,hwnd,min,max,!!(flags&1));return r===undefined?0:1;});
      u('DispatchMessage'+suffix,1,address=>{const msg=this.readMsg(address);if(msg.message===0x113&&msg.lParam)return p.call(msg.lParam,[msg.hwnd,msg.message,msg.wParam,msg.time]);return this.send(msg.hwnd,msg.message,msg.wParam,msg.lParam,wide);});
      u('SendMessage'+suffix,4,(h,msg,wp,lp)=>this.send(h,msg,wp,lp,wide));
      u('PostMessage'+suffix,4,(h,msg,wp,lp)=>{if(h&&!this.window(h))return a.fail(1400);p.postMessage(h,msg,wp,lp);return 1;});
      u('SetWindowText'+suffix,2,(h,text)=>{if(!this.window(h))return a.fail(1400);return this.send(h,0x0C,0,text,wide,result=>result?1:0);});
      u('GetWindowText'+suffix,3,(h,out,n)=>{
        n|=0;if(!out||!n)return 0;
        checkBuffer(m,out,wide?2:1);if(wide)m.w16(out,0);else m.w8(out,0);
        const w=this.window(h);if(!w)return a.fail(1400);if(n<0)return a.fail(0);
        if(!wide&&w.wide&&n===1)p.setError(0);
        return this.send(h,0x0D,n,out,wide);
      });
      u('GetWindowTextLength'+suffix,1,h=>this.window(h)?this.send(h,0x0E,0,0,wide):a.fail(1400));
      u('GetClassName'+suffix,3,(h,out,n)=>{const w=this.window(h);if(!w)return a.fail(1400);m.string(out,w.className,wide,n);return Math.min(w.className.length,Math.max(0,n-1));});
      u('MessageBox'+suffix,4,(hwnd,text,caption,type)=>{const groups={0:[['OK',1]],1:[['OK',1],['Cancel',2]],2:[['Abort',3],['Retry',4],['Ignore',5]],3:[['Yes',6],['No',7],['Cancel',2]],4:[['Yes',6],['No',7]],5:[['Retry',4],['Cancel',2]],6:[['Cancel',2],['Try again',10],['Continue',11]]};const buttons=groups[type&15];if(!buttons)throw new RuntimeFault('UNSUPPORTED_DIALOG','This MessageBox button type is not implemented.');const id=p.nextDialog++;p.emit('dialog',{id,hwnd,text:str(text),caption:str(caption),buttons,flags:type});return p.wait(()=>{if(!p.dialogResults.has(id))return undefined;const value=p.dialogResults.get(id);p.dialogResults.delete(id);return value;},'MessageBox response');});
      u('LoadCursor'+suffix,2,(instance,name)=>name<65536?name:0);u('LoadIcon'+suffix,2,(instance,name)=>name<65536?name:0);
      u('LoadString'+suffix,4,(instance,id,out,capacity)=>{const module=a.module(instance);if(!module)return 0;const r=p.loader.resource(module,6,(id>>>4)+1);if(!r)return 0;let cursor=r.address;for(let i=0;i<(id&15);i++){const n=m.u16(cursor);cursor+=2+n*2;}const length=m.u16(cursor);requireThat(cursor+2+length*2<=r.address+r.size,'PE_RESOURCE','String resource exceeds resource size.');const text=Array.from({length},(_,i)=>String.fromCharCode(m.u16(cursor+2+i*2))).join('');if(!capacity&&wide){m.w32(out,cursor+2);return length;}m.string(out,text,wide,capacity);return Math.min(text.length,Math.max(0,capacity-1));});
      u('GetWindowLong'+suffix,2,(h,index)=>{const w=this.window(h);if(!w)return a.fail(1400);index|=0;if(index>=0)return this.windowExtra(w,index);return index===-4?w.proc:index===-6?w.instance:index===-12?w.id:index===-16?w.style:index===-20?w.exStyle:index===-21?w.userData||0:index===-8?w.parent:a.fail(1413);});
      u('SetWindowLong'+suffix,3,(h,index,value)=>{const w=this.window(h);if(!w)return a.fail(1400);index|=0;if(index>=0)return this.windowExtra(w,index,value);const field=index===-4?'proc':index===-6?'instance':index===-12?'id':index===-16?'style':index===-20?'exStyle':index===-21?'userData':null;if(!field){if(index===-8)return setWindowOwner(this,w,value);return a.fail(1413);}const old=w[field]||0;w[field]=value;if(field==='proc')w.wide=wide;if(field==='style'){w.visible=!!(value&0x10000000);w.enabled=!(value&0x08000000);this.notify(w);}return old;});
      g('TextOut'+suffix,5,(hdc,x,y,text,count)=>{const dc=this.dc(hdc);if(!dc)return 0;requireThat(count<=1024*1024,'STRING_LIMIT','GDI text is too long.');const value=wide?Array.from({length:count},(_,i)=>String.fromCharCode(m.u16(text+i*2))).join(''):ansiDecode(m.read(text,count));const font=p.object(dc.font,'gdi');return this.draw(hdc,{op:'text',x:x|0,y:y|0,text:value,color:dc.textColor,background:dc.background,opaque:dc.bkMode===2,font:{height:Math.abs(font?.height||16),face:font?.face||'Arial',weight:font?.weight||400},align:dc.align});});
      u('DrawText'+suffix,5,(hdc,text,count,rect,format)=>{const dc=this.dc(hdc);if(!dc)return 0;const value=count===0xFFFFFFFF?str(text):wide?Array.from({length:count},(_,i)=>String.fromCharCode(m.u16(text+i*2))).join(''):ansiDecode(m.read(text,count));const font=p.object(dc.font,'gdi'),height=Math.abs(font?.height||16),x=m.i32(rect),y=m.i32(rect+4),width=m.i32(rect+8)-x;if(format&0x400){m.w32(rect+12,y+height);m.w32(rect+8,x+Math.min(width||1e6,Math.ceil(value.length*height*0.6)));return height;}this.draw(hdc,{op:'text',x,y,text:value,color:dc.textColor,background:dc.background,opaque:dc.bkMode===2,font:{height,face:font?.face||'Arial',weight:font?.weight||400},maxWidth:width,align:format&1?6:format&2?2:0});return height;});
      g('GetTextExtentPoint32'+suffix,4,(hdc,text,count,out)=>{const dc=this.dc(hdc);if(!dc)return 0;const font=p.object(dc.font,'gdi'),h=Math.abs(font?.height||16);m.w32(out,Math.ceil(count*h*0.6));m.w32(out+4,h);p.note('Text extents use approximate browser-font metrics; Windows font rasterization is not reproduced exactly.');return 1;});
    }
    u('TranslateMessage',1,address=>{const msg=this.readMsg(address);if(msg.message===0x100){const char=this.keyChars.get(msg.wParam);if(char){for(const c of char)p.postMessage(msg.hwnd,0x102,c.charCodeAt(0),msg.lParam);return 1;}}return 0;});
    u('PostQuitMessage',1,code=>{p.postMessage(0,WM_QUIT,code,0);return 0;});u('DestroyWindow',1,h=>this.destroy(h));
    u('ShowWindow',2,(h,command)=>{const w=this.window(h);if(!w)return 0;const old=w.visible;w.visible=command!==0;w.style=(w.visible?w.style|0x10000000:w.style&~0x10000000)>>>0;this.notify(w);if(w.visible){this.queuePaint(w);p.postMessage(h,WM_SIZE,0,(w.width|(w.height<<16))>>>0);}return old?1:0;});
    u('UpdateWindow',1,h=>{const w=this.window(h);if(!w)return 0;w.paintPending=false;p.messageQueue=p.messageQueue.filter(msg=>!(msg.hwnd===h&&msg.message===WM_PAINT));return w.proc?p.call(w.proc,[h,WM_PAINT,0,0],()=>1):1;});
    u('InvalidateRect',3,(h,rect,erase)=>{const w=this.window(h);if(!w)return 0;this.queuePaint(w);return 1;});u('ValidateRect',2,(h,rect)=>{const w=this.window(h);if(!w)return 0;w.paintPending=false;p.messageQueue=p.messageQueue.filter(msg=>!(msg.hwnd===h&&msg.message===WM_PAINT));return 1;});
    u('BeginPaint',2,(h,ps)=>{const w=this.window(h);if(!w)return 0;m.fill(ps,64);m.w32(ps,w.dc);m.w32(ps+4,1);m.w32(ps+16,w.width);m.w32(ps+20,w.height);w.paintPending=false;return w.dc;});u('EndPaint',2,(h,ps)=>this.window(h)?1:0);
    u('GetDC',1,h=>this.window(h)?.dc||(h===0?this.newDC(0):0));u('GetWindowDC',1,h=>this.window(h)?.dc||0);u('ReleaseDC',2,(h,dc)=>this.dc(dc)?1:0);
    u('AdjustWindowRect',3,(rect,style,menu)=>{if(menu)throw new RuntimeFault('UNSUPPORTED_MENU','Native menus are not implemented.');return 1;});
    u('MoveWindow',6,(h,x,y,width,height,repaint)=>{const w=this.window(h);if(!w)return 0;w.x=x|0;w.y=y|0;w.width=Math.max(1,Math.min(1920,width|0));w.height=Math.max(1,Math.min(1080,height|0));this.notify(w);if(repaint)this.queuePaint(w);return 1;});
    u('IsWindow',1,h=>this.window(h)?1:0);
    u('GetActiveWindow',0,()=>this.focus||[...this.windows.keys()][0]||0);u('SetActiveWindow',1,h=>{const old=this.focus;this.focus=h;return old;});
    u('GetDlgCtrlID',1,h=>this.window(h)?.id||0);u('GetDlgItem',2,(h,id)=>[...this.windows.values()].find(w=>w.parent===h&&w.id===id)?.hwnd||0);
    u('SetCursor',1,cursor=>cursor);u('GetSystemMetrics',1,index=>({0:1280,1:720,2:17,3:17,4:28,5:1,6:1,32:4,33:4,61:1,80:1}[index]??0));installClassQueries(this);installWindowIdentity(this);installWindowProperties(this);installWindowFocus(this);installWindowState(this);installWindowHierarchy(this);installWindowCoordinates(this);installSystemColors(this);installRegions(this);
    u('SetTimer',4,(hwnd,id,period,proc)=>{if(hwnd&&!this.window(hwnd))return 0;if(!id)id=this.nextTimer++;const ms=Math.max(10,period);p.timers.set(hwnd+':'+id,{hwnd,id,period:ms,next:performance.now()+ms,proc});return id;});u('KillTimer',2,(hwnd,id)=>p.timers.delete(hwnd+':'+id)?1:0);
    u('GetMessageTime',0,()=>Math.floor(performance.now()-p.started));
    installRectangles(this.api);
    installRectangleDrawing(this);
    installDCState(this);
    installGDIObjects(this);
    installFonts(this);
    installPolygons(this);
    installPolyDraw(this);
    g('GetStockObject',1,i=>this.stockObject(i));g('CreateSolidBrush',1,color=>p.handle('gdi',{kind:'brush',color}));
    g('SelectObject',2,(hdc,obj)=>{const dc=this.dc(hdc),object=p.object(obj,'gdi');if(!dc||!object)return 0;if(object.kind==='region')return a.lookup('gdi32.dll','SelectClipRgn').fn(hdc,obj);const old=dc[object.kind];dc[object.kind]=obj;return old||0;});
    g('DeleteObject',1,h=>{const obj=p.object(h,'gdi');if(obj?.system)return 1;if(!obj||obj.stock)return 0;if([...p.handles.values()].some(dc=>dc.type==='dc'&&dcSelectsObject(dc,h)))return 0;p.releaseHandle(h);return 1;});
    g('SetTextColor',2,(hdc,color)=>{const dc=this.dc(hdc);if(!dc)return 0xFFFFFFFF;const old=dc.textColor;dc.textColor=color;return old;});g('SetBkColor',2,(hdc,color)=>{const dc=this.dc(hdc);if(!dc)return 0xFFFFFFFF;const old=dc.background;dc.background=color;return old;});g('SetBkMode',2,(hdc,mode)=>{const dc=this.dc(hdc);if(!dc||![1,2].includes(mode))return 0;const old=dc.bkMode;dc.bkMode=mode;return old;});g('SetTextAlign',2,(hdc,align)=>{const dc=this.dc(hdc);if(!dc)return 0xFFFFFFFF;const old=dc.align;dc.align=align;return old;});
    for(const [name,op,n]of [['Rectangle','rectangle',5],['Ellipse','ellipse',5],['RoundRect','roundrect',7]])g(name,n,(hdc,left,top,right,bottom,rx=12,ry=12)=>{const dc=this.dc(hdc);if(!dc)return 0;return this.draw(hdc,{op,x:left|0,y:top|0,width:(right-left)|0,height:(bottom-top)|0,rx,ry,pen:this.drawingObject(dc,dc.pen),brush:this.drawingObject(dc,dc.brush)});});
    g('MoveToEx',4,(hdc,x,y,old)=>{const dc=this.dc(hdc);if(!dc)return 0;if(old){m.w32(old,dc.x);m.w32(old+4,dc.y);}dc.x=x|0;dc.y=y|0;return 1;});
    g('LineTo',3,(hdc,x,y)=>{const dc=this.dc(hdc);if(!dc)return 0;this.draw(hdc,{op:'line',x:dc.x,y:dc.y,x2:x|0,y2:y|0,pen:this.drawingObject(dc,dc.pen)});dc.x=x|0;dc.y=y|0;return 1;});
    g('SetPixel',4,(hdc,x,y,color)=>this.draw(hdc,{op:'fill',x:x|0,y:y|0,width:1,height:1,color})?color:0xFFFFFFFF);
    g('GetDeviceCaps',2,(hdc,index)=>({8:1280,10:720,12:32,14:1,88:96,90:96,38:1}[index]??0));
    g('StretchDIBits',13,(hdc,x,y,w,h,sx,sy,sw,sh,bits,info,usage,rop)=>{if(rop!==0x00CC0020||usage!==0)throw new RuntimeFault('UNSUPPORTED_GDI','StretchDIBits currently supports SRCCOPY and RGB colour tables only.');return this.dib(hdc,{x:x|0,y:y|0,width:w|0,height:h|0,sourceX:sx|0,sourceY:sy|0,sourceWidth:sw|0,sourceHeight:sh|0},bits,info);});
    g('SetDIBitsToDevice',12,(hdc,x,y,w,h,sx,sy,start,lines,bits,info,usage)=>{if(start!==0||lines!==Math.abs(m.i32(info+8))||usage)throw new RuntimeFault('UNSUPPORTED_GDI','Partial-scanline DIB uploads are not implemented.');return this.dib(hdc,{x:x|0,y:y|0,width:w|0,height:h|0,sourceX:sx|0,sourceY:sy|0,sourceWidth:w|0,sourceHeight:h|0},bits,info);});
  }
  dib(hdc,rect,bits,info){const m=this.m;requireThat(m.u32(info)>=40,'GDI_BITMAP','BITMAPINFOHEADER is too small.');const width=m.i32(info+4),signedHeight=m.i32(info+8),height=Math.abs(signedHeight),depth=m.u16(info+14),compression=m.u32(info+16);requireThat(width>0&&height>0&&width*height<=16*1024*1024,'GDI_BITMAP','Bitmap dimensions exceed limits.');requireThat([24,32].includes(depth)&&compression===0&&m.u16(info+12)===1,'UNSUPPORTED_GDI','Only uncompressed 24/32-bit RGB DIBs are implemented.');const stride=Math.ceil(width*depth/32)*4,data=m.read(bits,stride*height),rgba=new Uint8Array(width*height*4);for(let y=0;y<height;y++){const sy=signedHeight>0?height-1-y:y;for(let x=0;x<width;x++){const a=sy*stride+x*(depth/8),b=(y*width+x)*4;rgba[b]=data[a+2];rgba[b+1]=data[a+1];rgba[b+2]=data[a];rgba[b+3]=255;}}
    if(signedHeight>0)rect.sourceY=height-rect.sourceY-Math.abs(rect.sourceHeight);this.draw(hdc,{op:'pixels',...rect,pixelWidth:width,pixelHeight:height,rgba});return height;}
}

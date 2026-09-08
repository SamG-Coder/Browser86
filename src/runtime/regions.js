import {checkBuffer} from './files.js';
const normalize=(l,t,r,b)=>l===r||t===b?null:[Math.min(l,r),Math.min(t,b),Math.max(l,r),Math.max(t,b)];
const inRange=values=>values.every(n=>n>=-0x8000000&&n<0x8000000);
export function installRegions(gui){
 const {p,m,api}=gui,g=(n,c,f)=>api.add('gdi32.dll',n,c,f),region=h=>{const o=p.object(h,'gdi');return o?.kind==='region'?o:null;};
 const create=(...values)=>{values=values.map(n=>n|0);if(!inRange(values))return api.fail(87);return p.handle('gdi',{kind:'region',rect:normalize(...values)});};
 const visible=dc=>{
  const w=gui.window(dc.hwnd),surface=[0,0,w?.width??1280,w?.height??720];if(!dc.clipRegion)return surface;const r=dc.clipRegion.rect;if(!r)return null;
  const box=[Math.max(0,r[0]),Math.max(0,r[1]),Math.min(surface[2],r[2]),Math.min(surface[3],r[3])];return box[0]<box[2]&&box[1]<box[3]?box:null;
 };
 g('GetClipBox',2,(h,out)=>{const dc=gui.dc(h);if(!dc)return api.fail(6);if(!out)return 0;const r=visible(dc);checkBuffer(m,out,16);(r||[0,0,0,0]).forEach((n,i)=>m.w32(out+4*i,n));return r?2:1;});
 g('PtVisible',3,(h,x,y)=>{const dc=gui.dc(h);if(!dc)return api.fail(6,-1);const r=visible(dc);x|=0;y|=0;return r&&x>=r[0]&&x<r[2]&&y>=r[1]&&y<r[3]?1:0;});
 g('RectVisible',2,(h,input)=>{
  if(!input)return 0;const dc=gui.dc(h);if(!dc)return api.fail(6,-1);checkBuffer(m,input,16,'r');const r=visible(dc);if(!r)return 0;
  const [l,t,right,bottom]=[0,4,8,12].map(i=>m.i32(input+i));return Math.min(l,right)<r[2]&&Math.max(l,right)>r[0]&&Math.min(t,bottom)<r[3]&&Math.max(t,bottom)>r[1]?1:0;
 });
 g('SelectClipRgn',2,(h,r)=>{
  const dc=gui.dc(h);if(!dc)return api.fail(6);if(!r){dc.clipRegion=null;return 2;}const o=region(r);if(!o)return 0;
  dc.clipRegion={rect:o.rect?[...o.rect]:null};return visible(dc)?2:1;
 });
 g('IntersectClipRect',5,(h,l,t,r,b)=>{
  const dc=gui.dc(h);if(!dc)return api.fail(6);const values=[l,t,r,b].map(n=>n|0);if(!inRange(values))return api.fail(87);
  let rect=normalize(...values);if(dc.clipRegion){const old=dc.clipRegion.rect;if(!old||!rect)rect=null;else{const next=[Math.max(old[0],rect[0]),Math.max(old[1],rect[1]),Math.min(old[2],rect[2]),Math.min(old[3],rect[3])];rect=next[0]<next[2]&&next[1]<next[3]?next:null;}}
  dc.clipRegion={rect};return rect?2:1;
 });
 g('GetClipRgn',2,(h,r)=>{
  const dc=gui.dc(h);if(!dc)return api.fail(r?87:6,-1);const o=region(r);if(!o)return -1;if(!dc.clipRegion)return 0;
  o.rect=dc.clipRegion.rect?[...dc.clipRegion.rect]:null;return 1;
 });
 g('OffsetClipRgn',3,(h,x,y)=>{
  const dc=gui.dc(h);if(!dc)return api.fail(6);if(!dc.clipRegion)return 2;const old=dc.clipRegion.rect;if(!old)return 1;
  x|=0;y|=0;const rect=old.map((n,i)=>n+(i%2?y:x));if(!inRange(rect))return api.fail(1003);dc.clipRegion={rect};return 2;
 });
 const fill=(dcHandle,regionHandle,brushHandle)=>{
  if(!brushHandle)return 0;const dc=gui.dc(dcHandle);if(!dc)return api.fail(6);const o=region(regionHandle);if(!o)return 0;if(!o.rect)return 1;
  const brush=p.object(brushHandle,'gdi');if(!brush||!['brush','pen'].includes(brush.kind)||brush.null)return 0;
  const [l,t,r,b]=o.rect;gui.draw(dcHandle,{op:'fill',x:l,y:t,width:r-l,height:b-t,color:brush.dcColor?dc[brush.dcColor]:brush.color});return 1;
 };
 g('FillRgn',3,fill);
 g('InvertRgn',2,(dcHandle,regionHandle)=>{
  const o=region(regionHandle);if(!o)return 0;if(!gui.dc(dcHandle))return api.fail(6);if(!o.rect)return 1;
  const [l,t,r,b]=o.rect;gui.draw(dcHandle,{op:'invert',x:l,y:t,width:r-l,height:b-t});return 1;
 });
 g('FrameRgn',5,(dcHandle,regionHandle,brushHandle,w,h)=>{
  w=Math.abs(w|0);h=Math.abs(h|0);if(!w||!h||w===0x80000000||h===0x80000000||!brushHandle)return 0;
  const dc=gui.dc(dcHandle);if(!dc)return api.fail(6);const o=region(regionHandle);if(!o)return 0;if(!o.rect)return 1;
  const brush=p.object(brushHandle,'gdi');if(!brush||!['brush','pen'].includes(brush.kind)||brush.null)return 0;
  const [l,t,r,b]=o.rect,width=r-l,height=b-t,color=brush.dcColor?dc[brush.dcColor]:brush.color;
  const paint=(x,y,width,height)=>gui.draw(dcHandle,{op:'fill',x,y,width,height,color});
  if(w*2>=width||h*2>=height)paint(l,t,width,height);
  else{paint(l,t,width,h);paint(l,b-h,width,h);paint(l,t+h,w,height-2*h);paint(r-w,t+h,w,height-2*h);}return 1;
 });
 g('PaintRgn',2,(h,r)=>{const dc=gui.dc(h);return dc?fill(h,r,dc.brush):api.fail(6);});
 g('CreateRectRgn',4,create);
 g('CreateRectRgnIndirect',1,input=>{checkBuffer(m,input,16,'r');return create(...[0,4,8,12].map(i=>m.i32(input+i)));});
 g('SetRectRgn',5,(h,l,t,r,b)=>{const o=region(h);if(!o)return 0;o.rect=normalize(l|0,t|0,r|0,b|0);return 1;});
 g('GetRgnBox',2,(h,out)=>{const o=region(h);if(!o)return 0;checkBuffer(m,out,16);(o.rect||[0,0,0,0]).forEach((n,i)=>m.w32(out+4*i,n));return o.rect?2:1;});
 g('GetRegionData',3,(h,count,out)=>{
  const o=region(h);if(!o)return api.fail(6);const r=o.rect,size=r?48:32;if(!out)return size;if((count>>>0)<size)return api.fail(87);
  checkBuffer(m,out,size);const data=r?[32,1,1,16,...r,...r]:[32,1,0,0,0,0,0,0];data.forEach((n,i)=>m.w32(out+4*i,n));return size;
 });
 g('PtInRegion',3,(h,x,y)=>{const o=region(h);if(!o)return api.fail(6);x|=0;y|=0;const r=o.rect;return r&&x>=r[0]&&x<r[2]&&y>=r[1]&&y<r[3]?1:0;});
 g('RectInRegion',2,(h,input)=>{
  const o=region(h),r=o?.rect;if(!r)return 0;checkBuffer(m,input,16,'r');
  const [l,t,right,bottom]=[0,4,8,12].map(i=>m.i32(input+i)),q=[Math.min(l,right),Math.min(t,bottom),Math.max(l,right),Math.max(t,bottom)];
  // Native rectangular regions accept contained degenerate queries, including boundary points.
  const contained=q[0]>=r[0]&&q[1]>=r[1]&&q[2]<=r[2]&&q[3]<=r[3];
  const overlap=q[0]<r[2]&&q[1]<r[3]&&q[2]>r[0]&&q[3]>r[1];return contained||overlap?1:0;
 });
 g('EqualRgn',2,(a,b)=>{a=region(a);b=region(b);if(!a||!b)return 0;return a.rect===null||b.rect===null?(a.rect===b.rect?1:0):(a.rect.every((n,i)=>n===b.rect[i])?1:0);});
 g('OffsetRgn',3,(h,x,y)=>{const o=region(h);if(!o)return 0;if(!o.rect)return 1;x|=0;y|=0;const next=o.rect.map((n,i)=>n+(i%2?y:x));if(!inRange(next))return 0;o.rect=next;return 2;});
}

import {checkBuffer} from './files.js';
const normalize=(l,t,r,b)=>l===r||t===b?null:[Math.min(l,r),Math.min(t,b),Math.max(l,r),Math.max(t,b)];
const inRange=values=>values.every(n=>n>=-0x8000000&&n<0x8000000);
export function installRegions(gui){
 const {p,m,api}=gui,g=(n,c,f)=>api.add('gdi32.dll',n,c,f),region=h=>{const o=p.object(h,'gdi');return o?.kind==='region'?o:null;};
 const create=(...values)=>{values=values.map(n=>n|0);if(!inRange(values))return api.fail(87);return p.handle('gdi',{kind:'region',rect:normalize(...values)});};
 g('CreateRectRgn',4,create);
 g('CreateRectRgnIndirect',1,input=>{checkBuffer(m,input,16,'r');return create(...[0,4,8,12].map(i=>m.i32(input+i)));});
 g('SetRectRgn',5,(h,l,t,r,b)=>{const o=region(h);if(!o)return 0;o.rect=normalize(l|0,t|0,r|0,b|0);return 1;});
 g('GetRgnBox',2,(h,out)=>{const o=region(h);if(!o)return 0;checkBuffer(m,out,16);(o.rect||[0,0,0,0]).forEach((n,i)=>m.w32(out+4*i,n));return o.rect?2:1;});
 g('PtInRegion',3,(h,x,y)=>{const o=region(h);if(!o)return api.fail(6);x|=0;y|=0;const r=o.rect;return r&&x>=r[0]&&x<r[2]&&y>=r[1]&&y<r[3]?1:0;});
 g('EqualRgn',2,(a,b)=>{a=region(a);b=region(b);if(!a||!b)return 0;return a.rect===null||b.rect===null?(a.rect===b.rect?1:0):(a.rect.every((n,i)=>n===b.rect[i])?1:0);});
 g('OffsetRgn',3,(h,x,y)=>{const o=region(h);if(!o)return 0;if(!o.rect)return 1;x|=0;y|=0;const next=o.rect.map((n,i)=>n+(i%2?y:x));if(!inRange(next))return 0;o.rect=next;return 2;});
}

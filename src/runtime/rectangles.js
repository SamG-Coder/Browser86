import {checkBuffer} from './files.js';
const empty=r=>r[0]>=r[2]||r[1]>=r[3];
const intersect=(a,b)=>{const r=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];return empty(r)?null:r;};
export function installRectangles(api){
  const m=api.m,u=(name,n,fn)=>api.add('user32.dll',name,n,fn);
  const read=p=>{checkBuffer(m,p,16,'r');return [0,4,8,12].map(i=>m.i32(p+i));};
  const write=(p,r)=>{checkBuffer(m,p,16);r.forEach((v,i)=>m.w32(p+i*4,v));};
  u('SetRect',5,(p,l,t,r,b)=>{if(!p)return 0;write(p,[l,t,r,b]);return 1;});
  u('SetRectEmpty',1,p=>{if(!p)return 0;write(p,[0,0,0,0]);return 1;});
  u('CopyRect',2,(dst,src)=>{if(!dst||!src)return 0;write(dst,read(src));return 1;});
  u('EqualRect',2,(a,b)=>{if(!a||!b)return 0;const x=read(a),y=read(b);return x.every((v,i)=>v===y[i])?1:0;});
  u('IsRectEmpty',1,p=>!p||empty(read(p))?1:0);
  // POINT is passed by value and occupies two x86 stack slots.
  u('PtInRect',3,(p,x,y)=>{if(!p)return 0;const r=read(p);x|=0;y|=0;return x>=r[0]&&x<r[2]&&y>=r[1]&&y<r[3]?1:0;});
  for(const inflate of [false,true])u(inflate?'InflateRect':'OffsetRect',3,(p,x,y)=>{
    if(!p)return 0;const r=read(p);x|=0;y|=0;write(p,[r[0]+(inflate?-x:x),r[1]+(inflate?-y:y),r[2]+x,r[3]+y]);return 1;
  });
  for(const mode of ['Intersect','Union','Subtract'])u(mode+'Rect',3,(dst,pa,pb)=>{
    if(!dst||!pa||!pb)return 0;const a=read(pa),b=read(pb),overlap=intersect(a,b);let r;
    if(mode==='Intersect')r=overlap||[0,0,0,0];
    else if(mode==='Union')r=empty(a)?(empty(b)?[0,0,0,0]:b):empty(b)?a:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
    else{
      r=[...a];if(overlap){
        if(overlap.every((v,i)=>v===a[i]))r=[0,0,0,0];
        else if(overlap[0]===a[0]&&overlap[2]===a[2]){if(overlap[1]===a[1])r[1]=overlap[3];else if(overlap[3]===a[3])r[3]=overlap[1];}
        else if(overlap[1]===a[1]&&overlap[3]===a[3]){if(overlap[0]===a[0])r[0]=overlap[2];else if(overlap[2]===a[2])r[2]=overlap[0];}
      }
    }
    write(dst,r);return empty(r)?0:1;
  });
}

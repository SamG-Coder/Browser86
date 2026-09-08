import {requireThat} from './errors.js';

export function bitmapPixels(m,image){
  if(image.rgba)return image.rgba.slice();
  const {width,height,depth,stride,scan0,palette}=image,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){const row=image.data?image.data.subarray(y*stride,(y+1)*stride):m.read(scan0+y*stride,Math.ceil(width*depth/8));for(let x=0;x<width;x++){
    const dest=(y*width+x)*4;let color;
    if(depth<=8){const index=depth===8?row[x]:depth===4?(row[x>>>1]>>>((1-(x&1))*4))&15:(row[x>>>3]>>>(7-(x&7)))&1;color=palette[index]??0xff000000;}
    else{const offset=x*(depth/8);color=((image.alpha?row[offset+3]:255)<<24)|(row[offset+2]<<16)|(row[offset+1]<<8)|row[offset];}
    rgba[dest]=(color>>>16)&255;rgba[dest+1]=(color>>>8)&255;rgba[dest+2]=color&255;rgba[dest+3]=color>>>24;
  }}return rgba;
}
function snapshot(m,image){
  if(image.rgba)return {...image,rgba:image.rgba.slice(),palette:[...image.palette]};
  const stride=Math.ceil(image.width*image.depth/8),data=new Uint8Array(stride*image.height);
  for(let y=0;y<image.height;y++)data.set(image.data?image.data.subarray(y*image.stride,y*image.stride+stride):m.read(image.scan0+y*image.stride,stride),y*stride);
  return {...image,scan0:0,stride,data,palette:[...image.palette]};
}
export function installGDIPlusBitmaps(api){
  const p=api.p,m=api.m,g=(n,a,f)=>api.add('gdiplus.dll',n,a,f);
  const dimensions=(w,h)=>w>0&&h>0&&w*h<=16*1024*1024;
  const create=(out,image)=>{m.w32(out,p.handle('gdiplus-image',image));return 0;};
  g('GdipCreateBitmapFromGdiDib',3,(info,bits,out)=>{
    if(!info||!bits||!out)return 2;const size=m.u32(info),width=m.i32(info+4),signedHeight=m.i32(info+8),height=Math.abs(signedHeight),depth=m.u16(info+14);
    if(size<40||!dimensions(width,height)||m.u16(info+12)!==1)return 2;
    requireThat(m.u32(info+16)===0&&[1,4,8,24,32].includes(depth),'GDIPLUS_BITMAP','Only uncompressed indexed/RGB DIBs are implemented.');
    const stride=Math.ceil(width*depth/32)*4,palette=[];
    if(depth<=8){const count=m.u32(info+32)||1<<depth;if(count>1<<depth)return 2;for(let i=0;i<count;i++)palette.push((m.u32(info+size+i*4)|0xff000000)>>>0);}
    const image={width,height,depth,palette,stride:signedHeight>0?-stride:stride,scan0:signedHeight>0?bits+(height-1)*stride:bits};
    return create(out,snapshot(m,image));
  });
  g('GdipCreateBitmapFromScan0',6,(width,height,stride,format,scan0,out)=>{
    width|=0;height|=0;stride|=0;const depth=(format>>>8)&255;
    if(!out||!dimensions(width,height))return 2;
    requireThat([1,4,8,24,32].includes(depth)&&!(format&0x80000),'GDIPLUS_BITMAP','Unsupported GDI+ pixel format.');
    if(scan0&&(!stride||stride%4||Math.abs(stride)<Math.ceil(width*depth/8)))return 2;
    const palette=Array.from({length:depth<=8?1<<depth:0},(_,i)=>0xff000000|Math.round(i*255/((1<<depth)-1))*0x10101);
    if(!scan0){stride=Math.ceil(width*depth/32)*4;return create(out,{width,height,depth,palette,stride,data:new Uint8Array(stride*height),alpha:!!(format&0x40000)});}
    return create(out,{width,height,depth,palette,stride,scan0,alpha:!!(format&0x40000)});
  });
  g('GdipSetImagePalette',2,(handle,address)=>{const image=p.object(handle,'gdiplus-image');if(!image||!address)return 2;const count=m.u32(address+4);if(image.depth>8||count>1<<image.depth)return 2;image.palette=Array.from({length:count},(_,i)=>m.u32(address+8+i*4));return 0;});
  g('GdipCloneImage',2,(handle,out)=>{const image=p.object(handle,'gdiplus-image');if(!image||!out)return 2;return create(out,snapshot(m,image));});
  g('GdipDisposeImage',1,handle=>{if(!p.object(handle,'gdiplus-image'))return 2;p.releaseHandle(handle);return 0;});
}

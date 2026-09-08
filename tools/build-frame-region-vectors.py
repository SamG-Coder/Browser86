"""Record rectangular FrameRgn raster coverage on an owned offscreen bitmap."""
import ctypes as c
import json
from pathlib import Path
G=c.WinDLL('gdi32',use_last_error=True);U=c.WinDLL('user32')
for name,args in [('CreateCompatibleDC',[c.c_void_p]),('CreateBitmap',[c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p]),('CreateRectRgn',[c.c_int]*4),('GetStockObject',[c.c_int]),('SelectObject',[c.c_void_p,c.c_void_p])]:
    f=getattr(G,name);f.argtypes=args;f.restype=c.c_void_p
G.FrameRgn.argtypes=[c.c_void_p]*3+[c.c_int]*2
G.GetPixel.argtypes=[c.c_void_p,c.c_int,c.c_int];G.GetPixel.restype=c.c_uint
G.DeleteObject.argtypes=[c.c_void_p];G.DeleteDC.argtypes=[c.c_void_p];U.FillRect.argtypes=[c.c_void_p]*3
dc=G.CreateCompatibleDC(None);bitmap=G.CreateBitmap(8,8,1,32,None);assert dc and bitmap
old=G.SelectObject(dc,bitmap);results=[]
try:
    for bounds in [(1,1,7,7),(7,7,1,1),(1,1,2,6),(1,1,1,7)]:
        region=G.CreateRectRgn(*bounds);assert region
        try:
            for width in [-2,-1,0,1,2,3,9]:
                for height in [-2,-1,0,1,2,3,9]:
                    U.FillRect(dc,(c.c_int*4)(0,0,8,8),G.GetStockObject(0));c.set_last_error(1234)
                    result=G.FrameRgn(dc,region,G.GetStockObject(4),width,height);error=c.get_last_error()
                    pixels=[y*8+x for y in range(8) for x in range(8) if G.GetPixel(dc,x,y)==0]
                    results.append(dict(bounds=bounds,width=width,height=height,result=result,error=error,pixels=pixels))
        finally:G.DeleteObject(region)
finally:G.SelectObject(dc,old);G.DeleteDC(dc);G.DeleteObject(bitmap)
Path('tests/frame-region-vectors.json').write_text(json.dumps(results,separators=(',',':'))+'\n')
print(f'Recorded {len(results)} native frames; owned GDI resources released.')

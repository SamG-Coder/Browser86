"""Record native rectangle brush raster coverage on an owned offscreen bitmap."""
import ctypes as c
import json
from pathlib import Path
G=c.WinDLL('gdi32',use_last_error=True)
U=c.WinDLL('user32',use_last_error=True)
for name,args in [('CreateCompatibleDC',[c.c_void_p]),('CreateBitmap',[c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p]),('GetStockObject',[c.c_int]),('SelectObject',[c.c_void_p,c.c_void_p]),('CreateSolidBrush',[c.c_uint])]:
    f=getattr(G,name);f.argtypes=args;f.restype=c.c_void_p
G.GetPixel.argtypes=[c.c_void_p,c.c_int,c.c_int];G.GetPixel.restype=c.c_uint
G.DeleteObject.argtypes=[c.c_void_p];G.DeleteDC.argtypes=[c.c_void_p]
for name in ['FillRect','FrameRect']:getattr(U,name).argtypes=[c.c_void_p,c.c_void_p,c.c_void_p]
dc=G.CreateCompatibleDC(None);bitmap=G.CreateBitmap(8,8,1,32,None)
old=G.SelectObject(dc,bitmap);brush=G.CreateSolidBrush(255);results=[]
try:
    for name in ['FillRect','FrameRect']:
        for right in range(1,7):
            for bottom in range(1,7):
                rect=[2,2,right,bottom]
                U.FillRect(dc,(c.c_int*4)(0,0,8,8),G.GetStockObject(0))
                c.set_last_error(1234)
                result=getattr(U,name)(dc,(c.c_int*4)(*rect),brush)
                error=c.get_last_error()
                pixels=[y*8+x for y in range(8) for x in range(8) if G.GetPixel(dc,x,y)==255]
                results.append(dict(name=name,rect=rect,result=result,error=error,pixels=pixels))
finally:
    G.SelectObject(dc,old);G.DeleteDC(dc);G.DeleteObject(bitmap);G.DeleteObject(brush)
Path('tests/gdi-rect-vectors.json').write_text(json.dumps(results,separators=(',',':'))+'\n')
print(f'Recorded {len(results)} native cases; owned GDI resources released.')

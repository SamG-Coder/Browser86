"""Record native wide dash pen descriptions and centerline coverage on an owned bitmap."""
import ctypes as c
import json
from pathlib import Path
G=c.WinDLL('gdi32',use_last_error=True)
U=c.WinDLL('user32',use_last_error=True)
for name,args in [('CreateCompatibleDC',[c.c_void_p]),('CreateBitmap',[c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p]),('GetStockObject',[c.c_int]),('SelectObject',[c.c_void_p,c.c_void_p]),('CreatePen',[c.c_int,c.c_int,c.c_uint32])]:
    f=getattr(G,name);f.argtypes=args;f.restype=c.c_void_p
G.GetObjectW.argtypes=[c.c_void_p,c.c_int,c.c_void_p]
G.GetPixel.argtypes=[c.c_void_p,c.c_int,c.c_int];G.GetPixel.restype=c.c_uint
G.MoveToEx.argtypes=[c.c_void_p,c.c_int,c.c_int,c.c_void_p]
G.LineTo.argtypes=[c.c_void_p,c.c_int,c.c_int]
G.DeleteObject.argtypes=[c.c_void_p];G.DeleteDC.argtypes=[c.c_void_p]
U.FillRect.argtypes=[c.c_void_p,c.c_void_p,c.c_void_p]
dc=G.CreateCompatibleDC(None);bitmap=G.CreateBitmap(32,16,1,32,None)
assert dc and bitmap
old_bitmap=G.SelectObject(dc,bitmap);results=[]
try:
    for style in range(1,5):
        for width in [-3,-2,2,3,8]:
            c.set_last_error(1234);pen=G.CreatePen(style,width,0x123456);error=c.get_last_error();assert pen
            old_pen=None
            try:
                out=c.create_string_buffer(512);size=G.GetObjectW(pen,16,out)
                description=list((c.c_uint32*4).from_buffer(out))
                U.FillRect(dc,(c.c_int*4)(0,0,32,16),G.GetStockObject(0))
                old_pen=G.SelectObject(dc,pen);assert old_pen
                assert G.MoveToEx(dc,3,8,None) and G.LineTo(dc,29,8)
                pixels=[G.GetPixel(dc,x,8) for x in range(4,28)]
                results.append(dict(style=style,width=width,error=error,size=size,description=description,pixels=pixels))
            finally:
                if old_pen:G.SelectObject(dc,old_pen)
                G.DeleteObject(pen)
finally:
    G.SelectObject(dc,old_bitmap);G.DeleteDC(dc);G.DeleteObject(bitmap)
Path('tests/wide-pen-vectors.json').write_text(json.dumps(results,separators=(',',':'))+'\n')
print(f'Recorded {len(results)} native cases; owned GDI resources released.')

"""Record RGB inversion on an owned 32-bit offscreen bitmap."""
import ctypes as c
import json
from pathlib import Path
G=c.WinDLL('gdi32');U=c.WinDLL('user32')
for n,args in [('CreateCompatibleDC',[c.c_void_p]),('CreateBitmap',[c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p]),('CreateRectRgn',[c.c_int]*4),('CreateSolidBrush',[c.c_uint]),('SelectObject',[c.c_void_p,c.c_void_p])]:
    f=getattr(G,n);f.argtypes=args;f.restype=c.c_void_p
U.InvertRect.argtypes=[c.c_void_p]*2;G.GetPixel.argtypes=[c.c_void_p,c.c_int,c.c_int];G.GetPixel.restype=c.c_uint
G.DeleteObject.argtypes=[c.c_void_p];G.DeleteDC.argtypes=[c.c_void_p];U.FillRect.argtypes=[c.c_void_p]*3
dc=G.CreateCompatibleDC(None);bm=G.CreateBitmap(8,8,1,32,None);assert dc and bm
old=G.SelectObject(dc,bm);region=G.CreateRectRgn(1,1,7,7);results=[]
try:
    brush=G.CreateSolidBrush(0)
    for axis in [0,1]:
        for a in [-2147483648,-1,0,7,2147483647]:
            for b in [-2147483648,-1,0,7,2147483647]:
                rect=[a,1,b,7] if axis==0 else [1,a,7,b]
                U.FillRect(dc,(c.c_int*4)(0,0,8,8),brush);result=U.InvertRect(dc,(c.c_int*4)(*rect))
                pixels=[G.GetPixel(dc,x,y) for y in range(8) for x in range(8)]
                results.append(dict(rect=rect,result=result,pixels=pixels))
finally:G.SelectObject(dc,old);G.DeleteDC(dc);G.DeleteObject(bm);G.DeleteObject(region);G.DeleteObject(brush)
Path('tests/invert-rect-extreme-vectors.json').write_text(json.dumps(results,separators=(',',':'))+'\n')
print('Recorded 50 native extreme-coordinate rectangle masks; owned resources released.')

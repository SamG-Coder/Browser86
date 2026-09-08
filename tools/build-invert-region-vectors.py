"""Record RGB inversion on an owned 32-bit offscreen bitmap."""
import ctypes as c
import json
from pathlib import Path
G=c.WinDLL('gdi32');U=c.WinDLL('user32')
for n,args in [('CreateCompatibleDC',[c.c_void_p]),('CreateBitmap',[c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p]),('CreateRectRgn',[c.c_int]*4),('CreateSolidBrush',[c.c_uint]),('SelectObject',[c.c_void_p,c.c_void_p])]:
    f=getattr(G,n);f.argtypes=args;f.restype=c.c_void_p
G.InvertRgn.argtypes=[c.c_void_p]*2;G.GetPixel.argtypes=[c.c_void_p,c.c_int,c.c_int];G.GetPixel.restype=c.c_uint
G.DeleteObject.argtypes=[c.c_void_p];G.DeleteDC.argtypes=[c.c_void_p];U.FillRect.argtypes=[c.c_void_p]*3
dc=G.CreateCompatibleDC(None);bm=G.CreateBitmap(8,8,1,32,None);assert dc and bm
old=G.SelectObject(dc,bm);region=G.CreateRectRgn(1,1,7,7);results=[]
try:
    for color in [0,0xffffff,0x123456,0xff0080,0x808080]:
        brush=G.CreateSolidBrush(color)
        try:
            U.FillRect(dc,(c.c_int*4)(0,0,8,8),brush);assert G.InvertRgn(dc,region)
            pixels=[G.GetPixel(dc,x,y) for y in range(8) for x in range(8)]
            assert G.InvertRgn(dc,region)
            restored=[G.GetPixel(dc,x,y) for y in range(8) for x in range(8)]
            results.append(dict(color=color,pixels=pixels,restored=restored))
        finally:G.DeleteObject(brush)
finally:G.SelectObject(dc,old);G.DeleteDC(dc);G.DeleteObject(bm);G.DeleteObject(region)
Path('tests/invert-region-vectors.json').write_text(json.dumps(results,separators=(',',':'))+'\n')
print('Recorded five native RGB inversion/restore cases; owned resources released.')

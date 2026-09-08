"""Capture CP1252 GetObjectA conversion of every UTF-16 code unit in font names."""
import ctypes as c
from pathlib import Path
G=c.WinDLL('gdi32',use_last_error=True)
K=c.WinDLL('kernel32',use_last_error=True)
if K.GetACP()!=1252:raise RuntimeError('This reference profile requires native ACP 1252.')
G.CreateFontIndirectW.argtypes=[c.c_void_p];G.CreateFontIndirectW.restype=c.c_void_p
G.GetObjectA.argtypes=[c.c_void_p,c.c_int,c.c_void_p]
G.DeleteObject.argtypes=[c.c_void_p]
mapping=bytearray(65536)
for start in range(1,65536,31):
    units=list(range(start,min(start+31,65536)))
    source=(c.c_ubyte*92)();face=(c.c_ushort*32).from_buffer(source,28)
    for i,unit in enumerate(units):face[i]=unit
    handle=G.CreateFontIndirectW(source)
    if not handle:raise RuntimeError('Native font creation failed.')
    try:
        output=(c.c_ubyte*512)(*([204]*512));c.set_last_error(1234)
        if G.GetObjectA(handle,60,output)!=60 or c.get_last_error()!=1234:raise RuntimeError('Unexpected native query result.')
        if output[28+len(units)]!=0:raise RuntimeError('Unexpected conversion length.')
        mapping[start:start+len(units)]=bytes(output[28:28+len(units)])
    finally:G.DeleteObject(handle)
Path('tests/font-ansi-vectors.bin').write_bytes(mapping)
print('Captured all 65535 nonzero UTF-16 units through owned logical fonts; ACP 1252.')

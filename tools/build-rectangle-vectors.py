"""Record user32 rectangle arithmetic on owned structures; creates no windows."""
import ctypes
import json
import pathlib
import random

u=ctypes.WinDLL('user32',use_last_error=True);R=ctypes.c_int32*4;rng=random.Random(8604);vectors=[]
for i in range(1024):
    a=[rng.randrange(-20,21) for _ in range(4)];b=[rng.randrange(-20,21) for _ in range(4)]
    if i%2:
        a=[min(a[0],a[2]),min(a[1],a[3]),max(a[0],a[2]),max(a[1],a[3])]
        b=[min(b[0],b[2]),min(b[1],b[3]),max(b[0],b[2]),max(b[1],b[3])]
    for name in ['IntersectRect','UnionRect','SubtractRect']:
        f=getattr(u,name);f.argtypes=[ctypes.POINTER(R)]*3;x,y,z=R(*a),R(*b),R()
        ctypes.set_last_error(123);result=f(ctypes.byref(z),ctypes.byref(x),ctypes.byref(y))
        if ctypes.get_last_error()!=123:raise RuntimeError('Unexpected last-error mutation')
        vectors.append([name,a,b,result,list(z)])
(pathlib.Path(__file__).resolve().parent.parent/'tests/rectangle-native-vectors.json').write_text(json.dumps(vectors,separators=(',', ':'))+'\n',encoding='utf8')
print(f'Recorded {len(vectors)} native rectangle results.')

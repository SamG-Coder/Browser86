"""Record native RectInRegion results using owned rectangular regions."""
import ctypes as c
import itertools
import json
from pathlib import Path
G=c.WinDLL('gdi32',use_last_error=True)
G.CreateRectRgn.argtypes=[c.c_int]*4;G.CreateRectRgn.restype=c.c_void_p
G.RectInRegion.argtypes=[c.c_void_p,c.c_void_p];G.DeleteObject.argtypes=[c.c_void_p]
results=[]
for bounds in [(1,1,3,3),(3,3,1,1),(1,1,1,3),(-3,-3,-1,-1)]:
    h=G.CreateRectRgn(*bounds);assert h
    values=range(-4,1) if bounds[0]<0 else range(5)
    queries=list(itertools.product(values,repeat=4))+[(-2147483648,-2147483648,2147483647,2147483647),(2147483647,2147483647,-2147483648,-2147483648)]
    try:
        cases=[]
        for query in queries:
            rect=(c.c_int32*4)(*query);c.set_last_error(1234)
            result=G.RectInRegion(h,rect);error=c.get_last_error()
            cases.append([*query,result,error])
        results.append(dict(bounds=bounds,cases=cases))
    finally:G.DeleteObject(h)
Path('tests/rect-in-region-vectors.json').write_text(json.dumps(results,separators=(',',':'))+'\n')
print(f'Recorded {sum(len(v["cases"]) for v in results)} native cases; owned regions released.')

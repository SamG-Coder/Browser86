"""Record native MulDiv results on owned scalar inputs."""
import ctypes
import itertools
import json
import pathlib
import random

f=ctypes.WinDLL('kernel32',use_last_error=True).MulDiv
f.argtypes=[ctypes.c_int]*3
edges=[-2147483648,-2147483647,-1073741824,-3,-2,-1,0,1,2,3,1073741824,2147483646,2147483647]
inputs=list(itertools.product(edges,repeat=3));rng=random.Random(8603)
inputs.extend(tuple(rng.randrange(-2147483648,2147483648) for _ in range(3)) for _ in range(2048))
vectors=[]
for args in inputs:
    ctypes.set_last_error(123)
    result=f(*args)
    if ctypes.get_last_error()!=123:raise RuntimeError('Unexpected last-error mutation')
    vectors.append([*args,result])
path=pathlib.Path(__file__).resolve().parent.parent/'tests/muldiv-native-vectors.json'
path.write_text(json.dumps(vectors,separators=(',', ':'))+'\n',encoding='utf8')
print(f'Recorded {len(vectors)} native arithmetic vectors with preserved last error.')

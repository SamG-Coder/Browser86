"""Record native shell parsing; input strings are never executed."""
import ctypes
import json
import pathlib
import random

root=pathlib.Path(__file__).resolve().parent.parent
parse=ctypes.WinDLL('shell32').CommandLineToArgvW
parse.argtypes=[ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_int)]
parse.restype=ctypes.POINTER(ctypes.c_wchar_p)
free=ctypes.WinDLL('kernel32').LocalFree;free.argtypes=[ctypes.c_void_p]
rng=random.Random(8602)
inputs=['  a b','"abc"def x','abc"def ghi" x','p\na','p \na','\n\na','p "a""b"']
for i in range(1024):
    inputs.append(('p ' if i%2 else '')+''.join(rng.choice('ab \\"\t\n') for _ in range(rng.randrange(1,64))))
vectors=[]
for text in inputs:
    count=ctypes.c_int();block=parse(text,ctypes.byref(count))
    if not block:raise RuntimeError('Native parser failed')
    try:vectors.append([text,[block[i] for i in range(count.value)]])
    finally:free(block)
(root/'tests/command-line-native-vectors.json').write_text(json.dumps(vectors,separators=(',', ':'))+'\n',encoding='utf8')
print(f'Recorded {len(vectors)} native parser cases.')

#!/usr/bin/env python3
"""Build the original PE32 demo suite with LLVM/Clang and package it as a ZIP.
No Wine, Windows SDK, host execution or third-party application binaries are used.
Requires clang and lld-link on PATH. The ready-built binaries are in the demo ZIP.
"""
from pathlib import Path
import shutil, subprocess, zipfile, json, sys
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'demos'/'source'; BUILD=ROOT/'.build'; BUILD.mkdir(exist_ok=True)
for tool in ['clang','lld-link']:
    if not shutil.which(tool): raise SystemExit(f'{tool} is required to rebuild demos; the prebuilt demo ZIP can still run.')
K={'GetStdHandle':1,'WriteFile':5,'ReadFile':5,'ExitProcess':1,'CreateFileA':7,'CloseHandle':1,'GetLastError':0,'GetCurrentDirectoryA':2,'GetModuleHandleA':1,'LoadLibraryA':1,'GetProcAddress':2,'GetTickCount':0,'CreateThread':6}
U={'RegisterClassA':1,'CreateWindowExA':12,'ShowWindow':2,'UpdateWindow':1,'GetMessageA':4,'TranslateMessage':1,'DispatchMessageA':1,'DefWindowProcA':4,'PostQuitMessage':1,'DestroyWindow':1,'BeginPaint':2,'EndPaint':2,'SetWindowTextA':2,'MessageBoxA':4,'InvalidateRect':3,'SetTimer':4,'KillTimer':2,'FillRect':3}
G={'TextOutA':5,'SetTextColor':2,'SetBkMode':2,'SetBkColor':2,'CreateSolidBrush':1,'CreatePen':3,'SelectObject':2,'DeleteObject':1,'GetStockObject':1,'Rectangle':5,'Ellipse':5,'MoveToEx':4,'LineTo':3,'StretchDIBits':13}
C={'printf':1,'sprintf':2,'puts':1,'memset':3,'memcpy':3}
def run(*args): subprocess.run([str(x) for x in args],check=True)
libs=[];aliases=[]
for dll,items,stdcall in [('kernel32',K,True),('user32',U,True),('gdi32',G,True),('msvcrt',C,False)]:
    definition=BUILD/f'{dll}.def'; definition.write_text('LIBRARY '+dll+'.dll\nEXPORTS\n'+'\n'.join(items)+'\n')
    lib=BUILD/f'{dll}.lib';run('lld-link','/lib',f'/def:{definition}','/machine:x86',f'/out:{lib}');libs.append(lib)
    if stdcall: aliases.extend(f'/alternatename:__imp__{name}@{n*4}=__imp__{name}' for name,n in items.items())
def compile(source):
    obj=BUILD/(source+'.obj')
    run('clang','--target=i686-pc-windows-msvc','-c','-O1','-fno-stack-protector','-fno-builtin','-mno-sse','-mno-sse2','-fno-asynchronous-unwind-tables',SRC/(source+'.c'),'-o',obj)
    return obj
for name in ['mathhelper','scalehelper']:
    run('lld-link','/dll','/entry:DllMain','/nodefaultlib','/machine:x86','/base:0x10000000','/timestamp:0',f'/out:{BUILD/name}.dll',f'/implib:{BUILD/name}.lib',compile(name))
outputs={}
for source,target,subsystem in [('hello','HelloConsole.exe','console'),('files','apps/FileWorkbench.exe','console'),('interactive','apps/InteractiveConsole.exe','console'),('window','apps/WindowStudio.exe','windows'),('pixels','apps/PixelCanvas.exe','windows'),('dlls','apps/DllLoader.exe','console'),('unsupported','tests/UnsupportedApi.exe','console')]:
    exe=BUILD/Path(target).name
    extra=[BUILD/'mathhelper.lib',BUILD/'scalehelper.lib'] if source=='dlls' else []
    run('lld-link','/entry:mainCRTStartup',f'/subsystem:{subsystem}','/nodefaultlib','/machine:x86','/timestamp:0',f'/out:{exe}',compile(source),*libs,*extra,*aliases)
    outputs[target]=exe.read_bytes()
outputs['apps/mathhelper.dll']=(BUILD/'mathhelper.dll').read_bytes();outputs['apps/scalehelper.dll']=(BUILD/'scalehelper.dll').read_bytes()
outputs['apps/data/message.txt']=b'ZIP folders, dependencies and data stay together.\r\nThis file is inside the virtual application package.\r\n'
outputs['README.txt']=b'Original Browser86 demo programs, compiled from demos/source.\r\nStart with HelloConsole.exe, then apps/WindowStudio.exe.\r\nNo commercial binaries or Windows/Wine components are included.\r\n'
with zipfile.ZipFile(ROOT/'demos'/'browser86-demo.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,data in outputs.items():
        info=zipfile.ZipInfo(name,(2026,9,8,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
(ROOT/'demos'/'manifest.json').write_text(json.dumps({'build':'LLVM clang / lld-link; i686-pc-windows-msvc; -O1; no SDK','programs':list(outputs),'source':'demos/source'},indent=2)+'\n')
print(f'Built {len(outputs)} entries into demos/browser86-demo.zip')

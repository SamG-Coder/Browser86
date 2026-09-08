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
K.update({'CreateEventA':4,'CreateEventW':4,'CreateMutexA':3,'CreateMutexW':3,'CreateSemaphoreA':4,'CreateSemaphoreW':4,'SetEvent':1,'ResetEvent':1,'ReleaseMutex':1,'ReleaseSemaphore':3,'WaitForSingleObject':2,'WaitForSingleObjectEx':3,'WaitForMultipleObjects':4,'WaitForMultipleObjectsEx':5})
K.update({'GetCurrentProcess':0,'GetCurrentThread':0,'DuplicateHandle':7,'GetHandleInformation':2,'SetHandleInformation':3,'GetProcessId':1,'GetThreadId':1,'GetExitCodeProcess':2,'GetExitCodeThread':2,'SetFilePointer':4})
K.update({'SetFilePointerEx':5,'GetFileSizeEx':2,'SetEndOfFile':1})
K.update({'DeleteFileA':1})
K.update({'GetFileInformationByHandleEx':4})
K.update({'SetFileInformationByHandle':4})
K.update({'GetFinalPathNameByHandleA':4,'GetFinalPathNameByHandleW':4})
K.update({'GetTempFileNameA':4,'GetTempFileNameW':4})
K.update({'TlsAlloc':0,'TlsFree':1,'TlsSetValue':2,'TlsGetValue':1,'TlsGetValue2':1,'SetLastError':1})
K.update({'InitOnceInitialize':1,'InitOnceBeginInitialize':4,'InitOnceComplete':3,'InitOnceExecuteOnce':4})
K.update({'InitializeCriticalSection':1,'InitializeCriticalSectionAndSpinCount':2,'InitializeCriticalSectionEx':3,'SetCriticalSectionSpinCount':2,'EnterCriticalSection':1,'TryEnterCriticalSection':1,'LeaveCriticalSection':1,'DeleteCriticalSection':1})
K.update({'CreateDirectoryA':2,'RemoveDirectoryA':1,'MoveFileA':2})
K.update({'GetFileTime':4,'SetFileTime':4,'GetFileInformationByHandle':2,'SetFileAttributesA':2,'SetFileAttributesW':2,'GetFileAttributesA':1})
for suffix in ['A','W']:
    for name,count in [('OpenEvent',3),('OpenMutex',3),('OpenSemaphore',3),('CreateEventEx',4),('CreateMutexEx',4),('CreateSemaphoreEx',6)]:
        K[name+suffix]=count
U={'FrameRect':3,'RegisterClassA':1,'CreateWindowExA':12,'ShowWindow':2,'UpdateWindow':1,'GetMessageA':4,'TranslateMessage':1,'DispatchMessageA':1,'DefWindowProcA':4,'PostQuitMessage':1,'DestroyWindow':1,'BeginPaint':2,'EndPaint':2,'SetWindowTextA':2,'MessageBoxA':4,'InvalidateRect':3,'SetTimer':4,'KillTimer':2,'FillRect':3}
G={'TextOutA':5,'SetTextColor':2,'SetBkMode':2,'SetBkColor':2,'CreateSolidBrush':1,'CreatePen':3,'SelectObject':2,'DeleteObject':1,'GetStockObject':1,'Rectangle':5,'Ellipse':5,'MoveToEx':4,'LineTo':3,'StretchDIBits':13}
C={'printf':1,'sprintf':2,'puts':1,'memset':3,'memcpy':3}
S={'WaitOnAddress':4,'WakeByAddressSingle':1,'WakeByAddressAll':1}
G.update({'GetDCPenColor':1,'SetDCPenColor':2,'GetDCBrushColor':1,'SetDCBrushColor':2})
G.update({'CreatePenIndirect':1,'CreateBrushIndirect':1})
G.update({'CreateFontIndirectA':1,'CreateFontIndirectW':1})
G.update({'ExtCreatePen':5,'GetMiterLimit':2,'SetMiterLimit':3,'PolyDraw':4,'PolyBezier':3,'PolyBezierTo':3,'PolyPolygon':4,'PolyPolyline':4,'PolylineTo':3,'Polygon':3,'Polyline':3,'GetPolyFillMode':1,'SetPolyFillMode':2})
G.update({'GetObjectA':3,'GetObjectW':3})
G.update({'SaveDC':1,'RestoreDC':2,'GetCurrentPositionEx':2})
U.update({'InvertRect':2,'GetSysColor':1,'GetSysColorBrush':1})
G.update({'OffsetClipRgn':3,'IntersectClipRect':5,'GetClipBox':2,'PtVisible':3,'RectVisible':2,'SelectClipRgn':2,'GetClipRgn':2,'InvertRgn':2,'FrameRgn':5,'FillRgn':3,'PaintRgn':2,'GetRegionData':3,'RectInRegion':2,'CreateRectRgn':4,'CreateRectRgnIndirect':1,'SetRectRgn':5,'GetRgnBox':2,'PtInRegion':3,'EqualRgn':2,'OffsetRgn':3})
G.update({'GetBrushOrgEx':2,'SetBrushOrgEx':4})
G.update({'GetTextColor':1,'GetBkColor':1,'GetBkMode':1,'GetTextAlign':1,'GetCurrentObject':2,'GetObjectType':1})
U.update({'GetDC':1,'ReleaseDC':2})
U.update({'SetRect':5,'SetRectEmpty':1,'CopyRect':2,'EqualRect':2,'IsRectEmpty':1,'PtInRect':3,'OffsetRect':3,'InflateRect':3,'IntersectRect':3,'UnionRect':3,'SubtractRect':3})
K.update({'MulDiv':3})
K.update({'LocalFree':1})
K.update({'GetStringTypeW':4})
K.update({'IsValidCodePage':1,'GetCPInfo':2,'GetCPInfoExA':3,'GetCPInfoExW':3})
K.update({'MultiByteToWideChar':6,'WideCharToMultiByte':8})
K.update({'FindStringOrdinal':6})
K.update({'CompareStringOrdinal':5})
K.update({'DosDateTimeToFileTime':3,'FileTimeToDosDateTime':3})
K.update({'FileTimeToSystemTime':2,'SystemTimeToFileTime':2,'CompareFileTime':2})
K.update({'InitializeConditionVariable':1,'SleepConditionVariableCS':3,'SleepConditionVariableSRW':4,'WakeConditionVariable':1,'WakeAllConditionVariable':1})
K.update({name:1 for name in ['InitializeSRWLock','AcquireSRWLockShared','AcquireSRWLockExclusive','TryAcquireSRWLockShared','TryAcquireSRWLockExclusive','ReleaseSRWLockShared','ReleaseSRWLockExclusive']})
K.update({'SetEnvironmentVariableA':2,'GetEnvironmentVariableA':3,'ExpandEnvironmentStringsA':3,'GetEnvironmentStrings':0,'FreeEnvironmentStringsA':1,'GetEnvironmentStringsW':0,'FreeEnvironmentStringsW':1})
def run(*args): subprocess.run([str(x) for x in args],check=True)
libs=[];aliases=[]
for dll,items,stdcall in [('kernel32',K,True),('user32',U,True),('gdi32',G,True),('msvcrt',C,False),('api-ms-win-core-synch-l1-2-0',S,True),('shell32',{'CommandLineToArgvW':2},True)]:
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
for source,target,subsystem in [('hello','HelloConsole.exe','console'),('files','apps/FileWorkbench.exe','console'),('interactive','apps/InteractiveConsole.exe','console'),('window','apps/WindowStudio.exe','windows'),('pixels','apps/PixelCanvas.exe','windows'),('dlls','apps/DllLoader.exe','console'),('sync','tests/SyncPrimitives.exe','console'),('handles','tests/HandleObjects.exe','console'),('unsupported','tests/UnsupportedApi.exe','console')]:
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

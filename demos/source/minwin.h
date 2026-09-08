/* Original minimal declarations for these demos. No Windows SDK files shipped. */
#ifndef BROWSER86_MINWIN_H
#define BROWSER86_MINWIN_H
#define API __declspec(dllimport)
#define WINAPI __stdcall
#define NULL ((void*)0)
typedef unsigned int DWORD;typedef int BOOL;typedef void* HANDLE;typedef HANDLE HWND;typedef HANDLE HDC;typedef unsigned short WORD;typedef unsigned char BYTE;
typedef struct {DWORD low,high;} FILETIME;
typedef struct {DWORD attributes;FILETIME creation,access,write;DWORD volume,sizeHigh,sizeLow,links,idHigh,idLow;} BY_HANDLE_FILE_INFORMATION;
typedef long (WINAPI *WNDPROC)(HWND,DWORD,DWORD,long);
typedef struct {DWORD style;WNDPROC proc;int classExtra,windowExtra;HANDLE instance,icon,cursor,brush;const char *menu,*name;} WNDCLASSA;
typedef struct {HWND hwnd;DWORD message,wParam;long lParam;DWORD time;long x,y;} MSG;
typedef struct {HDC dc;BOOL erase;long left,top,right,bottom;BOOL restore,update;BYTE reserved[32];} PAINTSTRUCT;
typedef struct {long left,top,right,bottom;} RECT;
typedef struct {DWORD size;long width,height;WORD planes,bits;DWORD compression,imageSize;long xppm,yppm;DWORD colorsUsed,important;} BITMAPINFOHEADER;
API HANDLE WINAPI GetStdHandle(DWORD);
API BOOL WINAPI WriteFile(HANDLE,const void*,DWORD,DWORD*,void*);
API BOOL WINAPI ReadFile(HANDLE,void*,DWORD,DWORD*,void*);
API void WINAPI ExitProcess(DWORD);
API HANDLE WINAPI CreateFileA(const char*,DWORD,DWORD,void*,DWORD,DWORD,HANDLE);
API BOOL WINAPI CloseHandle(HANDLE);
API HANDLE WINAPI GetCurrentProcess(void);
API HANDLE WINAPI GetCurrentThread(void);
API BOOL WINAPI DuplicateHandle(HANDLE,HANDLE,HANDLE,HANDLE*,DWORD,BOOL,DWORD);
API BOOL WINAPI GetHandleInformation(HANDLE,DWORD*);
API BOOL WINAPI SetHandleInformation(HANDLE,DWORD,DWORD);
API DWORD WINAPI GetProcessId(HANDLE);
API DWORD WINAPI GetThreadId(HANDLE);
API BOOL WINAPI GetExitCodeProcess(HANDLE,DWORD*);
API BOOL WINAPI GetExitCodeThread(HANDLE,DWORD*);
API DWORD WINAPI SetFilePointer(HANDLE,long,long*,DWORD);
API BOOL WINAPI SetFilePointerEx(HANDLE,long long,long long*,DWORD);
API BOOL WINAPI GetFileSizeEx(HANDLE,long long*);
API BOOL WINAPI SetEndOfFile(HANDLE);
API BOOL WINAPI GetFileTime(HANDLE,FILETIME*,FILETIME*,FILETIME*);
API BOOL WINAPI SetFileTime(HANDLE,const FILETIME*,const FILETIME*,const FILETIME*);
API BOOL WINAPI GetFileInformationByHandle(HANDLE,BY_HANDLE_FILE_INFORMATION*);
API BOOL WINAPI SetFileAttributesA(const char*,DWORD);
API BOOL WINAPI SetFileAttributesW(const WORD*,DWORD);
API DWORD WINAPI GetFileAttributesA(const char*);
API DWORD WINAPI GetLastError(void);
API DWORD WINAPI GetCurrentDirectoryA(DWORD,char*);
API HANDLE WINAPI GetModuleHandleA(const char*);
API HANDLE WINAPI LoadLibraryA(const char*);
API void* WINAPI GetProcAddress(HANDLE,const char*);
API DWORD WINAPI GetTickCount(void);
API HANDLE WINAPI CreateThread(void*,DWORD,void*,void*,DWORD,DWORD*);
API HANDLE WINAPI CreateEventA(void*,BOOL,BOOL,const char*);
API HANDLE WINAPI CreateEventW(void*,BOOL,BOOL,const WORD*);
API HANDLE WINAPI CreateMutexA(void*,BOOL,const char*);
API HANDLE WINAPI CreateMutexW(void*,BOOL,const WORD*);
API HANDLE WINAPI CreateSemaphoreA(void*,long,long,const char*);
API HANDLE WINAPI CreateSemaphoreW(void*,long,long,const WORD*);
API HANDLE WINAPI OpenEventA(DWORD,BOOL,const char*);
API HANDLE WINAPI OpenEventW(DWORD,BOOL,const WORD*);
API HANDLE WINAPI OpenMutexA(DWORD,BOOL,const char*);
API HANDLE WINAPI OpenMutexW(DWORD,BOOL,const WORD*);
API HANDLE WINAPI OpenSemaphoreA(DWORD,BOOL,const char*);
API HANDLE WINAPI OpenSemaphoreW(DWORD,BOOL,const WORD*);
API HANDLE WINAPI CreateEventExA(void*,const char*,DWORD,DWORD);
API HANDLE WINAPI CreateEventExW(void*,const WORD*,DWORD,DWORD);
API HANDLE WINAPI CreateMutexExA(void*,const char*,DWORD,DWORD);
API HANDLE WINAPI CreateMutexExW(void*,const WORD*,DWORD,DWORD);
API HANDLE WINAPI CreateSemaphoreExA(void*,long,long,const char*,DWORD,DWORD);
API HANDLE WINAPI CreateSemaphoreExW(void*,long,long,const WORD*,DWORD,DWORD);
API BOOL WINAPI SetEvent(HANDLE);
API BOOL WINAPI ResetEvent(HANDLE);
API BOOL WINAPI ReleaseMutex(HANDLE);
API BOOL WINAPI ReleaseSemaphore(HANDLE,long,long*);
API DWORD WINAPI WaitForSingleObject(HANDLE,DWORD);
API DWORD WINAPI WaitForSingleObjectEx(HANDLE,DWORD,BOOL);
API DWORD WINAPI WaitForMultipleObjects(DWORD,const HANDLE*,BOOL,DWORD);
API DWORD WINAPI WaitForMultipleObjectsEx(DWORD,const HANDLE*,BOOL,DWORD,BOOL);
API WORD WINAPI RegisterClassA(const WNDCLASSA*);
API HWND WINAPI CreateWindowExA(DWORD,const char*,const char*,DWORD,int,int,int,int,HWND,HANDLE,HANDLE,void*);
API BOOL WINAPI ShowWindow(HWND,int);
API BOOL WINAPI UpdateWindow(HWND);
API BOOL WINAPI GetMessageA(MSG*,HWND,DWORD,DWORD);
API BOOL WINAPI TranslateMessage(const MSG*);
API long WINAPI DispatchMessageA(const MSG*);
API long WINAPI DefWindowProcA(HWND,DWORD,DWORD,long);
API void WINAPI PostQuitMessage(int);
API BOOL WINAPI DestroyWindow(HWND);
API HDC WINAPI BeginPaint(HWND,PAINTSTRUCT*);
API BOOL WINAPI EndPaint(HWND,const PAINTSTRUCT*);
API BOOL WINAPI SetWindowTextA(HWND,const char*);
API int WINAPI MessageBoxA(HWND,const char*,const char*,DWORD);
API BOOL WINAPI InvalidateRect(HWND,const RECT*,BOOL);
API DWORD WINAPI SetTimer(HWND,DWORD,DWORD,void*);
API BOOL WINAPI KillTimer(HWND,DWORD);
API BOOL WINAPI TextOutA(HDC,int,int,const char*,int);
API DWORD WINAPI SetTextColor(HDC,DWORD);
API int WINAPI SetBkMode(HDC,int);
API DWORD WINAPI SetBkColor(HDC,DWORD);
API HANDLE WINAPI CreateSolidBrush(DWORD);
API HANDLE WINAPI CreatePen(int,int,DWORD);
API HANDLE WINAPI SelectObject(HDC,HANDLE);
API BOOL WINAPI DeleteObject(HANDLE);
API HANDLE WINAPI GetStockObject(int);
API BOOL WINAPI Rectangle(HDC,int,int,int,int);
API BOOL WINAPI Ellipse(HDC,int,int,int,int);
API BOOL WINAPI MoveToEx(HDC,int,int,void*);
API BOOL WINAPI LineTo(HDC,int,int);
API int WINAPI FillRect(HDC,const RECT*,HANDLE);
API int WINAPI StretchDIBits(HDC,int,int,int,int,int,int,int,int,const void*,const void*,DWORD,DWORD);
API int __cdecl printf(const char*,...);
API int __cdecl sprintf(char*,const char*,...);
API int __cdecl puts(const char*);
API void* __cdecl memset(void*,int,unsigned int);
#define RGB(r,g,b) ((DWORD)((r)|((g)<<8)|((b)<<16)))
#define GENERIC_READ 0x80000000U
#define GENERIC_WRITE 0x40000000U
#define INVALID_HANDLE ((HANDLE)0xFFFFFFFFU)
#define WM_DESTROY 2
#define WM_PAINT 15
#define WM_COMMAND 0x111
#define WM_TIMER 0x113
#define WS_OVERLAPPEDWINDOW 0x00CF0000U
#define WS_CHILD_VISIBLE 0x50000000U
#endif

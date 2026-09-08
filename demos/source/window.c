#include "minwin.h"
static HANDLE instance,brush,pen;static HWND statusLabel;static DWORD tick=0;
long WINAPI WindowProc(HWND hwnd,DWORD msg,DWORD wp,long lp){
  if(msg==WM_DESTROY){KillTimer(hwnd,1);PostQuitMessage(0);return 0;}
  if(msg==WM_TIMER){tick++;InvalidateRect(hwnd,NULL,0);return 0;}
  if(msg==WM_COMMAND){
    if((wp&65535)==1){const char data[]="Saved from a real x86 window callback.\r\n";DWORD n=0;HANDLE f=CreateFileA("window-note.txt",GENERIC_WRITE,0,NULL,2,0,NULL);if(f!=INVALID_HANDLE){WriteFile(f,data,sizeof(data)-1,&n,NULL);CloseHandle(f);SetWindowTextA(statusLabel,"Saved window-note.txt in the virtual application folder.");}else SetWindowTextA(statusLabel,"Could not save the file.");return 0;}
    if((wp&65535)==2){int result=MessageBoxA(hwnd,"This dialog was requested by guest machine code.\n\nContinue running the demo?","Original Win32 runtime",4);SetWindowTextA(statusLabel,result==6?"The guest received IDYES (6).":"The guest received IDNO (7).");return 0;}
    if((wp&65535)==3){DestroyWindow(hwnd);return 0;}
  }
  if(msg==WM_PAINT){PAINTSTRUCT ps;HDC dc=BeginPaint(hwnd,&ps);RECT all={0,0,620,340};FillRect(dc,&all,GetStockObject(0));SetBkMode(dc,1);SetTextColor(dc,RGB(22,55,63));TextOutA(dc,26,23,"This window is running x86 machine code.",39);SetTextColor(dc,RGB(100,115,125));TextOutA(dc,26,51,"Callbacks, GDI drawing, timers, controls and virtual files.",58);
    HANDLE oldBrush=SelectObject(dc,brush),oldPen=SelectObject(dc,pen);Rectangle(dc,28,90,280,192);Ellipse(dc,316,91,418,193);MoveToEx(dc,450,188,NULL);LineTo(dc,482,136);LineTo(dc,520,165);LineTo(dc,570,99);SelectObject(dc,oldBrush);SelectObject(dc,oldPen);
    char text[80];int n=sprintf(text,"Timer callbacks: %u   /   virtual uptime: %u ms",tick,GetTickCount());SetTextColor(dc,RGB(55,92,90));TextOutA(dc,28,209,text,n);EndPaint(hwnd,&ps);return 0;}
  return DefWindowProcA(hwnd,msg,wp,lp);
}
void mainCRTStartup(void){instance=GetModuleHandleA(NULL);WNDCLASSA wc={0};wc.proc=WindowProc;wc.instance=instance;wc.name="Browser86DemoWindow";RegisterClassA(&wc);brush=CreateSolidBrush(RGB(136,225,198));pen=CreatePen(0,3,RGB(42,120,106));HWND win=CreateWindowExA(0,wc.name,"Browser86 - compiled Win32 application",WS_OVERLAPPEDWINDOW,22,18,620,340,NULL,NULL,instance,NULL);
  CreateWindowExA(0,"BUTTON","Write virtual file",WS_CHILD_VISIBLE,26,247,180,31,win,(HANDLE)1,instance,NULL);
  CreateWindowExA(0,"BUTTON","Message box",WS_CHILD_VISIBLE,218,247,180,31,win,(HANDLE)2,instance,NULL);
  CreateWindowExA(0,"BUTTON","Close",WS_CHILD_VISIBLE,410,247,180,31,win,(HANDLE)3,instance,NULL);
  statusLabel=CreateWindowExA(0,"STATIC","Choose an action above.",WS_CHILD_VISIBLE,26,291,570,29,win,(HANDLE)4,instance,NULL);
  ShowWindow(win,1);UpdateWindow(win);SetTimer(win,1,1000,NULL);MSG msg;while(GetMessageA(&msg,NULL,0,0)>0){TranslateMessage(&msg);DispatchMessageA(&msg);}ExitProcess(msg.wParam);
}

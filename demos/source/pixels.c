#include "minwin.h"
#define W 256
#define H 144
static DWORD pixels[W*H];static BITMAPINFOHEADER info={40,W,-H,1,32,0,W*H*4,0,0,0,0};
static unsigned int phase=0;
static void generate(void){for(unsigned int y=0;y<H;y++)for(unsigned int x=0;x<W;x++){unsigned int r=(x+phase)&255,g=((x^y)*3+phase)&255,b=(y*2+phase)&255;pixels[y*W+x]=(r<<16)|(g<<8)|b;}}
long WINAPI PixelProc(HWND hwnd,DWORD msg,DWORD wp,long lp){if(msg==WM_DESTROY){PostQuitMessage(0);return 0;}if(msg==0x201){phase+=23;generate();InvalidateRect(hwnd,NULL,0);return 0;}if(msg==WM_PAINT){PAINTSTRUCT ps;HDC dc=BeginPaint(hwnd,&ps);SetBkMode(dc,1);TextOutA(dc,18,15,"Every pixel below was computed by guest x86 instructions.",56);StretchDIBits(dc,18,48,512,288,0,0,W,H,pixels,&info,0,0x00CC0020);TextOutA(dc,18,351,"Click the image to run the guest pixel loop again.",49);EndPaint(hwnd,&ps);return 0;}return DefWindowProcA(hwnd,msg,wp,lp);}
void mainCRTStartup(void){generate();HANDLE instance=GetModuleHandleA(NULL);WNDCLASSA wc={0};wc.proc=PixelProc;wc.instance=instance;wc.name="Browser86PixelWindow";RegisterClassA(&wc);HWND w=CreateWindowExA(0,wc.name,"Guest-generated DIB pixel buffer",WS_OVERLAPPEDWINDOW,25,15,550,390,NULL,NULL,instance,NULL);ShowWindow(w,1);UpdateWindow(w);MSG msg;while(GetMessageA(&msg,NULL,0,0)>0){TranslateMessage(&msg);DispatchMessageA(&msg);}ExitProcess(0);}

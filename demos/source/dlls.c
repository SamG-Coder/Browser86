#include "minwin.h"
API int __cdecl AddValues(int,int);
API int __cdecl ScaleValue(int);
void mainCRTStartup(void){int result=ScaleValue(AddValues(3,6));printf("Packaged DLL result: %d (expected 60)\n",result);HANDLE module=LoadLibraryA("mathhelper.dll");int (__cdecl *dynamic)(void)=(int (__cdecl*)(void))GetProcAddress(module,"DynamicValue");printf("Dynamic export result: %d (expected 11)\n",dynamic?dynamic():-1);puts("Both DLLs request the same base; the second DLL is relocated.");ExitProcess(result==60?0:1);}

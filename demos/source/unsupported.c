#include "minwin.h"
void mainCRTStartup(void){puts("This is an intentional unsupported-API test.");puts("CreateThread must produce an honest diagnostic, not a fake success.");CreateThread(NULL,0,NULL,NULL,0,NULL);ExitProcess(99);}

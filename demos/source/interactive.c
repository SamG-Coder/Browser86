#include "minwin.h"
void mainCRTStartup(void){char buffer[512];DWORD n=0;puts("Type something into the console input, then press Enter.");ReadFile(GetStdHandle((DWORD)-10),buffer,sizeof(buffer)-1,&n,NULL);buffer[n]=0;printf("Guest received %u bytes: %s",n,buffer);puts("The read really blocked until input arrived.");ExitProcess(0);}

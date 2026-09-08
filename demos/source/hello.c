#include "minwin.h"
void mainCRTStartup(void){
  puts("BROWSER86 / COMPILED X86 CONSOLE DEMO");
  puts("This output was produced by a real PE32 executable.");
  unsigned int a=0,b=1;
  for(unsigned int i=0;i<12;i++){printf("Fibonacci[%02u] = %u\n",i,a);unsigned int n=a+b;a=b;b=n;}
  printf("Integer check: (137 * 29) / 7 = %u, remainder %u\n",(137*29)/7,(137*29)%7);
  puts("No Wine. No Windows installation. No remote execution.");
  ExitProcess(0);
}

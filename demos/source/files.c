#include "minwin.h"
static char input[4096],cwd[512];
void mainCRTStartup(void){
  GetCurrentDirectoryA(sizeof(cwd),cwd);printf("Working directory: %s\n",cwd);
  HANDLE f=CreateFileA("data\\message.txt",GENERIC_READ,1,NULL,3,0,NULL);
  if(f==INVALID_HANDLE){printf("Read failed: error %u\n",GetLastError());ExitProcess(2);return;}
  DWORD read=0;ReadFile(f,input,sizeof(input)-1,&read,NULL);CloseHandle(f);input[read]=0;printf("Read %u bytes from data\\message.txt:\n%s\n",read,input);
  unsigned int checksum=0;for(unsigned int i=0;i<read;i++)checksum=checksum*31+(unsigned char)input[i];
  char report[512];int len=sprintf(report,"Created by guest x86 instructions.\r\nInput bytes: %u\r\nChecksum: %08X\r\nVirtual C: is not your host disk.\r\n",read,checksum);
  f=CreateFileA("runtime-result.txt",GENERIC_WRITE,0,NULL,2,0,NULL);
  if(f==INVALID_HANDLE){printf("Create failed: error %u\n",GetLastError());ExitProcess(3);return;}
  DWORD written=0;WriteFile(f,report,len,&written,NULL);CloseHandle(f);printf("Saved %u bytes to runtime-result.txt. Open the Virtual disk tab.\n",written);
  ExitProcess(0);
}

#include "minwin.h"

/* Each failure identifies the actual guest assertion; no host execution. */
#define CHECK(expression) do { if(!(expression)) { printf("Sync failure at line %d\n",__LINE__); ExitProcess(__LINE__); } } while(0)
void mainCRTStartup(void){
  HANDLE objects[3],gate,extra;
  long previous=-1;
  DWORD result;
  objects[0]=CreateEventA(NULL,0,1,NULL);
  objects[1]=CreateSemaphoreW(NULL,0,2,NULL);
  objects[2]=CreateMutexA(NULL,0,NULL);
  CHECK(objects[0]&&objects[1]&&objects[2]);
  CHECK(WaitForMultipleObjects(3,objects,1,0)==258);
  CHECK(!ReleaseMutex(objects[2])&&GetLastError()==288);
  CHECK(ReleaseSemaphore(objects[1],2,&previous)&&previous==0);
  CHECK(!ReleaseSemaphore(objects[1],1,&previous)&&GetLastError()==298);
  CHECK(WaitForMultipleObjectsEx(3,objects,1,0,0)==0);
  CHECK(WaitForSingleObject(objects[0],0)==258);
  CHECK(WaitForMultipleObjects(3,objects,0,0)==1);
  CHECK(WaitForSingleObject(objects[1],0)==258);
  CHECK(WaitForSingleObjectEx(objects[2],0,0)==0);
  CHECK(ReleaseMutex(objects[2]));
  CHECK(ReleaseMutex(objects[2]));
  CHECK(!ReleaseMutex(objects[2])&&GetLastError()==288);
  CHECK(SetEvent(objects[0]));CHECK(ResetEvent(objects[0]));
  CHECK(WaitForSingleObject(objects[0],0)==258);
  CHECK(CloseHandle(objects[0]));CHECK(CloseHandle(objects[1]));CHECK(CloseHandle(objects[2]));
  CHECK(WaitForSingleObject(objects[0],0)==0xFFFFFFFFU&&GetLastError()==6);
  extra=CreateMutexW(NULL,1,NULL);CHECK(extra&&ReleaseMutex(extra)&&CloseHandle(extra));
  extra=CreateSemaphoreA(NULL,1,1,NULL);
  CHECK(extra&&WaitForSingleObject(extra,0)==0&&CloseHandle(extra));
  gate=CreateEventW(NULL,0,0,NULL);CHECK(gate);
  puts("Synchronization checks passed; waiting briefly.");
  result=WaitForSingleObjectEx(gate,25,0);
  CHECK(result==0||result==258);
  CHECK(CloseHandle(gate));
  puts("Synchronization wait resumed.");
  ExitProcess(0);
}

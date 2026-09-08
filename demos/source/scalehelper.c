static volatile int multiplier=2;
__declspec(dllexport) int __cdecl ScaleValue(int a){return a*multiplier;}
int __stdcall DllMain(void* instance,unsigned reason,void* reserved){if(reason==1)multiplier=3;return 1;}

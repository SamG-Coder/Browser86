/* A packaged, original DLL. Its initializer changes a global to prove DllMain ran. */
static volatile int seed=1;
__declspec(dllexport) int __cdecl AddValues(int a,int b){return a+b+seed;}
__declspec(dllexport) int __cdecl DynamicValue(void){return seed;}
int __stdcall DllMain(void* instance,unsigned reason,void* reserved){if(reason==1)seed=11;return 1;}

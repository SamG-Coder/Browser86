# Technical references

These primary/platform documents informed the implementation. Referencing a specification does not imply complete conformance. No source code from Wine or an existing emulator is included.

- Microsoft, **PE Format**: executable headers, sections, imports, exports, relocation, resources and TLS structures. https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
- Intel, **Intel 64 and IA-32 Architectures Software Developer's Manuals**, official manual index: instruction and architectural reference. https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html
- Microsoft, **CreateFileA**: Windows file handle contract and creation dispositions. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea
- Microsoft, **GetMessageA**: message retrieval, blocking behavior and WM_QUIT return contract. https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmessagea
- PKWARE, **APPNOTE.TXT**: ZIP structures, flags and compression method records. https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
- MDN, **DecompressionStream constructor**: browser stream formats and native DEFLATE integration. https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream

The test artifacts record the local tools and browser actually exercised; they are not inferred from these references.

Synchronization contracts checked for the compatibility extension:

- Microsoft, [WaitForMultipleObjects](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitformultipleobjects): wait-all atomicity, lowest-index wait-any, distinct handles and timeout results.
- Microsoft, [ReleaseSemaphore](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-releasesemaphore): positive release count, maximum count and optional previous-count output.
- Microsoft, [CreateMutexW](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createmutexw) and [ReleaseMutex](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-releasemutex): initial ownership and balanced recursive acquisitions/releases.
- Microsoft, [DuplicateHandle](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-duplicatehandle), [GetHandleInformation](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-gethandleinformation), [SetHandleInformation](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-sethandleinformation), and [CloseHandle](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-closehandle): shared object state, duplication flags, pseudo handles, handle flags and object lifetime.

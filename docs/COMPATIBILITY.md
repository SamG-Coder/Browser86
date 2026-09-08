# Compatibility contract — Browser86 0.1

## The honest boundary

The project runs **some native 32-bit Windows PE applications**, not every file ending in `.exe`. Successful results currently come from the included, purpose-built C programs. They prove real CPU execution, linking and API handling; they do not establish general compatibility with third-party software. No third-party application suite has been certified here.

A green/imported executable is a candidate, not a compatibility guarantee. A known import means a handler exists, not that every flag, argument, threading mode or edge case behaves like Windows. Missing imports bind to diagnostic traps and fail when invoked. An unknown dynamic `GetProcAddress` returns null rather than fabricating a callable implementation.

## Supported scope and gaps

| Area | Current scope | Important gaps |
|---|---|---|
| Executable architecture | User-mode IA-32 PE32, console and GUI subsystems. | x86-64, ARM, DOS/16-bit/NE, kernel drivers, services requiring an OS. |
| Integer CPU | Common arithmetic/logical instructions, flags, byte/high-byte/word/dword registers, ModRM/SIB, stack, near branches/calls, string loops, selected bit/atomic operations. | Full instruction-set coverage, privileged instructions, paging/system mode, complete CPU exception semantics. |
| Floating point | Selected x87 operations and scalar/vector SSE operations. | Exact x87 extended precision, full SSE/MMX/AVX, floating exception/denormal control and all rounding semantics. |
| Loading | Section mapping, imports/exports, HIGHLOW/HIGH/LOW relocation, application DLL initialization, TLS structures/callbacks, basic resources. | Delay imports, loader-lock parity, full manifests/SxS, full loader search policy, complete unloading/detach semantics. |
| Process model | One emulated thread in one active guest process. Guest callbacks can nest and block. | `CreateThread`, child processes, general synchronization across threads, scheduling multiple guests, Windows exception dispatch/SEH. |
| Kernel handles | Same-process `DuplicateHandle` with `DUPLICATE_SAME_ACCESS`, shared file positions/object state, `DUPLICATE_CLOSE_SOURCE`, per-handle inheritance and close-protection flags, process/thread pseudo-handle duplication, IDs and exit-code queries. | Cross-process duplication, changed access rights for non-synchronization objects, console/registry handle duplication. Inheritance flags are recorded but child processes are not implemented. |
| Synchronization | Named/unnamed A/W events, recursive mutexes, counting semaphores; Open and Ex creation APIs; per-handle access rights; single/multiple waits (up to 64 distinct handles), wait-any/wait-all, polling and finite/infinite timeouts; non-alertable Ex waits. | Cross-process/thread contention, custom security descriptors/ACLs, private namespaces, mutex abandonment, APC/alertable waits and waitable timers. |
| Files | Virtual C: only, regular files/directories, relative paths, basic sharing flags accepted in limited modes, synchronous I/O. | Real devices, network shares, host paths, overlapped I/O, full Windows file sharing/locking, reparse points, alternate streams and full filename rules. |
| Memory | Protected sparse guest pages; process heap and separately owned private heap allocations. | Full Windows reserve/commit accounting. Reserve-only VirtualAlloc occupies host memory. HeapCreate's initial reservation is not modelled as a distinct committed region. Heap exceptions require unsupported SEH. |
| GUI | Custom guest window procedures, basic messages/timers, BUTTON/STATIC/EDIT, pointer/keyboard events, basic message boxes. | Full USER32 behavior, menus, rich edit, common controls, common file dialogs, complete focus/activation/accessibility/IME, multi-monitor/DPI parity. |
| Graphics | Canvas-backed basic GDI shapes/text and a limited 24/32-bit BI_RGB DIB/SRCCOPY path. | DirectX, accelerated OpenGL/Vulkan translation, full GDI bitmap/offscreen operations, font rasterization/metrics parity, complex raster operations. |
| CRT | Portions of string/memory/formatting/math/file APIs and startup helpers. | Complete Microsoft C/C++ runtime, C++ exceptions, locale completeness, exact binary CRT ABI coverage, full text-mode newline semantics. |
| Managed applications | CLR metadata is detected. | .NET Framework, .NET runtime, WinForms, WPF, managed C++/CLI. These need a managed runtime, not just CPU instructions. |
| Registry | Small virtual registry backed by a JSON file inside virtual C:. | Native Windows registry compatibility, security descriptors, notifications and every value/key operation. |
| Devices/network/audio | No guest host-device or network bridge. | WinSock, internet access, audio devices, hardware acceleration/device drivers, printing, USB, DRM/anti-cheat. |

The original CPU uses direct interpretation, not a JIT. Native-speed execution is not claimed. Sustained workloads, large applications and real games may be slow or fail long before producing a window.

Synchronization waits suspend the existing guest continuation without spinning the CPU. Wait-any consumes only the lowest-index ready object; wait-all changes object state only when every object is ready. Mutex acquisition is recursive for the sole emulated thread. A timeout never consumes an event or semaphore. Custom security descriptors for new objects raise `UNSUPPORTED_SYNC`; alertable Ex waits raise `UNSUPPORTED_APC`. An infinite wait that cannot be signaled remains suspended until the guest is stopped. These APIs do not add thread creation or background guest execution.

Kernel handles refer to shared objects, so closing one duplicate does not destroy the object while another handle still references it. `CloseHandle` rejects window/GDI/registry/resource/find handles that require their own release APIs. Process/thread handles refer only to the current guest: ID and `STILL_ACTIVE` queries work, and waits remain pending while the guest is running. Wait-all rejects aliases of the same object to prevent multiple consumption in one wait.

Named synchronization objects use a case-sensitive namespace inside each guest. An unprefixed name aliases `Local\name`; `Global\name` is a separate namespace inside that same isolated guest, never a host or cross-package object. Creating an existing object returns a new handle and `ERROR_ALREADY_EXISTS` without resetting state. Names disappear on final handle close, including after duplication. Empty/overlong names and unsupported namespace paths fail. A 12-byte x86 `SECURITY_ATTRIBUTES` with a null descriptor records handle inheritance. Open/Ex/duplicate access masks are recorded per handle; waits require `SYNCHRONIZE`, and event/semaphore mutation requires the corresponding modify-state right. The default guest security model grants requested supported rights; Windows token/DACL enforcement is not implemented.

## Import/storage limits

`SetFilePointerEx` and the high/low `SetFilePointer` form track exact positions through `2^63-1` without allocating storage. Relative moves are signed; seeking beyond EOF is allowed, EOF reads return zero bytes, and zero-byte writes leave file size and position unchanged. Actual file growth remains bounded by virtual-disk capacity and reports `ERROR_DISK_FULL`. SetFilePointer without a high-word pointer rejects a resulting position above 32 bits. `FILE_FLAG_NO_BUFFERING` is explicitly unsupported; sector-alignment behavior is not implemented.

Defaults: ZIP at most 256 MiB; expanded files at most 512 MiB; at most 20,000 entries; individual files at most 128 MiB. Stored and DEFLATE archives are supported. Encrypted ZIP, ZIP64, multi-disk archives and symlinks are rejected. Compression-ratio checks have a small-entry allowance; declared expanded bounds are still enforced during streaming decompression.

The UI offers 128/256/512 MiB guest-memory caps. A single PE image is capped at 256 MiB. A single heap allocation is capped at 64 MiB. These are guest-accounting limits, not promises that total browser memory stays under the chosen number: imported archives, expanded disk data, snapshots, transfer copies, graphics buffers and IndexedDB may use additional memory.

## Working with other programs

Package the **complete native application folder**, preserving directories. Select the actual application EXE rather than an installer whenever possible. Installers often require missing Windows services, child processes or managed runtimes.

If execution stops, save the diagnostic report. It contains the missing API or opcode, fault address, register state, recent EIP/API calls and mapped modules. A program that fails at startup has not been successfully run merely because its file was parsed.

Do not hide a failure by returning zero/success from an unimplemented function. Correctly implement the behavior, reject the unsupported mode explicitly, or leave the diagnostic trap in place.

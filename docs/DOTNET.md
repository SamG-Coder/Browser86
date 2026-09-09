# Managed compatibility boundary

Recorded 9 September 2026. This document describes the experimental managed extension integrated into Browser86. **Experimental partial compatibility; no Microsoft CLR is included.**

## What the implementation actually does

.NET compilers produce metadata and Common Intermediate Language (CIL) within a portable executable. Browser86 reads that metadata, resolves the entry method, and interprets CIL instructions in a bounded worker loop. It does not feed CIL bytes into its x86 CPU interpreter. Native PE32 programs still use the original x86 path.

The managed execution engine is original JavaScript. Framework calls are dispatched to explicit compatibility implementations. Loading an assembly reference named `mscorlib`, `System`, `System.Core`, `System.Drawing`, `System.Windows.Forms` or `Microsoft.VisualBasic` does not mean the corresponding complete Microsoft library has been loaded. Those names select a limited intrinsic surface, not a full implementation.

## Implemented and exercised

| Area | Implemented boundary / evidence |
|---|---|
| Formats | Pure-IL PE32, x86 and AnyCPU, CLR metadata streams and tables, method and field signatures. Actual v4.0.30319 C#/VB compiler output was exercised. |
| CIL | Stack, arguments, locals, branches, switch, methods, constructors, field access, arrays, managed references, boxing, type tests and selected conversions. Unknown instructions fail explicitly. |
| Numbers | Int32 and Int64 arithmetic, wraparound, unsigned operations, checked overflow, divide errors, floating-point values. Int64 uses BigInt, not lossy JS numbers. |
| Objects | Application class instances, instance/static fields, basic inheritance, virtual dispatch, static constructors and delegates. Some generic signature handling and selected generic collections. |
| Exceptions | Catch/finally/leave/throw across managed frames, bounds errors, divide-by-zero and checked overflow exercised by real compiled C#. Not complete CLR exception semantics. |
| Libraries | Selected Console, String, primitive numeric, Math, Convert, StringBuilder, List and Dictionary operations. Overload, culture and collection semantics are partial. |
| Dependencies | Managed DLLs beside the EXE or in the package working directory, case-insensitive VFS paths, assembly name/version checks. A separately compiled application DLL is tested. |
| Files | Selected File, Directory and Path operations on Browser86's virtual C: drive. No host filesystem access. Writes participate in the original snapshot/backup mechanisms. |
| Interop | Restricted primitive 32-bit and input-string P/Invoke to existing registered Win32 handlers. The compiled console test calls `kernel32!GetCurrentProcessId`. |
| WinForms | Basic Form, Button, Label, TextBox and selected additional control plumbing; native window/control creation, managed event delegates, a cooperative Application.Run loop, selected properties, timers and control collections. Form/Button/Label/TextBox are the compiled fixture's verified controls. |
| Drawing | Selected Color/Point/Size/Rectangle/Pen/Brush/Graphics operations mapped to the existing GUI/GDI draw-command backend. FillRectangle and DrawEllipse are exercised by the compiled Paint handler. |
| Debugging | CIL method/token/offset, frames and evaluation-stack summaries; pause/step/stop; unsupported import/opcode diagnostics. CIL counts are not reported as x86 instructions. |

The renderer is shared with native applications: managed controls become the existing USER32-style windows, and drawing reaches the existing canvas/GDI protocol. There is no `ManagedForms.exe`-specific runtime branch or replacement HTML form. The included programs use only standard Framework APIs.

## What is not supported or not established

There is **no blanket .NET Framework 2.0/3.5/4.x version guarantee**. The CLR metadata version is displayed for diagnosis, not used as a compatibility certification. Supporting a compiler output format is different from implementing the APIs an application uses.

- Full WinForms, designer resource loading, layout/AutoScale fidelity, advanced controls, accessibility, commercial control suites such as DevExpress, or pixel-identical Windows rendering.
- WPF, ASP.NET hosting, ADO.NET/database providers, networking/HttpClient, COM/ActiveX and full remoting/AppDomain behaviour.
- Task/async, real managed threads, ThreadPool/synchronization parity, background workers or parallel execution. Selected waits are cooperative, within the single guest thread.
- Full reflection, Reflection.Emit, dynamic code, runtime-generated proxies, serialization frameworks or arbitrary generic specialization. Complex libraries may load metadata and still fail when executed.
- PE32+/x64, native entrypoints, mixed-mode C++/CLI, ReadyToRun/NGen images and arbitrary native DLL P/Invoke. Marshal/struct/byref/reverse-callback interop is not general-purpose.
- Microsoft GC/finalization semantics, complete value-type/layout/type-initialization edge cases, ECMA conformance, full IL verification or strong-name authenticity verification. The code is a compatibility prototype, not a verified CLR implementation.
- Binding redirects, Fusion/GAC, side-by-side assembly versions or downloading missing assemblies.

Unsupported APIs and instructions normally produce explicit runtime diagnostics. Some implemented API overloads and edge cases are approximations: the presence of a handler is not a guarantee of full Windows behaviour. The test suite is finite and is not a conformance suite.

**A normal DevExpress VB.NET business application is not established as compatible.** Do not expect it to run simply because the small VB.NET and WinForms fixtures pass.

## Limits and safety

Guest execution is cooperatively sliced and has an instruction ceiling, call-frame limit, allocation budget and bounded metadata/signature parsing. Managed strings/arrays and loaded-assembly count are capped. The managed allocation number is a **cumulative accounting budget**, not the size of a live CLR heap; allocating and dropping objects can still exhaust it. The browser/JS engine reclaims underlying objects, without CLR finalizer guarantees.

The existing native memory cap and the managed accounting limit are not a hard cap on browser-process RAM. Parsing, browser storage and rendering allocate additional memory. This is not a hardened malware sandbox. Run trusted test applications and export important virtual-disk files before closing the tab.

## Extension map

`metadata.js` parses assemblies and signatures; `il.js` validates instruction boundaries; `runtime.js` implements frames and instruction execution; `numeric.js` implements arithmetic; `framework.js` contains explicit managed API implementations; `forms.js` bridges managed controls/drawing to the original GUI backend. `factory.js` is the native/managed routing point. Add generic semantics and regression tests rather than executable-name checks.

## Format and architecture references

- Ecma International, [ECMA-335: Common Language Infrastructure](https://ecma-international.org/publications-and-standards/standards/ecma-335/), especially Partition II (metadata) and III (CIL).
- Microsoft, [Managed execution process](https://learn.microsoft.com/en-us/dotnet/standard/managed-execution-process), for the distinction between compiler output, runtime services and native execution. Browser86 interprets CIL; it does not implement Microsoft's JIT pipeline.

These references describe the platform. They are not endorsements or evidence of this implementation's conformance.

# Managed compatibility boundary

## Execution architecture

Browser86 now chooses between two genuine instruction paths:

```text
EXE / application ZIP -> per-package virtual C: drive -> PE inspection
  native PE32 -> existing IA-32 CPU -> existing Win32/GDI handlers
  IL-only managed PE32 -> CLI metadata -> MethodDef Main -> CIL interpreter
       -> compiled application methods / local managed DLLs
       -> explicit Framework bindings -> VFS / console / USER32 / GDI
```

Managed code is not fed to the IA-32 interpreter as though it were native code. The managed bootstrap import (`mscoree!_CorExeMain`) is replaced by a dedicated managed entry path. Actual method bodies, arguments, branches and event callbacks come from the user's compiled assembly. No application filenames, class names, expected test outputs or demo-specific behaviors are recognized by the runtime.

### Metadata and executable loading

The reader validates CLI and metadata directory bounds, stream locations, table sizes, coded indices, signatures, MethodDef bodies, tiny/fat method headers, and exception clauses. It reads the normal ECMA-335 table schemas 0–44 and signatures for common primitive, reference, byref, array and generic-instance forms. Unoptimized pointer tables and exception filters explicitly fail.

IL-only PE32 images targeting x86 or AnyCPU can be candidates. The recorded compiled programs use .NET Framework v4 metadata (`v4.0.30319`). This is **not** evidence that all APIs from Framework 4.0 through 4.8.1 exist. Framework 2.0/3.5 binaries have not been validated in this milestone. x64 PE32+, mixed-mode/C++/CLI, native managed entrypoints, NGen images and arbitrary CLR-hosting APIs are unsupported.

Application assemblies resolve locally by simple name, case-insensitively, beside the referring image or executable. Loading is capped at 128 assemblies. This is not a GAC, Fusion, strong-name validation, version/culture-aware binding, binding-redirect, multi-module or AppDomain implementation.

### Instruction and object model

The implementation executes common CIL loads/stores, arithmetic, checked arithmetic, signed/unsigned comparisons, branches, calls, recursion, constructors, fields, static initializers, arrays, managed byrefs, boxing/unboxing and basic virtual dispatch. CIL int64 values use BigInt rather than a JavaScript double. Floating evaluation values are tracked separately from int32 values.

Exception support includes catch, throw/rethrow, finally, leave and unwinding across method calls. Exception filters, full CLR verification, type-initialization failure caching and all exception hierarchy/edge-case semantics are not complete. Parsing a signature does not imply support for every use of it. Arbitrary generic user methods/types, generic static-state separation, interfaces and reflection are not complete.

Execution is single-threaded and cooperative in the existing runtime worker. Instruction/time slices, pause, resume, stop and a managed step operation are provided. Debug traces show assembly, MethodDef token and IL offset. Breakpoint addresses use the MethodDef token plus byte offset; this is a prototype convention, not a portable .NET debugger protocol or PDB implementation.

### Explicit Framework bindings

Implemented overload subsets include Console.Write/WriteLine/ReadLine, string operations and basic composite formatting, primitive parsing/conversions, selected Math functions, StringBuilder, simple generic List and Dictionary operations, basic arrays, File read/write/append, Directory creation/lookup and Path helpers. Some VB compiler helper methods are implemented, sufficient for the included compiled VB console program.

This is not a distributed copy of mscorlib or System.dll, and not a complete managed BCL. Culture/globalization, FileStream/StreamReader/StreamWriter, DateTime, full decimal behavior, LINQ, XML/JSON libraries, System.Data, reflection emit, arbitrary delegates/generics, threading/tasks/async, sockets/HTTP, registry parity and COM are outside this milestone. Unsupported method calls produce CLR_UNSUPPORTED_BCL with the type, method, parameter types and call location rather than silently claiming success. Argument and overload semantics within the implemented subset are not full Framework parity.

### WinForms and System.Drawing

Basic Form, Control, Button, Label, TextBox, Panel, checkbox and radio classes map to existing USER32 windows/controls. Fixed bounds, text, parent collections, basic events/delegates, timers, modal dialogs and the Application.Run loop are implemented. Events execute the compiled managed handlers. Keyboard and mouse input return through the existing browser-to-worker transport.

Selected Point/Size/Rectangle/Color/Brush/Pen/Graphics methods route into native-compatibility GDI drawing handlers. Opaque rectangle and ellipse painting is tested. Window chrome remains Browser86's host chrome; guest control surfaces are Canvas-backed. This is a reimplementation of a WinForms subset, **not execution of Microsoft's actual System.Windows.Forms.dll or gdiplus.dll**.

No full designer/resource loading, docking/anchoring/layout engine, data binding, accessibility parity, font/text rendering parity, image codec stack, custom control framework, DevExpress compatibility or WPF is claimed. Layout lifecycle methods that do no work apply only to the documented fixed-coordinate subset. Alpha/transparency features not implemented by the drawing bridge fail explicitly.

### P/Invoke

Blittable 8/16/32-bit scalar and IntPtr arguments can call matching built-in Browser86 native handlers. GetCurrentProcessId is exercised by compiled C#. This is not arbitrary native DLL execution from managed code. String/structure/array marshaling, pinned handles, native-to-managed callbacks, general unmanaged calling conventions, 64-bit native calls and mixed-mode runtime hosting are unsupported.

### Resource limits and security

The worker executes instructions instead of using eval or JavaScript code generation. Managed objects are JavaScript values with host GC; a conservative cumulative allocation budget is enforced independently of native sparse-page allocation. This budget is not live managed-heap measurement. Arrays are limited to one million elements; individual managed strings to one million characters; managed call depth to 1,024; assembly count to 128. A long-running allocating application can hit the cumulative budget even when host GC reclaimed prior objects.

Guest files resolve only inside the per-package VFS, not the real host filesystem. The original ZIP remains unchanged. Snapshot persistence and export follow the native runtime. This implementation is not a hardened sandbox, full bytecode verifier, malware-analysis environment, thread-safe CLR or production compatibility product. Unsupported behavior and implementation bugs remain possible; use trusted programs and keep backups.

## Source map

- `src/runtime/dotnet/metadata.js`: CLI metadata, signatures and method bodies.
- `src/runtime/dotnet/values.js`: typed numeric values, byrefs, cloning and managed exceptions.
- `src/runtime/dotnet/runtime.js`: CIL interpreter, assembly/type/method resolution and exception unwinding.
- `src/runtime/dotnet/bcl.js`: explicit Framework method bindings.
- `src/runtime/dotnet/forms.js`: managed UI/event loop and USER32/GDI bridge.
- `src/runtime/inspect.js`: shared native/managed import and saved-package inspection.
- `tests/dotnet.test.mjs`: compiler-byte fixtures, reference comparisons and regression/failure tests.

## Primary implementation references

ECMA-335 Common Language Infrastructure, especially Partition II (metadata) and Partition III (CIL instructions): https://ecma-international.org/publications-and-standards/standards/ecma-335/

Microsoft managed execution overview: https://learn.microsoft.com/en-us/dotnet/standard/managed-execution-process

These documents describe the full platform; linking them is not a claim that the entire specification is implemented here.

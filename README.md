# Browser86 .NET

A Browser86 clone with an **original JavaScript CIL interpreter** and an **experimental .NET Framework compatibility layer**. Native x86 execution is retained.

**This runs real compiled C# and VB.NET executables. It is not a complete .NET Framework implementation, does not install Microsoft's CLR, and cannot run arbitrary WinForms applications.** It does not use Wine, Mono, an existing emulator, a Windows installation, remote execution, or application-specific JavaScript substitutes.

The implementation is based on `SamG-Coder/Browser86`, native main commit `ddf12d8547effb095821c8dbf7af97b8ace136a4`. Development is isolated on `dotnet-framework`; the original main branch and its hosted website are not replaced. MIT licensed. New implementation and demo sources: **samgcoder**.

## Run it

Extract the entire project and double-click **run.cmd**, or use Node.js 22+:

```sh
node tools/serve.mjs
```

Open **http://127.0.0.1:8080**. There is no runtime npm dependency and no build step. Do not open index.html using file://.

Open **Applications**, then **Load compiled .NET demos**. Choose `ManagedForms.exe` and click **Run executable**. Type into the guest textbox, click **Click and save**, and close the guest. Its compiled C# event handler writes `C:/app/winforms-result.txt`, available from **Virtual disk**.

The same package includes `ManagedConsole.exe`, `ManagedAnyCPU.exe`, and `ManagedVB.exe`. The console regression programs expect the arguments below; the .NET demo button fills them automatically:

```text
"hello world" second
```

Drop an existing managed EXE, or a ZIP containing its EXE, adjacent application DLLs and data files. Native and managed executables use the same virtual-disk, import, persistence and export workflow. Importing successfully means only that the image is a runnable *candidate*, not that every dependency and API is implemented.

## What was added

| Component | Implemented in this clone |
|---|---|
| Managed PE inspection | CLI header and ECMA-335 metadata tables/heaps/signatures; x86 and AnyCPU IL-only PE32 executables; managed diagnostics during import. |
| CIL execution | Evaluation-stack interpreter, methods, recursion, branches, locals/arguments/byrefs, arrays, object/field/static state, basic virtual dispatch, boxing, integer/float arithmetic, common checked conversions, catch/finally unwinding. |
| Framework subset | Console, strings, primitive formatting/parsing, selected Math, StringBuilder, basic List/Dictionary, File/Directory/Path, selected Environment and VB compiler helpers. |
| Packaged assemblies | Local application DLL resolution by simple assembly name beside the executable/dependency; no host or network resolution. |
| WinForms subset | Form, Button, Label, TextBox, Panel, checkbox/radio controls, fixed positioning, delegates/events, message pumping, basic timers and dialogs. |
| Drawing | Selected System.Drawing operations bridge into Browser86's existing USER32/GDI/Canvas rendering. Guest controls are not HTML/CSS replacements. |
| Interop | Restricted scalar 32-bit P/Invoke into existing Browser86 built-in native APIs. Not general native/managed interoperability. |
| Integration | Existing import/run/pause/step/stop flow, saved package reinspection, managed stack/IL reports, VFS snapshots and compiled demo launcher. |

Read **[docs/DOTNET.md](docs/DOTNET.md)** before judging an application's compatibility. The inherited native runtime and limitations are described in **[docs/UPSTREAM_README.md](docs/UPSTREAM_README.md)** and **[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)**.

## Verification

```sh
npm test
```

Recorded local result: **596 tests passed, 0 failed**: the original 562 tests plus 34 managed tests. Actual Microsoft .NET Framework csc/vbc compiler output is stored in `demos/managed/fixtures.json`, with native-Windows console reference output. Both C# builds match their native reference output and pass 28 checks each. The VB build also matches its native reference.

```sh
npm run managed-demos
```

This reconstructs `demos/browser86-managed-demo.zip` from those exact compiler-produced bytes; it does not recompile or replace their code. Recompile sources using `.github/workflows/managed-fixtures.yml` on a Windows runner.

The offline Chromium UI test passes real keyboard, mouse, CIL event, GDI pixel and worker-snapshot checks using **test-only origin adapters**. This is not proof of HTTP module loading, served CSP or real IndexedDB. Its report and screenshot are in `docs/managed-test-artifacts/`.

A separate real-origin test covers those boundaries:

```sh
npm install --no-save --package-lock=false playwright@1.57.0
npx playwright install chromium
# In a separate terminal, keep node tools/serve.mjs running.
node tools/browser-dotnet.mjs http://127.0.0.1:8080
```

The optional browser test dependency is for development only. See **[docs/DOTNET_TEST_REPORT.md](docs/DOTNET_TEST_REPORT.md)** for evidence and environment limitations.

## Compatibility boundary

This is a useful first managed-runtime implementation, **not “any .NET Framework EXE now works.”** WPF, full WinForms, DevExpress, System.Data, full reflection/generics, async/multithreading, COM, network APIs, mixed-mode C++/CLI, x64 native binaries, arbitrary marshaling, GAC and assembly-binding redirects are not implemented.

Guest managed objects use host JavaScript garbage collection plus a conservative cumulative allocation budget, not a CLR-compatible collector. The runtime is not a hardened malware sandbox. Use trusted test software and export important virtual files.

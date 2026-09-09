# Managed extension verification

## Main-branch integration verification — 9 September 2026

The downloaded extension was integrated into Browser86 main on the `ddf12d8` native baseline. All **612 Node tests pass** locally. A real Edge browser run of the compiled WinForms fixture verified canvas controls, text entry, a compiled click handler updating the label with the edited text, and close with exit code 0; no page errors occurred. Reproduce with `node tools/browser-managed.mjs [url]`, using optional `PLAYWRIGHT_MODULE` and `BROWSER_EXE` environment variables. The native Win32 browser regression also passes. Both official Free42 binary and decimal executables pass addition, clear, clean exit and saved-state reload checks after integration. Managed browser persistence across reload remains unverified.

The report below records the original source-clone build. Its blocked browser attempt is historical and does not describe the subsequent local Edge check.

---

Date: **9 September 2026**. Source baseline: `SamG-Coder/Browser86` commit `ddf12d8547effb095821c8dbf7af97b8ace136a4`. Tests concern the complete source clone shipped with this report.

## Result

**612 / 612 Node tests passed; zero failures, zero skipped tests.** Node 22. The last full run took about 13.1 seconds in the build container. All 562 original tests remain in the run; 46 managed-runtime tests and four production-worker message-transport tests were added.

The complete TAP log is in `docs/verification/node-tests.tap`. Test counts refer to Node test cases, not Windows API coverage or CLR conformance.

## Actual compiled executable evidence

| Program | Compiler configuration | Executed in clone | Evidence |
|---|---|---|---|
| ManagedConsole.exe | Microsoft Framework C# compiler, optimized x86 | Yes | 28 internal checks, exact normalized Windows stdout match, exit 0, expected virtual file content. |
| ManagedAnyCPU.exe | Same compiler, unoptimized AnyCPU | Yes | Same 28 checks, exact Windows stdout match, exit 0; a different instruction stream from the optimized executable. |
| ManagedVB.exe | Microsoft Framework VB compiler, x86 | Yes | Exact Windows stdout match, SUM=55, expected file content, exit 0. |
| ManagedForms.exe | Microsoft Framework C# compiler, x86 WinExe, Forms/Drawing references | Yes, runtime and worker protocol | Form plus four controls; edited Unicode text reaches a real CIL click delegate; click count and file write checked; paint commands change; normal and native-window close checked. |
| ManagedLibrary.dll | Microsoft Framework C# library | Loaded and called by the console programs | Helpers.Square(7) returns 49 through managed dependency resolution. Removing the DLL produces an explicit assembly error. |

The fixtures were compiled on a Windows GitHub Actions runner using `Microsoft.NET/Framework/v4.0.30319/csc.exe` and `vbc.exe`. Console, AnyCPU and VB outputs were also executed on that Windows runner to capture reference stdout. The recorded compiler workflow run was **34310861663**, artifact **10088300448**, on branch `dotnet-framework`, commit `256cc0ceddf76a32ac5735df244bf8c772961765`.

Only our small MIT-licensed fixture applications were executed on the Windows runner. The delivered website never asks a server to run a user's EXE. Microsoft runtime DLLs are not bundled. The fixture source, compiled bytes and Windows stdout are retained in `demos/managed`; `fixtures.json` contains the corresponding byte representations consumed by reproducible Node tests.

## Additional checks

The managed tests cover bounded instruction execution and allocation, pause/step/stop, metadata corruption, truncated inputs, invalid branches, mixed-mode rejection, native-path preservation, array-store type safety, empty/Unicode console input, arithmetic edge cases and virtual-disk backup round trips. Unsupported APIs/opcodes are checked for explicit diagnostics.

The four worker tests import the **actual** `src/import-worker.js` and `src/runtime-worker.js` modules under a small Node `worker_threads` message adapter. They verify package discovery, execution, draw-message delivery, debug/stop, fault messages and transferable virtual-disk snapshots. They do not substitute a mock managed runtime.

## Browser validation — blocked, not passed

An attempted Playwright/Chromium smoke test could not navigate to the local app: **`net::ERR_BLOCKED_BY_ADMINISTRATOR`**. It stopped before testing the page. No browser restriction was bypassed.

Consequently, this build has **not** established real-browser canvas rendering, interactive pointer/keyboard behaviour through the page, Content Security Policy compatibility, production worker URL loading, IndexedDB persistence across reload, mobile behaviour or deployed GitHub Pages behaviour. Runtime-level rendering commands and worker transport tests do not establish those results.

The upstream native project has separate historical browser reports; those are not evidence that the managed clone passed browser testing. No browser screenshot is supplied as verification.

## Reproduce

```sh
npm test
npm run test:managed
npm run demos:managed
```

To test the browser on a machine where local navigation is allowed, run `npm start`, open the printed address, load the compiled .NET demos, run ManagedForms, edit text, click/save twice, close, inspect the virtual file, then reload and verify the saved package. Also run the native demo to check the original path. This checklist is pending for the delivered clone, not a recorded success.

Passing these tests establishes a narrow working prototype. It does not establish full .NET Framework, WinForms, DevExpress or arbitrary third-party assembly compatibility. See `DOTNET.md` for the explicit boundary.

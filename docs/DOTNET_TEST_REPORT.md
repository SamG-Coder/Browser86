# Managed runtime test report

Date: 2026-09-09. Upstream native baseline: ddf12d8547effb095821c8dbf7af97b8ace136a4.

## Executed locally

`npm test`: **596 passed, 0 failed, 0 skipped**. This comprises the original 562 native tests plus 34 managed tests. The report includes real compiler-generated binary execution, not only synthetic opcode assertions.

The fixtures were produced by Microsoft .NET Framework v4.0.30319 csc/vbc on a GitHub Actions Windows runner (fixture workflow run 34310861663). `fixtures.json` stores the exact binaries and native console reference output. No Microsoft runtime DLLs are redistributed in that fixture package.

| Fixture | Recorded result |
|---|---|
| ManagedConsole.exe, x86, optimized C# | Exits 0; all 28 checks pass; stdout matches native Windows output. |
| ManagedAnyCPU.exe, AnyCPU, debug C# | Exits 0; all 28 checks pass; stdout matches native Windows output. |
| ManagedVB.exe | Exits 0; prints SUM=55; stdout matches native Windows output; writes the expected VFS file. |
| ManagedLibrary.dll | Loaded locally and called by the compiled console fixture. |
| ManagedForms.exe | Remains in Application.Run; paints via GDI, edits text, dispatches compiled click delegates, saves a virtual file, and exits 0 on Close. |

The 28 console checks exercise recursion, loops, integer wrapping, unsigned shifts, exact int64, floating point, byrefs, arrays, boxing, virtual dispatch/static initialization, strings, StringBuilder, generic collections, numeric parsing, Math, VFS, Path, cross-frame exception/finally handling, return through finally, divide-by-zero, bounds/overflow exceptions, assembly resolution, arguments and scalar P/Invoke.

Failure tests cover malformed metadata/tokens, wrong image architecture, mixed mode, missing assemblies, unsupported CIL and Framework calls, and memory/instruction limits. Tests also cover pause/step/stop, debugger serialization, numeric edge cases and independent managed state across processes.

## Offline browser test

`python tools/browser-dotnet-offline.py`: **PASS**, seven recorded checks, zero page errors, Chromium 144.0.7559.96 using Python Playwright 1.57.0. The original application and workers were bundled into a test document, with explicitly substituted storage, worker-URL, fetch and digest adapters for the opaque origin.

The test imports compiled fixtures, runs all three console binaries, sends actual browser keyboard and mouse events to Canvas controls, executes the compiled WinForms event handler, verifies a painted pixel is [30,120,200], closes the guest and checks the worker's saved-file snapshot. `managed-winforms.png` is a screenshot of that test, not a design mock-up.

**This offline test does not validate real IndexedDB, HTTP module loading or the served CSP.** Local normal-origin browser navigation was blocked with ERR_BLOCKED_BY_ADMINISTRATOR; no browser policy was changed. Node static-server tests remain part of the native suite.

## Separate real-origin harness

`node tools/browser-dotnet.mjs [url] [browser-executable]` tests the actual site, native module workers, original CSP, compiled managed console/GUI binaries, GDI pixels, standalone managed EXE import, real IndexedDB, and persistence after page reload.

A successful run writes `docs/managed-test-artifacts/http-browser-report.json` with result PASS and zero pageErrors, plus `managed-winforms-http.png`. An absent successful report must not be treated as passing evidence. CI source-publish verification runs this harness on its own ordinary HTTP origin; consult the generated report for the observed result.

None of these results claims arbitrary .NET Framework application compatibility, all WinForms controls, WPF, DevExpress, long-duration stability, or complete security validation.

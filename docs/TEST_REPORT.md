# Browser86 0.1 — recorded test report

Build date: 2026-09-08. Tests use the source and compiled demonstration binaries delivered with this project.

## Windows synchronization extension — 2026-09-08

On Windows with Node.js 24.19.0, the extended Node suite passes **51 tests, 0 failures, 0 skips**. The demo package was rebuilt using LLVM clang/lld-link targeting i686-pc-windows-msvc. It now includes `tests/SyncPrimitives.exe` and has eight EXEs: seven supported fixtures and the intentional unsupported-API fixture. The generated API catalog has 412 entries, nine more than the baseline.

Eleven new tests cover A/W event behavior, mutex initial ownership/recursion, signed semaphore count validation and overflow, previous-count output, invalid guest buffers/handles, wait-any ordering, atomic mixed-object wait-all, the 64-handle limit, named/security/APC rejection, pending continuation resumption, finite/infinite deadlines, and compiled PE imports with both signal and timeout completion. The original 40 regression tests continue to pass. The raw extended run is in `test-artifacts/sync-unit-tests.tap`.

The browser harness and origin smoke script now expect eight EXEs. Browser checks were not rerun for this extension; the browser results and screenshots below describe the original baseline only.

## Kernel handle extension — 2026-09-08

The suite passes **58 tests, 0 failures, 0 skips** on Node.js 24.19.0. Seven additional tests cover shared file offsets and sharing lifetime, per-handle flags and close protection, semaphore/mutex alias state, duplicate-close-source success/failure, invalid buffers/types, and process/thread pseudo-handle conversion/query/wait behavior. `HandleObjects.exe` exercises the seven new imports through the interpreter and exits successfully. The catalog has 419 entries. The rebuilt package has nine EXEs; browser test expectations were updated but browser tests were not rerun. Run `npm test` to reproduce the current suite.

## Named synchronization extension — 2026-09-08

The current suite passes **65 tests, 0 failures, 0 skips** on Node.js 24.19.0. Seven new tests exercise named create/open behavior and existing-state preservation, A/W Unicode names, case sensitivity, Local/Global namespaces and guest isolation, type collisions, final-close lifetime including duplicates, access rights and generic masks, basic SECURITY_ATTRIBUTES and unsupported descriptors, and invalid names/flags/pointers. `SyncPrimitives.exe` now imports and exercises all 12 new Open/Ex functions in addition to its original synchronization checks. Both signal and timeout paths still exit successfully through the guest ABI. The rebuilt catalog contains 431 entries. The full run is saved in `test-artifacts/win32-compat-tests.tap`; browser results below remain the historical baseline.

## File seek extension — 2026-09-08

Latest file I/O stage: **71 tests passed, 0 failed, 0 skipped** on Node.js 24.19.0. Six new tests cover exact 64-bit seeks, legacy high-word/sentinel behavior, EOF and zero-byte I/O, quota failure atomicity, gap zero-filling/truncation, invalid output pages, access checks and unsupported modes. `HandleObjects.exe` was rebuilt to import SetFilePointerEx (five x86 stack slots) and exercise a cursor above `2^53`, relative/end seeks and quota failures. Catalog: 432 entries. Browser checks were not rerun for this stage.

## File metadata extension — 2026-09-08

**79 Node tests passed, 0 failed, 0 skipped.** Eight new tests cover independent exact FILETIMEs, x86 structure layout, agreement between handle/path/find queries, timestamp suppression and duplicate handles, read-only and directory attributes, stable IDs across write/rename/copy, access and buffer validation, snapshot/backup persistence, legacy backups, and malformed metadata rejection. `HandleObjects.exe` imports all four new APIs (`GetFileInformationByHandle`, `SetFileTime`, `SetFileAttributesA/W`) and verifies IDs and timestamps through the x86 interpreter. The catalog contains 436 entries.

**Seven real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** `tools/browser-win32.mjs` ran against the actual static server and deployed CSP, with real import/runtime module workers and real IndexedDB. SyncPrimitives and HandleObjects executed successfully. Exact metadata survived a page reload, download to a backup ZIP and reimport as a new package. No origin adapters, CSP overrides, mocked workers or host guest-executable execution were used. The result is recorded in `test-artifacts/file-metadata-browser-report.json`. This focused Win32/storage test does not replace the broader GUI origin smoke test or storage-denial testing.

Run `node tools/serve.mjs`, then `node tools/browser-win32.mjs http://127.0.0.1:8080 [browser-binary]`. The optional Node `playwright` package is needed; `PLAYWRIGHT_MODULE` can select an existing installed package.

## File deletion lifetime extension — 2026-09-08

**86 Node tests passed, 0 failed, 0 skipped.** Seven new tests exercise independent opens and duplicate references, pending-name reservation, read/write after deletion, final-close quota recovery, mutual DELETE sharing, delete-on-close transfer/failure, forced cleanup on exit/stop/fault, snapshot exclusions, inheritance and unsupported directory modes. The rebuilt HandleObjects.exe calls DeleteFileA and exercises deletion and delete-on-close through real imports. The catalog remains at 436 entries; this stage improves existing APIs.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The checks cover module workers under the deployed CSP, both Win32 fixtures, IndexedDB, reload, ZIP export/reimport and absence of deleted temporary files in the saved disk. Raw results: `test-artifacts/file-lifetime-tests.tap` and `test-artifacts/file-lifetime-browser-report.json`.

Contracts: [DeleteFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-deletefilew), [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew). POSIX unlink, mappings and CRT stream lifetime are outside this stage.

## Original baseline results (historical)

| Check | Recorded result |
|---|---|
| Node test suite | **40 passed, 0 failed, 0 skipped.** |
| Deterministic integer ALU/flag comparisons | **18,000 cases passed** inside the CPU test suite. |
| Supported compiled PE32 fixtures | All six exercised successfully within their tested scenarios. |
| Intentional unsupported fixture | `CreateThread` produces `UNSUPPORTED_API`, not a fake success or exit 0. |
| Browser interaction harness | **9 assertions passed, no page errors**, Chromium 144.0.7559.96. |
| Actual static-server HTTP delivery | Tested from Node: HTML, JS MIME, demo ZIP, missing file, rejected POST and path escape. |
| Full HTTP-origin browser app load | **Not validated here.** Navigation was blocked by the environment's managed browser URL policy. |
| Real browser IndexedDB across reload | **Not validated here.** The in-memory harness uses a clearly marked test store adapter. |
| Deployed CSP in a real-origin browser session | **Not validated here.** The in-memory harness uses a test document without the application's CSP to load local test bundles. |
| Third-party application compatibility | **Not established.** No arbitrary application or commercial program is certified. |
| Windows launch script on an actual Windows host | Included and reviewed; **not executed on a Windows host here**. |

No managed browser policy was removed, weakened or bypassed. The normal navigation failure was `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Browser rendering/input tests instead used an in-memory `about:blank` document. They ran the original application and runtime worker code, with local adapters for module-worker URLs, fetch, hash input and origin storage. This is meaningful functional coverage, but not a substitute for a normal-origin deployment test.

## Compiled program coverage

**HelloConsole:** real EXE sections and imports loaded; integer program logic, Fibonacci formatting and clean exit 0 verified. It is not simulated by output matching inside the app.

**FileWorkbench:** reads the packaged `apps/data/message.txt`, computes a checksum and creates `apps/runtime-result.txt`. Current-directory handling and independent VFS mutations are checked.

**DllLoader:** two compiled DLLs request the same preferred image base. Both run `DllMain`, one is relocated, named imports resolve, and dynamic export lookup works. The checked result is 60, and the dynamically queried initialized value is 11.

**InteractiveConsole:** the real guest ReadFile call remains blocked until an input event arrives, then resumes and prints the supplied text.

**WindowStudio:** executes a compiled window procedure, paints GDI text/shapes, handles timer messages and buttons, writes a virtual file, waits for a modal MessageBox response, receives IDYES and exits through its message loop. Browser events enter the same guest callback path.

**PixelCanvas:** guest instructions generate a nontrivial DIB buffer; the renderer displays it on Canvas. The browser test measured 151,883 non-white pixels in the whole guest canvas (including text/graphics) and verified that mouse input regenerates the image and changes sampled pixel values. This is not a benchmark or a measure of compatibility.

**UnsupportedApi:** intentionally imports/calls CreateThread. The runtime reports the missing symbol and call context, with a null process exit code rather than claiming success.

## CPU/filesystem/parser coverage

The suite checks signed/unsigned arithmetic and flags, high-byte and 16-bit register writes, ModRM/SIB addressing, FS-relative access, calls/returns, multiply/divide errors, bounded REP loops, reverse string operations, CPUID preserved registers, 32-bit double-shift precision, selected x87 operand ordering and SSE behavior, unsupported opcode diagnostics, sparse page protection and heap behavior.

ZIP checks include CRC's known vector, stored Unicode entries, actual DEFLATE import, path traversal, duplicate case-insensitive names, file/parent conflicts, corruption, truncation, encryption, symlinks, unsupported compression and size limits. VFS checks cover independent snapshots, quotas, random/sparse writes, case-insensitive paths, root protection and backup round-tripping. PE checks include malformed headers, unsupported CPU/managed metadata and bounded malformed-field mutations. These are regression tests, not an exhaustive fuzzing campaign.

## Bugs found and fixed during testing

Tests exposed and corrected x87 reverse arithmetic operand ordering, ANSI mapping differences between browser and the local Node build, virtual-root listing/removal problems, quota-sensitive rename behavior, private-heap ownership, and a real dialog transport bug in which a MessageBox flag overwrote the worker event type. CPU register preservation and double-shift precision were also checked and corrected during implementation.

## Reproduce and extend

```sh
npm test
python tools/browser-harness.py
```

The harness additionally needs Python Playwright and Chromium. To run the **separate normal-origin check** in an unrestricted browser environment, start the static server and execute:

```sh
python tools/browser-smoke.py --url http://127.0.0.1:8080
```

The last script is provided for release validation, not counted as a successful test in this report. Test actual file durability by stopping the guest, waiting for the saved indicator, reloading, exporting, clearing the test profile, then importing the backup.

## Raw artifacts

- `test-artifacts/unit-tests.tap`: recorded Node test run.
- `test-artifacts/browser-report.json`: recorded harness mode, assertions, browser version and limitations.
- `test-artifacts/initial.png`: actual browser rendering of the initial application UI in the harness.
- `test-artifacts/window-running.png`: compiled window demo after a guest dialog response.
- `test-artifacts/window-dialog.png`: guest-requested MessageBox.
- `test-artifacts/pixel-running.png`: guest-generated DIB display.
- `test-artifacts/mobile-layout.png`: narrow viewport layout and visible unsupported-API fault.

Screenshots are browser captures of the running test harness, not generated concept images. They are not evidence of untested HTTP-origin storage or unsupported program compatibility.

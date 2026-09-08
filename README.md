# Browser86

**Drop an application ZIP into a browser, choose an EXE, and run it against an isolated virtual C: drive.**

Browser86 is an original JavaScript IA-32 interpreter, PE32 loader, and **partial** Windows user-mode compatibility runtime. It does not use Wine, Boxedwine, v86, QEMU, a Windows installation, remote execution, or an existing CPU emulator. The application and demo source are MIT licensed.

**This is an executable prototype, not universal Windows compatibility.** It executes real 32-bit x86 machine code and can run the eight included supported demonstration programs. It will not run arbitrary modern Windows applications. Importing a package successfully does not mean its software is compatible. See [COMPATIBILITY.md](docs/COMPATIBILITY.md) for the actual boundary.

## Start on Windows

Extract the project ZIP and double-click **`run.cmd`**. With Node.js available, it starts a static server and opens the browser after the server is listening. With Python available instead, it prints the address to open.

Or, from the extracted project directory:

```sh
node tools/serve.mjs
```

Open **http://127.0.0.1:8080**. Keep the terminal open while using the application. Node.js 22 or newer is the development/test baseline. There are **no npm runtime dependencies and no build step**; `npm install` is unnecessary.

Python-only alternative:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

On macOS/Linux, `./run.sh` chooses Node or Python. Do not double-click `index.html`: module workers need a served origin, not `file://`.

A browser with ES modules, Web Workers, BigInt, IndexedDB, Web Crypto and `DecompressionStream('deflate-raw')` is required. The rendering/worker harness was exercised with Chromium 144.0.7559.96. That is the recorded test engine, not a claim about the latest browser version. Focused HTTP-origin worker/storage checks now pass in Edge 152.0.4191.66; full GUI release testing remains on the checklist.

## Use it

1. Click **Load the compiled demo package**, or drop one application `.zip` into the page.
2. Choose an executable in the left panel. Its architecture and imports appear under **Compatibility**.
3. Set command-line arguments and the memory cap, then click **Run executable**.
4. Interact with the guest console or window. Use **Virtual disk** to inspect output files, **Debugger** to inspect registers/API calls, and **Export virtual disk** to save a backup.

The package must contain the program's dependencies and assets, not just a shortcut to an installed program. Folder structure is preserved:

```text
MyApp.zip                         Virtual disk
├── bin/                          C:/app/bin/
│   ├── MyApp.exe       →              MyApp.exe
│   └── helper.dll                    helper.dll
└── data/settings.ini              C:/app/data/settings.ini
```

Selecting `bin/MyApp.exe` sets the guest working directory to `C:/app/bin`. Paths and file lookup are case-insensitive. Only **one guest process/thread** runs at a time. The ZIP is a package, not an instruction to execute every EXE inside it.

The original ZIP is never modified. Changed files live in the browser's virtual disk. Snapshots are sent approximately every three seconds while files change, and when the process stops, exits or faults. The app writes those snapshots to IndexedDB and displays save failures. Stop the guest, wait for the saved indicator, and export important work before closing the tab. A page-unload save is not guaranteed.

Importing the exact same original ZIP again restores that package's saved disk; delete the saved package to start fresh. Exported backups contain the entire virtual C: drive plus a small manifest, and can be imported again. Host, port, browser profile and site-data clearing affect which browser storage is available.

## What is implemented

| Component | Implemented behavior |
|---|---|
| Package importer | Drag/drop, file picker, EXE discovery, PE architecture inspection, dependency/import display. |
| ZIP implementation | Original central-directory parser, Store/Deflate, CRC validation, original ZIP writer, traversal/collision/symlink rejection, size limits. Browser-native DEFLATE is used for compressed bytes. |
| Virtual filesystem | Case-insensitive C: drive, directories, random-access file I/O, independent package disks, snapshot transfer, IndexedDB adapter, backup export/import. |
| CPU | Actual 8/16/32-bit integer instructions, flags, ModRM/SIB, calls/returns, string instructions, FS/TEB access, selected x87/SSE instructions, bounded worker slices. Unsupported encodings fault. |
| PE loader | PE32 section mapping/protection, IAT binding, packaged DLL imports/exports, forwarded exports, base relocations, DLL initialization, static TLS setup/callback dispatch, bounded resource lookup. |
| Windows compatibility | Original kernel/file/heap/path/console handlers, portions of CRT, basic registry storage, window callbacks/messages, timers, basic controls and GDI drawing. |
| Diagnostics | Pause/resume/step, breakpoint, register and memory-map display, recent API/EIP traces, exact unsupported import/opcode reports and JSON export. |

`src/api-catalog.json` contains **603 registered import entries**, including A/W variants, CRT functions and data entries. **That count is not 603 fully compatible Windows APIs.** Many handlers implement a restricted argument/behavior subset; others explicitly reject unsupported modes. See the source and compatibility notes before assuming parity.

## Included compiled programs

These are PE32 binaries compiled from the included C source with LLVM, not JavaScript stand-ins. No Windows SDK, commercial software, operating-system DLLs, or Wine components are packaged.

| Executable | What it exercises |
|---|---|
| `HelloConsole.exe` | CPU arithmetic, console imports, formatting, Fibonacci values and clean process exit. |
| `apps/FileWorkbench.exe` | Reading packaged assets and writing `runtime-result.txt` through guest file calls. |
| `apps/InteractiveConsole.exe` | A genuine blocked `ReadFile` resumed by browser console input. |
| `apps/DllLoader.exe` | Two application DLLs, `DllMain`, IAT exports, dynamic `GetProcAddress`, and relocation when preferred bases collide. |
| `apps/WindowStudio.exe` | Guest window procedure, controls, GDI shapes/text, timer, file-writing button and modal dialog result. |
| `apps/PixelCanvas.exe` | Guest-computed pixels displayed with `StretchDIBits`; clicking regenerates the image. |
| `tests/SyncPrimitives.exe` | Named A/W events, mutexes, semaphores, access rights, atomic multi-object waits and a suspended wait. |
| `tests/HandleObjects.exe` | Duplicated file positions, handle flags, close protection and process/thread queries. |
| `tests/UnsupportedApi.exe` | An **intentional failure** at `CreateThread`, demonstrating an honest unsupported-API diagnostic. |

## Verification

```sh
npm test
# Equivalent:
node --test tests/*.test.mjs
```

The recorded run passes **499 tests**, including 18,000 deterministic ALU/flag comparisons, memory/ZIP/VFS validation, all eight supported demos, the intentional failure, GUI callbacks, DLL relocation, synchronization state/error/timeout checks, environment buffers and blocks, open-file deletion lifetime, extended file-information queries and static-server delivery.

The optional browser harness is:

```sh
python tools/browser-harness.py
```

It requires Python Playwright and an installed Chromium. The harness runs the original application and worker code in an in-memory browser document with test-only adapters for origin-dependent services. It passed nine interaction assertions without page errors. **It does not validate production HTTP module loading, the deployed CSP, or real IndexedDB durability.** The environment's navigation policy blocked the normal localhost browser run; no browser policy was changed. The Node test separately verifies actual HTTP delivery from the static server.

For a normal browser on your own machine, run the server, then:

```sh
python tools/browser-smoke.py --url http://127.0.0.1:8080
```

That origin-based smoke test is included but was **not executed successfully in the restricted build environment**. A separate Node Playwright test, `node tools/browser-win32.mjs [url] [browser-binary]`, now passes real-origin Win32 workers, exact metadata in IndexedDB, reload and backup reimport. It requires the optional `playwright` package (or `PLAYWRIGHT_MODULE` pointing to an installed copy). Full details and raw results are in [TEST_REPORT.md](docs/TEST_REPORT.md).

## Rebuild the demo binaries

The project already includes the compiled demonstration ZIP. To rebuild it, put `clang` and `lld-link` on PATH, then run:

```sh
python tools/build-demos.py
node tools/catalog.mjs
npm test
```

The builder targets `i686-pc-windows-msvc`, creates import libraries from small local definitions, and never executes a guest EXE on the host. Linker intermediates go into `.build/` and are not needed to serve the website.

## Project map

```text
src/app.js                 Application import, selection, run controls and panels
src/import-worker.js       ZIP import and executable inspection
src/runtime-worker.js      Scheduling, guest events, snapshots and debugger transport
src/runtime/cpu.js         Original IA-32 instruction interpreter
src/runtime/memory.js      Sparse protected pages and allocation
src/runtime/pe.js          PE images, linking, relocation and DLL initialization
src/runtime/process.js     Guest process, stack/TEB/PEB, imports and callbacks
src/runtime/win32.js        Original kernel/file/path/heap/registry compatibility
src/runtime/file-info.js    File IDs, attributes and exact persistent FILETIMEs
src/runtime/file-system.js  File creation, sharing, copying and deletion lifetime
src/runtime/files.js        Exact 64-bit file cursors and synchronous disk I/O
src/runtime/handles.js      Shared kernel objects, handle flags and duplication
src/runtime/sync.js         Named event/mutex/semaphore objects, rights and waits
src/runtime/gui.js          Window messaging, controls and GDI command generation
src/runtime/crt.js          Restricted C runtime implementation
src/runtime/zip.js          ZIP reader/writer and validation
src/runtime/vfs.js          Virtual C: drive
src/ui/display.js           Browser controls and Canvas rendering
src/store.js               IndexedDB package store
src/backup.js              Full virtual-disk backup format
```

Read [ARCHITECTURE.md](docs/ARCHITECTURE.md), [EXTENDING.md](docs/EXTENDING.md), and [SECURITY.md](docs/SECURITY.md) before extending the runtime.

**Use trusted test programs. This is not a hardened malware sandbox, a complete Windows implementation, or a production compatibility product.**

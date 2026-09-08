# Architecture

## End-to-end execution

```text
User-selected ZIP
       |
       v
Import worker: validate directory, bounds, names, expansion and CRC
       |
       v
Case-insensitive C:/app package + PE candidate list
       |
       v
User selects an EXE; its containing folder becomes current directory
       |
       v
Runtime worker creates memory, stack, TEB/PEB and virtual kernel objects
       |
       v
PE loader maps EXE and application DLLs, relocates, binds IAT, initializes DLLs/TLS
       |
       v
Original JavaScript IA-32 interpreter fetches and executes guest instructions
       |
       +-- import trap --> original Win32/CRT handler --> virtual disk/objects
       |
       +-- window callback --> genuine guest instructions --> drawing commands
       |
       +-- unsupported operation --> structured diagnostic, no fabricated success
       |
       v
Worker messages --> Canvas, browser controls, console, debugger and snapshots
```

Only static website files are served by Node/Python. Executables imported by the user remain in browser memory/storage and are never passed to Node, a host shell, Wine or a Windows process. The runtime uses browser platform services for streams, workers, storage, hashing, graphics and input; it does not attempt to implement a browser or a DEFLATE codec from scratch.

## Guest memory and ABI

Memory is a sparse collection of 4 KiB guest pages with read/write/execute checks. Guest addresses are numbers, never host pointers. The null/low 64 KiB region is guarded. Mapping overlap, size, permission and transfer bounds are checked. PE pages become read-only/executable/writable according to combined section permissions after relocation and IAT binding.

The main stack is an 8 MiB region. FS points to a small TEB with stack limits, process/thread IDs, TLS pointer, PEB pointer and last-error value. This is a minimal user-mode substrate, not a complete Windows NT implementation. Programs that inspect unsupported internal structures may fault.

System imports bind to reserved interpreter trap addresses starting at `0xF0000000`. No machine code is installed in the host. When EIP reaches a registered trap, the interpreter bridge reads stack arguments, runs the handler, writes the return value to EAX, and applies stdcall or cdecl cleanup. Variable/data imports point to guest memory instead of function traps.

Window procedures, DLL entry points and other callbacks run in the same interpreter. A reserved callback return address resumes the original continuation after a real guest `RET`. Callback stack balance is checked. A blocked handler stores a continuation; console input, dialog results or queued messages resolve it later. The guest is not spun in a busy loop waiting for the browser.

## Scheduling and rendering

The runtime worker executes bounded slices (up to 20,000 dispatched instructions and about 10 ms, with periodic time checks). REP operations yield after bounded batches. This is cooperative scheduling, not preemption inside every individual API handler. Explicit Stop can terminate the worker if it does not respond; unsent file changes can then be lost.

The UI receives window state and GDI drawing operations, batches them, and renders Canvas/browser controls. A BUTTON click becomes a guest WM_COMMAND; it is not a hardcoded demo action. Dialog choices resume the waiting MessageBox call with the appropriate response ID. Guest DIB bytes are converted to RGBA then drawn, rather than replaced with an imitation image.

Fonts and text metrics are approximate browser equivalents. There is no DirectX/WebGPU backend in this release.

## Files and persistence

Each import receives a package ID derived from the original ZIP's SHA-256. A separate complete disk snapshot is retained per package. File paths are normalized within virtual C:, with case-insensitive lookup. Exports use a stored ZIP under `drive-c/` plus a `browser86-backup.json` manifest. Importing that format restores the full drive rather than nesting it again under C:/app.

The worker holds the active mutable disk. Snapshot copies are transferred back to the UI, which serializes IndexedDB writes and acknowledges the snapshot. Autosaves occur after changes on an approximate three-second interval and at process termination. Export during execution first requests a fresh snapshot. Snapshot persistence is separate from guest memory: reopening a package restores files, not suspended CPU state.

Browser storage can be unavailable, quota-limited, cleared or evicted. Save errors are surfaced. Maintain exported backups. The application is not a replacement for durable storage, and beforeunload cannot guarantee a final asynchronous save.

## Validation strategy

Synthetic instruction vectors and deterministic ALU comparisons exercise the CPU independently. Compiled C programs exercise the same interpreter through real PE imports and function calls. Two DLLs intentionally request the same preferred base, requiring actual relocation; both run initialization code. GUI tests use actual callbacks and verify the virtual file written by one of them.

The browser harness uses the original worker and UI implementation with local test adapters for origin services. It demonstrates worker transport, DOM/Canvas rendering and input without bypassing the environment's blocked navigation policy. Production HTTP-origin loading/CSP/storage remain distinct validation tasks; see TEST_REPORT.md.

## Original implementation and references

The runtime was written for this project, not copied from an existing emulator or Wine. The PE layout and Windows API contracts were investigated using primary documentation; the documents are references, not bundled source dependencies. See SOURCES.md.

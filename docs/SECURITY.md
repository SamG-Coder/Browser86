# Security and data handling

**Experimental software. Not audited or hardened for hostile programs. Use trusted test packages.**

The runtime interprets guest x86 bytes; it does not evaluate those bytes as JavaScript, launch them on the host, expose host filesystem paths, or give guest programs a network API. Virtual files and registry state are separate from the host filesystem. User-selected package names, guest text and diagnostics are rendered with textContent or Canvas, not inserted as guest HTML.

The ZIP reader rejects path traversal, absolute/drive paths, case-insensitive collisions, files used as directories, symlinks, unsupported encryption/ZIP64 and inconsistent metadata. It verifies CRC and bounds expansion while reading DEFLATE output. These checks reduce risk; they do not establish that every malformed archive or executable is safe.

Sparse memory and access checks prevent guest pointers from directly indexing arbitrary host objects. Some library handlers have their own transfer limits. Runtime slices and a main-thread stop mechanism limit some runaway execution, but a large synchronous handler or parser can still use excessive CPU/memory. Total browser usage includes archive/disk/snapshot copies in addition to guest committed memory.

The served application CSP restricts scripts and workers to the same origin, prevents object embeds and denies arbitrary network connections. The runtime does not use eval or dynamically generated guest JavaScript. The optional browser test harness changes only its test document to allow injected bundles and uses local origin-service adapters; it does not weaken the shipped page or alter managed browser policies.

Packages remain local to the browser; the static server has no upload endpoint. IndexedDB data is not encrypted by this project. Other scripts installed on the same site origin, malicious extensions, a compromised browser profile or a browser vulnerability may undermine isolation. Serve the project on a dedicated origin, not a site that contains untrusted scripts.

Exports contain the entire virtual disk, including application files, registry JSON and user-created documents. Diagnostic JSON includes paths, selected imports, addresses, recent arguments and runtime state; inspect it before sharing. Do not put secrets in test packages.

## Durability is not security

Stopping the application normally requests a final disk snapshot. Forcing termination or closing/crashing the tab may lose unsaved changes. Browser storage denial, quota exhaustion, eviction and site-data clearing are possible. Keep explicit exported backups of anything important. CPU/memory execution state is not persisted.

## Reporting a defect

Preserve the diagnostic JSON and a minimal source-built reproducer. Do not include proprietary or confidential program files without permission. For parser bugs, provide the smallest malformed file that reproduces the issue, its size and which validation stage failed.

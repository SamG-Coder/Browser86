# Extending Browser86

## Add an API correctly

`Win32.add(dll, name, argumentCount, handler, cdecl)` registers a function and supplies its guest trap address. The kernel helper in `installKernel()` fixes `kernel32.dll` and stdcall for common APIs.

A synchronous handler returns an unsigned integer-compatible result. Use `this.fail(error, returnValue)` for an expected Windows failure and `RuntimeFault` for a genuinely unsupported runtime feature. Guest pointers must be read through `Memory`; paths must go through the virtual filesystem. Never use host files or construct host executable commands from guest input.

For asynchronous input, return `p.wait(check, reason)`. `check()` returns undefined while pending, and the actual result when ready. The original guest call remains suspended until then. For a guest callback, return `p.call(address, args, continuation)`; do not call guest code as JavaScript.

Match the exact ABI: argument count includes every 32-bit stack slot, cdecl callers clean their own arguments, structures must use their x86 layout, A/W variants require the right encoding, and functions returning floating/64-bit results require their documented registers/stack conventions. Consult the source before assuming a generic integer return covers the API.

After adding or changing handlers:

```sh
node tools/catalog.mjs
npm test
```

Add unit tests for success and failure, invalid handles/buffers, unsupported flags, and a compiled C test that imports the real symbol. A catalog entry alone is not completion.

## Add instructions

The decoder in `cpu.js` handles prefixes and ModRM/SIB. Operand widths, displacement sign extension, low/high byte registers and flags need independent tests. Undefined architectural behaviors should not be advertised as faithful emulation. The x87 subset intentionally uses JavaScript binary64; full 80-bit parity is separate work.

Add a small encoded vector in `tests/cpu.test.mjs`, then a compiler-generated test. Verify the exact faulting instruction bytes using a disassembler rather than guessing from the surrounding function. Keep unsupported opcodes explicit. Do not change a fault to NOP just to let a program proceed.

## Add program fixtures

Put original source in `demos/source`, declare required imports in the small header, and extend `tools/build-demos.py`. The builder creates import libraries locally with LLVM, so a Windows SDK is not needed for these fixtures. Target the actual runtime rather than replacing program output in the browser.

Exercise DLL load/unload, TLS, exceptions, process creation and graphics as separate milestones; each is a substantial compatibility surface. Prioritize by concrete diagnostics from a legally distributable test program, then preserve the failure as a regression fixture.

## Origin-based browser release check

Run `tools/browser-smoke.py` against a normal HTTP-origin server. Verify imports, workers under the deployed CSP, console and window interaction, disk changes across reload, virtual-disk export/reimport, and storage-denial behavior. Repeat on the actual intended browser and operating system. The restricted in-memory harness is not a substitute for these checks.

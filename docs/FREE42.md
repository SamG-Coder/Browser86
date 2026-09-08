# Free42 compatibility target

Tested on 2026-09-08 using the publisher's prebuilt [Free42 Windows 32-bit ZIP](https://thomasokken.com/free42/download/Free42Windows-32bit.zip), linked from the [official download page](https://thomasokken.com/free42/index.html). No application rebuild or host execution was used.

Package SHA-256: `6A2D009F40C2BF6670956D5EE5CE9E8A899D1BE86927B15BDAD9AE332D7C5726`.

**Neither executable reaches a calculator window yet.** Both are native PE32 x86 applications. The main Windows download is x64; use the separately linked 32-bit package for Browser86.

| Executable | Current first failure | Unresolved imports | Guest windows |
|---|---|---:|---:|
| Free42Binary.exe | `msvcrt.dll!__p__commode`, caller `0x004c026c` | 175 | 0 |
| Free42Decimal.exe | `msvcrt.dll!__p__commode`, caller `0x00654a87` | 147 | 0 |

Unresolved import counts do not mean every import is required for startup. Dependencies include the Microsoft C/C++ runtime, GDI+, buffered painting, menus and dialogs; a simple calculator interface still relies on substantial Windows behavior.

This attempt fixed two observed blockers: the `66 0F 13 /r` MOVLPD memory store instruction and the `_set_app_type` CRT export alias. MOVLPD tests cover the exact eight-byte write, unaligned memory, preserved registers/flags and rejected register destinations. The resulting Node suite passes 504 tests.

Reproduce after downloading the official package:

```sh
node tools/probe-application.mjs path/to/Free42Windows-32bit.zip
```

For the actual browser path, serve Browser86, import that ZIP, select each executable and press Run. Both were exercised in Edge 152.0.4191.66, including the ZIP worker and runtime worker.

Evidence: [browser report](test-artifacts/free42-browser-report.json), [runtime report](test-artifacts/free42-runtime-report.json), [tests](test-artifacts/free42-startup-tests.tap), [Binary screenshot](test-artifacts/Free42Binary-first-run.png), [Decimal screenshot](test-artifacts/Free42Decimal-first-run.png).

The next milestone is completing the exercised CRT startup path, then reaching window creation and identifying the next actual API failure. Successful imports alone will not count as calculator compatibility: the acceptance check is an interactive window with a correct calculation, clear operation and clean close.

# Free42 compatibility target

Tested on 2026-09-08 using the publisher's prebuilt [Free42 Windows 32-bit ZIP](https://thomasokken.com/free42/download/Free42Windows-32bit.zip). No application rebuild or host execution was used.

Package SHA-256: `6A2D009F40C2BF6670956D5EE5CE9E8A899D1BE86927B15BDAD9AE332D7C5726`.

**Both executables pass the first interactive mouse baseline:** launch, display the calculator, click `2`, `Enter`, `3`, `+`, display `5.0000`, clear to `0.0000`, and close with exit code zero. Both produce identical calculator images for calculation and clear.

| Executable | Addition | Clear | Close | Remaining unresolved imports |
|---|---|---|---|---:|
| Free42Binary.exe | 5.0000 | 0.0000 | Exit 0 | 87 |
| Free42Decimal.exe | 5.0000 | 0.0000 | Exit 0 | 60 |

The actual EXE executes in Browser86's IA-32 interpreter. Its skin decoding, calculator arithmetic, resources, and LCD bitmap remain guest code/data. The runtime implements reusable Windows/CRT and CPU behavior; it contains no Free42 source, skin asset, hardcoded answer, or application-specific compatibility branch. Guest menus and built-in controls now draw through the graphics command path instead of HTML controls and appearance CSS. USER32 supplies generic control rendering, as Windows does; these are approximate implementations, not Microsoft's own USER32/GDI binaries. Existing host window chrome and the legacy MessageBox presentation still use browser UI.

The exercised additions include CRT startup and file operations, binary64 decimal formatting, x87 extended storage, packed SSE conversions, menu resources and accelerators, GDI+ indexed/RGB bitmap storage, clipping/transforms/image drawing, buffered painting, and synchronous initial size notification before painting.

This is a narrow baseline, not complete Free42 compatibility. A keyboard sequence produced an incorrect operation and needs further input-translation investigation; use mouse input for this baseline. Scientific functions, programming, printing, file dialogs, persisted-state reload, alternate skins, and extended sessions have not passed acceptance testing. Unsupported imports still stop execution if reached. x87 arithmetic remains binary64 despite support for reading/writing 80-bit storage; GDI+ text uses approximate browser font metrics.

## Reproduction

Serve Browser86, import the official 32-bit ZIP, select either EXE, and press Run. Scroll within the guest desktop to reach the calculator's lower rows. The main Windows download is x64 and is not this test target.

The standalone runtime probe reaches the message loop:

```sh
node tools/probe-application.mjs path/to/Free42Windows-32bit.zip
```

For the browser acceptance test, configure `PLAYWRIGHT_MODULE` and optionally `BROWSER_EXE`, then run:

```sh
node tools/browser-free42.mjs http://127.0.0.1:8096 path/to/Free42Windows-32bit.zip
```

The test compares complete canvas PNG hashes against visually verified addition/clear images. Those hashes were recorded with Edge 152.0.4191.66; font/rasterization differences in other browsers can change menu pixels even when the guest LCD agrees. The test does not download, rebuild, or execute the EXE on the host.

## Evidence

- [Interactive browser report](test-artifacts/free42-interactive-report.json)
- [Addition: guest canvas showing 5.0000](test-artifacts/free42-addition.png)
- [Clear: guest canvas showing 0.0000](test-artifacts/free42-clear.png)
- [552-test runtime suite](test-artifacts/free42-interactive-tests.txt)
- Earlier startup-failure evidence is retained: [browser report](test-artifacts/free42-browser-report.json), [runtime report](test-artifacts/free42-runtime-report.json), [Binary screenshot](test-artifacts/Free42Binary-first-run.png), [Decimal screenshot](test-artifacts/Free42Decimal-first-run.png).

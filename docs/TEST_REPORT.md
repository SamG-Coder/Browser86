# Browser86 0.1 — recorded test report

Build date: 2026-09-08. Tests use the source and compiled demonstration binaries delivered with this project.

## Extended solid pen creation and rendering - 2026-09-08

**243 Node tests passed, 0 failed, 0 skipped.** Three new tests cover all nine geometric cap/join combinations, OBJ_EXTPEN, x86 descriptions, size/short-buffer queries, selected-object lifetime, saved miter-state resolution, invalid flag/width combinations and input validation. The rebuilt HandleObjects.exe imports ExtCreatePen and inspects its style, width, color and hatch fields through x86 calls. The catalog contains 519 entries.

**Fourteen real-canvas checks passed in Edge 152.0.4191.66**, including visible geometric miter extension at limit 10 and beveling at limit 1. Evidence: [canvas report](test-artifacts/extended-pens-canvas-report.json). **Eight existing real-origin browser checks passed with no page errors**, including fixture execution, persistence and backup. Evidence: [Node TAP](test-artifacts/extended-pens-tests.tap) and [browser report](test-artifacts/extended-pens-browser-report.json).

Native ctypes probes created/deleted owned extended pens to verify style/width validation, zero width, object type and descriptions. The native zero-entry EXTLOGPEN header is 28 bytes on the 64-bit host; the guest uses the 24-byte x86 header with a 32-bit hatch field. No guest executable ran on the host. Microsoft [ExtCreatePen](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-extcreatepen) specifies geometric caps, joins and miter behavior. This stage supports solid brush/solid line modes; dashed/null/inside-frame/user-style/pattern modes explicitly fault. Pixel-exact native rasterization, coordinate transforms and nonfinite miter rendering remain unfinished.

## GDI miter-limit state extension - 2026-09-08

**240 Node tests passed, 0 failed, 0 skipped.** Two new tests cover defaults, float32 bit preservation, previous-value output, independent DCs, save/restore, NaN/infinity, invalid limits and atomic output validation. The rebuilt HandleObjects.exe imports GetMiterLimit and SetMiterLimit with a genuine float parameter and checks the output bits. The fixture supplies LLVM's required _fltused marker. The catalog contains 518 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The rebuilt fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/miter-limit-tests.tap) and [browser report](test-artifacts/miter-limit-browser-report.json).

Native ctypes probes used an owned memory DC, deleted in finally, to verify defaults, invalid limits, NaN/infinity acceptance, optional output and invalid DC errors. No guest executable ran on the host. Microsoft [SetMiterLimit](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setmiterlimit) and [GetMiterLimit](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getmiterlimit) define the state contract and geometric-line use. Rendering integration is deferred until geometric miter-join pens are supported; this stage does not claim visible miter-limit effects.

## PolyDraw mixed line and curve extension - 2026-09-08

**238 Node tests passed, 0 failed, 0 skipped.** Three new tests cover native point-type sequences and final positions, combined move/line/curve/closure commands, selected pen color, copied inputs, malformed groups and atomic input validation. HandleObjects.exe imports PolyDraw and checks a closed cubic figure, endpoint position and malformed group error through x86 calls. The catalog contains 516 entries.

**Twelve real-canvas checks passed in Edge 152.0.4191.66**, including PolyDraw cubic midpoint coverage and a closed line figure. Evidence: [canvas report](test-artifacts/poly-draw-canvas-report.json). **Eight existing real-origin browser checks passed with no page errors**, including the updated fixture, persistence and backup. Evidence: [Node TAP](test-artifacts/poly-draw-tests.tap) and [browser report](test-artifacts/poly-draw-browser-report.json).

Native ctypes probes used an owned memory DC, deleted in finally, to verify valid/invalid type sequences, empty/null calls, current-position updates and errors. No guest executable ran on the host. Microsoft [PolyDraw](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polydraw) documents grouping and closure. The probed Windows implementation retains the supplied endpoint after closure, differing from the documented closing-line endpoint; this implementation follows the observation. BeginPath/EndPath recording, clipping/transforms and pixel-exact rasterization remain unfinished.

## Cubic Bezier drawing extension - 2026-09-08

**235 Node tests passed, 0 failed, 0 skipped.** Two new tests cover multi-curve control-point grouping, selected pen color, signed copied points, distinct current-position rules, saved-state restoration, invalid counts, null arrays and atomic memory validation. HandleObjects.exe imports PolyBezier and PolyBezierTo, checking both position contracts and invalid counts through x86 calls. The catalog contains 515 entries.

**Ten real-canvas checks passed in Edge 152.0.4191.66**, including cubic midpoint coverage from both APIs plus prior polygon/fill-rule checks. Evidence: [canvas report](test-artifacts/bezier-canvas-report.json). **Eight existing real-origin browser checks passed with no page errors**, including execution of the updated fixture, persistence and backup. Evidence: [Node TAP](test-artifacts/bezier-tests.tap) and [browser report](test-artifacts/bezier-browser-report.json).

Native ctypes probes used an owned memory DC, deleted in finally, to verify counts 0 through 7, null arrays, invalid DCs and final current positions. No guest executable ran on the host. Microsoft documents [PolyBezier](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polybezier) and [PolyBezierTo](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polybezierto). Canvas curves provide cubic geometry but do not establish native pixel-exact rasterization; clipping, transforms and unsupported pen styles remain unfinished.

## PolyPolygon compound contours extension - 2026-09-08

**233 Node tests passed, 0 failed, 0 skipped.** Two new tests cover compound contour boundaries, selected fill mode, copied points, unchanged current position, signed count errors and complete validation before drawing. The rebuilt HandleObjects.exe imports PolyPolygon and executes a multi-contour call through x86. The catalog contains 513 entries.

**Eight real-canvas checks passed in Edge 152.0.4191.66**, including nested contours with alternate fill, same-direction winding fill and opposite-direction winding holes. tools/browser-polygons.mjs passes actual runtime commands through GuestDisplay and inspects interior pixels. Evidence: [canvas report](test-artifacts/poly-polygon-canvas-report.json). **Eight existing real-origin browser checks passed with no page errors**, including the rebuilt fixture, persistence and backup. Evidence: [Node TAP](test-artifacts/poly-polygon-tests.tap) and [browser report](test-artifacts/poly-polygon-browser-report.json).

Native ctypes probes used an owned memory DC, deleted in finally, to verify zero/negative group counts, zero/one/two-point contours, invalid later contours, null arrays and invalid DC errors. No guest executable ran on the host. Microsoft [PolyPolygon](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polypolygon) specifies closed contours, current-position preservation and use of selected pen/brush/fill mode. Pixel-exact stroke edges, mapping transforms, clipping and pattern brushes remain unfinished.

## PolyPolyline disconnected line groups extension - 2026-09-08

**231 Node tests passed, 0 failed, 0 skipped.** Two new tests verify independent group boundaries, selected pen colors, signed copied points, unchanged current position, invalid late groups, count/point buffer boundaries, total-count overflow protection and no partial drawing on failure. HandleObjects.exe imports PolyPolyline and checks valid groups and invalid counts through x86 calls. The catalog contains 512 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The rebuilt fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/poly-polyline-tests.tap) and [browser report](test-artifacts/poly-polyline-browser-report.json). Rendering uses the previously verified open-polyline canvas command.

Native ctypes probes used an owned memory DC, deleted in finally, to verify empty calls, zero/one-point groups, invalid later groups, null arrays and invalid DC errors. No guest executable ran on the host. Microsoft [PolyPolyline](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polypolyline) documents independent unfilled groups and current-position preservation. Mapping, clipping and pixel-exact native stroke rendering remain unfinished.

## PolylineTo current-position drawing extension - 2026-09-08

**229 Node tests passed, 0 failed, 0 skipped.** Two new tests check initial/current/final points, selected DC pen color, subsequent LineTo continuation, saved-state restoration, null-pen position changes, zero-count success and atomic failure behavior. The rebuilt HandleObjects.exe imports PolylineTo and verifies final position and zero-count behavior through x86 calls. The catalog contains 511 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/polyline-to-tests.tap) and [browser report](test-artifacts/polyline-to-browser-report.json). This stage reuses the previously tested open-polyline canvas path.

Native ctypes probes used an owned memory DC, deleted in finally, to verify zero/one/two points, null arrays, invalid DC errors and final positions. No guest executable ran on the host. Microsoft [PolylineTo](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polylineto) documents current-position use/update and unfilled figures. Mapping transforms, clipping and native pixel-exact stroke edges remain unfinished.

## Polygon and polyline drawing extension - 2026-09-08

**227 Node tests passed, 0 failed, 0 skipped.** Three new tests cover raw fill-mode state, saved-state restoration, independent DCs, selected objects/DC colors, signed point copies, current-position preservation, invalid counts/handles/pointers and atomic input validation. HandleObjects.exe imports Polygon, Polyline, GetPolyFillMode and SetPolyFillMode and checks success/failure through x86 calls. The catalog contains 510 entries.

**Five real-canvas checks passed in Edge 152.0.4191.66.** tools/browser-polygons.mjs feeds actual runtime commands into GuestDisplay and inspects canvas pixels to distinguish alternate/winding overlap, native raw mode 3, open polylines and closed polygon outlines. Evidence: [canvas report](test-artifacts/polygons-canvas-report.json). **Eight existing real-origin browser checks also passed with no page errors**, including execution of the rebuilt fixture, persistence, reload and backup. Evidence: [Node TAP](test-artifacts/polygons-tests.tap) and [browser report](test-artifacts/polygons-browser-report.json).

Native ctypes probes used an owned memory DC and offscreen bitmap, restored selections and deleted resources. They verified count/handle errors, null-array failures, raw fill-mode storage and interior coverage for modes 0,1,2,3,4,255,256,-1. No guest executable ran on the host. Microsoft documents [Polygon](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-polygon) and [SetPolyFillMode](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setpolyfillmode). Browser antialiasing/stroke edges are not certified pixel-exact against GDI; mapping/clipping, patterned brushes and unsupported pen styles remain separate work.

## ANSI font-name fidelity correction - 2026-09-08

**224 Node tests passed, 0 failed, 0 skipped.** Two new tests compare GetObjectA font-name conversion with all 65,535 nonzero native UTF-16 code-unit results and verify best-fit mappings, separate surrogate replacements, partial-output boundaries and ANSI tail preservation. The rebuilt HandleObjects.exe checks full-width/diacritic/minus best-fit mapping and two-byte surrogate fallback through real imported APIs. The catalog remains at 506 entries: this stage corrects existing behavior.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/font-ansi-tests.tap) and [browser report](test-artifacts/font-ansi-browser-report.json).

The reproducible tools/build-font-ansi-vectors.py requires native ACP 1252, creates owned logical fonts in batches of 31 code units and captures GetObjectA results into a 512-byte scratch buffer with a fixed 60-byte requested size. It deletes each font in finally and records tests/font-ansi-vectors.bin. No guest executable ran on the host. Microsoft [GetObjectA](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getobjecta) specifies logical-font inspection; the exhaustive native capture establishes this profile's conversion details. Other ANSI code pages, extended font structures and full font-rendering parity remain separate work.

## Logical font creation and inspection extension - 2026-09-08

**222 Node tests passed, 0 failed, 0 skipped.** Three new tests cover preservation of all LOGFONT scalar fields, independent input storage, Unicode face-name array preservation, bounded ANSI conversion, direct and indirect constructors, selected/saved font lifetime, partial queries, A/W alignment, ANSI tail preservation, null input and atomic memory validation. HandleObjects.exe imports CreateFontIndirectA/W and inspects both through GetObjectA/W using actual x86 calls. The catalog contains 506 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The rebuilt fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/fonts-tests.tap) and [browser report](test-artifacts/fonts-browser-report.json).

Native ctypes probes verified scalar preservation, bounded names, null constructors, partial query counts, A/W alignment and ANSI tail behavior. An initial extended-size probe exceeded its scratch buffer and terminated; its results are not used to claim extended-structure support. The alignment/name checks were repeated with 512-byte buffers and owned fonts deleted after use. No guest executable ran on the host. References: Microsoft [CreateFontIndirectA](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createfontindirecta) and [GetObject](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getobject). Extended structures, full ANSI best-fit face conversion, native font matching and rendering of every stored LOGFONT property remain unfinished; stock descriptions use the existing synthetic profile.

## Rectangle brush drawing extension - 2026-09-08

**219 Node tests passed, 0 failed, 0 skipped.** Three new tests compare emitted fill coverage with 72 recorded native offscreen raster cases and verify hollow brushes, selected-brush fallback, DC_BRUSH colors, system-color lookup, invalid DC errors and complete input validation before drawing. HandleObjects.exe imports FillRect and the new FrameRect, checking ordinary and inverted rectangles through x86 calls. The catalog contains 504 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The rebuilt fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/rectangle-drawing-tests.tap) and [browser report](test-artifacts/rectangle-drawing-browser-report.json).

The reproducible tools/build-gdi-rect-vectors.py probe records coverage from an owned 8x8 bitmap and memory DC, restoring selections and deleting resources. Additional native probes verify brush fallback, hollow brushes and invalid DC return/error behavior. No guest executable ran on the host. Microsoft documents [FillRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-fillrect) and [FrameRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-framerect). Coverage comparisons apply to identity mapping and solid brushes; they do not establish transformed/clipped or patterned rendering parity. System colors use Browser86's existing fixed profile.

## Per-device-context stock colors extension - 2026-09-08

**216 Node tests passed, 0 failed, 0 skipped.** Two new tests cover the four DC pen/brush color APIs, defaults, full-width COLORREF values, previous-color returns, independent DCs, saved state and native invalid-handle errors. Emitted rectangle/ellipse/roundrect/line/fill commands are checked for resolved colors; ordinary objects and shared stock handles remain unchanged. HandleObjects.exe imports all four APIs and checks defaults, changes and restoration through x86 calls. The catalog contains 503 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The rebuilt fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/dc-stock-colors-tests.tap) and [browser report](test-artifacts/dc-stock-colors-browser-report.json). Drawing-command tests do not establish pixel-exact native rasterization.

Native ctypes probes used an owned memory DC, deleted in finally, to verify defaults, invalid DC errors, preservation of full COLORREF bits and restoration. No guest executable ran on the host. Microsoft documents [SetDCPenColor](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setdcpencolor) and [SetDCBrushColor](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setdcbrushcolor). ICM and palette mapping are not implemented.

## Indirect GDI object creation extension - 2026-09-08

**214 Node tests passed, 0 failed, 0 skipped.** Two new tests cover copying and independence from input structures, selected objects in emitted drawing commands, hollow brushes, GetObject inspection, deletion, invalid pointers, complete input validation before allocation, unsupported styles and pen-style normalization. The rebuilt HandleObjects.exe imports CreatePenIndirect and CreateBrushIndirect and verifies both structures through actual x86 calls. The catalog contains 499 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture ran in the actual worker; persistence/reload/deletion/backup checks passed. Evidence: [Node TAP](test-artifacts/indirect-gdi-tests.tap) and [browser report](test-artifacts/indirect-gdi-browser-report.json).

Native ctypes probes created and deleted owned objects and verified ignored Y width/hatch fields, negative width normalization, null styles, invalid brush style failure, unchanged last error and unrecognized pen-style fallback. Null input caused a caught native access violation; guest input instead follows Browser86's memory-fault path. Native brush structures were 64-bit; the guest explicitly reads the 12-byte x86 layout. No guest executable ran on the host. References: Microsoft [CreatePenIndirect](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createpenindirect) and [CreateBrushIndirect](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createbrushindirect). Only solid/null styles are implemented; other recognized styles still fault explicitly.

## GDI pen and brush descriptions extension - 2026-09-08

**212 Node tests passed, 0 failed, 0 skipped.** Three new tests cover both GetObject variants, pen/brush layouts, size queries, zero/negative/null pen widths, null brushes, short buffers, alignment, last-error preservation, invalid handles, explicit unsupported fonts and atomic guest-memory validation. HandleObjects.exe imports both APIs and checks stock-object descriptions and short pen-buffer failure through x86 calls. The catalog contains 497 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The rebuilt fixture ran in the actual module worker; persistence and backup checks passed. Evidence: [Node TAP](test-artifacts/gdi-objects-tests.tap) and [browser report](test-artifacts/gdi-objects-browser-report.json).

Native ctypes probes created and deleted owned pens/brushes, checking A/W capacity/alignment, null-output queries, logical width and null-object fields. No guest executable ran on the host. The native probe was 64-bit (LOGBRUSH is 16 bytes there); the runtime uses the documented x86 layout with a 32-bit hatch member and 12-byte structure. Short-brush copy behavior is adopted from the native probe, not independently verified against a 32-bit Windows process. References: Microsoft [GetObject](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getobject), [LOGPEN](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-logpen) and [LOGBRUSH](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-logbrush). Font, bitmap, palette and extended-pen descriptions remain unsupported.

## GDI state and object queries extension � 2026-09-08

**209 Node tests passed, 0 failed, 0 skipped.** Three new tests cover default/mutated/restored settings, independent DCs, selected stock objects, restored handle identity, deleted handles, invalid inputs, last-error behavior and explicit unsupported selection kinds. The rebuilt HandleObjects.exe imports all six new APIs and checks their results through actual x86 calls. The catalog contains 495 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Workers executed the rebuilt fixture under the deployed CSP; persistence, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/dc-queries-tests.tap) and [browser report](test-artifacts/dc-queries-browser-report.json).

Native ctypes probes used an owned compatible memory DC, deleted in finally, to check defaults, invalid handles/types and last-error behavior. No guest executable ran on the host. Microsoft documents [GetCurrentObject](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getcurrentobject), [GetObjectType](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getobjecttype) and [GetTextColor](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-gettextcolor). Browser86 currently models display DCs, pens, brushes and fonts; this stage does not implement memory DCs, bitmaps, palettes or color spaces.

## GDI device-context state extension — 2026-09-08

**206 Node tests passed, 0 failed, 0 skipped.** Four new tests cover nested absolute/relative restore, discarded levels and level reuse, independent DC stacks, selected-object lifetime protection, invalid handles/levels, last-error preservation and POINT output validation. Restored pen position/colors/selection are checked in actual emitted line/text commands. The rebuilt HandleObjects.exe imports SaveDC, RestoreDC and GetCurrentPositionEx, checks nested position restoration and invalid restore, and releases its DC. The catalog contains 489 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual workers executed the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/dc-state-tests.tap) and [browser report](test-artifacts/dc-state-browser-report.json). This focused check does not certify full GUI rendering or unimplemented DC state.

Native ctypes probes used a temporary compatible memory DC (deleted in finally) to verify save levels, relative/absolute restore, invalid-level errors and level reuse. No guest executable ran on the host. Microsoft's [SaveDC](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-savedc) and [RestoreDC](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-restoredc) document the stack contract. Only existing emulated state is saved; mapping/clipping/regions and native deferred object deletion remain limitations.

## Rectangle helper extension — 2026-09-08

**202 Node tests passed, 0 failed, 0 skipped.** Four new tests check 3,072 recorded native intersection/union/subtraction results with separate and aliased destinations (9,216 comparisons), point boundaries, inverted/empty rectangles, copying/equality, signed inflate/offset arithmetic, last-error preservation and atomic buffer validation. HandleObjects.exe imports all eleven rectangle helpers, including the three-stack-slot PtInRect signature for a by-value POINT. Seven imports are new; four existing handlers now share complete buffer validation. The catalog contains 486 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual workers executed the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/rectangle-tests.tap) and [browser report](test-artifacts/rectangle-browser-report.json). This focused fixture does not certify broader GUI rendering or clipping behavior.

tools/build-rectangle-vectors.py records native user32 operations on owned RECT structures without creating windows. Additional probes verified empty/inverted inputs and bounding subtraction behavior. No guest executable ran on the host. Microsoft's [rectangle functions overview](https://learn.microsoft.com/en-us/windows/win32/gdi/rectangle-functions), [IntersectRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-intersectrect) and [SubtractRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-subtractrect) establish the geometry contracts. GDI regions and clipping remain separate work.

## MulDiv integer scaling extension — 2026-09-08

**198 Node tests passed, 0 failed, 0 skipped.** Three new tests cover 4,245 recorded native results (all combinations of thirteen boundary inputs plus 2,048 seeded full-width triples), signed half rounding, products above JavaScript Number precision, overflow, zero divisors, INT_MIN behavior and last-error preservation. HandleObjects.exe was rebuilt with the three-stack-slot MulDiv import and checks representative success/failure paths through x86 calls. The catalog contains 479 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual workers ran the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/muldiv-tests.tap) and [browser report](test-artifacts/muldiv-browser-report.json).

tools/build-muldiv-vectors.py records native scalar results and verifies unchanged last error. No guest executable ran on the host. Microsoft's [MulDiv documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-muldiv) establishes 64-bit intermediate multiplication, nearest rounding with half-integers away from zero, and -1 for overflow/zero divisors. The implementation additionally preserves the probed native INT_MIN edge behavior; these reference results do not establish parity across every Windows implementation.

## Shell command-line parsing extension — 2026-09-08

**195 Node tests passed, 0 failed, 0 skipped.** Four new tests cover 1,031 recorded native parser cases, contiguous x86 pointer/string allocation, single-call LocalFree, empty-input guest executable paths, leading empty arguments, last-error preservation and invalid-buffer allocation safety. The rebuilt HandleObjects.exe imports CommandLineToArgvW from shell32.dll and LocalFree from kernel32.dll, parses a quoted argument and frees the result through the interpreter. The catalog contains 478 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual module workers executed the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/command-line-tests.tap) and [browser report](test-artifacts/command-line-browser-report.json).

tools/build-command-line-vectors.py records deterministic native reference cases covering quotes, backslashes, tabs, spaces, newlines, executable-name handling and unclosed quotes. Native allocations are freed immediately; input strings are never executed. Microsoft's [CommandLineToArgvW documentation](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-commandlinetoargvw) establishes the allocation/freeing contract, empty-input behavior and quote/backslash rules. This adds parsing only; guest process creation remains unimplemented and CRT argv parsing is unchanged.

## Unicode character classification extension — 2026-09-08

**191 Node tests passed, 0 failed, 0 skipped.** Four new tests verify all 196,608 results (65,536 UTF-16 units across three modes) against SHA-256 hashes of native Windows output. Additional assertions cover letters/digits/whitespace, bidirectional classes, combining marks, ideographs, surrogate halves, negative counts including NUL, last-error preservation, invalid flags/parameters and atomic memory validation. HandleObjects.exe was rebuilt with the four-stack-slot GetStringTypeW import and exercises all modes plus invalid flags through the x86 interpreter. The catalog contains 477 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual workers executed the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/character-type-tests.tap) and [browser report](test-artifacts/character-type-browser-report.json).

tools/build-character-types.py captures native Windows 10.0.26200 output into compressed range tables and separate output hashes. Additional ctypes probes verified representative text, surrogate handling, invalid mode/count results and negative lengths. Native calls used owned buffers; no guest executable ran on the host. Microsoft's [GetStringTypeW documentation](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-getstringtypew) establishes the three modes and output/count semantics. This is version-pinned Windows classification, not modern Unicode scalar classification or support for the ANSI/Ex variants.

## SBCS conversion extension — 2026-09-08

**187 Node tests passed, 0 failed, 0 skipped.** Five new tests cover all-byte OEM round trips, ACP/thread/OEM aliases, native best-fit versus exact-only mappings, custom defaults, substitution reporting, surrogate code units, decomposition, glyph mode, signed lengths, size queries, short-buffer prefix behavior, invalid flags and output validation. The rebuilt HandleObjects.exe exercises Windows-1252 best-fit/exact conversion and an OEM 437 round trip through the existing conversion imports. The catalog remains at 476 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual workers executed the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/sbcs-tests.tap) and [browser report](test-artifacts/sbcs-browser-report.json).

tools/build-sbcs-tables.py recorded all 256 byte decodings for eight flag modes and all 65,536 UTF-16 code-unit encodings for best-fit/exact modes on each of 1252 and 437. Tables are pinned to Windows 10.0.26200. Additional owned-buffer ctypes probes verified custom defaults, supplementary/unpaired surrogate replacement, flags and partial output on insufficient capacity. No guest executable ran on the host. Microsoft's [MultiByteToWideChar](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-multibytetowidechar) and [WideCharToMultiByte](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-widechartomultibyte) document conversion flags and default reporting. Wide-character composite checking remains explicitly unsupported; arbitrary code pages and all-version NLS parity are not certified.

## Code-page information extension — 2026-09-08

**182 Node tests passed, 0 failed, 0 skipped.** Four new tests cover concrete IDs versus aliases, fixed ACP/OEM resolution, default characters, lead-byte ranges, ANSI/Unicode names, x86 field offsets, reserved flags, unsupported IDs and atomic output validation. The rebuilt HandleObjects.exe imports IsValidCodePage, GetCPInfo and GetCPInfoExA/W and verifies structure sizes 20/284/544 plus metadata and error results through the interpreter. The catalog contains 476 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The actual workers ran the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/code-page-tests.tap) and [browser report](test-artifacts/code-page-browser-report.json).

Native ctypes probes verified profiles for 1252/437/65001, alias resolution, validity results, fields/names and the differing reserved-flag behavior for SBCS versus UTF-8 queries. No guest executable ran on the host. Microsoft's [CPINFO](https://learn.microsoft.com/en-us/windows/win32/api/winnls/ns-winnls-cpinfo), [CPINFOEXW](https://learn.microsoft.com/en-us/windows/win32/api/winnls/ns-winnls-cpinfoexw) and [GetCPInfoExW](https://learn.microsoft.com/en-us/windows/win32/api/winnls/nf-winnls-getcpinfoexw) document the structures and query contract. Only the runtime's three profiles are exposed; OEM 437 general conversion and full Windows-1252 best-fit support remain gaps.

## UTF-8 conversion correction — 2026-09-08

**178 Node tests passed, 0 failed, 0 skipped.** Four new tests cover BOM preservation, supplementary characters, UTF-16/byte count distinctions, terminated and counted inputs, embedded NULs, native malformed-prefix replacement vectors, strict rejection, unpaired surrogates, flags/default-pointer validation, insufficient buffers and atomic memory validation. HandleObjects.exe was rebuilt with both conversion imports and verifies BOM round-trip and strict surrogate rejection through x86 calls. The catalog remains at 472 entries; this stage corrects existing CP_UTF8 handlers.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture ran in actual workers under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/utf8-tests.tap) and [browser report](test-artifacts/utf8-browser-report.json).

Native ctypes probes on owned input/output buffers confirmed BOM preservation, signed negative counts, malformed-sequence replacement consumption and strict failure. In particular, Windows emits two U+FFFD characters for ED A0 80, whereas WHATWG decoding differs. No guest executable ran on the host. Contracts were checked against Microsoft's [MultiByteToWideChar](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-multibytetowidechar) and [WideCharToMultiByte](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-widechartomultibyte) documentation. The existing Windows-1252 implementation and its best-fit/default-character limitations are unchanged.

## Ordinal Unicode search extension — 2026-09-08

**174 Node tests passed, 0 failed, 0 skipped.** Four new tests cover all search modes, default flags, found/not-found last-error clearing, empty values/source, embedded NULs, UTF-16 offsets, ordinal case behavior, invalid flags/arguments and memory boundaries. The rebuilt HandleObjects.exe imports FindStringOrdinal with six x86 stack slots and checks forward/backward/prefix/suffix results plus error 1004. The catalog contains 472 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Actual module workers ran the updated fixture under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/ordinal-search-tests.tap) and [browser report](test-artifacts/ordinal-search-browser-report.json).

Native ctypes probes on owned strings verified all four modes and the zero-flag default, empty-value indices, no-match behavior, strict boolean validation and last-error clearing. No guest executable ran on the host. Microsoft's [FindStringOrdinal documentation](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-findstringordinal) establishes the search modes, length semantics and error distinctions. Case matching inherits the pinned Windows table and version limitations documented for CompareStringOrdinal.

## Ordinal Unicode comparison extension — 2026-09-08

**170 Node tests passed, 0 failed, 0 skipped.** Four new tests cover UTF-16 lengths, embedded NULs, terminated strings, CSTR result codes, last-error preservation, nonlinguistic case behavior, surrogates, invalid arguments and counted-buffer validation. The suite checks 512 deterministic native reference comparisons recorded in tests/ordinal-native-vectors.json. HandleObjects.exe now imports CompareStringOrdinal and checks case-sensitive/insensitive results, embedded NUL handling and invalid boolean failure through the x86 interpreter. The catalog contains 471 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture and actual workers ran under the deployed CSP; IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/ordinal-tests.tap) and [browser report](test-artifacts/ordinal-browser-report.json).

tools/build-ordinal-table.py inspected all 65,536 UTF-16 code units using native RtlUpcaseUnicodeChar and verified all 973 nonidentity mappings with CompareStringOrdinal on Windows 10.0.26200. The generated table is pinned for deterministic browser behavior. Native probes confirmed distinctions from JavaScript casing, including dotless i, long s, Kelvin sign, Greek sigma variants and supplementary characters. Calls used owned strings/scalars; no guest executable ran on the host. Microsoft's [CompareStringOrdinal documentation](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-comparestringordinal) establishes the length, return-value and strict boolean contracts. This test scope does not certify every Windows NLS version or linguistic collation.

## DOS packed timestamp extension — 2026-09-08

**166 Node tests passed, 0 failed, 0 skipped.** Four new tests cover native rounding vectors, exact 100ns boundary behavior, month/year rollover, exhaustive validation of all 65,536 packed date words (46,751 valid dates), invalid time fields, WORD argument truncation, range failures, unchanged failure output, overlapping buffers and complete output validation. HandleObjects.exe was rebuilt with both real DOS conversion imports and checks the 1980 epoch, one-tick upward rounding and invalid-date failure through the x86 interpreter. The catalog contains 470 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture executed in the actual runtime worker; CSP/module delivery, IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/dos-time-tests.tap) and [browser report](test-artifacts/dos-time-browser-report.json).

Native ctypes probes on scratch structures verified upward two-second rounding before year-range checks, leap-day rollover, upper-limit rejection, invalid packed fields and last-error preservation. Guest executables ran only in Browser86. Microsoft's [DosDateTimeToFileTime](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-dosdatetimetofiletime) and [FileTimeToDosDateTime](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-filetimetodosdatetime) documentation establishes the bit layouts and representable years. These conversions do not add time-zone/DST adjustment APIs.

## UTC time conversion extension — 2026-09-08

**162 Node tests passed, 0 failed, 0 skipped.** Four new tests cover native known-value vectors, 1601/1970 epochs, Gregorian leap dates, ignored input weekday, last-error preservation, asymmetric upper year limits, invalid fields, unchanged failure output, fractional-millisecond truncation, exact unsigned comparisons beyond 2^53, overlapping buffers and complete memory validation. HandleObjects.exe was rebuilt with FileTimeToSystemTime, SystemTimeToFileTime and CompareFileTime imports; the guest checks a leap-day round trip, signed comparison results and invalid-date rejection. The catalog contains 468 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture executed in the actual runtime worker and existing CSP, IndexedDB, reload, deletion and backup checks passed. Evidence: [Node TAP](test-artifacts/time-conversion-tests.tap) and [browser report](test-artifacts/time-conversion-browser-report.json).

Native ctypes probes used scratch structures to verify success/failure values, untouched error outputs, sub-millisecond truncation, upper boundaries and unsigned comparisons. No guest executable ran on the host. Contracts were checked against Microsoft's [FileTimeToSystemTime](https://learn.microsoft.com/en-us/windows/win32/api/timezoneapi/nf-timezoneapi-filetimetosystemtime), [SystemTimeToFileTime](https://learn.microsoft.com/en-us/windows/win32/api/timezoneapi/nf-timezoneapi-systemtimetofiletime) and [CompareFileTime](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-comparefiletime) documentation. Time-zone/DST and DOS packed-date conversion APIs remain outside this implementation.

## Condition variable extension — 2026-09-08

**158 Node tests passed, 0 failed, 0 skipped.** Five new tests cover zero-timeout lock reacquisition, CS and both SRW modes, wake-one/all, no retained wake signals, independent condition variables, process isolation, CPU suspension, delayed reacquisition after wake/timeout, invalid inputs and recursive CS rejection. HandleObjects.exe was rebuilt to import all five APIs and exercise timeout/reacquisition through real x86 calls. The catalog contains 465 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture executed in an actual runtime module worker and existing CSP, IndexedDB, reload, deletion and backup checks passed. Raw evidence: [Node TAP](test-artifacts/condition-variable-tests.tap) and [browser report](test-artifacts/condition-variable-browser-report.json).

Contracts were checked against Microsoft's [condition variable overview](https://learn.microsoft.com/en-us/windows/win32/sync/condition-variables), [SleepConditionVariableCS](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-sleepconditionvariablecs) and [SleepConditionVariableSRW](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-sleepconditionvariablesrw). Native ctypes probes on owned process-local locks confirmed that zero-timeout SRW waits return false/error 1460 and reacquire the original exclusive/shared mode. Guest executables were only executed by Browser86. Injected unit-level wakes and releases test continuations; guest thread scheduling remains unimplemented.

## SRW lock extension — 2026-09-08

**153 Node tests passed, 0 failed, 0 skipped.** Five new tests cover static/dynamic initialization, both ownership modes, failed try-acquisition, last-error preservation, suspended CPU execution and resumption, invalid memory/state/releases, and lock/process isolation. The rebuilt HandleObjects.exe imports and exercises all seven SRW functions through the x86 interpreter. The catalog contains 460 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** The updated fixture ran in an actual runtime worker; CSP/module delivery, IndexedDB, reload and backup checks passed. Raw evidence: [Node TAP](test-artifacts/srw-lock-tests.tap) and [browser report](test-artifacts/srw-lock-browser-report.json).

Microsoft's [SRW lock documentation](https://learn.microsoft.com/en-us/windows/win32/sync/slim-reader-writer--srw--locks) establishes pointer-sized initialization, shared/exclusive modes and nonrecursive exclusive behavior. Native ctypes probes on an owned host lock confirmed zero initialization, basic shared/exclusive state values and failed try-acquisitions. These probes used the host pointer width; the compiled guest fixture verifies Browser86's four-byte x86 storage and calling convention. Unit-level release while suspended tests the scheduler continuation; it does not demonstrate multiple guest threads. No guest executable ran on the host.

## Process environment correction — 2026-09-08

**148 Node tests passed, 0 failed, 0 skipped.** Five new tests cover case-insensitive lookup, empty versus missing variables, last-error preservation, short buffers, ACP byte versus UTF-16 size counts, single-pass expansion, atomic output validation, OEM/Unicode blocks, allocation ownership, independent snapshots, process isolation and CRT getenv consistency. HandleObjects.exe was rebuilt with seven environment imports and executes set/get/expand/empty/delete and both block allocation/free variants through the x86 interpreter. The catalog contains 453 entries.

**Eight real-origin browser checks passed with no page errors in Edge 152.0.4191.66.** Both Win32 fixtures ran in actual module workers under the deployed CSP; IndexedDB persistence, reload, deletion and backup export/reimport checks passed. Raw results: [Node TAP](test-artifacts/environment-tests.tap) and [browser report](test-artifacts/environment-browser-report.json). This focused run does not certify arbitrary Windows applications or all GUI behavior.

Native ctypes probes on a temporary process-local variable verified empty/missing values, short-buffer clearing and last-error behavior. No guest executable ran on the host. Contracts were checked against Microsoft's [GetEnvironmentVariableW](https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-getenvironmentvariablew), [SetEnvironmentVariableW](https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-setenvironmentvariablew) and [GetEnvironmentStringsW](https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-getenvironmentstringsw) documentation, including the ANSI block's OEM encoding. Canonical name casing, fixed code pages and the CRT startup-array snapshot remain documented limitations.

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

## Extended file information — 2026-09-08

**92 Node tests passed, 0 failed, 0 skipped.** Six new tests cover the four supported GetFileInformationByHandleEx classes, x86 field offsets and padding, byte allocation/EOF updates, zero links during pending deletion, IDs across independent/duplicate handles and rename, UTF-16 surrogate pairs and truncated names, directory/root queries, invalid classes/handles, short buffers and atomic cross-page output validation. HandleObjects.exe imports the new four-stack-slot API and verifies the C structures in the interpreter. Catalog: 437 entries.

Native kernel32 probes on this Windows host verified ERROR_BAD_LENGTH (24) for buffers below fixed structure sizes, ERROR_MORE_DATA (234) and a required byte length for truncated names, preservation of an odd trailing byte, and zero links during pending deletion in both standard and legacy information queries. These probes called Windows from Python on README.md and newly created disposable data files; guest EXEs were executed only in Browser86. Virtual allocation uses exact byte lengths rather than native cluster allocation.

**Eight real-origin Edge browser checks passed with no page errors** after rebuilding the fixture. Results: `test-artifacts/file-info-ex-tests.tap` and `test-artifacts/file-info-ex-browser-report.json`. Contracts: [GetFileInformationByHandleEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex), [FILE_NAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_name_info), [FILE_STANDARD_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_standard_info), [FILE_ID_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info).

## Handle-based EOF changes — 2026-09-08

**97 Node tests passed, 0 failures or skips; eight real-origin Edge checks passed with no page errors.** SetFileInformationByHandle now implements FileEndOfFileInfo. Five new tests cover growth/truncation/zero length, independent and duplicate cursors, exact signed 64-bit bounds and quota accounting, pending deletion, suppressed timestamps, denied rights, directories, invalid classes, short and cross-page buffers, and read-only input memory. HandleObjects.exe imports the new API and verifies growth, unchanged cursor, negative input and truncation through the interpreter. The catalog contains 438 entries.

Native Windows probes on disposable data files verified that EOF changes leave a cursor at offset 5 unchanged through growth, truncation and clearing; seven-byte inputs return ERROR_BAD_LENGTH (24), and negative lengths return ERROR_INVALID_PARAMETER (87). Contract: [SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle) and [FILE_END_OF_FILE_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_end_of_file_info). Results: `test-artifacts/file-set-info-tests.tap` and `test-artifacts/file-set-info-browser-report.json`.

## Handle-based disposition — 2026-09-08

**102 Node tests passed with no failures or skips.** Five new tests cover cancellation through independent/duplicate handles, cancellation after the requesting handle closes, link counts, snapshots, exclusive opens, DeleteFile cancellation, delete-on-close precedence, termination cleanup, empty/nonempty directories, pending-parent protection, permissions, read-only files, root protection and invalid input. HandleObjects.exe exercises the one-byte disposition structure through the existing SetFileInformationByHandle import. The catalog remains at 438 entries.

Native Windows probes verified cross-handle cancellation and restored link counts, delete-on-close precedence, DELETE access for both marking and cancellation, short-buffer error 24, read-only marking error 5 and nonempty-directory error 145. Contract: [FILE_DISPOSITION_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info). **Eight real-origin Edge checks passed without page errors**, including absence of the disposition fixture file from the persisted backup. Results: `test-artifacts/file-disposition-tests.tap` and `test-artifacts/file-disposition-browser-report.json`.

## Handle-based file rename — 2026-09-08

**107 Node tests passed, no failures or skips; eight real-origin Edge checks passed with no page errors.** Five new tests cover Unicode/case-only names, identity and shared cursor retention, timestamps and quota, directory-handle roots, absolute/current-directory paths, replacement restrictions, permissions, pending deletion, invalid names and x86 input validation. The rebuilt HandleObjects.exe verifies the 12-byte filename offset and renames a file through SetFileInformationByHandle before writing through its retained handle. The catalog remains at 438 entries.

Native Windows probes verified existing-target error 183, successful explicit replacement, open-target error 5, missing-parent error 3 and same-name success. Contract: [FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info). Directory and stream renames remain unsupported. Results: `test-artifacts/file-rename-tests.tap` and `test-artifacts/file-rename-browser-report.json`.

## Directory rename — 2026-09-08

**111 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Four additional tests cover subtree identity/metadata/quota retention, Unicode and case-only paths, FileRenameInfo and MoveFileW, open descendants and duplicates, current-directory ancestors, self-descendant moves, missing parents and directory/file replacement rules. The compiled HandleObjects.exe creates a directory with a child, renames it through the handle API, moves it back with MoveFileA and reads its child before cleanup. The catalog remains at 438 entries.

Native Windows probes verified ordinary directory rename, open-descendant denial (5), self-descendant rejection (87), directory-target replacement denial (5), and successful explicit replacement of a closed file with a directory. The earlier [FILE_RENAME_INFO contract](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info) applies. Results: `test-artifacts/directory-rename-tests.tap` and `test-artifacts/directory-rename-browser-report.json`.

## Final paths from handles — 2026-09-08

**116 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Five new tests cover DOS/volume-relative A/W paths, opened/normalized flags, rename and pending deletion, short buffers and terminators, extended DOS reopen identity, Unicode surrogate pairs and ANSI conversion, root handles, invalid flags, unsupported namespaces and atomic output validation. HandleObjects.exe imports both four-stack-slot APIs and reopens the path returned by the ANSI query. The catalog contains 440 entries.

Native Windows probes verified rename tracking in both name modes, invalid flag combinations, and unchanged output for insufficient buffers. The observed A short-buffer count excludes the terminator, unlike W and unlike the general wording in [Microsoft's return-value documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew); this distinction is covered explicitly. The W short-buffer probe set last error 8, while A set 0. No host paths are exposed by the guest implementation. Results: `test-artifacts/final-path-tests.tap` and `test-artifacts/final-path-browser-report.json`.

## Append-only file access — 2026-09-08

**120 Node tests passed with no failures or skips; eight real-origin Edge checks passed without page errors.** Four new tests cover independent/duplicate append handles, seeks followed by appends, mixed read/append and write/append permissions, flush/EOF rights, mutual sharing, read-only checks, creation dispositions, zero writes, invalid buffers, quota failure and pending deletion. HandleObjects.exe verifies append-after-seek, retained original bytes and denied truncation. The catalog remains at 440 entries.

Native Windows probes verified append-only seeking and flushing, EOF resize denial (5), positional writes when FILE_WRITE_DATA is also granted, CREATE_ALWAYS truncation, TRUNCATE_EXISTING rejection (87) and unchanged cursors on zero writes. Contract: [File Access Rights Constants](https://learn.microsoft.com/en-us/windows/win32/fileio/file-access-rights-constants). Results: `test-artifacts/file-append-tests.tap` and `test-artifacts/file-append-browser-report.json`.

## Temporary file names — 2026-09-08

**124 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Four new tests cover automatic reservation, collisions with files/directories, numeric wrap, low-word masking, explicit name-only behavior, three-character prefixes, A/W paths, guest reopen/delete, missing/pending directories, length limits and invalid output atomicity. HandleObjects.exe imports GetTempFileNameA/W and exercises reserved empty-file creation and explicit Unicode naming. Catalog: 442 entries.

Native Windows probes confirmed uppercase hexadecimal without zero padding, lowercase .tmp, three-character truncation, directory validation (267), low-word return values and automatic creation when the supplied low word is zero. Contract: [GetTempFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-gettempfilenamew). Results: `test-artifacts/temp-file-tests.tap` and `test-artifacts/temp-file-browser-report.json`.

## Dynamic TLS correctness — 2026-09-08

**129 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Five tests cover slot reuse/zeroing, application-data ownership, x86 TEB and expansion memory coherence, separation from static PE TLS, all 1,088 slots, exhaustion/recovery, last-error behavior, invalid indices and process isolation. HandleObjects.exe imports all five TLS functions, allocates 65 slots, reads values directly through compiled FS-segment intrinsics and verifies TlsGetValue2 plus freed-slot reuse. Catalog: 443 entries.

Native probes verified reused indices with zero values, double-free error 87, valid-range zero reads, GetValue2 preserving last error even on out-of-range reads, and allocation-exhaustion error 8. Contracts: [TlsAlloc](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-tlsalloc), [TlsGetValue](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-tlsgetvalue). Results: `test-artifacts/tls-tests.tap` and `test-artifacts/tls-browser-report.json`.

## One-time initialization — 2026-09-08

**134 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Five new tests cover check-only, begin/complete, failed-attempt retry, saved context, callback arguments and last-error preservation, async-mode consistency, completion races expressed as sequential attempts, synchronous wait continuation, reserved context bits and invalid output atomicity. HandleObjects.exe imports all four functions and executes a compiled stdcall initializer that fails once, succeeds on retry and is not called after completion. Catalog: 447 entries.

Native probes verified uninitialized check-only and duplicate-complete error 31, invalid context/mode error 87, pending/context output preservation, callback-error preservation, null callback context forwarding and encoded completion context. Contracts: [InitOnceExecuteOnce](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-initonceexecuteonce), [InitOnceBeginInitialize](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-initoncebegininitialize), [InitOnceComplete](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-initoncecomplete). Results: `test-artifacts/init-once-tests.tap` and `test-artifacts/init-once-browser-report.json`.

## Address-based synchronization — 2026-09-08

**139 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Five new tests cover exact-width comparison, zero/finite/infinite timeouts, wake-one order, wake-all matching, no saved signals, expiration cleanup, process isolation, polling without guest instruction execution and invalid ranges. HandleObjects.exe imports WaitOnAddress and both WakeByAddress functions from api-ms-win-core-synch-l1-2-0.dll and exercises immediate/timeout/error paths through the x86 ABI. Catalog: 450 entries.

Native probes verified unchanged-value timeout error 1460, different-value success with last-error preservation, and invalid-size error 87. Contracts: [WaitOnAddress](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitonaddress), [WakeByAddressSingle](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-wakebyaddresssingle). Results: `test-artifacts/address-wait-tests.tap` and `test-artifacts/address-wait-browser-report.json`.

## Critical-section state — 2026-09-08

**143 Node tests passed without failures or skips; eight real-origin Edge checks passed without page errors.** Four tests cover recursive enter/try/leave and guest structure updates, all constructors and Ex flags, single-processor spin behavior, lifecycle diagnostics, failed-memory atomicity and process isolation. HandleObjects.exe imports all eight critical-section APIs and inspects the x86 structure during acquisition and release. Catalog: 452 entries.

Native probes verified unlocked LockCount -1, uncontended owned LockCount -2, recursion changes and ownership clearing. Spin handling follows the documented single-processor behavior of [SetCriticalSectionSpinCount](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-setcriticalsectionspincount); recursive ownership follows [EnterCriticalSection](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-entercriticalsection). Results: `test-artifacts/critical-section-tests.tap` and `test-artifacts/critical-section-browser-report.json`.

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

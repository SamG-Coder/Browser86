# Metapad LE compatibility target

The official prebuilt [Metapad 3.6 LE ZIP](https://liquidninja.com/metapad/downloads/metapad36LE.zip) was downloaded and tested on 2026-09-08. SHA-256: `F7AEE5FCC910BE06111CF1AB35DB31837C260648F869DE45103EDC03E56088C9`.

`metapad.exe` is a native x86 PE32 Windows GUI application without CLR metadata. Both the Node interpreter probe and the public GitHub Pages browser test stop at `user32.dll!GetDialogBaseUnits`, caller `0x0040bdef`, before creating a guest window. The browser reports 60 unresolved imports; this is not a count of APIs necessarily required for startup. No browser JavaScript errors occurred.

No host execution or application rebuilding was used. This is a recorded startup failure, not a successful editor compatibility result. The next acceptance baseline is typing/editing a note, saving to the isolated virtual drive, closing, and reopening the document. Runtime changes must remain generic Windows behavior, with no Metapad application logic or rendering embedded in the runtime.

Reproduce with `node tools/probe-application.mjs .build/metapad/metapad36LE.zip`, or import the official ZIP in Browser86 and launch `metapad.exe`.

Evidence: [browser report](test-artifacts/metapad-first-browser.json), [screenshot](test-artifacts/metapad-first-browser.png).

## Startup API progress

The first blocker is now resolved. `GetDialogBaseUnits` derives its packed horizontal/vertical values from Browser86's approximate virtual system-font metrics. `DeleteMenu`, `DestroyMenu`, `SetMenu`, and `DrawMenuBar` implement menu lifetime, attachment, and drawing behavior. Built-in control subclassing now returns a callable original window procedure instead of zero, allowing Metapad's EDIT subclass to forward messages through CallWindowProc.

The current runtime and browser probes reach `user32.dll!RegisterWindowMessageA`, caller `0x0040c0ca`. The browser reports 55 unresolved imports, one guest window record, and no browser JavaScript errors. An interactive editor is still unverified and the save/reopen acceptance test remains incomplete. Validation at this stage: 558 Node tests and 16 browser regression checks pass.

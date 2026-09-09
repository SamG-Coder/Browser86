# Compile our own fixtures using installed Microsoft Framework compilers.
# Does not execute guest binaries. Generated outputs are used by Node tests.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fx = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319'
if (!(Test-Path (Join-Path $fx 'csc.exe')) -or !(Test-Path (Join-Path $fx 'vbc.exe'))) {
    throw 'The Microsoft .NET Framework C# and VB compilers are not installed at the expected path.'
}
Push-Location $root
try {
    $out = 'demos\managed'
    & "$fx\csc.exe" /nologo /target:library "/out:$out\ManagedLibrary.dll" "$out\ManagedLibrary.cs"
    if ($LASTEXITCODE -ne 0) { throw 'ManagedLibrary compilation failed.' }
    & "$fx\csc.exe" /nologo /optimize+ /platform:x86 "/out:$out\ManagedConsole.exe" "/reference:$out\ManagedLibrary.dll" "$out\ManagedConsole.cs"
    if ($LASTEXITCODE -ne 0) { throw 'ManagedConsole compilation failed.' }
    & "$fx\csc.exe" /nologo /optimize- /platform:anycpu "/out:$out\ManagedAnyCPU.exe" "/reference:$out\ManagedLibrary.dll" "$out\ManagedConsole.cs"
    if ($LASTEXITCODE -ne 0) { throw 'ManagedAnyCPU compilation failed.' }
    & "$fx\csc.exe" /nologo /platform:x86 /target:winexe "/out:$out\ManagedForms.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "$out\ManagedForms.cs"
    if ($LASTEXITCODE -ne 0) { throw 'ManagedForms compilation failed.' }
    & "$fx\vbc.exe" /nologo /platform:x86 /target:exe "/out:$out\ManagedVB.exe" "$out\ManagedVB.vb"
    if ($LASTEXITCODE -ne 0) { throw 'ManagedVB compilation failed.' }
    $files = [ordered]@{}
    Get-ChildItem $out -File | Where-Object { $_.Extension -in '.exe','.dll' -or $_.Name -like 'native-*.txt' } | ForEach-Object {
        $files[$_.Name] = [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName))
    }
    @{ compiler='Microsoft .NET Framework v4.0.30319 csc/vbc'; files=$files } | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 "$out\fixtures.json"
    & node tools/build-managed-demo.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Managed demo packaging failed.' }
    Write-Host 'Compiled and packaged. Run npm test. Retained Windows stdout baselines were not regenerated.'
} finally { Pop-Location }

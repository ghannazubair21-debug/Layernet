# Builds the v3 report: build -> keep the user's edited front pages -> Word finalize.
# Usage: tools\build_v3.ps1 -Py <python.exe> -UserDocx <user-edited.docx> [-NoAbbrev]
param([string]$Py, [string]$UserDocx, [switch]$NoAbbrev, [string]$OutName = "LayerNet_FYP_Report_v3")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$env:PYTHONIOENCODING = "utf-8"
$env:LAYERNET_ABBREV = if ($NoAbbrev) { "0" } else { "1" }
& $Py "$root\tools\build_report.py" $root "$root\output\build\LayerNet_FYP_Report_build.docx"
if ($LASTEXITCODE) { throw "build failed" }
& $Py "$root\tools\splice_front.py" "$root\output\build\LayerNet_FYP_Report_build.docx" $UserDocx "$root\output\build\LayerNet_FYP_Report_v3_spliced.docx"
if ($LASTEXITCODE) { throw "splice failed" }
& "$root\tools\finalize_with_word.ps1" -InDocx "$root\output\build\LayerNet_FYP_Report_v3_spliced.docx" -OutBase "$root\output\$OutName"
& $Py "$root\tools\strip_theme_fonts.py" "$root\output\$OutName.docx"
if ($LASTEXITCODE) { throw "font clean-up failed" }

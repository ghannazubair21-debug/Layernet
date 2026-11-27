# Read-only proofing audit in Word: spelling errors, grammar errors and the line count of
# every body paragraph from the Table of Contents onward. Usage: proof_check.ps1 <docx> <out.txt>
param([string]$Docx, [string]$Out)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
$lines = New-Object System.Collections.Generic.List[string]
try {
  $doc = $word.Documents.Open($Docx, $false, $true)
  $doc.Repaginate()
  $start = $doc.Content.Find
  $toc = $doc.Content; [void]$toc.Find.Execute("Table of Contents")
  $from = $toc.Start
  $lines.Add("== SPELLING (from TOC onward)")
  foreach ($e in $doc.SpellingErrors) { if ($e.Start -ge $from) { $lines.Add("S`t$($e.Text)") } }
  $lines.Add("== GRAMMAR (from TOC onward)")
  foreach ($e in $doc.GrammaticalErrors) { if ($e.Start -ge $from) { $lines.Add("G`t$($e.Text)") } }
  $lines.Add("== PARAGRAPHS (Normal style, body text)")
  foreach ($p in $doc.Paragraphs) {
    $r = $p.Range
    if ($r.Start -lt $from) { continue }
    if ($r.Information(12)) { continue }          # inside a table
    $style = $p.Style.NameLocal
    $t = $r.Text.Trim()
    if ($style -ne "Normal" -or $t.Length -lt 40) { continue }
    $n = $r.ComputeStatistics(1)
    $page = $r.Information(3)
    $lines.Add("P`t$n`tp$page`t$($t.Substring(0, [Math]::Min(70, $t.Length)))")
  }
  $doc.Close($false)
} finally { $word.Quit() }
$lines | Out-File -Encoding utf8 $Out

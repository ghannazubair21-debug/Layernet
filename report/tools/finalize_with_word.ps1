# Opens the generated DOCX in Microsoft Word, updates all fields (TOC, lists, SEQ, PAGE),
# then saves .docx, Word 97-2003 .doc and PDF. Usage: finalize_with_word.ps1 <in.docx> <outBase>
param([string]$InDocx, [string]$OutBase)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($InDocx, $false, $false)
  # A4 portrait on every section (595.3 x 841.9 pt), set explicitly so Word never falls back to Letter.
  foreach ($sec in $doc.Sections) {
    $sec.PageSetup.PaperSize = 7          # wdPaperA4
    $sec.PageSetup.Orientation = 0        # portrait
  }
  # Two passes: first fixes SEQ numbers and pagination, second refreshes TOC page numbers.
  for ($pass = 0; $pass -lt 2; $pass++) {
    foreach ($story in $doc.StoryRanges) {
      $r = $story
      while ($r -ne $null) { [void]$r.Fields.Update(); $r = $r.NextStoryRange }
    }
    foreach ($t in $doc.TablesOfContents) { [void]$t.Update() }
    $doc.Repaginate()
  }
  $pages = $doc.ComputeStatistics(2)
  $words = $doc.ComputeStatistics(0)
  $doc.SaveAs2("$OutBase.docx", 16)
  $doc.SaveAs2("$OutBase.doc", 0)
  $doc.ExportAsFixedFormat("$OutBase.pdf", 17, $false, 0, 0, 0, 0, 0, $true, $true, 1)
  "pages=$pages words=$words"
  $doc.Close($false)
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}

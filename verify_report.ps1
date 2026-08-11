# Structural verification of the generated build report.
$ErrorActionPreference = 'Stop'
$path = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'SPL-Playground-Build-Report.docx'

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($path, $false, $true)   # read-only

  $pages = $doc.ComputeStatistics(2)   # wdStatisticPages
  $words = $doc.ComputeStatistics(0)   # wdStatisticWords
  Write-Output "pages=$pages words=$words paragraphs=$($doc.Paragraphs.Count) tables=$($doc.Tables.Count)"

  # heading outline
  Write-Output "`n--- headings ---"
  foreach ($p in $doc.Paragraphs) {
    $s = $p.Style.NameLocal
    if ($s -like 'Heading*' -or $s -eq 'Title' -or $s -eq 'Subtitle') {
      $t = $p.Range.Text.TrimEnd([char]13, [char]7)
      if ($t) { Write-Output ("{0,-10} {1}" -f $s, $t) }
    }
  }

  # tables
  Write-Output "`n--- tables ---"
  $i = 1
  foreach ($t in $doc.Tables) {
    $hdr = @()
    for ($c = 1; $c -le $t.Columns.Count; $c++) {
      $hdr += $t.Cell(1, $c).Range.Text.TrimEnd([char]13, [char]7)
    }
    Write-Output ("table {0}: {1}r x {2}c | header: {3}" -f $i, $t.Rows.Count, $t.Columns.Count, ($hdr -join ' / '))
    $i++
  }

  # table of contents populated?
  Write-Output "`n--- toc ---"
  Write-Output "tocCount=$($doc.TablesOfContents.Count)"
  if ($doc.TablesOfContents.Count -gt 0) {
    $tocText = $doc.TablesOfContents.Item(1).Range.Text
    Write-Output "tocChars=$($tocText.Length)"
    Write-Output ($tocText -replace "[`r`a]", ' | ').Substring(0, [Math]::Min(400, $tocText.Length))
  }

  # monospace code blocks present?
  $consolas = 0
  foreach ($p in $doc.Paragraphs) {
    if ($p.Range.Font.Name -eq 'Consolas') { $consolas++ }
  }
  Write-Output "`nconsolasParagraphs=$consolas"

  # content hygiene checks
  $all = $doc.Content.Text
  Write-Output "`n--- hygiene ---"
  Write-Output ("emDash=" + ([regex]::Matches($all, [char]0x2014)).Count)
  Write-Output ("smartQuote=" + ([regex]::Matches($all, '[“”‘’]')).Count)
  Write-Output ("nulBytes=" + ([regex]::Matches($all, "`0")).Count)
  foreach ($needle in @('cidrmatch', 'mulberry', 'transaction JSESSIONID', '(?<src_port>\d+)', 'strictCols', '5,970')) {
    Write-Output ("contains '" + $needle + "' = " + $all.Contains($needle))
  }
  # footer
  $f = $doc.Sections.Item(1).Footers.Item(1).Range.Text
  Write-Output ("footer='" + ($f -replace "[`r`a]", ' ') + "'")

  $doc.Close(0)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

# Replaces the personal metadata Word embeds in a .docx (author, last modified
# by, company) with neutral project values.
#
# Word writes dc:creator and cp:lastModifiedBy from the signed-in Office
# profile, so a document generated on a corporate machine carries the author's
# real name and employer. Setting BuiltInDocumentProperties over COM does not
# work reliably in this environment, so the package XML is rewritten directly.
#
# Usage: .\scrub_docx_metadata.ps1 [-Path <file.docx>] [-Author <name>]

param(
  [string]$Path,
  [string]$Author = 'SPL Playground',
  [string]$Title  = 'SPL Playground engineering report',
  [string]$Subject = 'Architecture, components, dependencies and design decisions',
  [string]$Keywords = 'splunk, spl, javascript, education'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not $Path) {
  $Path = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'SPL-Playground-Build-Report.docx'
}
if (-not (Test-Path $Path)) { throw "Not found: $Path" }

function Esc([string]$s) {
  return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

$zip = [System.IO.Compression.ZipFile]::Open($Path, 'Update')
try {
  # ---- docProps/core.xml : author, title, subject, keywords ----
  $entry = $zip.GetEntry('docProps/core.xml')
  if ($entry) {
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $xml = $reader.ReadToEnd()
    $reader.Dispose()

    $before = ([regex]::Match($xml, '<dc:creator>([^<]*)</dc:creator>')).Groups[1].Value

    $xml = [regex]::Replace($xml, '<dc:creator>[^<]*</dc:creator>',        '<dc:creator>' + (Esc $Author) + '</dc:creator>')
    $xml = [regex]::Replace($xml, '<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', '<cp:lastModifiedBy>' + (Esc $Author) + '</cp:lastModifiedBy>')
    $xml = [regex]::Replace($xml, '<dc:title>[^<]*</dc:title>',            '<dc:title>' + (Esc $Title) + '</dc:title>')
    $xml = [regex]::Replace($xml, '<dc:subject>[^<]*</dc:subject>',        '<dc:subject>' + (Esc $Subject) + '</dc:subject>')
    $xml = [regex]::Replace($xml, '<cp:keywords>[^<]*</cp:keywords>',      '<cp:keywords>' + (Esc $Keywords) + '</cp:keywords>')
    $xml = [regex]::Replace($xml, '<cp:lastPrinted>[^<]*</cp:lastPrinted>', '')

    $s = $entry.Open(); $s.SetLength(0)
    $w = New-Object System.IO.StreamWriter($s, (New-Object System.Text.UTF8Encoding $false))
    $w.Write($xml); $w.Flush(); $w.Dispose()

    Write-Output ("core.xml  creator '{0}' -> '{1}'" -f $before, $Author)
  }

  # ---- docProps/app.xml : company and manager ----
  $entry2 = $zip.GetEntry('docProps/app.xml')
  if ($entry2) {
    $reader2 = New-Object System.IO.StreamReader($entry2.Open())
    $xml2 = $reader2.ReadToEnd()
    $reader2.Dispose()
    $xml2 = [regex]::Replace($xml2, '<Company>[^<]*</Company>', '<Company></Company>')
    $xml2 = [regex]::Replace($xml2, '<Manager>[^<]*</Manager>', '<Manager></Manager>')
    $s2 = $entry2.Open(); $s2.SetLength(0)
    $w2 = New-Object System.IO.StreamWriter($s2, (New-Object System.Text.UTF8Encoding $false))
    $w2.Write($xml2); $w2.Flush(); $w2.Dispose()
    Write-Output 'app.xml   company and manager cleared'
  }
}
finally {
  $zip.Dispose()
}

Write-Output "Scrubbed $Path"

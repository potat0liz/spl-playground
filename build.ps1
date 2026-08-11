# Builds the SPL Playground into single self-contained HTML files.
#   dist\index.html    - standalone page, open it directly in a browser
#   dist\artifact.html - same content without the document wrapper, for
#                        publishing environments that supply their own <head>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root 'src'
$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

$css = Get-Content (Join-Path $src 'styles.css') -Raw -Encoding UTF8

$scripts = @('data.js','spl-lang.js','spl-commands.js','content.js','app.js')
$js = ($scripts | ForEach-Object {
  $p = Join-Path $src $_
  "/* ===== $_ ===== */`n" + (Get-Content $p -Raw -Encoding UTF8)
}) -join "`n"

$title = 'SPL Playground - practise Splunk searches without Splunk'

$inner = @"
<title>$title</title>
<style>
$css
</style>
<script>
$js
</script>
"@

$standalone = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A browser-based Splunk SPL interpreter with generated sample data, a command reference and graded exercises.">
$inner
</head>
<body>
</body>
</html>
"@

[System.IO.File]::WriteAllText((Join-Path $dist 'index.html'), $standalone, (New-Object System.Text.UTF8Encoding $false))
[System.IO.File]::WriteAllText((Join-Path $dist 'artifact.html'), $inner, (New-Object System.Text.UTF8Encoding $false))

$size = [math]::Round((Get-Item (Join-Path $dist 'index.html')).Length / 1KB, 1)
Write-Output "Built dist\index.html and dist\artifact.html ($size KB)"

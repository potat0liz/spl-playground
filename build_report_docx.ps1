# Generates the SPL Playground engineering report as a Word .docx via Word COM.
# PowerShell + Word COM is used because this machine has no Node, no Python
# interpreter, no pandoc and no LibreOffice. See section 8 of the document.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDocx = Join-Path $root 'SPL-Playground-Build-Report.docx'
$outPdf  = Join-Path $root 'SPL-Playground-Build-Report.pdf'

# Word built-in style ids (WdBuiltinStyle); integers avoid locale issues
$stTitle = -63; $stSubtitle = -75; $stH1 = -2; $stH2 = -3; $stH3 = -4
$stNormal = -1; $stBullet = -48; $stCaption = -35

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

# Autocorrect would turn "--" into a dash and quotes into smart quotes,
# which would corrupt every code sample in the document.
$opt = $word.Options
$autoOff = @(
  'AutoFormatAsYouTypeReplaceQuotes','AutoFormatAsYouTypeReplaceHyphens',
  'AutoFormatAsYouTypeReplaceSymbols','AutoFormatAsYouTypeApplyBulletedLists',
  'AutoFormatAsYouTypeApplyNumberedLists','AutoFormatAsYouTypeFormatListItemBeginning',
  'AutoFormatReplaceQuotes','AutoFormatReplaceHyphens','AutoFormatReplaceSymbols'
)
foreach ($p in $autoOff) { try { $opt.$p = $false } catch { } }

try {
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  $ps = $doc.PageSetup
  $ps.PageWidth = 612; $ps.PageHeight = 792
  $ps.TopMargin = 72; $ps.BottomMargin = 72
  $ps.LeftMargin = 90; $ps.RightMargin = 90

  $doc.Styles.Item($stNormal).Font.Name = 'Calibri'
  $doc.Styles.Item($stNormal).Font.Size = 11
  $doc.Styles.Item($stNormal).ParagraphFormat.SpaceAfter = 8
  $doc.Styles.Item($stNormal).ParagraphFormat.LineSpacingRule = 0

  foreach ($h in @($stH1, $stH2, $stH3)) {
    $doc.Styles.Item($h).Font.Name = 'Calibri Light'
    $doc.Styles.Item($h).Font.Color = 2245660
  }
  $doc.Styles.Item($stH1).Font.Size = 17
  $doc.Styles.Item($stH2).Font.Size = 13.5
  $doc.Styles.Item($stH3).Font.Size = 11.5
  $doc.Styles.Item($stH3).Font.Bold = $true

  # ---------- helpers ----------
  function Add-Para([string]$text, [int]$style) {
    $script:sel.Style = $script:doc.Styles.Item($style)
    $script:sel.TypeText($text); $script:sel.TypeParagraph()
  }
  function Add-Body([string]$text) {
    $sel.Style = $doc.Styles.Item($stNormal)
    $sel.ParagraphFormat.LeftIndent = 0; $sel.Font.Bold = $false
    $sel.TypeText($text); $sel.TypeParagraph()
  }
  function Add-Bullet([string]$text) {
    $sel.Style = $doc.Styles.Item($stBullet)
    $sel.ParagraphFormat.SpaceAfter = 4
    $sel.TypeText($text); $sel.TypeParagraph()
  }
  function Add-Code([string[]]$lines) {
    $sel.Style = $doc.Styles.Item($stNormal)
    $start = $sel.Range.Start
    foreach ($l in $lines) { $sel.TypeText($l); $sel.TypeParagraph() }
    $rng = $doc.Range($start, $sel.Range.Start)
    $rng.Font.Name = 'Consolas'; $rng.Font.Size = 8.5
    $rng.ParagraphFormat.SpaceAfter = 0; $rng.ParagraphFormat.SpaceBefore = 0
    $rng.ParagraphFormat.LeftIndent = 14
    $rng.Shading.BackgroundPatternColor = 15921906
    $rng.Borders.Item(1).LineStyle = 1
    $rng.Borders.Item(1).Color = 7908437
    $rng.Borders.Item(1).LineWidth = 6
    $sel.Style = $doc.Styles.Item($stNormal)
    $sel.Font.Name = 'Calibri'; $sel.Font.Size = 11
    $sel.ParagraphFormat.LeftIndent = 0; $sel.ParagraphFormat.SpaceAfter = 8
    $sel.Borders.Item(1).LineStyle = 0
    $sel.Shading.BackgroundPatternColor = -16777216
    $sel.TypeParagraph()
  }
  function Add-Table([object[]]$rows, [double[]]$weights) {
    $nRows = $rows.Count; $nCols = $rows[0].Count
    $tbl = $doc.Tables.Add($sel.Range, $nRows, $nCols)
    $tbl.Rows.Item(1).HeadingFormat = $true
    $tbl.PreferredWidthType = 2; $tbl.PreferredWidth = 100
    $tbl.Range.Font.Name = 'Calibri'; $tbl.Range.Font.Size = 9
    $tbl.Range.ParagraphFormat.SpaceAfter = 2
    $tbl.Range.ParagraphFormat.SpaceBefore = 2
    for ($r = 0; $r -lt $nRows; $r++) {
      for ($c = 0; $c -lt $nCols; $c++) {
        $cell = $tbl.Cell($r + 1, $c + 1)
        $cell.Range.Text = [string]$rows[$r][$c]
        if ($r -eq 0) {
          $cell.Range.Font.Bold = $true
          $cell.Shading.BackgroundPatternColor = 15921906
        }
      }
    }
    foreach ($b in @(-1, -2, -3, -4, -5, -6)) { try { $tbl.Borders.Item($b).LineStyle = 0 } catch {} }
    $tbl.Borders.Item(-3).LineStyle = 1; $tbl.Borders.Item(-3).Color = 13684944
    $tbl.Borders.Item(-5).LineStyle = 1; $tbl.Borders.Item(-5).Color = 8421504
    $tbl.Borders.Item(-6).LineStyle = 1; $tbl.Borders.Item(-6).Color = 8421504
    if ($weights) {
      $total = 0.0; foreach ($w in $weights) { $total += $w }
      $avail = $ps.PageWidth - $ps.LeftMargin - $ps.RightMargin
      for ($c = 0; $c -lt $nCols; $c++) {
        $tbl.Columns.Item($c + 1).Width = $avail * ($weights[$c] / $total)
      }
    }
    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item($stNormal)
  }

  # =====================================================================
  Add-Para 'SPL Playground' $stTitle
  Add-Para 'Engineering report: components, dependencies and design decisions' $stSubtitle

  $sel.Style = $doc.Styles.Item($stNormal)
  $sel.Font.Color = 8421504
  $sel.TypeText('Revision 2  |  ' + (Get-Date -Format 'd MMMM yyyy'))
  $sel.TypeParagraph()
  $sel.Font.Color = -16777216
  $sel.TypeParagraph()

  Add-Body 'The SPL Playground is a single self-contained HTML file that interprets Splunk Search Processing Language entirely in the browser, against generated sample data, with no Splunk instance, no server, no install and no third-party code.'

  Add-Body 'This revision documents the engineering: every component and what it owns, the full dependency position, the decisions taken and the alternatives rejected, how the thing is built and verified, and where to extend it.'

  # ---- contents ----
  $sel.Style = $doc.Styles.Item($stNormal)
  $sel.Font.Name = 'Calibri Light'; $sel.Font.Size = 17; $sel.Font.Color = 2245660
  $sel.ParagraphFormat.SpaceBefore = 12; $sel.ParagraphFormat.SpaceAfter = 6
  $sel.TypeText('Contents'); $sel.TypeParagraph()
  $sel.Font.Name = 'Calibri'; $sel.Font.Size = 11; $sel.Font.Color = -16777216
  $sel.ParagraphFormat.SpaceBefore = 0; $sel.ParagraphFormat.SpaceAfter = 8

  $toc = $doc.TablesOfContents.Add($sel.Range, $true, 1, 2)
  $sel.EndKey(6) | Out-Null
  $sel.TypeParagraph()
  $sel.InsertBreak(7) | Out-Null

  # =====================================================================
  Add-Para '1. The problem and the constraint' $stH1

  Add-Body 'The requirement was somewhere to run SPL queries and check understanding of the commands, without standing up Splunk. A trial licence expires, and a local install is a heavy prerequisite for what is fundamentally revision practice.'

  Add-Body 'The build machine settled the architecture before any design work started. A survey of the toolchain returned almost nothing usable:'

  Add-Table @(
    @('Tool', 'Status', 'Consequence'),
    @('node / npm / npx', 'Not installed', 'No bundler, no package manager, no JavaScript build step'),
    @('python / python3', 'Microsoft Store alias stub only', 'No Python scripting, no python-docx'),
    @('pandoc', 'Not installed', 'No document conversion'),
    @('LibreOffice (soffice)', 'Not installed', 'No headless render or PDF conversion'),
    @('pdftoppm (Poppler)', 'Not installed', 'PDFs cannot be rasterised for visual checking'),
    @('zip', 'Not installed', 'No command-line archive creation'),
    @('unzip', 'Present', 'Archives can be read but not written'),
    @('PowerShell 5.1', 'Present', 'Primary scripting host'),
    @('Word 16 via COM', 'Present', 'Document generation route'),
    @('git / gh CLI', 'Present', 'Version control and publishing')
  ) @(2.0, 2.6, 3.6)

  Add-Body 'With no runtime to build against and no server to deploy to, anything requiring a package manager, a bundler or a backend was ruled out at the start. That pointed at one target: a zero-dependency application that runs entirely client side, ships as a single HTML file, works offline from a file:// URL, and can be hosted or shared as a link with no infrastructure.'

  Add-Body 'The consequence is that the SPL engine had to be written from scratch in JavaScript. That is the bulk of the work and the most interesting part of it.'

  # =====================================================================
  Add-Para '2. Architecture' $stH1

  Add-Para '2.1 Module boundaries' $stH2

  Add-Body 'The application is five JavaScript modules, one stylesheet and a build script. The separation is enforced by the dependency direction: each module may only reference the ones above it in this list, and nothing references anything below it.'

  Add-Table @(
    @('Layer', 'Module', 'May depend on', 'Lines'),
    @('1. Language core', 'spl-lang.js', 'nothing', '829'),
    @('2. Command library', 'spl-commands.js', 'spl-lang.js', '2,005'),
    @('3. Data', 'data.js', 'nothing', '464'),
    @('4. Content', 'content.js', 'nothing', '506'),
    @('5. Interface', 'app.js', 'all of the above', '1,005'),
    @('Presentation', 'styles.css', 'nothing', '345')
  ) @(2.2, 2.4, 2.6, 1.0)

  Add-Body 'The important property is that the language core knows nothing about commands, the command layer knows nothing about the interface, and the data and content modules are inert: they export values and no behaviour. The engine can therefore be exercised without a user interface at all, which is exactly how the test suite drives it.'

  Add-Body 'Each module is an immediately-invoked function expression that attaches a single global. There is no module system because there is no bundler to resolve one:'

  Add-Code @(
    'window.SPLLang    = { tokenize, parseExpr, evalNode, numeric, toStr, truthy,',
    '                      cmp, isNull, isMV, strftime, strptime, relativeTime,',
    '                      toRegExp, likeToRegExp, cidrMatch, jsonPath, FUNCS, ... }',
    '',
    'window.SPLEngine  = { runSearch, splitPipeline, parseSearch, matchSearch,',
    '                      commands, aggs }',
    '',
    'window.SPLData    = { generate, PRODUCTS, HTTP_STATUS, USERS, VENDORS }',
    '',
    'window.SPLContent = { COMMANDS, EVAL_FUNCS, STATS_FUNCS, SAMPLES,',
    '                      EXERCISES, NOTES, MACROS }'
  )

  Add-Para '2.2 Data flow' $stH2

  Add-Body 'Data flows one way. The generator produces events once at page load. A search is parsed, the base filter selects events, and surviving rows pass through each command in turn. Every command receives a result set and returns a new one.'

  Add-Code @(
    'runSearch(spl, opts)',
    '  |',
    '  +-- expandMacros()      resolve `backtick` macros, up to 10 passes',
    '  +-- splitPipeline()     split on | outside quotes and brackets',
    '  +-- parseSearch()       base filter -> boolean AST',
    '  |     +-- earliest= / latest= extracted as time bounds',
    '  |     +-- events scanned, matchNodeFixed() per event',
    '  +-- applySegment() x N  one command at a time',
    '        State -> State',
    '',
    'returns { rows, fields, isEvents, chart, warnings, elapsed }'
  )

  # =====================================================================
  Add-Para '3. Component reference' $stH1

  Add-Para '3.1 src/spl-lang.js  (829 lines)' $stH2
  Add-Body 'The language core. Owns everything that is true about SPL expressions regardless of which command they appear in.'
  Add-Bullet 'Tokenizer for expression syntax: strings, single-quoted field references, numbers, identifiers, operators, and SPL triple-backtick comments.'
  Add-Bullet 'Recursive-descent parser producing an abstract syntax tree.'
  Add-Bullet 'Evaluator with Splunk null semantics and numeric coercion.'
  Add-Bullet 'The eval function library: 65 functions in a lookup table, plus six lazy forms handled directly in the evaluator.'
  Add-Bullet 'Time handling: strftime, strptime, and a relative-time parser covering the modifier syntax including snapping.'
  Add-Bullet 'Regular expression translation from PCRE-flavoured patterns to JavaScript, plus SQL LIKE translation and CIDR matching.'
  Add-Bullet 'JSON path evaluation used by both the spath command and the spath function.'

  Add-Para '3.2 src/spl-commands.js  (2,005 lines)' $stH2
  Add-Body 'The largest module. Owns the search grammar, the aggregation functions and the command library.'
  Add-Bullet 'A second, separate tokenizer and parser for the base search grammar.'
  Add-Bullet 'The event matcher, including the special handling that negation requires.'
  Add-Bullet '30 aggregation functions used by stats, eventstats, streamstats, chart, timechart, top and rare.'
  Add-Bullet '65 command entries covering roughly 60 distinct commands plus documented aliases such as bucket for bin and kv for extract.'
  Add-Bullet 'Shared argument parsing: a quote-aware and bracket-aware splitter, an option extractor, a BY and OVER clause splitter, and an aggregation parser.'
  Add-Bullet 'The pipeline runner, macro expansion and subsearch execution.'

  Add-Para '3.3 src/data.js  (464 lines)' $stH2
  Add-Body 'The dataset generator. Exports a single generate() function returning events, lookup tables and geo blocks, plus the reference tables so other code can reuse them.'
  Add-Bullet 'A mulberry32 seeded pseudo-random generator, so output is identical for every user and every reload.'
  Add-Bullet 'Six event builders, one per sourcetype, each producing both a realistic _raw string and pre-extracted fields.'
  Add-Bullet 'Diurnal weighting so event volume follows a plausible working day.'
  Add-Bullet 'Five lookup tables and a small geo block table used by the iplocation command.'
  Add-Bullet 'Event type and tag assignment, so knowledge-object searches such as eventtype=failed_login work.'

  Add-Para '3.4 src/content.js  (506 lines)' $stH2
  Add-Body 'Pure data, no logic. Keeping the study material out of the interface code means content can be edited without touching behaviour.'
  Add-Table @(
    @('Export', 'Contents'),
    @('COMMANDS', '57 command entries: syntax, description, runnable examples, exam-relevance flag'),
    @('EVAL_FUNCS', '37 eval function entries grouped by category'),
    @('STATS_FUNCS', '15 aggregation function entries'),
    @('SAMPLES', '9 groups of worked example searches'),
    @('EXERCISES', '25 graded exercises with reference solutions and hints'),
    @('NOTES', '14 exam notes on commonly confused behaviour'),
    @('MACROS', 'Three macro definitions so backtick expansion can be demonstrated')
  ) @(2.0, 6.2)

  Add-Para '3.5 src/app.js  (1,005 lines)' $stH2
  Add-Body 'The interface. Deliberately the only module that touches the DOM.'
  Add-Bullet 'Search execution, time range handling and result rendering across Events, Statistics and Visualization views.'
  Add-Bullet 'A hand-written SVG chart renderer supporting column, stacked column, grouped column, line with area fill, and horizontal bar.'
  Add-Bullet 'The field sidebar with per-field value distributions.'
  Add-Bullet 'The study panel: command reference, function reference, samples, exercises, exam notes and dataset documentation.'
  Add-Bullet 'The exercise grader.'
  Add-Bullet 'Theme handling, shareable-link encoding and localStorage persistence of progress.'

  Add-Para '3.6 src/styles.css  (345 lines)' $stH2
  Add-Body 'Token-based theming. The palette is defined once as custom properties and redefined for dark mode under both the prefers-color-scheme media query and an explicit data-theme attribute, so an operating system preference and a manual toggle both work. Semantic colours for good, warning and critical state are kept separate from the interface accent, because the accent means "this application" and not "this value is healthy".'

  Add-Para '3.7 Scripts' $stH2
  Add-Table @(
    @('Script', 'Lines', 'Purpose'),
    @('build.ps1', '42', 'Concatenates sources into dist/index.html and dist/artifact.html'),
    @('build_report_docx.ps1', '~470', 'Generates this document and its PDF via Word COM'),
    @('verify_report.ps1', '63', 'Structural verification of the generated document')
  ) @(2.6, 0.9, 4.7)

  # =====================================================================
  Add-Para '4. The SPL engine' $stH1

  Add-Para '4.1 Two grammars, two parsers' $stH2

  Add-Body 'SPL is not one language. The base search is a boolean retrieval grammar where bare words are full-text terms and adjacency means AND. An eval expression is an ordinary infix expression language. Serving both with one parser produces something that handles neither well, so the engine has two.'

  Add-Body 'Base search grammar:'
  Add-Code @(
    'OR        lowest precedence',
    'AND       implicit between adjacent terms',
    'NOT       unary',
    'term      field=value | field IN (..) | TERM(..) | bare full-text term',
    '          | ( ... ) | [ subsearch ]'
  )

  Add-Body 'Expression grammar used by eval and where:'
  Add-Code @(
    'OR',
    'AND / XOR',
    'NOT',
    'comparison   =  ==  !=  <  >  <=  >=  LIKE  IN',
    'additive     +  -  .            (. is string concatenation)',
    'multiplic.   *  /  %',
    'unary        -',
    'primary      literal | field | function(..) | ( expr )'
  )

  Add-Para '4.2 Details that decide whether it feels real' $stH2

  Add-Para 'The dot is ambiguous' $stH3
  Add-Body 'In SPL the dot is the string concatenation operator, but field names such as http.status also contain dots. The tokenizer resolves this positionally: a dot glued to identifier characters on both sides is part of the name, otherwise it is the operator. So http.status is one field, and host . ":" . status is a concatenation of three things.'

  Add-Para 'Negation cannot be evaluated per value' $stH3
  Add-Body 'A multivalue field matches a positive comparison if any one of its values matches. Applying that rule to an inequality gives the wrong answer, because "any value is not X" is true whenever the field holds two different values. Negation is therefore evaluated against the whole field: no value may match. This is also what separates NOT status=200, which keeps events with no status field at all, from status!=200, which requires the field to exist.'

  Add-Para 'Some functions must not evaluate their arguments' $stH3
  Add-Body 'Evaluating every argument before the call breaks if(), case(), validate() and coalesce(), which exist precisely to avoid evaluating branches that should not run. Those four are handled as lazy forms ahead of argument evaluation. The same mechanism supports mvfilter() and mvmap(), which bind each value of a multivalue field in turn and evaluate the expression once per value.'

  Add-Para 'Quoting rules carry meaning' $stH3
  Add-Body 'Double quotes delimit a string literal; single quotes denote a field reference. So eval x="status" assigns the text status, while eval x=''status'' assigns the value of the status field. The unquote routine deliberately consumes only quote and backslash escapes and leaves every other backslash intact, because consuming them all silently destroys regular expressions passed to rex.'

  Add-Para 'Null propagates, comparisons do not' $stH3
  Add-Body 'Arithmetic involving null yields null. Comparison against null yields false rather than null, so a where clause cannot accidentally retain rows on a missing field. An eval that produces null for every row creates no field, and therefore no column, matching Splunk.'

  Add-Para '4.3 The command contract' $stH2

  Add-Body 'Every command has the same signature. That single decision is what keeps a sixty-command library tractable, and what allows a new command to be added without touching the pipeline runner.'

  Add-Code @(
    'CMD.<name> = function (State, argString, ctx) -> State',
    '',
    'State = {',
    '  rows:     array of row objects (fields are plain properties)',
    '  fields:   explicit column order, or null to derive from the data',
    '  isEvents: still raw events, or now a statistics table?',
    '  chart:    optional { x, series, time } hint for the visualiser',
    '}',
    '',
    'ctx = {',
    '  now, earliest, latest,      time context',
    '  allEvents,                  the full generated dataset',
    '  lookups, geoBlocks, macros, reference data',
    '  warnings, depth             diagnostics and subsearch recursion guard',
    '}'
  )

  Add-Body 'A multivalue field is simply a JavaScript array in the row object, which is why mvexpand, mvcombine and the mv functions need no special storage. The isEvents flag is what lets the interface decide between an event list and a results table, and it flips the first time a transforming command runs.'

  Add-Body 'chart and timechart share one implementation. timechart is chart with _time on the x axis, so it buckets time, delegates, and then fills empty buckets so the series stays continuous. When no span is given the engine selects from a list of round intervals, choosing the smallest that keeps the chart under roughly sixty points.'

  # =====================================================================
  Add-Para '5. Generating data worth searching' $stH1

  Add-Body 'The dataset is 5,970 events across six indexes and six sourcetypes covering the last seven days, plus five lookup tables.'

  Add-Table @(
    @('index', 'sourcetype', 'events', 'Exercises what'),
    @('web', 'access_combined_wcookie', '2,600', 'stats, top, timechart, transaction, rex'),
    @('security', 'linux_secure', '800', 'Authentication analysis, rex, eventtypes'),
    @('windows', 'WinEventLog:Security', '700', 'Multi-line events, EventCode filtering'),
    @('network', 'pan:traffic', '950', 'key=value extraction, cidrmatch'),
    @('sales', 'vendor_sales', '420', 'Lookups and joins'),
    @('app', 'app:json', '500', 'spath and JSON path handling')
  ) @(1.3, 2.6, 1.0, 3.3)

  Add-Para '5.1 Determinism is a requirement, not a nicety' $stH2

  Add-Body 'Generation runs from a seeded pseudo-random generator, a small mulberry32 implementation, rather than Math.random. Every user and every reload produces identical data. This is not tidiness: the exercise grader compares a learner query against a reference query, and that comparison is only meaningful if the underlying data cannot shift between the two runs.'

  Add-Para '5.2 Random events teach the wrong lesson' $stH2

  Add-Body 'The first generator emitted independent events, each with a freshly randomised client IP and session id. It looked plausible and was useless. With roughly 7,000 possible session ids spread across 2,600 events almost nothing repeated, so the queries that matter most returned nothing:'

  Add-Code @(
    'index=web | stats count by clientip | where count > 25',
    '  -> 0 results',
    '',
    'index=web | transaction JSESSIONID maxspan=30m | where eventcount > 5',
    '  -> 0 results'
  )

  Add-Body 'A learner running those and seeing an empty table would reasonably conclude they had written them wrong. The generator was restructured so web traffic is produced as browsing sessions: a fixed pool of ninety client IPs, each session holding one client, one session id and a run of page views a few minutes apart, with realistic page sequencing. SSH sources and firewall endpoints received the same treatment, including four brute-force source addresses that generate a heavy tail of failures. The same queries now return 50 rows and 145 sessions respectively.'

  Add-Body 'This is the most important decision in the data layer. The realism is not decorative; it is what makes transaction, dedup and per-entity aggregation demonstrate anything at all.'

  # =====================================================================
  Add-Para '6. Grading without demanding one exact answer' $stH1

  Add-Body 'There are 25 graded exercises. Marking them by comparing query text would be worse than useless, because SPL offers many equivalent phrasings and a learner who finds a different correct route should not be told they are wrong.'

  Add-Body 'Instead the grader executes both queries and compares results:'

  Add-Code @(
    '1. run the reference solution over the full dataset',
    '2. run the learner query over the same data',
    '3. compare the two result tables'
  )

  Add-Body 'The comparison was tuned against real disagreements found during testing:'
  Add-Bullet 'Column names are compared as a set, not a sequence, so declaring aggregations in a different order still passes.'
  Add-Bullet 'Column order is enforced only where an exercise is explicitly about it, via a strictCols flag.'
  Add-Bullet 'Row order is always compared, because the sorting exercises depend on it.'
  Add-Bullet 'Values are normalised: numbers rounded to six decimal places, multivalue fields flattened.'
  Add-Bullet 'Event-level exercises with no meaningful table use a count-only comparison mode.'
  Add-Bullet 'Failures name the specific row and column that disagree rather than saying "incorrect".'

  Add-Body 'Grading always runs over all seven days regardless of the time picker, so a correct answer cannot be marked wrong because of an unrelated interface setting. The panel states this explicitly.'

  # =====================================================================
  Add-Para '7. Dependencies' $stH1

  Add-Para '7.1 Runtime dependencies: none' $stH2

  Add-Body 'There is no framework, no charting library, no date library, no polyfill and no third-party code of any kind. The shipped artefact contains only code written for this project. The browser platform features relied upon are:'

  Add-Table @(
    @('Platform feature', 'Used for', 'Available since'),
    @('Regular expression named groups', 'rex field extraction', 'ES2018'),
    @('Object.assign, Array.fill, String.startsWith', 'General code', 'ES2015 to ES2017'),
    @('Inline SVG', 'All charts and the timeline', 'Long established'),
    @('localStorage', 'Exercise progress, last query, theme', 'Long established'),
    @('CSS custom properties', 'Theming', 'Long established'),
    @('CSS color-mix()', 'Semantic state tints', '2023'),
    @('prefers-color-scheme', 'Automatic dark mode', '2019'),
    @('performance.now()', 'Search timing display', 'Long established')
  ) @(3.2, 3.0, 1.8)

  Add-Body 'The practical requirement is a current evergreen browser. Nothing is fetched at runtime, so the page works offline, from a file:// URL, and inside a strict content security policy that blocks all external requests.'

  Add-Para '7.2 Build dependencies' $stH2

  Add-Table @(
    @('Dependency', 'Version', 'Used by', 'Required to run the app?'),
    @('PowerShell', '5.1 (built into Windows)', 'build.ps1', 'No, only to rebuild'),
    @('Microsoft Word', '16.0 via COM', 'build_report_docx.ps1', 'No, only for this report'),
    @('git and gh CLI', '2.55 / 2.96', 'Publishing', 'No')
  ) @(2.2, 2.4, 2.2, 2.0)

  Add-Body 'The build is file concatenation. There is no bundler, no transpiler, no minifier, no lockfile and no dependency tree.'

  Add-Code @(
    '.\build.ps1',
    '  reads   src\*.css and src\*.js',
    '  writes  dist\index.html      standalone, opens by double-click, offline',
    '  writes  dist\artifact.html   same content without the document wrapper'
  )

  Add-Para '7.3 A note on Python' $stH2

  Add-Body 'There are no Python files in this project, and this is worth stating plainly because it differs from the usual pattern of driving document generation from a build_*.py script using python-docx.'

  Add-Body 'Python is not available on this machine. The python and python3 commands resolve to the Microsoft Store alias stub, which prints an installation prompt rather than executing anything. python-docx was therefore not an option, and neither were the pandoc or LibreOffice conversion routes, since neither is installed.'

  Add-Body 'PowerShell driving Word through COM was chosen instead. It has one clear advantage over a library: the document is produced by Word itself, so styles, the table of contents, field updates and pagination are genuinely native rather than approximated. It also has a specific cost, covered in section 9: the usual "render it to images and look at it" verification step is unavailable, because nothing on this machine can rasterise a PDF.'

  Add-Para '7.4 Supply chain position' $stH2

  Add-Body 'Zero third-party code means no transitive dependencies, no lockfile to maintain, no dependency vulnerability surface, no build-time network access and nothing that can be pulled or altered upstream. The single file will still open in a decade.'

  Add-Body 'The cost is that everything is hand-written, so every behaviour is only as correct as the code and the tests make it. That is precisely why the verification described in section 9 exists and why it asserts invariants rather than trusting the implementation.'

  Add-Body 'No credentials, keys, tokens or connection strings exist anywhere in the project. Nothing authenticates to anything, because nothing leaves the browser. All addresses, user names, host names and email addresses in the generated data are synthetic.'

  # =====================================================================
  Add-Para '8. Decision log' $stH1

  Add-Body 'The decisions that shaped the project, with the alternative that was rejected in each case.'

  Add-Table @(
    @('Decision', 'Alternative rejected', 'Rationale'),
    @('Client-side single HTML file', 'Server-backed web application', 'No runtime, no server and no package manager available. Must work offline and be shareable as one file'),
    @('Write a real SPL interpreter', 'Canned answers for a fixed question set', 'A fixed set cannot respond to a query the learner invents, which is the entire purpose'),
    @('Two parsers, one per grammar', 'One unified parser', 'Boolean retrieval and infix expressions are genuinely different languages; one parser serves neither well'),
    @('Seeded pseudo-random data', 'Math.random', 'Result-comparison grading is only sound if the data cannot change between the two runs'),
    @('Session-structured web traffic', 'Independent random events', 'Without repetition, transaction, dedup and group-by return nothing and teach the wrong lesson'),
    @('Grade by comparing results', 'Compare query text', 'Many correct phrasings exist; text comparison punishes correct answers'),
    @('One uniform command signature', 'Bespoke handling per command', 'Sixty commands need one contract, otherwise the pipeline runner accumulates special cases'),
    @('Hand-written SVG charts', 'A charting library', 'No package manager to install one, and no network access at runtime to load one'),
    @('PowerShell plus Word COM for documents', 'python-docx or pandoc', 'No Python interpreter and no pandoc; Word produces genuinely native styles and fields'),
    @('Concatenation build', 'Webpack, Rollup or esbuild', 'All require Node, which is absent. Concatenation is sufficient for five files with no imports')
  ) @(2.4, 2.2, 4.2)

  # =====================================================================
  Add-Para '9. Verification' $stH1

  Add-Body 'A search engine that silently returns a wrong number is worse than one that fails loudly, because a study tool that quietly teaches wrong behaviour is actively harmful. Verification therefore runs against the built bundle in a real browser rather than against the source in principle.'

  Add-Para '9.1 Invariants over golden values' $stH2

  Add-Body 'Around eighty assertions execute inside the running page. Most check properties that must hold rather than values captured from an earlier run, which is what lets them detect a regression rather than merely restate one.'

  Add-Table @(
    @('Invariant', 'Why it catches real bugs'),
    @('count(NOT status=200) + count(status=200) = total', 'Negation and multivalue handling'),
    @('Sum of all chart cells = total event count', 'Split-by bucketing, OTHER handling, limits'),
    @('Sum of transaction eventcount = total events', 'No event dropped or double-counted when grouping'),
    @('timechart bucket boundaries exactly one span apart', 'Gap filling and span alignment'),
    @('avg(x) = sum(x) / count(x)', 'Aggregation arithmetic'),
    @('Sum of per-group counts = ungrouped count', 'Grouping key construction'),
    @('cidrmatch over two different prefixes must differ', 'Netmask arithmetic')
  ) @(3.6, 4.0)

  Add-Body 'Alongside those, every example in the command reference, every sample search and every exercise reference answer is executed, and any that errors or returns an empty table is reported. That keeps the documentation honest: a documented example that stops working fails the run.'

  Add-Body 'The exercise grader is tested from both directions. Each reference answer must be accepted, and a deliberately wrong query must be rejected, for all 25 exercises. Alternative correct phrasings are tested separately, which is how the over-strict column ordering was found.'

  Add-Para '9.2 What verification found' $stH2

  Add-Table @(
    @('Defect', 'Effect', 'Cause'),
    @('cidrmatch always returned true', 'Every subnet matched every address, including 192.168.0.0/16 matching 10.1.1.1', 'The netmask was used as a modulus instead of dividing away the host bits'),
    @('Quoting destroyed regular expressions', 'rex "port (?<src_port>\d+)" extracted nothing at all', 'The unquote routine consumed every backslash escape, turning \d into a literal d'),
    @('top 5 field misread as a field name', 'The bare-integer limit form returned no rows', 'Only the limit= option form was handled'),
    @('Five NUL bytes in the source', 'The dataset reference panel rendered incorrectly', 'Single-space string literals were written as NUL instead of space'),
    @('Malformed IP addresses', 'Addresses such as 203.0.113.241.213 were generated', 'A three-octet prefix had two further octets appended'),
    @('sort with a detached minus sign', 'sort - count silently sorted ascending', 'A lone minus token was discarded instead of applying to the next field'),
    @('Non-deterministic tie ordering in top', 'Equal counts came back in arbitrary order', 'No tie-break, so equivalent queries disagreed'),
    @('Empty column for an all-null eval', 'A column of dashes implied the field existed', 'The field name was added to the column list regardless of value')
  ) @(2.3, 3.0, 3.3)

  Add-Body 'The cidrmatch defect is the one worth dwelling on. It never threw an error and never returned an empty table. It simply returned true, so every search using it produced a full, plausible and entirely wrong result. Only an assertion comparing two different subnets exposed it.'

  Add-Para '9.3 Verifying the document' $stH2

  Add-Body 'Because no PDF rasteriser exists on this machine, this document cannot be checked by rendering it to images. verify_report.ps1 checks it structurally through Word instead: page and word counts, the full heading outline, every table dimension and header row, the table of contents entries and their page numbers, the count of monospaced paragraphs, and a hygiene scan for smart quotes, stray dashes and NUL bytes.'

  Add-Body 'One approach was tried and abandoned. Decompressing the PDF content streams to read the rendered text matched embedded font licence strings rather than document text, producing convincing nonsense. It was discarded rather than trusted.'

  # =====================================================================
  Add-Para '10. Performance' $stH1

  Add-Table @(
    @('Operation', 'Measured'),
    @('Dataset generation, once at page load', 'About 160 ms'),
    @('index=web | stats count by status', 'About 6 ms'),
    @('index=* | timechart span=1h count by index', 'About 77 ms'),
    @('Full 64-query regression sweep', 'About 1.9 s')
  ) @(5.0, 2.0)

  Add-Body 'Searches are linear scans over an in-memory array. There is no index, no query planner and no caching of result sets. At six thousand events an index would cost more to build than it saves, and it would obscure the model the tool is meant to teach. Compiled regular expressions are cached, since those are the genuine hot path.'

  Add-Body 'Rendering is capped independently of search: 200 events on desktop and 50 on narrow screens, 1,000 table rows, 1,000 subsearch rows and 10 rows for map. Each cap reports itself in the interface rather than truncating silently.'

  # =====================================================================
  Add-Para '11. Extending the project' $stH1

  Add-Table @(
    @('To add', 'Edit', 'Shape'),
    @('An SPL command', 'src/spl-commands.js', 'CMD.name = function (S, arg, ctx) { return new State(rows, fields, isEvents) }'),
    @('An eval function', 'src/spl-lang.js', 'Add to the FUNCS table; lazy forms go in evalCall'),
    @('An aggregation function', 'src/spl-commands.js', 'Add to the AGGS table'),
    @('A sourcetype or index', 'src/data.js', 'Add a build function and concatenate it in generate()'),
    @('A lookup table', 'src/data.js', 'Add an array of row objects to the lookups map'),
    @('A graded exercise', 'src/content.js', 'Append to EXERCISES with q, hint, solution and optional compare or strictCols'),
    @('Reference documentation', 'src/content.js', 'Append to COMMANDS, EVAL_FUNCS or NOTES')
  ) @(2.2, 2.2, 4.4)

  Add-Body 'After any change, run build.ps1 and reload. Any new command is automatically reachable from the pipeline runner, and any new documentation entry is automatically executed by the verification sweep, so a broken example cannot be added quietly.'

  # =====================================================================
  Add-Para '12. Deliberate limits' $stH1

  Add-Body 'The following are out of scope. The application reports a clear message when one is reached rather than failing obscurely.'
  Add-Bullet 'erex, which generates a regular expression from examples, is documented but not implemented. The exam tests rex.'
  Add-Bullet 'outputlookup is accepted but writes nothing, since there is no persistent store.'
  Add-Bullet 'map is capped at ten input rows to prevent runaway subsearch execution.'
  Add-Bullet 'Data models, pivot, tstats and accelerated searches are not modelled.'
  Add-Bullet 'The hashing functions return deterministic stand-in values rather than real digests.'
  Add-Bullet 'Full-text search matches on token boundaries rather than reproducing Splunk segmentation rules in full, so unusual punctuation may differ.'

  # =====================================================================
  Add-Para '13. Summary' $stH1

  Add-Table @(
    @('Measure', 'Value'),
    @('JavaScript source', '4,809 lines across 5 modules'),
    @('Stylesheet', '345 lines'),
    @('Build and tooling scripts', '3 PowerShell scripts, no Python'),
    @('Shipped artefact', 'One HTML file, about 261 KB'),
    @('Runtime dependencies', 'None'),
    @('Build dependencies', 'PowerShell 5.1; Word only for this report'),
    @('SPL commands', '65 entries, about 60 distinct'),
    @('eval functions', '65 tabled plus 6 lazy forms'),
    @('Aggregation functions', '30'),
    @('Generated events', '5,970 across 6 indexes and 6 sourcetypes'),
    @('Lookup tables', '5'),
    @('Graded exercises', '25, marked by result comparison'),
    @('Test assertions', 'About 80, plus every documented example'),
    @('Typical search time', 'About 6 ms')
  ) @(3.4, 4.6)

  Add-Body 'The engine is the deliverable. The interface, the sample data and the exercises exist to give it something to be correct about, and the verification exists because an SPL interpreter that is wrong in silence would teach the wrong thing with complete confidence.'

  # ---- footer ----
  $fSec = $doc.Sections.Item(1).Footers.Item(1)
  $fRange = $fSec.Range
  $fRange.Text = "SPL Playground engineering report`t"
  $fRange.Font.Name = 'Calibri'; $fRange.Font.Size = 8.5; $fRange.Font.Color = 8421504
  $fRange.ParagraphFormat.Alignment = 0
  $fRange.ParagraphFormat.TabStops.ClearAll()
  $usable = $ps.PageWidth - $ps.LeftMargin - $ps.RightMargin
  $fRange.ParagraphFormat.TabStops.Add($usable, 2) | Out-Null
  $tail = $fSec.Range; $tail.Collapse(0) | Out-Null
  $fSec.Range.Fields.Add($tail, 33, '', $true) | Out-Null

  # Document properties are scrubbed after saving, at the package XML level.
  # Setting BuiltInDocumentProperties over COM fails silently here, which is how
  # the author's real name reached the first revision of this file.

  $toc.Update()
  $doc.Fields.Update() | Out-Null
  $fSec.Range.Fields.Update() | Out-Null
  $doc.Repaginate()
  $toc.Update()

  $doc.SaveAs2([string]$outDocx, 16)
  Write-Output "Wrote $outDocx"

  # The PDF is a convenience copy, not the deliverable. If a viewer holds the
  # old file open the export fails; that must not fail the whole build.
  try {
    $doc.ExportAsFixedFormat([string]$outPdf, 17)
    Write-Output "Wrote $outPdf"
  } catch {
    Write-Warning "PDF export skipped: $($_.Exception.Message.Split([char]10)[0])"
    Write-Warning "Close the PDF in whatever has it open, then rerun to refresh it."
  }
  $doc.Close(0)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

# Word stamps the signed-in Office profile into the package, so strip it now
# that the file is closed. This project is published publicly.
& (Join-Path $root 'scrub_docx_metadata.ps1') -Path $outDocx

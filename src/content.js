/* =========================================================================
   SPL Playground - study content: command reference, sample searches and
   graded exercises. Exercises are validated by running a reference
   solution and comparing the resulting table, so any correct SPL passes.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------
     Command reference
     --------------------------------------------------------------------- */
  var COMMANDS = [
    { name: 'search', group: 'Filter', exam: true,
      syntax: 'search <field>=<value> [AND|OR|NOT ...]',
      desc: 'Filters events. Implicit at the start of every search; used again after a pipe to filter results. Values are case insensitive, field names are case sensitive, and * is a wildcard.',
      examples: ['index=web status=404', 'index=web (status=404 OR status=503) NOT host=www1', 'index=* sourcetype=linux_secure "Failed password"'] },

    { name: 'where', group: 'Filter', exam: true,
      syntax: 'where <eval-expression>',
      desc: 'Filters using an eval expression. Use it to compare two fields, or when you need eval functions. Unlike search, where does not do wildcards - use like() or match().',
      examples: ['index=web | where bytes > 5000', 'index=web | stats count by clientip | where count > 30', 'index=web | where like(uri_path, "/product%")'] },

    { name: 'fields', group: 'Fields', exam: true,
      syntax: 'fields [+|-] <field-list>',
      desc: 'Keeps (+, default) or removes (-) fields. Placing "fields" early in the pipeline improves performance because fewer fields travel down the pipe.',
      examples: ['index=web | fields clientip, status, bytes', 'index=web | fields - _raw, punct'] },

    { name: 'table', group: 'Fields', exam: true,
      syntax: 'table <field-list>',
      desc: 'Builds a results table with the named columns in the order given. Unlike fields, table always produces a statistics table and drops everything else.',
      examples: ['index=web | table _time, clientip, uri_path, status'] },

    { name: 'rename', group: 'Fields', exam: true,
      syntax: 'rename <field> AS <new-name>[, ...]',
      desc: 'Renames fields. Wrap names containing spaces in quotes. Wildcards work on both sides.',
      examples: ['index=web | rename clientip AS "Client IP"', 'index=web | rename uri_* AS request_*'] },

    { name: 'eval', group: 'Fields', exam: true,
      syntax: 'eval <field>=<expression>[, <field>=<expression>]',
      desc: 'Calculates a value and puts it in a new or existing field. The result exists only for the duration of the search. Multiple assignments are comma separated.',
      examples: ['index=web | eval kb = round(bytes/1024, 2)',
                 'index=web | eval status_type = case(status<300, "OK", status<400, "Redirect", status<500, "Client error", true(), "Server error")',
                 'index=web | eval label = host . ":" . status'] },

    { name: 'stats', group: 'Report', exam: true,
      syntax: 'stats <function>(<field>) [AS <name>] [BY <field-list>]',
      desc: 'The core reporting command. Transforms events into a statistics table. Only fields named in the stats clause survive.',
      examples: ['index=web | stats count by status',
                 'index=web | stats count AS hits, sum(bytes) AS total_bytes BY host',
                 'index=web | stats dc(clientip) AS unique_visitors, avg(bytes) BY uri_path'] },

    { name: 'eventstats', group: 'Report', exam: true,
      syntax: 'eventstats <function>(<field>) [AS <name>] [BY <field-list>]',
      desc: 'Same maths as stats, but the aggregate is added back onto every event instead of replacing them. Handy for comparing a value against its group average.',
      examples: ['index=web | eventstats avg(bytes) AS avg_bytes BY host | where bytes > avg_bytes'] },

    { name: 'streamstats', group: 'Report', exam: true,
      syntax: 'streamstats [current=<bool>] [window=<int>] <function>(<field>) [BY <field-list>]',
      desc: 'Computes running aggregates in event order - running totals, running counts, moving averages.',
      examples: ['index=web | sort _time | streamstats count AS running_total',
                 'index=web | streamstats avg(bytes) AS moving_avg window=10'] },

    { name: 'timechart', group: 'Report', exam: true,
      syntax: 'timechart [span=<span>] <function>(<field>) [BY <field>]',
      desc: 'A stats aggregation where _time is always the x-axis. Only one BY field is allowed and it becomes the series split.',
      examples: ['index=web | timechart span=1h count',
                 'index=web | timechart span=4h count BY status',
                 'index=web | timechart avg(bytes) AS avg_bytes'] },

    { name: 'chart', group: 'Report', exam: true,
      syntax: 'chart <function>(<field>) [OVER <field>] [BY <field>]',
      desc: 'Builds a table for charting over any field. With OVER x BY y, x becomes the rows and each value of y becomes a column.',
      examples: ['index=web | chart count OVER host BY status',
                 'index=web | chart avg(bytes) OVER uri_path'] },

    { name: 'top', group: 'Report', exam: true,
      syntax: 'top [limit=<int>] <field-list> [BY <field>]',
      desc: 'Most common values, with a count and percent column. Defaults to limit=10.',
      examples: ['index=web | top uri_path', 'index=web | top limit=5 clientip BY host',
                 'index=web | top status showperc=f'] },

    { name: 'rare', group: 'Report', exam: true,
      syntax: 'rare [limit=<int>] <field-list> [BY <field>]',
      desc: 'The mirror of top: least common values.',
      examples: ['index=web | rare limit=5 uri_path'] },

    { name: 'dedup', group: 'Filter', exam: true,
      syntax: 'dedup [<int>] <field-list> [sortby <field-list>]',
      desc: 'Keeps the first N (default 1) events for each combination of the given fields.',
      examples: ['index=web | dedup clientip', 'index=web | dedup 3 host sortby -bytes'] },

    { name: 'sort', group: 'Order', exam: true,
      syntax: 'sort [<count>] [-|+]<field> [, ...]',
      desc: 'Sorts results. A leading minus is descending. A leading number limits the output. num(), str() and ip() force a sort type.',
      examples: ['index=web | stats count by clientip | sort -count', 'index=web | sort 10 -bytes, +host'] },

    { name: 'head', group: 'Order', exam: true,
      syntax: 'head [<int>] | head (<eval-expression>)',
      desc: 'Returns the first N results (default 10), or results while a condition holds.',
      examples: ['index=web | head 20', 'index=web | sort -bytes | head 5'] },

    { name: 'tail', group: 'Order',
      syntax: 'tail [<int>]',
      desc: 'Returns the last N results, in reverse order.',
      examples: ['index=web | tail 5'] },

    { name: 'reverse', group: 'Order',
      syntax: 'reverse', desc: 'Reverses the order of results.', examples: ['index=web | head 5 | reverse'] },

    { name: 'rex', group: 'Extract', exam: true,
      syntax: 'rex [field=<field>] [max_match=<int>] "<regex with (?<name>...)>"',
      desc: 'Extracts fields at search time using named capture groups. mode=sed rewrites a field instead.',
      examples: ['index=security sourcetype=linux_secure | rex "port (?<src_port>\\d+)"',
                 'index=web | rex field=uri_query "productId=(?<pid>[A-Z0-9-]+)"',
                 'index=web | rex field=clientip mode=sed "s/\\d+$/xxx/"'] },

    { name: 'regex', group: 'Filter',
      syntax: 'regex [<field>=|!=]"<regex>"',
      desc: 'Filters events by regular expression. Unlike rex it extracts nothing.',
      examples: ['index=security | regex _raw="Failed password for (invalid user )?root"'] },

    { name: 'erex', group: 'Extract',
      syntax: 'erex <field> examples="<value>, <value>"',
      desc: 'Generates a regex from examples. Not supported in the playground - use rex instead, which is what the exam tests.',
      examples: [] },

    { name: 'lookup', group: 'Enrich', exam: true,
      syntax: 'lookup <table> <lookup-field> [AS <event-field>] [OUTPUT|OUTPUTNEW <fields>]',
      desc: 'Adds fields from a lookup table. OUTPUTNEW only fills fields that are currently empty.',
      examples: ['index=web status=* | lookup http_status status OUTPUT status_description, status_type',
                 'index=sales | lookup product_lookup productId OUTPUT product_name, price'] },

    { name: 'inputlookup', group: 'Enrich', exam: true,
      syntax: '| inputlookup <table> [where <expr>]',
      desc: 'Reads a lookup table as if it were search results. A generating command, so it starts the search.',
      examples: ['| inputlookup product_lookup', '| inputlookup user_roles where department="IT"'] },

    { name: 'fillnull', group: 'Fields', exam: true,
      syntax: 'fillnull [value=<string>] [<field-list>]',
      desc: 'Replaces null values with a value (0 by default). With no field list it fills every field.',
      examples: ['index=web | stats count by user | fillnull value="unknown" user'] },

    { name: 'filldown', group: 'Fields',
      syntax: 'filldown [<field-list>]',
      desc: 'Carries the last non-null value forward into subsequent rows.',
      examples: ['index=web | table _time host status | filldown status'] },

    { name: 'transaction', group: 'Group', exam: true,
      syntax: 'transaction <field-list> [maxspan=<span>] [maxpause=<span>] [startswith=...] [endswith=...]',
      desc: 'Groups related events into a single transaction with duration and eventcount fields. Expensive - prefer stats when you only need counts.',
      examples: ['index=web | transaction JSESSIONID maxspan=30m',
                 'index=web | transaction clientip maxpause=5m | where eventcount > 3'] },

    { name: 'bin', group: 'Group', exam: true,
      syntax: 'bin [span=<span>] [bins=<int>] <field> [AS <name>]',
      desc: 'Buckets numeric or time values into ranges. timechart does this for you; bin lets you do it before stats. Also spelled bucket.',
      examples: ['index=web | bin span=1h _time | stats count by _time, status',
                 'index=web | bin bytes bins=5 | stats count by bytes'] },

    { name: 'makemv', group: 'Multivalue', exam: true,
      syntax: 'makemv [delim=<string>] [tokenizer=<regex>] <field>',
      desc: 'Splits a single value into a multivalue field.',
      examples: ['index=web | makemv delim="&" uri_query'] },

    { name: 'mvexpand', group: 'Multivalue', exam: true,
      syntax: 'mvexpand <field> [limit=<int>]',
      desc: 'Turns one event with an N-value multivalue field into N events.',
      examples: ['index=web | makemv delim="&" uri_query | mvexpand uri_query'] },

    { name: 'nomv', group: 'Multivalue',
      syntax: 'nomv <field>', desc: 'Collapses a multivalue field back into a single value.',
      examples: ['index=security | stats values(user) AS users by host | nomv users'] },

    { name: 'spath', group: 'Extract', exam: true,
      syntax: 'spath [input=<field>] [output=<field>] [path=<path>]',
      desc: 'Extracts fields from JSON or XML. With no arguments it auto-extracts everything it can find.',
      examples: ['index=app | spath', 'index=app | spath path=user.name output=username',
                 'index=app | spath | stats count by "http.status"'] },

    { name: 'addtotals', group: 'Report',
      syntax: 'addtotals [row=<bool>] [col=<bool>] [fieldname=<field>] [<field-list>]',
      desc: 'Adds a Total column summing numeric fields per row, and optionally a totals row.',
      examples: ['index=web | chart count OVER host BY status | addtotals'] },

    { name: 'addcoltotals', group: 'Report',
      syntax: 'addcoltotals [labelfield=<field>] [<field-list>]',
      desc: 'Appends a summary row totalling each numeric column.',
      examples: ['index=web | stats count by host | addcoltotals labelfield=host'] },

    { name: 'appendcols', group: 'Combine',
      syntax: 'appendcols [<subsearch>]',
      desc: 'Runs a subsearch and glues its columns onto the existing rows, position by position.',
      examples: ['index=web | stats count | appendcols [search index=security | stats count AS sec_count]'] },

    { name: 'append', group: 'Combine',
      syntax: 'append [<subsearch>]',
      desc: 'Runs a subsearch and adds its results as extra rows at the end.',
      examples: ['index=web | stats count AS events by index | append [search index=security | stats count AS events by index]'] },

    { name: 'appendpipe', group: 'Combine',
      syntax: 'appendpipe [<pipeline>]',
      desc: 'Runs a pipeline against the current results and appends the outcome. Useful for adding a subtotal row.',
      examples: ['index=web | stats count by host | appendpipe [stats sum(count) AS count | eval host="TOTAL"]'] },

    { name: 'join', group: 'Combine',
      syntax: 'join [type=inner|left] <field-list> [<subsearch>]',
      desc: 'SQL-style join on one or more fields. Usually stats or lookup is a better answer.',
      examples: ['index=web user=* | stats count AS web_events by user | join user [search index=security | stats count AS auth_events by user]'] },

    { name: 'xyseries', group: 'Reshape',
      syntax: 'xyseries <x-field> <series-field> <value-field>',
      desc: 'Turns three columns into a chartable table. The inverse of untable.',
      examples: ['index=web | stats count by host, status | xyseries host status count'] },

    { name: 'untable', group: 'Reshape',
      syntax: 'untable <x-field> <series-name-field> <value-field>',
      desc: 'Flattens a chart-shaped table back into rows. The inverse of xyseries.',
      examples: ['index=web | chart count OVER host BY status | untable host status count'] },

    { name: 'transpose', group: 'Reshape',
      syntax: 'transpose [<int>] [header_field=<field>] [column_name=<name>]',
      desc: 'Swaps rows and columns. Defaults to the first 5 rows.',
      examples: ['index=web | stats count by status | transpose header_field=status'] },

    { name: 'convert', group: 'Fields',
      syntax: 'convert [timeformat=<format>] <function>(<field>) [AS <name>]',
      desc: 'Converts field values: ctime(), mktime(), num(), dur2sec(), rmcomma(), rmunit(), memk(), auto().',
      examples: ['index=web | convert ctime(_time) AS readable_time', 'index=web | convert num(bytes)'] },

    { name: 'rangemap', group: 'Fields',
      syntax: 'rangemap field=<field> <name>=<start>-<end> ... [default=<string>]',
      desc: 'Maps a numeric field into named ranges, writing the result to the "range" field.',
      examples: ['index=web | rangemap field=bytes small=0-1000 medium=1001-5000 large=5001-100000 default=huge'] },

    { name: 'strcat', group: 'Fields',
      syntax: 'strcat [allowempty=<bool>] <source>... <dest>',
      desc: 'Concatenates field values and literals into a new field.',
      examples: ['index=web | strcat host ":" status host_status'] },

    { name: 'iplocation', group: 'Enrich',
      syntax: 'iplocation [prefix=<string>] <ip-field>',
      desc: 'Adds City, Country, Region, lat and lon from an IP address. The playground uses a small built-in geo table.',
      examples: ['index=web | iplocation clientip | stats count by Country'] },

    { name: 'makeresults', group: 'Generate',
      syntax: '| makeresults [count=<int>] [annotate=<bool>]',
      desc: 'Creates empty results for testing eval expressions. The fastest way to try a function.',
      examples: ['| makeresults | eval x = round(3.14159, 2)',
                 '| makeresults count=5 | streamstats count AS n | eval squared = n*n'] },

    { name: 'eventcount', group: 'Generate',
      syntax: '| eventcount [index=<index>]', desc: 'Counts events per index without scanning them.',
      examples: ['| eventcount'] },

    { name: 'metadata', group: 'Generate',
      syntax: '| metadata type=hosts|sources|sourcetypes',
      desc: 'Summarises which hosts, sources or sourcetypes exist and when they were last seen.',
      examples: ['| metadata type=sourcetypes'] },

    { name: 'fieldsummary', group: 'Report',
      syntax: 'fieldsummary', desc: 'Summary statistics for every field in the result set.',
      examples: ['index=web | fieldsummary'] },

    { name: 'accum', group: 'Report',
      syntax: 'accum <field> [AS <name>]', desc: 'Running total of a numeric field.',
      examples: ['index=web | timechart span=1d count | accum count AS cumulative'] },

    { name: 'delta', group: 'Report',
      syntax: 'delta [p=<int>] <field> [AS <name>]', desc: 'Difference between this row and a previous row.',
      examples: ['index=web | timechart span=1d count | delta count AS change'] },

    { name: 'set', group: 'Combine',
      syntax: '| set union|diff|intersect [<subsearch>] [<subsearch>]',
      desc: 'Set operations across two subsearches.',
      examples: ['| set diff [search index=web | top 5 clientip | fields clientip] [search index=security | top 5 src_ip | rename src_ip AS clientip | fields clientip]'] },

    { name: 'format', group: 'Combine',
      syntax: 'format', desc: 'Turns results into a single search string. Mostly seen at the end of subsearches.',
      examples: ['index=security action=failure | top 3 src_ip | fields src_ip | format'] },

    { name: 'return', group: 'Combine',
      syntax: 'return [<count>] <field>|$<field>|<alias>=$<field>',
      desc: 'Controls what a subsearch passes back to the outer search.',
      examples: ['index=security action=failure | top 1 src_ip | return src_ip'] },

    { name: 'mvcombine', group: 'Multivalue',
      syntax: 'mvcombine [delim=<string>] <field>',
      desc: 'Merges rows that differ only in one field into a single multivalue row. The inverse of mvexpand.',
      examples: ['index=security | table host user | mvcombine user'] },

    { name: 'extract', group: 'Extract',
      syntax: 'extract [pairdelim=<chars>] [kvdelim=<chars>]',
      desc: 'Forces key=value extraction on _raw. Also spelled kv.',
      examples: ['index=network | extract pairdelim=" " kvdelim="="'] },

    { name: 'replace', group: 'Fields',
      syntax: 'replace <old> WITH <new> [IN <field-list>]',
      desc: 'Replaces whole field values. Wildcards allowed.',
      examples: ['index=web | replace 404 WITH "Not Found" IN status'] },

    { name: 'map', group: 'Combine',
      syntax: 'map [<subsearch>]',
      desc: 'Runs a subsearch once per input row, substituting $field$ tokens. Capped at 10 rows here.',
      examples: [] }
  ];

  /* ---------------------------------------------------------------------
     eval function reference
     --------------------------------------------------------------------- */
  var EVAL_FUNCS = [
    { g: 'Conditional', n: 'if(<cond>, <then>, <else>)', d: 'Two-branch conditional.', e: 'eval speed = if(duration<100, "fast", "slow")' },
    { g: 'Conditional', n: 'case(<c1>,<v1>, <c2>,<v2>, ...)', d: 'First matching condition wins. Use true() as the catch-all.', e: 'eval band = case(bytes<1000,"S", bytes<5000,"M", true(),"L")' },
    { g: 'Conditional', n: 'validate(<c1>,<v1>, ...)', d: 'Opposite of case: returns the value for the first condition that is FALSE.', e: 'eval problem = validate(bytes>0, "no bytes", status=200, "bad status")' },
    { g: 'Conditional', n: 'coalesce(<f1>, <f2>, ...)', d: 'First non-null argument. The standard way to merge differently-named fields.', e: 'eval src = coalesce(clientip, src_ip)' },
    { g: 'Conditional', n: 'nullif(<a>, <b>)', d: 'Null when the two arguments are equal, otherwise the first.', e: 'eval x = nullif(status, "200")' },

    { g: 'Comparison', n: 'like(<str>, <pattern>)', d: 'SQL wildcards: % is many characters, _ is one.', e: 'where like(uri_path, "/product%")' },
    { g: 'Comparison', n: 'match(<str>, <regex>)', d: 'Regular-expression test. Returns true or false.', e: 'where match(clientip, "^198\\.")' },
    { g: 'Comparison', n: 'cidrmatch("<cidr>", <ip>)', d: 'Is the IP inside the subnet? Note the CIDR comes first.', e: 'where cidrmatch("10.0.0.0/8", src_ip)' },
    { g: 'Comparison', n: 'searchmatch("<search>")', d: 'Does the event match this search string?', e: 'where searchmatch("status=404")' },
    { g: 'Comparison', n: 'in(<field>, <v1>, <v2>...)', d: 'Membership test.', e: 'where in(status, "404", "500", "503")' },

    { g: 'Type', n: 'isnull(<f>) / isnotnull(<f>)', d: 'Null checks.', e: 'where isnull(user)' },
    { g: 'Type', n: 'isnum / isstr / isint / isbool', d: 'Type checks.', e: 'eval numeric = if(isnum(bytes), "yes", "no")' },
    { g: 'Type', n: 'typeof(<f>)', d: 'Returns Number, String, Boolean or Invalid.', e: 'eval t = typeof(bytes)' },
    { g: 'Type', n: 'tostring(<v>, "commas"|"hex"|"duration")', d: 'Number to string with formatting.', e: 'eval pretty = tostring(bytes, "commas")' },
    { g: 'Type', n: 'tonumber(<str>, <base>)', d: 'String to number.', e: 'eval n = tonumber(status)' },

    { g: 'Text', n: 'len(<str>)', d: 'Character count.', e: 'eval l = len(uri_path)' },
    { g: 'Text', n: 'lower / upper / trim / ltrim / rtrim', d: 'Case and whitespace handling.', e: 'eval u = upper(host)' },
    { g: 'Text', n: 'substr(<str>, <start>, <len>)', d: 'Substring. Positions start at 1, negatives count from the end.', e: 'eval prefix = substr(productId, 1, 2)' },
    { g: 'Text', n: 'replace(<str>, <regex>, <replacement>)', d: 'Regex replace; \\1 refers to a capture group.', e: 'eval masked = replace(clientip, "\\d+$", "xxx")' },
    { g: 'Text', n: 'split(<str>, <delim>)', d: 'Makes a multivalue field.', e: 'eval parts = split(uri_query, "&")' },
    { g: 'Text', n: 'urldecode(<str>)', d: 'Percent-decoding.', e: 'eval clean = urldecode(uri_query)' },
    { g: 'Text', n: 'printf(<format>, ...)', d: 'C-style formatting.', e: 'eval s = printf("%05.1f", bytes/1024)' },

    { g: 'Math', n: 'abs, ceiling, floor, sqrt, exp, ln, log, pow', d: 'Standard maths.', e: 'eval kb = ceiling(bytes/1024)' },
    { g: 'Math', n: 'round(<num>, <decimals>)', d: 'Rounds to the given number of decimals.', e: 'eval mb = round(bytes/1048576, 3)' },
    { g: 'Math', n: 'min(...) / max(...)', d: 'Smallest or largest of the arguments (not an aggregation).', e: 'eval worst = max(bytes_in, bytes_out)' },
    { g: 'Math', n: 'sigfig(<num>)', d: 'Rounds to significant figures.', e: 'eval s = sigfig(bytes/3)' },

    { g: 'Time', n: 'now()', d: 'Current time as epoch seconds.', e: 'eval age = now() - _time' },
    { g: 'Time', n: 'strftime(<epoch>, <format>)', d: 'Epoch to string. %Y-%m-%d %H:%M:%S, %A, %b, %H, %d...', e: 'eval when = strftime(_time, "%Y-%m-%d %H:%M")' },
    { g: 'Time', n: 'strptime(<str>, <format>)', d: 'String to epoch. The inverse of strftime.', e: 'eval t = strptime("2026-08-11", "%Y-%m-%d")' },
    { g: 'Time', n: 'relative_time(<epoch>, <modifier>)', d: 'Applies a time modifier such as -1d@d.', e: 'eval midnight = relative_time(now(), "@d")' },

    { g: 'Multivalue', n: 'mvcount(<mvfield>)', d: 'Number of values.', e: 'eval n = mvcount(users)' },
    { g: 'Multivalue', n: 'mvindex(<mv>, <start>, <end>)', d: 'Zero-based slice.', e: 'eval first = mvindex(users, 0)' },
    { g: 'Multivalue', n: 'mvjoin(<mv>, <delim>)', d: 'Joins values into one string.', e: 'eval joined = mvjoin(users, ", ")' },
    { g: 'Multivalue', n: 'mvfilter(<expr>)', d: 'Keeps values matching the expression.', e: 'eval admins = mvfilter(match(users, "^a"))' },
    { g: 'Multivalue', n: 'mvappend / mvdedup / mvsort / mvzip / mvrange', d: 'Building and cleaning multivalue fields.', e: 'eval all = mvappend(users, "system")' },

    { g: 'Structured', n: 'spath(<json>, <path>)', d: 'Pulls a value out of a JSON string.', e: 'eval svc = spath(_raw, "service")' },
    { g: 'Structured', n: 'json_valid(<str>)', d: 'Is this valid JSON?', e: 'where json_valid(_raw)' }
  ];

  var STATS_FUNCS = [
    { n: 'count(<field>)', d: 'Number of events, or of events where the field exists. Alias: c.' },
    { n: 'dc(<field>)', d: 'Distinct count of values. Alias: distinct_count.' },
    { n: 'sum(<field>)', d: 'Total of numeric values.' },
    { n: 'avg(<field>)', d: 'Arithmetic mean. Alias: mean.' },
    { n: 'min(<field>) / max(<field>)', d: 'Smallest and largest value.' },
    { n: 'median(<field>)', d: 'Middle value. Same as perc50.' },
    { n: 'mode(<field>)', d: 'Most frequent value.' },
    { n: 'range(<field>)', d: 'max minus min.' },
    { n: 'stdev / stdevp / var / varp', d: 'Sample and population spread.' },
    { n: 'first(<field>) / last(<field>)', d: 'First and last value in result order, NOT in time order.' },
    { n: 'earliest(<field>) / latest(<field>)', d: 'Value at the oldest and newest _time. This is the time-ordered pair.' },
    { n: 'list(<field>)', d: 'All values as a multivalue field, order preserved, duplicates kept.' },
    { n: 'values(<field>)', d: 'Unique values as a multivalue field, sorted.' },
    { n: 'perc<N>(<field>)', d: 'Nth percentile, e.g. perc95(duration).' },
    { n: 'sumsq(<field>)', d: 'Sum of squares.' }
  ];

  /* ---------------------------------------------------------------------
     Sample searches, grouped
     --------------------------------------------------------------------- */
  var SAMPLES = [
    { g: 'Getting started', items: [
      { t: 'All web traffic', q: 'index=web' },
      { t: 'Failed logins', q: 'index=security action=failure' },
      { t: 'Errors, any index', q: 'index=* (status>=400 OR level=ERROR)' },
      { t: 'What data exists?', q: '| metadata type=sourcetypes' }
    ]},
    { g: 'stats and friends', items: [
      { t: 'Events per status code', q: 'index=web | stats count by status' },
      { t: 'Traffic per host', q: 'index=web | stats count AS hits, sum(bytes) AS bytes, dc(clientip) AS visitors by host' },
      { t: 'Busiest pages', q: 'index=web | top limit=10 uri_path' },
      { t: 'Above-average events', q: 'index=web | eventstats avg(bytes) AS avg_bytes by host | where bytes > avg_bytes | table _time host bytes avg_bytes' },
      { t: 'Running total', q: 'index=web | sort _time | streamstats count AS running | table _time running clientip' }
    ]},
    { g: 'Time', items: [
      { t: 'Hourly volume', q: 'index=web | timechart span=1h count' },
      { t: 'Status codes over time', q: 'index=web | timechart span=4h count by status' },
      { t: 'Busiest hour of day', q: 'index=web | eval hour = strftime(_time, "%H") | stats count by hour | sort -count' },
      { t: 'Day of week pattern', q: 'index=web | eval day = strftime(_time, "%A") | stats count by day' }
    ]},
    { g: 'eval', items: [
      { t: 'Human readable size', q: 'index=web | eval size = case(bytes<1024, "tiny", bytes<10240, "small", true(), "large") | stats count by size' },
      { t: 'Concatenate fields', q: 'index=web | eval location = host . " / " . status | table location' },
      { t: 'Try an expression', q: '| makeresults | eval result = round(1234.5678, 2)' },
      { t: 'Coalesce two IP fields', q: 'index=* | eval src = coalesce(clientip, src_ip) | stats count by src | sort -count' }
    ]},
    { g: 'Extraction', items: [
      { t: 'rex a port number', q: 'index=security sourcetype=linux_secure | rex "port (?<src_port>\\d+)" | table _time user src_ip src_port' },
      { t: 'rex a product id', q: 'index=web uri_query=* | rex field=uri_query "productId=(?<pid>[A-Z0-9-]+)" | top pid' },
      { t: 'Parse JSON', q: 'index=app | spath | table _time service level "user.name" "http.status"' },
      { t: 'JSON with a path', q: 'index=app | spath path=http.status output=code | stats count by code' }
    ]},
    { g: 'Lookups', items: [
      { t: 'Describe status codes', q: 'index=web | lookup http_status status OUTPUT status_description, status_type | stats count by status_type, status_description' },
      { t: 'View a lookup table', q: '| inputlookup product_lookup' },
      { t: 'Enrich users', q: 'index=security action=failure | lookup user_roles user OUTPUT department, role | stats count by department' }
    ]},
    { g: 'Security-flavoured', items: [
      { t: 'Brute force candidates', q: 'index=security action=failure | stats count AS failures, dc(user) AS users_tried by src_ip | where failures > 10 | sort -failures' },
      { t: 'Failed then succeeded', q: 'index=security | stats count(eval(action="failure")) AS failures, count(eval(action="success")) AS successes by user, src_ip | where failures > 3 AND successes > 0' },
      { t: 'Blocked outbound traffic', q: 'index=network action=blocked | stats sum(bytes) AS total by dest_ip, dest_port | sort -total' },
      { t: 'Windows logon failures', q: 'index=windows EventCode=4625 | stats count by user, Source_Network_Address | sort -count' }
    ]},
    { g: 'Transactions', items: [
      { t: 'Sessionise web traffic', q: 'index=web | transaction JSESSIONID maxspan=30m | table _time JSESSIONID duration eventcount' },
      { t: 'Long sessions', q: 'index=web | transaction JSESSIONID maxspan=30m | where duration > 600 | stats count' }
    ]},
    { g: 'Reshaping', items: [
      { t: 'Matrix of host vs status', q: 'index=web | chart count OVER host BY status | addtotals' },
      { t: 'Flatten a chart', q: 'index=web | chart count OVER host BY status | untable host status count' },
      { t: 'Pivot with xyseries', q: 'index=web | stats count by host, method | xyseries host method count' }
    ]}
  ];

  /* ---------------------------------------------------------------------
     Exercises. `solution` is executed to produce the expected table;
     any query producing the same table passes.
     --------------------------------------------------------------------- */
  var EXERCISES = [
    { id: 'e1', level: 'Basics', points: 1,
      q: 'Return every event in the web index with an HTTP status of 404.',
      hint: 'The base search takes field=value pairs directly. No pipe needed.',
      solution: 'index=web status=404',
      compare: 'count' },

    { id: 'e2', level: 'Basics', points: 1,
      q: 'From the web index, show only the fields _time, clientip, uri_path and status, in that order.',
      hint: 'table keeps the column order you give it.',
      solution: 'index=web | table _time, clientip, uri_path, status',
      strictCols: true },

    { id: 'e3', level: 'Basics', points: 1,
      q: 'Count how many web events there are for each host.',
      hint: 'stats count by <field>.',
      solution: 'index=web | stats count by host' },

    { id: 'e4', level: 'Basics', points: 1,
      q: 'Show the 5 most common values of uri_path in the web index, including the count and percent columns.',
      hint: 'top has a limit option.',
      solution: 'index=web | top limit=5 uri_path' },

    { id: 'e5', level: 'Basics', points: 2,
      q: 'In the web index, count events by status and sort so the largest count is first.',
      hint: 'A leading minus sign makes sort descending.',
      solution: 'index=web | stats count by status | sort -count' },

    { id: 'e6', level: 'eval', points: 2,
      q: 'For the web index, create a field named kb holding bytes divided by 1024, rounded to 2 decimal places, then show _time, bytes and kb.',
      hint: 'round(<number>, <decimals>).',
      solution: 'index=web | eval kb = round(bytes/1024, 2) | table _time, bytes, kb' },

    { id: 'e7', level: 'eval', points: 2,
      q: 'Count web events by a new field called status_group that is "success" when status is below 400 and "error" otherwise.',
      hint: 'if(<condition>, <then>, <else>). Remember status is a string, but comparisons coerce it.',
      solution: 'index=web | eval status_group = if(status < 400, "success", "error") | stats count by status_group' },

    { id: 'e8', level: 'eval', points: 3,
      q: 'Count web events by hour of day. Name the field hour and format it as a two digit number such as 09.',
      hint: 'strftime(_time, "%H").',
      solution: 'index=web | eval hour = strftime(_time, "%H") | stats count by hour' },

    { id: 'e9', level: 'Filtering', points: 2,
      q: 'Show web events where bytes is greater than 7000. Return only _time, clientip and bytes.',
      hint: 'where takes an eval expression and can compare numerically.',
      solution: 'index=web | where bytes > 7000 | table _time, clientip, bytes' },

    { id: 'e10', level: 'Filtering', points: 3,
      q: 'Find client IPs in the web index that generated more than 25 events. Show clientip and the count, largest first.',
      hint: 'Aggregate first with stats, then filter the aggregate with where.',
      solution: 'index=web | stats count by clientip | where count > 25 | sort -count' },

    { id: 'e11', level: 'Filtering', points: 2,
      q: 'Return one event per distinct clientip from the web index.',
      hint: 'dedup keeps the first event for each value.',
      solution: 'index=web | dedup clientip',
      compare: 'count' },

    { id: 'e12', level: 'Reporting', points: 2,
      q: 'For the web index show, per host: the event count as hits, the total bytes as total_bytes, and the number of distinct client IPs as visitors.',
      hint: 'One stats command can hold several functions, each with its own AS alias.',
      solution: 'index=web | stats count AS hits, sum(bytes) AS total_bytes, dc(clientip) AS visitors by host' },

    { id: 'e13', level: 'Reporting', points: 2,
      q: 'Produce an hourly count of web events using a 1 hour span.',
      hint: 'timechart span=1h.',
      solution: 'index=web | timechart span=1h count' },

    { id: 'e14', level: 'Reporting', points: 3,
      q: 'Build a table with one row per host and one column per HTTP status code, containing event counts.',
      hint: 'chart <function> OVER <rows> BY <columns>.',
      solution: 'index=web | chart count OVER host BY status' },

    { id: 'e15', level: 'Reporting', points: 3,
      q: 'For each host in the web index, show every event alongside that host\'s average bytes in a field named avg_bytes, keeping only events larger than that average. Return _time, host, bytes and avg_bytes.',
      hint: 'eventstats adds the aggregate to each event instead of collapsing them.',
      solution: 'index=web | eventstats avg(bytes) AS avg_bytes by host | where bytes > avg_bytes | table _time, host, bytes, avg_bytes' },

    { id: 'e16', level: 'Extraction', points: 3,
      q: 'From linux_secure events in the security index, extract the SSH port number into a field named src_port, then count events by src_port keeping only the top 5.',
      hint: 'rex with a named capture group: (?<src_port>\\d+). The raw text reads "port 4243 ssh2".',
      solution: 'index=security sourcetype=linux_secure | rex "port (?<src_port>\\d+)" | top limit=5 src_port' },

    { id: 'e17', level: 'Extraction', points: 3,
      q: 'From the app index, extract the JSON field http.status and count events by it.',
      hint: 'spath auto-extracts nested JSON; the field name uses dots so it needs quoting in stats.',
      solution: 'index=app | spath | stats count by "http.status"' },

    { id: 'e18', level: 'Lookups', points: 2,
      q: 'Enrich web events with status_description from the http_status lookup and count events by status and status_description.',
      hint: 'lookup <table> <field> OUTPUT <fields>.',
      solution: 'index=web | lookup http_status status OUTPUT status_description | stats count by status, status_description' },

    { id: 'e19', level: 'Lookups', points: 2,
      q: 'Display the whole product_lookup table as search results.',
      hint: 'inputlookup is a generating command, so the search starts with a pipe.',
      solution: '| inputlookup product_lookup' },

    { id: 'e20', level: 'Multivalue', points: 3,
      q: 'For each host in the security index, list the distinct users seen as a multivalue field named users, plus a field user_count holding how many distinct users that is.',
      hint: 'values() collects unique values; dc() counts them.',
      solution: 'index=security | stats values(user) AS users, dc(user) AS user_count by host' },

    { id: 'e21', level: 'Transactions', points: 3,
      q: 'Group web events into sessions by JSESSIONID with a maximum span of 30 minutes, then show only sessions containing more than 5 events. Return JSESSIONID, duration and eventcount.',
      hint: 'transaction adds duration and eventcount automatically.',
      solution: 'index=web | transaction JSESSIONID maxspan=30m | where eventcount > 5 | table JSESSIONID, duration, eventcount' },

    { id: 'e22', level: 'Security', points: 4,
      q: 'Find source IPs in the security index with more than 10 failed authentications. Show src_ip, the number of failures as failures, and the number of distinct usernames tried as users_tried, sorted by failures descending.',
      hint: 'Filter to action=failure first, then stats count and dc(user) by src_ip, then where.',
      solution: 'index=security action=failure | stats count AS failures, dc(user) AS users_tried by src_ip | where failures > 10 | sort -failures' },

    { id: 'e23', level: 'Security', points: 4,
      q: 'For each user in the security index, count failures and successes in one stats command, naming them failures and successes. Keep only users with at least one of each.',
      hint: 'count(eval(<condition>)) counts only the events matching the condition.',
      solution: 'index=security | stats count(eval(action="failure")) AS failures, count(eval(action="success")) AS successes by user | where failures > 0 AND successes > 0' },

    { id: 'e24', level: 'Reporting', points: 3,
      q: 'Show total sale_price per product_name from the sales index, largest first, limited to the top 5 rows.',
      hint: 'sort accepts a row limit before the field name.',
      solution: 'index=sales | stats sum(sale_price) AS revenue by product_name | sort 5 -revenue' },

    { id: 'e25', level: 'Time', points: 3,
      q: 'Show a daily count of security index events split by action, using a 1 day span.',
      hint: 'timechart span=1d count by <field>.',
      solution: 'index=security | timechart span=1d count by action' }
  ];

  /* ---------------------------------------------------------------------
     Quick-reference notes for the exam
     --------------------------------------------------------------------- */
  var NOTES = [
    { t: 'Search order matters', b: 'Filter as early and as specifically as possible: index, then sourcetype/source/host, then field values, then free text. Everything after the first pipe runs on whatever survived.' },
    { t: 'Case sensitivity', b: 'Field NAMES are case sensitive (status is not Status). Field VALUES and boolean keywords are not. Commands are lower case by convention. AND, OR, NOT must be upper case to be treated as operators.' },
    { t: 'Operator precedence', b: 'Inside a search: NOT, then OR, then AND. Use parentheses when mixing - (a OR b) c is not the same as a OR b c.' },
    { t: 'NOT vs !=', b: 'NOT status=200 also returns events that have no status field at all. status!=200 requires the field to exist.' },
    { t: 'search vs where', b: 'search compares a field to a literal and supports wildcards. where evaluates an expression and can compare two fields. Use where when both sides are fields.' },
    { t: 'fields vs table', b: 'Both narrow the columns. fields keeps events as events and is a performance optimisation; table converts results to a statistics table.' },
    { t: 'Streaming vs transforming', b: 'Streaming commands (eval, rex, where, fields) act on one event at a time. Transforming commands (stats, chart, timechart, top, rare) build a results table. Only transforming commands can drive most visualisations.' },
    { t: 'first/last vs earliest/latest', b: 'first() and last() are about position in the result set. earliest() and latest() are about _time. They only agree when results are in time order.' },
    { t: 'Time modifiers', b: 'earliest=-24h@h latest=now. The @ snaps DOWN to the unit: @d is midnight today, @w0 is the most recent Sunday. -1d@d means midnight yesterday.' },
    { t: 'Knowledge objects', b: 'Field aliases and calculated fields are applied at search time. Order of operations: field extraction, field aliasing, calculated fields, lookups, event types, tags.' },
    { t: 'Lookup OUTPUT vs OUTPUTNEW', b: 'OUTPUT overwrites existing fields with lookup values. OUTPUTNEW only writes when the field is currently null.' },
    { t: 'Reports vs alerts vs dashboards', b: 'A report is a saved search you run on demand or on a schedule. An alert is a saved search plus a trigger condition and an action. A dashboard is a collection of panels backed by searches.' },
    { t: 'Macro basics', b: 'Macros are reusable SPL fragments called with backticks: `mymacro(arg)`. Arguments are referenced inside the definition as $1$, $2$ or by name.' },
    { t: 'Wildcards cost money', b: 'A leading wildcard (*error) forces a full scan and cannot use the index. Trailing wildcards (error*) are far cheaper.' }
  ];

  var MACROS = {
    'web_errors': 'index=web (status>=400)',
    'failed_auth': 'index=security action=failure',
    'top_n(1)': 'top limit=$1$'
  };

  global.SPLContent = {
    COMMANDS: COMMANDS,
    EVAL_FUNCS: EVAL_FUNCS,
    STATS_FUNCS: STATS_FUNCS,
    SAMPLES: SAMPLES,
    EXERCISES: EXERCISES,
    NOTES: NOTES,
    MACROS: MACROS
  };

})(typeof window !== 'undefined' ? window : this);

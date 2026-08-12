# SPL Playground

A Splunk search practice environment that runs entirely in a browser. No Splunk
install, no trial licence, no server. Open the HTML file and start typing SPL.

Built for Splunk Core Certified Power User revision.

## [Open it now](https://potat0liz.github.io/spl-playground/)

**https://potat0liz.github.io/spl-playground/** — nothing to install, no sign-up.

## Running it offline

Download [`dist/index.html`](dist/index.html) and open it. That single file is
the whole application: no install, no build step, no network access, no server.
It works offline and from a `file://` URL, so it is fine on an air-gapped
machine.

To host your own copy, drop that one file anywhere static. There is nothing to
configure.

## No dependencies, and nothing to trust

There is no framework, no charting library and no third-party code of any kind.
No package manager, no lockfile, no transitive dependencies, no build-time
network access. Everything in the shipped file was written for this project.

Nothing authenticates to anything and nothing leaves the browser, so there are
no keys, tokens or connection strings anywhere in this repository. Every IP
address, host name, user name and email address in the sample data is
synthetic.

## What is in it

- **A real SPL interpreter** written in JavaScript: a tokenizer, a
  recursive-descent expression parser for `eval`/`where`, a boolean search
  parser with wildcards and subsearches, and ~60 commands.
- **~5,970 generated events** across six sourcetypes and six indexes, spread
  over the last seven days. Generation is seeded, so results are identical for
  every user and every reload, which is what makes graded exercises possible.
- **Five lookup tables**, event types, and tags.
- **25 graded exercises.** Your query is executed and the resulting table is
  compared against a reference answer's table, so any query that produces the
  correct result passes, not just the one the author had in mind.
- **Command and function reference** with runnable examples, plus exam notes on
  the things that are actually tested (search vs where, NOT vs !=, streaming vs
  transforming, first/last vs earliest/latest, time modifier snapping).

## Datasets

| index      | sourcetype                | events | notes |
|------------|---------------------------|--------|-------|
| `web`      | `access_combined_wcookie` | 2,600  | Generated as browsing sessions, so `transaction JSESSIONID` and per-IP aggregation behave realistically |
| `security` | `linux_secure`            | 800    | SSH successes and failures, with four brute-force sources |
| `windows`  | `WinEventLog:Security`    | 700    | Multi-line events, EventCode 4624/4625/4672/4720/4732/4768 |
| `network`  | `pan:traffic`             | 950    | key=value firewall traffic |
| `sales`    | `vendor_sales`            | 420    | Joins to `product_lookup` and `geo_vendor` |
| `app`      | `app:json`                | 500    | JSON in `_raw`, for `spath` practice |

Lookups: `product_lookup`, `http_status`, `user_roles`, `geo_vendor`, `prices`.

## Supported commands

`search` `where` `regex` `eval` `fields` `table` `rename` `stats` `eventstats`
`streamstats` `chart` `timechart` `top` `rare` `dedup` `sort` `head` `tail`
`reverse` `rex` `lookup` `inputlookup` `outputlookup` `fillnull` `filldown`
`replace` `strcat` `transaction` `bin`/`bucket` `makemv` `mvexpand` `mvcombine`
`nomv` `spath` `extract`/`kv` `addtotals` `addcoltotals` `transpose` `xyseries`
`untable` `append` `appendcols` `appendpipe` `join` `set` `format` `return`
`map` `convert` `rangemap` `iplocation` `accum` `delta` `abstract` `fieldsummary`
`makeresults` `gentimes` `eventcount` `metadata` `multikv`

Plus the `eval` function library (`if` `case` `validate` `coalesce` `nullif`
`like` `match` `cidrmatch` `searchmatch` `in` `mvfilter` `mvmap` `mvindex`
`mvjoin` `mvcount` `mvappend` `mvdedup` `mvsort` `mvzip` `mvrange` `strftime`
`strptime` `relative_time` `now` `tostring` `tonumber` `round` `substr`
`replace` `split` `printf` `spath` and the rest) and the `stats` function
library (`count` `dc` `sum` `avg` `median` `mode` `range` `stdev` `var`
`first` `last` `earliest` `latest` `list` `values` `perc<N>` `sumsq`).

## Known limits

These are deliberately out of scope; the playground tells you when you hit one.

- `erex` (regex-from-examples) is documented but not implemented — the exam
  tests `rex`, so use that.
- `outputlookup` is accepted but writes nothing.
- `map` is capped at 10 input rows.
- Data models, `pivot`, `tstats` and accelerated searches are not modelled.
- Hashing functions (`md5`, `sha1`, `sha256`) return deterministic stand-in
  values, not real digests.
- Free-text search matches on token boundaries rather than Splunk's full
  segmentation rules, so exotic punctuation cases may differ.

## Project layout

```
src/data.js           seeded mock data generator
src/spl-lang.js       tokenizer, expression parser, eval + time functions
src/spl-commands.js   search parser, command library, pipeline runner
src/content.js        command reference, samples, exam notes, exercises
src/app.js            UI
src/styles.css        theming (light + dark)
build.ps1             inlines everything into dist/
```

## Building

```powershell
.\build.ps1
```

Produces `dist/index.html` (standalone) and `dist/artifact.html` (same content
without the document wrapper, for hosts that supply their own `<head>`).

The build is file concatenation. There is no bundler, transpiler or minifier,
because there is no Node on the machine this was written on and none is needed.
Any shell that can concatenate files works; `build.ps1` is just what was to
hand.

## Engineering notes

`SPL-Playground-Build-Report.docx` is a 14-page write-up of the architecture,
every component, the dependency position, the decision log with rejected
alternatives, the verification strategy and the defects it caught. Generated by
`build_report_docx.ps1`.

## Licence and trademarks

MIT, see [LICENSE](LICENSE). Fork it, change it, use it however you like.

Splunk and SPL are trademarks of Splunk LLC. This project is independent and
unaffiliated, contains no Splunk code, and is an approximation of the search
language built for revision purposes. See [NOTICE.md](NOTICE.md).

## Contributing

Forks and pull requests welcome. The quickest orientation is the engineering
report above, then `src/spl-commands.js`, which is where most behaviour lives.

Before opening a PR, run the app and confirm the reference examples still pass.
Every example in `src/content.js` is executable, so a broken one is a real
regression.

## Adding your own exercises

Append to `EXERCISES` in `src/content.js`:

```js
{ id: 'e26', level: 'Reporting', points: 2,
  q: 'The question shown to the learner.',
  hint: 'Shown when they press Hint.',
  solution: 'index=web | stats count by host',
  compare: 'count',      // optional: grade on row count only
  strictCols: true }     // optional: also require the column ORDER to match
```

Then rerun `build.ps1`.

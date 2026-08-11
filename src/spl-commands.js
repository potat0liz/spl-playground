/* =========================================================================
   SPL Playground - search parser, command library and pipeline runner.
   ========================================================================= */
(function (global) {
  'use strict';

  var L = global.SPLLang;
  var err = L.err, numeric = L.numeric, toStr = L.toStr, truthy = L.truthy, cmp = L.cmp;
  var isNull = L.isNull, isMV = L.isMV;

  /* =====================================================================
     Low level splitting helpers (quote / bracket aware)
     ===================================================================== */

  /* Split on a single-char delimiter at depth 0, honouring quotes. */
  function splitTop(str, delim) {
    var out = [], buf = '', depth = 0, q = null;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (q) {
        buf += c;
        if (c === '\\' && i + 1 < str.length) { buf += str[++i]; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") { q = c; buf += c; continue; }
      if (c === '(' || c === '[') { depth++; buf += c; continue; }
      if (c === ')' || c === ']') { depth--; buf += c; continue; }
      if (c === delim && depth === 0) { out.push(buf); buf = ''; continue; }
      buf += c;
    }
    out.push(buf);
    return out;
  }

  /* Split a full SPL string into pipeline segments. */
  function splitPipeline(str) {
    return splitTop(str, '|').map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
  }

  /* Break an argument string into whitespace-separated atoms, keeping
     quoted strings, (...) groups and [...] subsearches intact.        */
  function atoms(str) {
    var out = [], buf = '', depth = 0, q = null;
    function flush() { if (buf.trim() !== '') out.push(buf.trim()); buf = ''; }
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (q) {
        buf += c;
        if (c === '\\' && i + 1 < str.length) { buf += str[++i]; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") { q = c; buf += c; continue; }
      if (c === '(' || c === '[') { depth++; buf += c; continue; }
      if (c === ')' || c === ']') { depth--; buf += c; continue; }
      if (/\s/.test(c) && depth === 0) { flush(); continue; }
      if (c === ',' && depth === 0) { flush(); continue; }
      buf += c;
    }
    flush();
    return out;
  }

  function unquote(s) {
    if (typeof s !== 'string') return s;
    s = s.trim();
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
      // Only quote and backslash escapes are consumed. Everything else keeps its
      // backslash, otherwise regexes like \d+ would be destroyed by quoting.
      return s.slice(1, -1).replace(/\\(.)/g, function (m, c) {
        return (c === '"' || c === "'" || c === '\\') ? c : m;
      });
    }
    return s;
  }

  /* Pull leading key=value options out of an argument string. */
  function takeOptions(str, keys) {
    var list = atoms(str), opts = {}, rest = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(a);
      if (m && keys.indexOf(m[1].toLowerCase()) >= 0) { opts[m[1].toLowerCase()] = unquote(m[2]); }
      else rest.push(a);
    }
    return { opts: opts, rest: rest, restStr: rest.join(' ') };
  }

  function boolOpt(v, dflt) {
    if (v === undefined) return dflt;
    var s = String(v).toLowerCase();
    return s === 't' || s === 'true' || s === '1' || s === 'y' || s === 'yes';
  }

  /* Wildcard field selector -> matching field names */
  function expandFields(patterns, allFields) {
    var out = [];
    patterns.forEach(function (p) {
      p = unquote(p);
      if (p.indexOf('*') >= 0) {
        var re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, function (c) { return c === '*' ? '.*' : '\\' + c; }) + '$');
        allFields.forEach(function (f) { if (re.test(f) && out.indexOf(f) < 0) out.push(f); });
      } else if (out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }

  function allFieldsOf(rows) {
    var seen = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      for (var k in rows[i]) if (Object.prototype.hasOwnProperty.call(rows[i], k)) {
        if (!seen[k]) { seen[k] = 1; out.push(k); }
      }
    }
    return out;
  }

  /* =====================================================================
     Base search: tokenizer + parser + matcher
     ===================================================================== */

  function tokenizeSearch(s) {
    var toks = [], i = 0, n = s.length;
    while (i < n) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (s.startsWith('```', i)) { var ce = s.indexOf('```', i + 3); i = ce === -1 ? n : ce + 3; continue; }
      if (c === '(') { toks.push({ t: '(' }); i++; continue; }
      if (c === ')') { toks.push({ t: ')' }); i++; continue; }
      if (c === '[') {
        var depth = 0, j = i, q = null;
        for (; j < n; j++) {
          var d = s[j];
          if (q) { if (d === '\\') { j++; continue; } if (d === q) q = null; continue; }
          if (d === '"' || d === "'") { q = d; continue; }
          if (d === '[') depth++;
          if (d === ']') { depth--; if (depth === 0) break; }
        }
        if (depth !== 0) err('Unbalanced [ ] in search');
        toks.push({ t: 'sub', v: s.slice(i + 1, j) });
        i = j + 1; continue;
      }
      // atom
      var buf = '', q2 = null;
      while (i < n) {
        var e = s[i];
        if (q2) {
          buf += e;
          if (e === '\\' && i + 1 < n) { buf += s[++i]; i++; continue; }
          if (e === q2) q2 = null;
          i++; continue;
        }
        if (e === '"' || e === "'") { q2 = e; buf += e; i++; continue; }
        if (/\s/.test(e)) break;
        if (e === ')' || e === '[') break;
        if (e === '(') {
          // only part of the atom when it follows an operator: status=(200 OR 404)
          if (/[=<>!]$/.test(buf) || /\bIN$/i.test(buf)) {
            var dep = 0, k = i;
            for (; k < n; k++) {
              if (s[k] === '(') dep++;
              if (s[k] === ')') { dep--; if (dep === 0) break; }
            }
            buf += s.slice(i, k + 1); i = k + 1; continue;
          }
          break;
        }
        buf += e; i++;
      }
      if (buf === '') { i++; continue; }
      // "field IN (a, b)" arrives as three tokens; glue them back together
      var ahead = /^(\s+IN\s*)\(/i.exec(s.slice(i));
      if (ahead && !/[=<>!]/.test(buf)) {
        var start = i + ahead[0].length - 1, dep2 = 0, k2 = start;
        for (; k2 < n; k2++) {
          if (s[k2] === '(') dep2++;
          if (s[k2] === ')') { dep2--; if (dep2 === 0) break; }
        }
        if (dep2 === 0) { buf += ' IN ' + s.slice(start, k2 + 1); i = k2 + 1; }
      }
      toks.push({ t: 'atom', v: buf });
    }
    toks.push({ t: 'eof' });
    return toks;
  }

  function parseSearch(str, ctx) {
    var toks = tokenizeSearch(str), p = 0;
    function peek() { return toks[p]; }
    function isKw(k) { var t = toks[p]; return t.t === 'atom' && t.v.toUpperCase() === k; }

    function parseOr() {
      var l = parseAnd();
      while (isKw('OR')) { p++; l = { op: 'or', l: l, r: parseAnd() }; }
      return l;
    }
    function parseAnd() {
      var l = parseNot();
      for (;;) {
        var t = peek();
        if (t.t === 'eof' || t.t === ')' || isKw('OR')) break;
        if (isKw('AND')) { p++; }
        l = { op: 'and', l: l, r: parseNot() };
      }
      return l;
    }
    function parseNot() {
      if (isKw('NOT')) { p++; return { op: 'not', e: parseNot() }; }
      return parseAtom();
    }
    function parseAtom() {
      var t = toks[p];
      if (t.t === '(') { p++; var e = parseOr(); if (peek().t === ')') p++; else err('Unbalanced ( ) in search'); return e; }
      if (t.t === 'sub') { p++; return subsearchNode(t.v, ctx); }
      if (t.t === 'atom') { p++; return termNode(t.v, ctx); }
      if (t.t === ')') err('Unexpected ) in search');
      err('Unexpected end of search expression');
    }

    if (peek().t === 'eof') return { op: 'true' };
    var ast = parseOr();
    if (peek().t !== 'eof') err('Could not parse the whole search expression');
    return ast;
  }

  var CMP_OPS = ['!=', '<=', '>=', '=', '<', '>'];

  function termNode(atom, ctx) {
    // split at first top-level comparison operator
    var q = null, opIdx = -1, opStr = null;
    for (var i = 0; i < atom.length && opIdx < 0; i++) {
      var c = atom[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      for (var k = 0; k < CMP_OPS.length; k++) {
        if (atom.startsWith(CMP_OPS[k], i)) { opIdx = i; opStr = CMP_OPS[k]; break; }
      }
    }

    if (opIdx > 0) {
      var field = atom.slice(0, opIdx).trim();
      var value = atom.slice(opIdx + opStr.length).trim();
      var lf = field.toLowerCase();

      if (lf === 'earliest' || lf === 'latest') {
        var t = L.relativeTime(ctx.now, unquote(value));
        if (lf === 'earliest') ctx.searchEarliest = t; else ctx.searchLatest = t;
        return { op: 'true' };
      }
      if (lf === 'index' && ctx.knownIndexes && ctx.knownIndexes.indexOf(unquote(value).toLowerCase()) < 0 &&
          unquote(value).indexOf('*') < 0) {
        ctx.warnings.push('No index named "' + unquote(value) + '". Available: ' + ctx.knownIndexes.join(', ') + '.');
      }
      // field=(a OR b)
      if (/^\(.*\)$/.test(value)) {
        var inner = value.slice(1, -1);
        var parts = inner.split(/\s+OR\s+/i).map(function (s) { return s.trim(); }).filter(Boolean);
        if (parts.length > 1) {
          return parts.map(function (v) { return { op: 'cmp', field: field, cmp: opStr, value: unquote(v) }; })
            .reduce(function (a, b) { return { op: 'or', l: a, r: b }; });
        }
        value = inner;
      }
      if (field.slice(0, 5) === 'tag::') field = 'tag';
      return { op: 'cmp', field: field, cmp: opStr, value: unquote(value) };
    }

    // field IN (a, b, c)
    var mIn = /^([A-Za-z_][A-Za-z0-9_.:{}]*)\s+IN\s*\(([\s\S]*)\)$/i.exec(atom);
    if (mIn) {
      var vals = splitTop(mIn[2], ',').map(function (s) { return unquote(s.trim()); }).filter(function (s) { return s !== ''; });
      if (!vals.length) return { op: 'false' };
      return vals.map(function (v) { return { op: 'cmp', field: mIn[1], cmp: '=', value: v }; })
        .reduce(function (a, b) { return { op: 'or', l: a, r: b }; });
    }

    var m2 = /^TERM\((.*)\)$/i.exec(atom);
    if (m2) return { op: 'raw', value: unquote(m2[1]) };
    var m3 = /^CASE\((.*)\)$/i.exec(atom);
    if (m3) return { op: 'raw', value: unquote(m3[1]), cs: true };

    return { op: 'raw', value: unquote(atom) };
  }

  function subsearchNode(inner, ctx) {
    if (ctx.depth > 4) err('Subsearch nesting is too deep');
    var res = runPipeline(inner.trim(), Object.assign({}, ctx, { depth: ctx.depth + 1 }));
    var rows = res.rows.slice(0, 1000);
    if (!rows.length) return { op: 'false' };
    // "return"-style: build OR of AND of the row's fields (ignoring internals)
    var nodes = rows.map(function (r) {
      var terms = [];
      Object.keys(r).forEach(function (k) {
        if (k.charAt(0) === '_' && k !== '_time') return;
        if (isNull(r[k])) return;
        terms.push({ op: 'cmp', field: k, cmp: '=', value: toStr(r[k]) });
      });
      if (!terms.length) return { op: 'false' };
      return terms.reduce(function (a, b) { return { op: 'and', l: a, r: b }; });
    });
    return nodes.reduce(function (a, b) { return { op: 'or', l: a, r: b }; });
  }

  function wildcardRe(v, caseSensitive) {
    var body = String(v).replace(/[.*+?^${}()|[\]\\]/g, function (c) { return c === '*' ? '[\\s\\S]*' : '\\' + c; });
    return new RegExp('^' + body + '$', caseSensitive ? '' : 'i');
  }
  var wcCache = {};
  function wcTest(pattern, value, cs) {
    var key = (cs ? 'C' : 'i') + pattern;
    if (!wcCache[key]) wcCache[key] = wildcardRe(pattern, cs);
    return wcCache[key].test(toStr(value));
  }

  var rawCache = {};
  function rawTest(term, raw, cs) {
    var key = (cs ? 'C' : 'i') + term;
    if (!rawCache[key]) {
      var body = String(term).replace(/[.*+?^${}()|[\]\\]/g, function (c) { return c === '*' ? '\\S*' : '\\' + c; });
      rawCache[key] = new RegExp('(^|[^A-Za-z0-9_])' + body + '($|[^A-Za-z0-9_])', cs ? '' : 'i');
    }
    return rawCache[key].test(raw);
  }

  function matchNode(node, ev) {
    switch (node.op) {
      case 'true': return true;
      case 'false': return false;
      case 'and': return matchNode(node.l, ev) && matchNode(node.r, ev);
      case 'or': return matchNode(node.l, ev) || matchNode(node.r, ev);
      case 'not': return !matchNode(node.e, ev);
      case 'raw': {
        if (rawTest(node.value, toStr(ev._raw), node.cs)) return true;
        // also allow matching a field value, which helps once fields are computed
        for (var k in ev) {
          if (k.charAt(0) === '_') continue;
          if (rawTest(node.value, toStr(ev[k]), node.cs)) return true;
        }
        return false;
      }
      case 'cmp': {
        var v = ev[node.field];
        var vals = isMV(v) ? v : [v];
        for (var i = 0; i < vals.length; i++) {
          if (matchOne(vals[i], node)) return node.cmp === '!=' ? true : true;
        }
        if (node.cmp === '!=') {
          // != is true when the field exists and no value equals it
          if (v === undefined) return false;
          return true;
        }
        return false;
      }
    }
    return false;
  }

  function matchOne(v, node) {
    var target = node.value;
    switch (node.cmp) {
      case '=':
        if (v === undefined) return false;
        if (target === '*') return !isNull(v);
        return wcTest(target, v);
      case '!=':
        if (v === undefined) return false;
        return !wcTest(target, v);
      case '<':  return !isNull(v) && cmp(v, target) < 0;
      case '>':  return !isNull(v) && cmp(v, target) > 0;
      case '<=': return !isNull(v) && cmp(v, target) <= 0;
      case '>=': return !isNull(v) && cmp(v, target) >= 0;
    }
    return false;
  }

  /* != needs whole-value semantics rather than per-mv-value */
  function matchNodeFixed(node, ev) {
    if (node.op === 'cmp' && node.cmp === '!=') {
      var v = ev[node.field];
      if (v === undefined) return false;
      var vals = isMV(v) ? v : [v];
      return !vals.some(function (x) { return wcTest(node.value, x); });
    }
    if (node.op === 'and') return matchNodeFixed(node.l, ev) && matchNodeFixed(node.r, ev);
    if (node.op === 'or') return matchNodeFixed(node.l, ev) || matchNodeFixed(node.r, ev);
    if (node.op === 'not') return !matchNodeFixed(node.e, ev);
    return matchNode(node, ev);
  }

  /* =====================================================================
     Aggregation functions
     ===================================================================== */

  function valuesOf(rows, field) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][field];
      if (isNull(v)) continue;
      if (isMV(v)) { for (var j = 0; j < v.length; j++) if (!isNull(v[j])) out.push(v[j]); }
      else out.push(v);
    }
    return out;
  }
  function numsOf(rows, field) {
    var out = [];
    valuesOf(rows, field).forEach(function (v) { var n = numeric(v); if (n !== undefined) out.push(n); });
    return out;
  }
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var idx = (p / 100) * (sorted.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  var AGGS = {
    count: function (rows, f) { return f ? valuesOf(rows, f).length : rows.length; },
    c: function (rows, f) { return AGGS.count(rows, f); },
    dc: function (rows, f) { var s = {}; valuesOf(rows, f).forEach(function (v) { s[toStr(v)] = 1; }); return Object.keys(s).length; },
    distinct_count: function (rows, f) { return AGGS.dc(rows, f); },
    estdc: function (rows, f) { return AGGS.dc(rows, f); },
    sum: function (rows, f) { var n = numsOf(rows, f); return n.length ? n.reduce(function (a, b) { return a + b; }, 0) : null; },
    sumsq: function (rows, f) { var n = numsOf(rows, f); return n.length ? n.reduce(function (a, b) { return a + b * b; }, 0) : null; },
    avg: function (rows, f) { var n = numsOf(rows, f); return n.length ? n.reduce(function (a, b) { return a + b; }, 0) / n.length : null; },
    mean: function (rows, f) { return AGGS.avg(rows, f); },
    min: function (rows, f) { var v = valuesOf(rows, f); if (!v.length) return null;
                              return v.reduce(function (a, b) { return cmp(b, a) < 0 ? b : a; }); },
    max: function (rows, f) { var v = valuesOf(rows, f); if (!v.length) return null;
                              return v.reduce(function (a, b) { return cmp(b, a) > 0 ? b : a; }); },
    range: function (rows, f) { var n = numsOf(rows, f); if (!n.length) return null; return Math.max.apply(null, n) - Math.min.apply(null, n); },
    median: function (rows, f) { var n = numsOf(rows, f).sort(function (a, b) { return a - b; }); return percentile(n, 50); },
    mode: function (rows, f) {
      var v = valuesOf(rows, f), counts = {}, best = null, bestN = -1;
      v.forEach(function (x) { var k = toStr(x); counts[k] = (counts[k] || 0) + 1; if (counts[k] > bestN) { bestN = counts[k]; best = x; } });
      return best;
    },
    stdev: function (rows, f) {
      var n = numsOf(rows, f); if (n.length < 2) return null;
      var m = n.reduce(function (a, b) { return a + b; }, 0) / n.length;
      return Math.sqrt(n.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n.length - 1));
    },
    stdevp: function (rows, f) {
      var n = numsOf(rows, f); if (!n.length) return null;
      var m = n.reduce(function (a, b) { return a + b; }, 0) / n.length;
      return Math.sqrt(n.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / n.length);
    },
    var: function (rows, f) { var s = AGGS.stdev(rows, f); return s === null ? null : s * s; },
    varp: function (rows, f) { var s = AGGS.stdevp(rows, f); return s === null ? null : s * s; },
    first: function (rows, f) { for (var i = 0; i < rows.length; i++) if (!isNull(rows[i][f])) return rows[i][f]; return null; },
    last: function (rows, f) { for (var i = rows.length - 1; i >= 0; i--) if (!isNull(rows[i][f])) return rows[i][f]; return null; },
    list: function (rows, f) { var v = valuesOf(rows, f).slice(0, 100); return v.length === 0 ? null : (v.length === 1 ? v[0] : v); },
    values: function (rows, f) {
      var seen = {}, out = [];
      valuesOf(rows, f).forEach(function (v) { var k = toStr(v); if (!seen[k]) { seen[k] = 1; out.push(v); } });
      out.sort(function (a, b) { return cmp(a, b); });
      return out.length === 0 ? null : (out.length === 1 ? out[0] : out);
    },
    earliest: function (rows, f) {
      var best = null, bt = Infinity;
      rows.forEach(function (r) { var t = numeric(r._time); if (t !== undefined && t < bt && !isNull(r[f])) { bt = t; best = r[f]; } });
      return best;
    },
    latest: function (rows, f) {
      var best = null, bt = -Infinity;
      rows.forEach(function (r) { var t = numeric(r._time); if (t !== undefined && t > bt && !isNull(r[f])) { bt = t; best = r[f]; } });
      return best;
    },
    earliest_time: function (rows) { var t = Infinity; rows.forEach(function (r) { var x = numeric(r._time); if (x !== undefined && x < t) t = x; }); return t === Infinity ? null : t; },
    latest_time: function (rows) { var t = -Infinity; rows.forEach(function (r) { var x = numeric(r._time); if (x !== undefined && x > t) t = x; }); return t === -Infinity ? null : t; },
    per_second: function (rows, f, ctx) { var s = AGGS.sum(rows, f); var span = (ctx && ctx.spanSecs) || 1; return s === null ? null : s / span; },
    per_minute: function (rows, f, ctx) { var s = AGGS.per_second(rows, f, ctx); return s === null ? null : s * 60; },
    per_hour: function (rows, f, ctx) { var s = AGGS.per_second(rows, f, ctx); return s === null ? null : s * 3600; },
    per_day: function (rows, f, ctx) { var s = AGGS.per_second(rows, f, ctx); return s === null ? null : s * 86400; }
  };

  function aggValue(spec, rows, ctx) {
    if (spec.evalExpr) {
      // sum(eval(...)) style - materialise a temp field first
      var tmp = rows.map(function (r) {
        var o = Object.create(r);
        o.__aggtmp = L.evalNode(spec.evalExpr, r, ctx);
        return o;
      });
      return applyAgg(spec.func, tmp, '__aggtmp', ctx, spec);
    }
    return applyAgg(spec.func, rows, spec.field, ctx, spec);
  }

  function applyAgg(func, rows, field, ctx, spec) {
    var pm = /^(exact)?(?:perc|p|upperperc)(\d+(?:\.\d+)?)$/.exec(func);
    if (pm) {
      var n = numsOf(rows, field).sort(function (a, b) { return a - b; });
      return percentile(n, Number(pm[2]));
    }
    var fn = AGGS[func];
    if (!fn) err('Unknown stats function "' + func + '"');
    if (func !== 'count' && func !== 'earliest_time' && func !== 'latest_time' && !field) {
      err('Stats function "' + func + '" requires a field, e.g. ' + func + '(bytes)');
    }
    return fn(rows, field, ctx, spec);
  }

  /* Parse an aggregation clause: "count sum(bytes) as total, dc(host) AS hosts" */
  function parseAggs(str) {
    var list = atoms(str), specs = [], i = 0;
    while (i < list.length) {
      var a = list[i];
      if (/^(as)$/i.test(a)) { i++; continue; }
      var spec = parseOneAgg(a);
      i++;
      if (i < list.length && /^as$/i.test(list[i])) {
        i++;
        if (i < list.length) { spec.alias = unquote(list[i]); i++; }
      }
      specs.push(spec);
    }
    return specs;
  }

  function parseOneAgg(a) {
    var m = /^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/.exec(a);
    if (!m) {
      var bare = unquote(a).toLowerCase();
      if (bare === 'count' || bare === 'c') return { func: 'count', field: null, alias: 'count', label: 'count' };
      err('Could not parse the aggregation "' + a + '". Use a form like count, sum(bytes) or avg(price) AS avg_price.');
    }
    var func = m[1].toLowerCase(), arg = m[2].trim();
    var spec = { func: func, field: null, alias: null, label: func + '(' + arg + ')' };
    if (func === 'count' && arg === '') { spec.alias = 'count'; spec.label = 'count'; return spec; }
    var ev = /^eval\(([\s\S]*)\)$/i.exec(arg);
    if (ev) { spec.evalExpr = L.parseExpr(ev[1]); spec.label = func + '(eval(' + ev[1] + '))'; }
    else spec.field = unquote(arg);
    spec.alias = spec.label;
    return spec;
  }

  function aggName(spec) { return spec.alias || spec.label; }

  /* Split "<aggs> by a,b" / "<aggs> over x by y" */
  function splitByClause(str) {
    var list = atoms(str), head = [], by = [], over = null, mode = 'head';
    for (var i = 0; i < list.length; i++) {
      var lw = list[i].toLowerCase();
      if (lw === 'by' || lw === 'groupby') { mode = 'by'; continue; }
      if (lw === 'over') { mode = 'over'; continue; }
      if (mode === 'head') head.push(list[i]);
      else if (mode === 'by') by.push(unquote(list[i]));
      else { over = unquote(list[i]); mode = 'by'; }
    }
    return { head: head.join(' '), by: by, over: over };
  }

  function groupKey(row, byFields) {
    return byFields.map(function (f) { return isNull(row[f]) ? ' NULL' : toStr(row[f]); }).join('');
  }

  function groupBy(rows, byFields) {
    var map = {}, order = [];
    rows.forEach(function (r) {
      var k = groupKey(r, byFields);
      if (!map[k]) { map[k] = { key: k, rows: [], sample: r }; order.push(k); }
      map[k].rows.push(r);
    });
    return order.map(function (k) { return map[k]; });
  }

  /* =====================================================================
     Pipeline state
     ===================================================================== */
  function State(rows, fields, isEvents) {
    this.rows = rows;
    this.fields = fields || null;   // explicit column order, or null = derive
    this.isEvents = !!isEvents;
    this.chart = null;              // {x: fieldName, series: [names]}
  }
  State.prototype.cols = function () {
    if (this.fields) return this.fields.slice();
    return deriveFields(this.rows, this.isEvents);
  };

  var INTERNAL = ['_cd', '_indextime', '_bkt', '_serial', '_si', '_subsecond', '_sourcetype', '_kv', '_confstr'];
  function deriveFields(rows, isEvents) {
    var f = allFieldsOf(rows).filter(function (k) { return INTERNAL.indexOf(k) < 0; });
    if (isEvents) {
      var head = ['_time', '_raw'].filter(function (x) { return f.indexOf(x) >= 0; });
      var rest = f.filter(function (x) { return head.indexOf(x) < 0 && x.charAt(0) !== '_'; }).sort();
      return head.concat(rest);
    }
    var t = f.filter(function (x) { return x === '_time'; });
    return t.concat(f.filter(function (x) { return x !== '_time' && x !== '_raw'; }));
  }

  /* =====================================================================
     Commands
     ===================================================================== */
  var CMD = {};

  /* ---------- search / where / filtering ---------- */

  CMD.search = function (S, arg, ctx) {
    if (!arg.trim()) return S;
    var ast = parseSearch(arg, ctx);
    return new State(S.rows.filter(function (r) { return matchNodeFixed(ast, r); }), S.fields, S.isEvents);
  };

  CMD.where = function (S, arg, ctx) {
    if (!arg.trim()) err('where requires an expression, e.g. | where bytes > 1000');
    var ast = L.parseExpr(arg);
    return new State(S.rows.filter(function (r) { return truthy(L.evalNode(ast, r, ctx)); }), S.fields, S.isEvents);
  };

  CMD.regex = function (S, arg, ctx) {
    var m = /^\s*([A-Za-z_][A-Za-z0-9_.{}:]*)\s*(!?=)\s*([\s\S]+)$/.exec(arg);
    var field = '_raw', neg = false, pat = arg.trim();
    if (m) { field = m[1]; neg = m[2] === '!='; pat = m[3]; }
    var re = L.toRegExp(unquote(pat));
    return new State(S.rows.filter(function (r) {
      var hit = re.test(toStr(r[field]));
      return neg ? !hit : hit;
    }), S.fields, S.isEvents);
  };

  /* ---------- field manipulation ---------- */

  CMD.eval = function (S, arg, ctx) {
    var assigns = splitTop(arg, ',').map(function (s) { return s.trim(); }).filter(Boolean);
    var parsed = assigns.map(function (a) {
      var i = indexOfAssign(a);
      if (i < 0) err('eval needs field=expression, got "' + a + '"');
      return { name: unquote(a.slice(0, i).trim()), ast: L.parseExpr(a.slice(i + 1)) };
    });
    var rows = S.rows.map(function (r) {
      var o = shallow(r);
      parsed.forEach(function (p) {
        var v = L.evalNode(p.ast, o, ctx);
        if (isNull(v)) delete o[p.name]; else o[p.name] = v;
      });
      return o;
    });
    var fields = S.fields ? S.fields.slice() : null;
    if (fields) parsed.forEach(function (p) {
      // An eval that is null for every row creates no field, so it gets no
      // column either. A column of dashes would suggest the field exists.
      var anySet = rows.some(function (r) { return !isNull(r[p.name]); });
      if (anySet && fields.indexOf(p.name) < 0) fields.push(p.name);
    });
    return new State(rows, fields, S.isEvents);
  };

  function indexOfAssign(s) {
    var depth = 0, q = null;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === '=' && depth === 0 && s[i + 1] !== '=' && s[i - 1] !== '!' && s[i - 1] !== '<' && s[i - 1] !== '>' && s[i - 1] !== '=') return i;
    }
    return -1;
  }

  function shallow(o) {
    var n = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k];
    return n;
  }

  CMD.fields = function (S, arg) {
    var list = atoms(arg), keep = true;
    if (list.length && (list[0] === '-' || list[0] === '+')) { keep = list[0] === '+'; list = list.slice(1); }
    else if (list.length && list[0].charAt(0) === '-' && list[0].length > 1) { keep = false; list[0] = list[0].slice(1); }
    var all = allFieldsOf(S.rows);
    var sel = expandFields(list.map(unquote), all);
    var rows = S.rows.map(function (r) {
      var o = {};
      if (keep) {
        if (r._time !== undefined) o._time = r._time;
        sel.forEach(function (f) { if (r[f] !== undefined) o[f] = r[f]; });
      } else {
        for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k) && sel.indexOf(k) < 0) o[k] = r[k];
      }
      return o;
    });
    var fields = keep ? sel.slice() : (S.cols().filter(function (f) { return sel.indexOf(f) < 0; }));
    return new State(rows, fields, keep ? false : S.isEvents);
  };

  CMD.table = function (S, arg) {
    var all = allFieldsOf(S.rows);
    var sel = expandFields(atoms(arg).map(unquote), all);
    var rows = S.rows.map(function (r) {
      var o = {};
      sel.forEach(function (f) { if (r[f] !== undefined) o[f] = r[f]; });
      return o;
    });
    return new State(rows, sel, false);
  };

  CMD.rename = function (S, arg) {
    var pairs = splitTop(arg, ',').map(function (s) { return s.trim(); }).filter(Boolean);
    var maps = [];
    pairs.forEach(function (p) {
      var list = atoms(p);
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (/^as$/i.test(list[i])) { idx = i; break; }
      if (idx < 1 || idx === list.length - 1) err('rename needs "<field> AS <newname>", got "' + p + '"');
      maps.push({ from: unquote(list.slice(0, idx).join(' ')), to: unquote(list.slice(idx + 1).join(' ')) });
    });
    var all = allFieldsOf(S.rows);
    var renameOf = {};
    maps.forEach(function (m) {
      if (m.from.indexOf('*') >= 0) {
        var re = new RegExp('^' + m.from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)') + '$');
        all.forEach(function (f) {
          var mm = re.exec(f);
          if (!mm) return;
          var gi = 1, out = m.to.replace(/\*/g, function () { return mm[gi++] || ''; });
          renameOf[f] = out;
        });
      } else renameOf[m.from] = m.to;
    });
    var rows = S.rows.map(function (r) {
      var o = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[renameOf[k] || k] = r[k];
      return o;
    });
    var fields = S.fields ? S.fields.map(function (f) { return renameOf[f] || f; }) : null;
    return new State(rows, fields, S.isEvents);
  };

  CMD.fillnull = function (S, arg) {
    var o = takeOptions(arg, ['value']);
    var val = o.opts.value !== undefined ? o.opts.value : '0';
    var n = numeric(val); if (n !== undefined) val = n;
    var target = o.rest.length ? expandFields(o.rest.map(unquote), allFieldsOf(S.rows)) : null;
    var cols = target || S.cols();
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      cols.forEach(function (f) { if (isNull(x[f])) x[f] = val; });
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  CMD.filldown = function (S, arg) {
    var cols = arg.trim() ? expandFields(atoms(arg).map(unquote), allFieldsOf(S.rows)) : S.cols();
    var last = {};
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      cols.forEach(function (f) {
        if (!isNull(x[f])) last[f] = x[f];
        else if (last[f] !== undefined) x[f] = last[f];
      });
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  CMD.replace = function (S, arg) {
    // replace "a" WITH "b" [IN field...]
    var list = atoms(arg), specs = [], fields = null, i = 0;
    while (i < list.length) {
      if (/^in$/i.test(list[i])) { fields = list.slice(i + 1).map(unquote); break; }
      var from = unquote(list[i]);
      if (!/^with$/i.test(list[i + 1] || '')) err('replace needs: replace "old" WITH "new" IN field');
      specs.push({ from: from, to: unquote(list[i + 2]) });
      i += 3;
    }
    var cols = fields ? expandFields(fields, allFieldsOf(S.rows)) : S.cols();
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      cols.forEach(function (f) {
        if (x[f] === undefined) return;
        specs.forEach(function (s) { if (wcTest(s.from, x[f], true)) x[f] = s.to; });
      });
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  CMD.strcat = function (S, arg) {
    var o = takeOptions(arg, ['allowempty']);
    var parts = o.rest;
    if (parts.length < 2) err('strcat needs source fields plus a destination field');
    var dest = parts[parts.length - 1], src = parts.slice(0, -1);
    var allowEmpty = boolOpt(o.opts.allowempty, false);
    var rows = S.rows.map(function (r) {
      var s = '', ok = true;
      src.forEach(function (p) {
        if (/^".*"$/.test(p)) { s += unquote(p); return; }
        if (isNull(r[p])) { if (!allowEmpty) ok = false; return; }
        s += toStr(r[p]);
      });
      var x = shallow(r);
      if (ok) x[dest] = s;
      return x;
    });
    var fields = S.fields ? S.fields.concat(S.fields.indexOf(dest) < 0 ? [dest] : []) : null;
    return new State(rows, fields, S.isEvents);
  };

  /* ---------- ordering / trimming ---------- */

  CMD.sort = function (S, arg) {
    var list = atoms(arg), limit = null;
    if (list.length && /^\d+$/.test(list[0])) { limit = Number(list[0]); list = list.slice(1); }
    var keys = [], pendingDir = null;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (/^(desc|descending)$/i.test(a)) { if (keys.length) keys[keys.length - 1].dir = -1; continue; }
      if (/^(asc|ascending)$/i.test(a)) { if (keys.length) keys[keys.length - 1].dir = 1; continue; }
      // a lone "-" or "+" applies to the field that follows it: sort - count
      if (a === '-' || a === '+') { pendingDir = a === '-' ? -1 : 1; continue; }
      var dir = pendingDir === null ? 1 : pendingDir;
      pendingDir = null;
      if (a.charAt(0) === '-') { dir = -1; a = a.slice(1); }
      else if (a.charAt(0) === '+') { a = a.slice(1); }
      var type = null;
      var m = /^(num|str|ip|auto)\(([\s\S]*)\)$/i.exec(a);
      if (m) { type = m[1].toLowerCase(); a = m[2]; }
      if (a === '') continue;
      keys.push({ field: unquote(a), dir: dir, type: type });
    }
    if (!keys.length) err('sort needs at least one field');
    var rows = S.rows.slice();
    rows.sort(function (x, y) {
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k], a = x[key.field], b = y[key.field];
        var an = isNull(a), bn = isNull(b);
        if (an && bn) continue;
        if (an) return 1;
        if (bn) return -1;
        var c;
        if (key.type === 'num') { c = (numeric(a) || 0) - (numeric(b) || 0); }
        else if (key.type === 'str') { c = toStr(a) < toStr(b) ? -1 : toStr(a) > toStr(b) ? 1 : 0; }
        else if (key.type === 'ip') { c = ipNum(a) - ipNum(b); }
        else c = cmp(a, b);
        if (c) return c * key.dir;
      }
      return 0;
    });
    if (limit !== null) rows = rows.slice(0, limit);
    return new State(rows, S.fields, S.isEvents);
  };
  function ipNum(ip) {
    var p = toStr(ip).split('.'), v = 0;
    for (var i = 0; i < 4; i++) v = v * 256 + (Number(p[i]) || 0);
    return v;
  }

  CMD.head = function (S, arg, ctx) {
    var o = takeOptions(arg, ['limit', 'keeplast', 'null']);
    var n = o.opts.limit !== undefined ? Number(o.opts.limit) : null;
    var whileExpr = null;
    var rest = o.rest.join(' ').trim();
    var wm = /^while\s*\(([\s\S]*)\)$/i.exec(rest);
    if (wm) whileExpr = L.parseExpr(wm[1]);
    else if (/^\d+$/.test(rest)) n = Number(rest);
    if (whileExpr) {
      var out = [];
      for (var i = 0; i < S.rows.length; i++) {
        if (!truthy(L.evalNode(whileExpr, S.rows[i], ctx))) { if (boolOpt(o.opts.keeplast, false)) out.push(S.rows[i]); break; }
        out.push(S.rows[i]);
      }
      return new State(out, S.fields, S.isEvents);
    }
    return new State(S.rows.slice(0, n === null ? 10 : n), S.fields, S.isEvents);
  };

  CMD.tail = function (S, arg) {
    var n = /^\d+$/.test(arg.trim()) ? Number(arg.trim()) : 10;
    return new State(S.rows.slice(-n).reverse(), S.fields, S.isEvents);
  };

  CMD.reverse = function (S) { return new State(S.rows.slice().reverse(), S.fields, S.isEvents); };

  CMD.dedup = function (S, arg) {
    var o = takeOptions(arg, ['keepevents', 'keepempty', 'consecutive']);
    var list = o.rest, keep = 1;
    if (list.length && /^\d+$/.test(list[0])) { keep = Number(list[0]); list = list.slice(1); }
    var sortBy = null;
    for (var i = 0; i < list.length; i++) {
      if (/^sortby$/i.test(list[i])) { sortBy = list.slice(i + 1).join(' '); list = list.slice(0, i); break; }
    }
    var fields = expandFields(list.map(unquote), allFieldsOf(S.rows));
    if (!fields.length) err('dedup needs at least one field');
    var rows = S.rows;
    if (sortBy) rows = CMD.sort(new State(rows, S.fields, S.isEvents), sortBy).rows;
    var consecutive = boolOpt(o.opts.consecutive, false);
    var counts = {}, out = [], prevKey = null;
    rows.forEach(function (r) {
      if (!boolOpt(o.opts.keepempty, false) && fields.some(function (f) { return isNull(r[f]); })) return;
      var k = groupKey(r, fields);
      if (consecutive) { if (k === prevKey) return; prevKey = k; out.push(r); return; }
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] <= keep) out.push(r);
    });
    return new State(out, S.fields, S.isEvents);
  };

  /* ---------- reporting ---------- */

  CMD.stats = function (S, arg, ctx) {
    var parts = splitByClause(arg);
    var specs = parseAggs(parts.head);
    if (!specs.length) err('stats needs at least one function, e.g. | stats count by host');
    var by = parts.by;
    var groups = by.length ? groupBy(S.rows, by) : [{ rows: S.rows, sample: {} }];
    var rows = groups.map(function (g) {
      var o = {};
      by.forEach(function (f) { if (!isNull(g.sample[f])) o[f] = g.sample[f]; });
      specs.forEach(function (sp) {
        var v = aggValue(sp, g.rows, ctx);
        if (!isNull(v)) o[aggName(sp)] = v;
      });
      return o;
    });
    if (by.length) {
      rows.sort(function (a, b) {
        for (var i = 0; i < by.length; i++) { var c = cmp(a[by[i]], b[by[i]]); if (c) return c; }
        return 0;
      });
    }
    var fields = by.concat(specs.map(aggName));
    return new State(rows, fields, false);
  };

  CMD.eventstats = function (S, arg, ctx) {
    var parts = splitByClause(arg);
    var specs = parseAggs(parts.head);
    var by = parts.by;
    var groups = by.length ? groupBy(S.rows, by) : [{ rows: S.rows }];
    var lookup = {};
    groups.forEach(function (g) {
      var vals = {};
      specs.forEach(function (sp) { vals[aggName(sp)] = aggValue(sp, g.rows, ctx); });
      g.rows.forEach(function (r) { lookup[r.__id] = vals; });
      g.vals = vals;
    });
    var rows = [];
    groups.forEach(function (g) {
      g.rows.forEach(function (r) {
        var o = shallow(r);
        specs.forEach(function (sp) { var v = g.vals[aggName(sp)]; if (!isNull(v)) o[aggName(sp)] = v; });
        rows.push(o);
      });
    });
    // restore original order
    var idx = new Map();
    S.rows.forEach(function (r, i) { idx.set(r, i); });
    var fields = S.fields ? S.fields.concat(specs.map(aggName)) : null;
    return new State(rows, fields, S.isEvents);
  };

  CMD.streamstats = function (S, arg, ctx) {
    var o = takeOptions(arg, ['window', 'current', 'global', 'allnum', 'reset_on_change', 'reset_before', 'reset_after', 'time_window']);
    var parts = splitByClause(o.restStr);
    var specs = parseAggs(parts.head);
    var by = parts.by;
    var win = o.opts.window !== undefined ? Number(o.opts.window) : 0;
    var current = boolOpt(o.opts.current, true);
    var resetOnChange = boolOpt(o.opts.reset_on_change, false);
    var buffers = {}, lastKey = {}, rows = [];
    S.rows.forEach(function (r) {
      var k = by.length ? groupKey(r, by) : '';
      if (resetOnChange && lastKey[k] !== undefined && lastKey[k] !== groupKey(r, by)) buffers[k] = [];
      if (!buffers[k]) buffers[k] = [];
      var buf = buffers[k];
      if (current) buf.push(r);
      var view = win > 0 ? buf.slice(-win) : buf.slice();
      var out = shallow(r);
      specs.forEach(function (sp) {
        var v = view.length ? aggValue(sp, view, ctx) : null;
        if (!isNull(v)) out[aggName(sp)] = v;
      });
      if (!current) buf.push(r);
      rows.push(out);
    });
    var fields = S.fields ? S.fields.concat(specs.map(aggName)) : null;
    return new State(rows, fields, S.isEvents);
  };

  CMD.top = function (S, arg, ctx) { return topRare(S, arg, ctx, true); };
  CMD.rare = function (S, arg, ctx) { return topRare(S, arg, ctx, false); };

  function topRare(S, arg, ctx, isTop) {
    var o = takeOptions(arg, ['limit', 'showcount', 'showperc', 'countfield', 'percentfield', 'useother', 'otherstr']);
    var parts = splitByClause(o.restStr);
    var fields = atoms(parts.head).map(unquote);
    // "top 5 uri_path" - a leading integer is shorthand for limit=
    var leading = null;
    if (fields.length > 1 && /^\d+$/.test(fields[0])) { leading = Number(fields[0]); fields = fields.slice(1); }
    if (!fields.length) err((isTop ? 'top' : 'rare') + ' needs a field name');
    var limit = o.opts.limit !== undefined ? Number(o.opts.limit) : (leading !== null ? leading : 10);
    var countField = o.opts.countfield || 'count';
    var percField = o.opts.percentfield || 'percent';
    var showCount = boolOpt(o.opts.showcount, true);
    var showPerc = boolOpt(o.opts.showperc, true);
    var by = parts.by;

    var outer = by.length ? groupBy(S.rows, by) : [{ rows: S.rows, sample: {} }];
    var rows = [];
    outer.forEach(function (og) {
      var total = og.rows.filter(function (r) { return !fields.some(function (f) { return isNull(r[f]); }); }).length;
      var groups = groupBy(og.rows.filter(function (r) { return !fields.some(function (f) { return isNull(r[f]); }); }), fields);
      var ranked = groups.map(function (g) { return { g: g, n: g.rows.length }; });
      // Ties are broken by value so the output is reproducible run to run.
      ranked.sort(function (a, b) {
        if (a.n !== b.n) return isTop ? b.n - a.n : a.n - b.n;
        return cmp(groupKey(a.g.sample, fields), groupKey(b.g.sample, fields));
      });
      if (limit > 0) ranked = ranked.slice(0, limit);
      ranked.forEach(function (x) {
        var row = {};
        by.forEach(function (f) { row[f] = og.sample[f]; });
        fields.forEach(function (f) { row[f] = x.g.sample[f]; });
        if (showCount) row[countField] = x.n;
        if (showPerc) row[percField] = total ? Math.round((x.n / total) * 1e6) / 1e4 : 0;
        rows.push(row);
      });
    });
    var cols = by.concat(fields);
    if (showCount) cols.push(countField);
    if (showPerc) cols.push(percField);
    return new State(rows, cols, false);
  }

  /* ---------- chart / timechart / bin ---------- */

  var NICE_SPANS = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 604800, 2592000];

  function parseSpan(str) {
    var m = /^(\d+(?:\.\d+)?)\s*([A-Za-z]*)$/.exec(String(str).trim());
    if (!m) err('Could not parse span "' + str + '"');
    var n = Number(m[1]), u = (m[2] || 's').toLowerCase();
    var map = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
                h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, d: 86400, day: 86400, days: 86400,
                w: 604800, week: 604800, weeks: 604800, mon: 2592000, month: 2592000, months: 2592000 };
    if (u === 'mon' || u === 'month' || u === 'months') return { secs: n * 2592000, months: n };
    if (!map[u]) err('Unknown span unit "' + m[2] + '"');
    return { secs: n * map[u] };
  }

  function autoSpan(minT, maxT) {
    var range = Math.max(1, maxT - minT);
    for (var i = 0; i < NICE_SPANS.length; i++) {
      if (range / NICE_SPANS[i] <= 60) return { secs: NICE_SPANS[i] };
    }
    return { secs: NICE_SPANS[NICE_SPANS.length - 1] };
  }

  function snapTime(t, span) {
    if (span.months) {
      var d = new Date(t * 1000);
      d.setDate(1); d.setHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    }
    if (span.secs >= 86400) {
      var d2 = new Date(t * 1000);
      d2.setHours(0, 0, 0, 0);
      var dayStart = Math.floor(d2.getTime() / 1000);
      var days = Math.floor(span.secs / 86400);
      if (days <= 1) return dayStart;
      return dayStart - ((Math.floor(dayStart / 86400)) % days) * 86400;
    }
    // align to local wall clock
    var off = new Date(t * 1000).getTimezoneOffset() * 60;
    return Math.floor((t - off) / span.secs) * span.secs + off;
  }

  CMD.bin = function (S, arg, ctx) {
    var o = takeOptions(arg, ['span', 'bins', 'minspan', 'start', 'end', 'aligntime']);
    var list = o.rest, field = null, alias = null;
    for (var i = 0; i < list.length; i++) {
      if (/^as$/i.test(list[i])) { alias = unquote(list[i + 1]); i++; continue; }
      if (!field) field = unquote(list[i]);
    }
    if (!field) err('bin needs a field, e.g. | bin span=1h _time');
    alias = alias || field;

    if (field === '_time') {
      var times = S.rows.map(function (r) { return numeric(r._time); }).filter(function (x) { return x !== undefined; });
      var span = o.opts.span ? parseSpan(o.opts.span)
               : (o.opts.bins ? { secs: Math.max(1, Math.round((Math.max.apply(null, times) - Math.min.apply(null, times)) / Number(o.opts.bins))) }
                              : autoSpan(Math.min.apply(null, times), Math.max.apply(null, times)));
      ctx.lastSpan = span;
      var rows = S.rows.map(function (r) {
        var o2 = shallow(r);
        var t = numeric(r._time);
        if (t !== undefined) o2[alias] = snapTime(t, span);
        return o2;
      });
      return new State(rows, S.fields, S.isEvents);
    }
    var nums = S.rows.map(function (r) { return numeric(r[field]); }).filter(function (x) { return x !== undefined; });
    var width;
    if (o.opts.span) width = parseSpan(o.opts.span).secs;
    else {
      var lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums);
      var b = o.opts.bins ? Number(o.opts.bins) : 10;
      width = niceWidth((hi - lo) / b);
    }
    var rows2 = S.rows.map(function (r) {
      var o3 = shallow(r), n = numeric(r[field]);
      if (n !== undefined) {
        var lo2 = Math.floor(n / width) * width;
        o3[alias] = fmtNum(lo2) + '-' + fmtNum(lo2 + width);
      }
      return o3;
    });
    return new State(rows2, S.fields, S.isEvents);
  };
  CMD.bucket = CMD.bin;
  CMD.discretize = CMD.bin;

  function niceWidth(w) {
    if (!isFinite(w) || w <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(w) / Math.LN10));
    var norm = w / mag;
    var mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return mult * mag;
  }
  function fmtNum(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000); }

  function chartify(rows, rowField, colField, specs, opts, ctx) {
    var limit = opts.limit !== undefined ? Number(opts.limit) : 10;
    var useOther = boolOpt(opts.useother, true);
    var useNull = boolOpt(opts.usenull, true);
    var otherStr = opts.otherstr || 'OTHER';
    var nullStr = opts.nullstr || 'NULL';
    var spec = specs[0];

    if (!colField) {
      var groups = groupBy(rows, [rowField]);
      var out = groups.map(function (g) {
        var o = {};
        o[rowField] = g.sample[rowField];
        specs.forEach(function (sp) { var v = aggValue(sp, g.rows, ctx); if (!isNull(v)) o[aggName(sp)] = v; });
        return o;
      });
      return { rows: out, cols: [rowField].concat(specs.map(aggName)), series: specs.map(aggName) };
    }

    // rank the split-by values by total
    var totals = {};
    rows.forEach(function (r) {
      var k = isNull(r[colField]) ? nullStr : toStr(r[colField]);
      totals[k] = (totals[k] || 0) + 1;
    });
    var keys = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
    var kept = limit > 0 ? keys.slice(0, limit) : keys;
    var dropped = keys.filter(function (k) { return kept.indexOf(k) < 0; });
    var series = kept.slice();
    if (dropped.length && useOther) series.push(otherStr);

    var rowGroups = groupBy(rows, [rowField]);
    var out2 = rowGroups.map(function (g) {
      var o = {};
      o[rowField] = g.sample[rowField];
      var bySeries = {};
      g.rows.forEach(function (r) {
        var k = isNull(r[colField]) ? nullStr : toStr(r[colField]);
        if (!useNull && k === nullStr) return;
        if (kept.indexOf(k) < 0) { if (!useOther) return; k = otherStr; }
        (bySeries[k] = bySeries[k] || []).push(r);
      });
      series.forEach(function (s) {
        var v = bySeries[s] ? aggValue(spec, bySeries[s], ctx) : null;
        o[s] = isNull(v) ? 0 : v;
      });
      return o;
    });
    return { rows: out2, cols: [rowField].concat(series), series: series };
  }

  CMD.chart = function (S, arg, ctx) {
    var o = takeOptions(arg, ['limit', 'useother', 'usenull', 'otherstr', 'nullstr', 'sep', 'span', 'cont', 'agg']);
    var parts = splitByClause(o.restStr);
    var specs = parseAggs(parts.head);
    if (!specs.length) err('chart needs a function, e.g. | chart count by status');
    var rowField, colField = null;
    if (parts.over) { rowField = parts.over; colField = parts.by[0] || null; }
    else { rowField = parts.by[0]; colField = parts.by[1] || null; }
    if (!rowField) err('chart needs "over <field>" or "by <field>"');

    var rows = S.rows;
    if (o.opts.span && rowField === '_time') {
      rows = CMD.bin(new State(rows, null, S.isEvents), 'span=' + o.opts.span + ' _time', ctx).rows;
    }
    var r = chartify(rows, rowField, colField, specs, o.opts, ctx);
    var st = new State(r.rows, r.cols, false);
    st.chart = { x: rowField, series: r.series };
    st.rows.sort(function (a, b) { return cmp(a[rowField], b[rowField]); });
    return st;
  };

  CMD.timechart = function (S, arg, ctx) {
    var o = takeOptions(arg, ['span', 'bins', 'limit', 'useother', 'usenull', 'otherstr', 'nullstr', 'cont', 'fixedrange', 'partial', 'sep', 'format']);
    var parts = splitByClause(o.restStr);
    var specs = parseAggs(parts.head);
    if (!specs.length) err('timechart needs a function, e.g. | timechart span=1h count');
    var colField = parts.by[0] || null;

    var times = S.rows.map(function (r) { return numeric(r._time); }).filter(function (x) { return x !== undefined; });
    var lo = times.length ? Math.min.apply(null, times) : ctx.earliest;
    var hi = times.length ? Math.max.apply(null, times) : ctx.latest;
    if (ctx.earliest !== null && ctx.earliest !== undefined) lo = Math.min(lo, ctx.earliest);
    if (ctx.latest !== null && ctx.latest !== undefined) hi = Math.max(hi, ctx.latest);
    var span = o.opts.span ? parseSpan(o.opts.span)
             : (o.opts.bins ? { secs: Math.max(1, Math.round((hi - lo) / Number(o.opts.bins))) } : autoSpan(lo, hi));
    ctx.spanSecs = span.secs;

    var binned = S.rows.map(function (r) {
      var x = shallow(r);
      var t = numeric(r._time);
      if (t !== undefined) x._time = snapTime(t, span);
      return x;
    });
    var r2 = chartify(binned, '_time', colField, specs, o.opts, ctx);

    // fill empty buckets so the chart is continuous
    if (boolOpt(o.opts.cont, true) && binned.length) {
      var have = {};
      r2.rows.forEach(function (row) { have[row._time] = row; });
      var start = snapTime(lo, span), end = snapTime(hi, span), filled = [];
      var guard = 0;
      for (var t = start; t <= end && guard < 5000; guard++) {
        if (have[t]) filled.push(have[t]);
        else {
          var blank = { _time: t };
          r2.series.forEach(function (s) { blank[s] = 0; });
          if (!colField) specs.forEach(function (sp) { blank[aggName(sp)] = 0; });
          filled.push(blank);
        }
        if (span.months) { var d = new Date(t * 1000); d.setMonth(d.getMonth() + span.months); t = Math.floor(d.getTime() / 1000); }
        else t += span.secs;
      }
      r2.rows = filled;
    }
    r2.rows.sort(function (a, b) { return a._time - b._time; });
    var st = new State(r2.rows, r2.cols, false);
    st.chart = { x: '_time', series: r2.series.length ? r2.series : specs.map(aggName), time: true, span: span.secs };
    return st;
  };

  /* ---------- totals & reshaping ---------- */

  CMD.addtotals = function (S, arg, ctx) {
    var o = takeOptions(arg, ['row', 'col', 'fieldname', 'labelfield', 'label']);
    var doRow = boolOpt(o.opts.row, true), doCol = boolOpt(o.opts.col, false);
    var name = o.opts.fieldname || 'Total';
    var cols = o.rest.length ? expandFields(o.rest.map(unquote), allFieldsOf(S.rows))
                             : S.cols().filter(function (f) { return f.charAt(0) !== '_'; });
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      if (doRow) {
        var sum = 0, any = false;
        cols.forEach(function (f) { var n = numeric(r[f]); if (n !== undefined) { sum += n; any = true; } });
        x[name] = any ? sum : 0;
      }
      return x;
    });
    var fields = S.fields ? S.fields.slice() : null;
    if (fields && doRow && fields.indexOf(name) < 0) fields.push(name);
    var st = new State(rows, fields, S.isEvents);
    if (doCol) return CMD.addcoltotals(st, 'labelfield=' + (o.opts.labelfield || '') + ' label=' + (o.opts.label || 'Total'), ctx);
    return st;
  };

  CMD.addcoltotals = function (S, arg) {
    var o = takeOptions(arg, ['labelfield', 'label']);
    var label = o.opts.label || 'Total';
    var cols = o.rest.length ? expandFields(o.rest.map(unquote), allFieldsOf(S.rows))
                             : S.cols().filter(function (f) { return f.charAt(0) !== '_'; });
    var total = {};
    cols.forEach(function (f) {
      var sum = null;
      S.rows.forEach(function (r) { var n = numeric(r[f]); if (n !== undefined) sum = (sum === null ? 0 : sum) + n; });
      if (sum !== null) total[f] = sum;
    });
    if (o.opts.labelfield) total[o.opts.labelfield] = label;
    return new State(S.rows.concat([total]), S.fields, false);
  };

  CMD.transpose = function (S, arg) {
    var o = takeOptions(arg, ['header_field', 'column_name', 'include_empty']);
    var list = o.rest, limit = list.length && /^\d+$/.test(list[0]) ? Number(list[0]) : 5;
    var colName = o.opts.column_name || 'column';
    var cols = S.cols();
    var src = S.rows.slice(0, limit);
    var headers = src.map(function (r, i) { return o.opts.header_field ? toStr(r[o.opts.header_field]) : 'row ' + (i + 1); });
    var rows = cols.filter(function (c) { return c !== o.opts.header_field; }).map(function (c) {
      var row = {};
      row[colName] = c;
      src.forEach(function (r, i) { row[headers[i]] = r[c]; });
      return row;
    });
    return new State(rows, [colName].concat(headers), false);
  };

  CMD.xyseries = function (S, arg, ctx) {
    var o = takeOptions(arg, ['grouped', 'sep', 'format']);
    var list = o.rest.map(unquote);
    if (list.length < 3) err('xyseries needs <x-field> <series-field> <value-field>');
    var x = list[0], s = list[1], v = list[2];
    var groups = groupBy(S.rows, [x]);
    var seriesNames = [];
    S.rows.forEach(function (r) { var k = toStr(r[s]); if (seriesNames.indexOf(k) < 0) seriesNames.push(k); });
    seriesNames.sort();
    var rows = groups.map(function (g) {
      var o2 = {};
      o2[x] = g.sample[x];
      g.rows.forEach(function (r) { o2[toStr(r[s])] = r[v]; });
      return o2;
    });
    var st = new State(rows, [x].concat(seriesNames), false);
    st.chart = { x: x, series: seriesNames };
    return st;
  };

  CMD.untable = function (S, arg) {
    var list = atoms(arg).map(unquote);
    if (list.length < 3) err('untable needs <x-field> <series-name-field> <value-field>');
    var x = list[0], sName = list[1], vName = list[2];
    var cols = S.cols().filter(function (c) { return c !== x; });
    var rows = [];
    S.rows.forEach(function (r) {
      cols.forEach(function (c) {
        if (isNull(r[c])) return;
        var o = {};
        o[x] = r[x]; o[sName] = c; o[vName] = r[c];
        rows.push(o);
      });
    });
    return new State(rows, [x, sName, vName], false);
  };

  /* ---------- extraction ---------- */

  CMD.rex = function (S, arg, ctx) {
    var o = takeOptions(arg, ['field', 'max_match', 'offset_field', 'mode']);
    var field = o.opts.field || '_raw';
    var pat = unquote(o.rest.join(' '));
    if (!pat) err('rex needs a regular expression in quotes');

    if ((o.opts.mode || '').toLowerCase() === 'sed') {
      var sm = /^s\/((?:\\.|[^\/])*)\/((?:\\.|[^\/])*)\/([gi0-9]*)$/.exec(pat);
      if (sm) {
        var flags = sm[3].indexOf('g') >= 0 ? 'g' : '';
        if (sm[3].indexOf('i') >= 0) flags += 'i';
        var re = L.toRegExp(sm[1], flags);
        var repl = sm[2].replace(/\\(\d)/g, '$$$1');
        return new State(S.rows.map(function (r) {
          var x = shallow(r);
          if (!isNull(x[field])) x[field] = toStr(x[field]).replace(re, repl);
          return x;
        }), S.fields, S.isEvents);
      }
      var ym = /^y\/([^\/]*)\/([^\/]*)\/$/.exec(pat);
      if (ym) {
        return new State(S.rows.map(function (r) {
          var x = shallow(r);
          if (!isNull(x[field])) x[field] = toStr(x[field]).split('').map(function (ch) {
            var i = ym[1].indexOf(ch); return i >= 0 ? ym[2][i] : ch;
          }).join('');
          return x;
        }), S.fields, S.isEvents);
      }
      err('rex mode=sed expects s/old/new/ or y/abc/xyz/');
    }

    var maxMatch = o.opts.max_match !== undefined ? Number(o.opts.max_match) : 1;
    var rx = L.toRegExp(pat, maxMatch === 1 ? '' : 'g');
    var names = (pat.match(/\(\?P?<([A-Za-z_][A-Za-z0-9_]*)>/g) || [])
      .map(function (s) { return /<([A-Za-z_][A-Za-z0-9_]*)>/.exec(s)[1]; });
    if (!names.length) ctx.warnings.push('rex found no named capture groups. Use (?<name>...) to create a field.');

    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      var subject = toStr(r[field]);
      if (maxMatch === 1) {
        var m = rx.exec(subject);
        if (m && m.groups) names.forEach(function (n) { if (m.groups[n] !== undefined) x[n] = m.groups[n]; });
      } else {
        var collected = {}, m2, count = 0;
        rx.lastIndex = 0;
        while ((m2 = rx.exec(subject)) !== null && (maxMatch === 0 || count < maxMatch)) {
          if (m2[0] === '') { rx.lastIndex++; continue; }
          names.forEach(function (n) {
            if (m2.groups && m2.groups[n] !== undefined) (collected[n] = collected[n] || []).push(m2.groups[n]);
          });
          count++;
        }
        names.forEach(function (n) {
          if (collected[n]) x[n] = collected[n].length === 1 ? collected[n][0] : collected[n];
        });
      }
      return x;
    });
    var fields = S.fields ? S.fields.concat(names.filter(function (n) { return S.fields.indexOf(n) < 0; })) : null;
    return new State(rows, fields, S.isEvents);
  };

  CMD.extract = function (S, arg) {
    var o = takeOptions(arg, ['pairdelim', 'kvdelim']);
    var pd = o.opts.pairdelim || ' ', kd = o.opts.kvdelim || '=';
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      toStr(r._raw).split(new RegExp('[' + pd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']')).forEach(function (p) {
        var i = p.indexOf(kd);
        if (i > 0) x[p.slice(0, i).trim()] = unquote(p.slice(i + 1).trim());
      });
      return x;
    });
    return new State(rows, null, S.isEvents);
  };
  CMD.kv = CMD.extract;

  CMD.spath = function (S, arg, ctx) {
    var o = takeOptions(arg, ['input', 'output', 'path']);
    var input = o.opts.input || '_raw';
    var path = o.opts.path || (o.rest.length ? unquote(o.rest[0]) : null);
    var output = o.opts.output || (o.rest.length > 1 && /^output$/i.test(o.rest[0]) ? unquote(o.rest[1]) : null) || path;
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      var src = toStr(r[input]);
      var obj;
      try { obj = JSON.parse(src); } catch (e) { return x; }
      if (path) {
        var v = L.jsonPath(obj, path);
        if (!isNull(v)) x[output] = v;
      } else {
        flattenJson(obj, '', x);
      }
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  function flattenJson(obj, prefix, out) {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      obj.forEach(function (v) {
        if (v !== null && typeof v === 'object') flattenJson(v, prefix + '{}', out);
        else {
          var k = prefix + '{}';
          if (out[k] === undefined) out[k] = v;
          else out[k] = (isMV(out[k]) ? out[k] : [out[k]]).concat([v]);
        }
      });
      return;
    }
    if (typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) {
        var p = prefix ? prefix + '.' + k : k;
        var v = obj[k];
        if (v !== null && typeof v === 'object') flattenJson(v, p, out);
        else if (v !== null && v !== undefined) {
          if (out[p] === undefined) out[p] = v;
          else out[p] = (isMV(out[p]) ? out[p] : [out[p]]).concat([v]);
        }
      });
    }
  }

  /* ---------- multivalue ---------- */

  CMD.makemv = function (S, arg) {
    var o = takeOptions(arg, ['delim', 'tokenizer', 'allowempty', 'setsv']);
    var field = o.rest.length ? unquote(o.rest[0]) : null;
    if (!field) err('makemv needs a field name');
    var delim = o.opts.delim !== undefined ? o.opts.delim : ' ';
    var tok = o.opts.tokenizer ? L.toRegExp(o.opts.tokenizer, 'g') : null;
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      if (isNull(x[field])) return x;
      var s = toStr(x[field]), parts;
      if (tok) {
        parts = []; var m; tok.lastIndex = 0;
        while ((m = tok.exec(s)) !== null) { parts.push(m[1] !== undefined ? m[1] : m[0]); if (m[0] === '') tok.lastIndex++; }
      } else parts = s.split(delim);
      if (!boolOpt(o.opts.allowempty, false)) parts = parts.filter(function (p) { return p !== ''; });
      x[field] = parts.length === 1 ? parts[0] : parts;
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  CMD.nomv = function (S, arg) {
    var field = unquote(arg.trim());
    return new State(S.rows.map(function (r) {
      var x = shallow(r);
      if (isMV(x[field])) x[field] = x[field].map(toStr).join(' ');
      return x;
    }), S.fields, S.isEvents);
  };

  CMD.mvexpand = function (S, arg) {
    var o = takeOptions(arg, ['limit']);
    var field = o.rest.length ? unquote(o.rest[0]) : null;
    if (!field) err('mvexpand needs a field name');
    var limit = o.opts.limit ? Number(o.opts.limit) : 0;
    var rows = [];
    S.rows.forEach(function (r) {
      var v = r[field];
      if (!isMV(v)) { rows.push(r); return; }
      var list = limit > 0 ? v.slice(0, limit) : v;
      list.forEach(function (item) {
        var x = shallow(r);
        x[field] = item;
        rows.push(x);
      });
    });
    return new State(rows, S.fields, S.isEvents);
  };

  CMD.mvcombine = function (S, arg) {
    var o = takeOptions(arg, ['delim']);
    var field = o.rest.length ? unquote(o.rest[0]) : null;
    if (!field) err('mvcombine needs a field name');
    var others = S.cols().filter(function (f) { return f !== field; });
    var groups = groupBy(S.rows, others);
    var rows = groups.map(function (g) {
      var x = shallow(g.sample);
      var vals = [];
      g.rows.forEach(function (r) {
        var v = r[field];
        if (isNull(v)) return;
        (isMV(v) ? v : [v]).forEach(function (y) { if (vals.indexOf(y) < 0) vals.push(y); });
      });
      if (vals.length) x[field] = vals.length === 1 ? vals[0] : (o.opts.delim ? vals.join(o.opts.delim) : vals);
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  /* ---------- lookups ---------- */

  CMD.lookup = function (S, arg, ctx) {
    var list = atoms(arg);
    if (!list.length) err('lookup needs a lookup table name');
    var name = unquote(list[0]);
    var table = ctx.lookups[name];
    if (!table) err('Lookup table "' + name + '" not found. Available: ' + Object.keys(ctx.lookups).join(', '));
    var i = 1, inputs = [], outputs = null, outputNew = false;
    while (i < list.length) {
      var t = list[i];
      if (/^output$/i.test(t) || /^outputnew$/i.test(t)) { outputNew = /^outputnew$/i.test(t); outputs = []; i++; continue; }
      var pair = { from: unquote(t), to: unquote(t) };
      if (i + 2 < list.length && /^as$/i.test(list[i + 1])) { pair.to = unquote(list[i + 2]); i += 3; }
      else i += 1;
      if (outputs === null) inputs.push(pair); else outputs.push(pair);
    }
    if (!inputs.length) err('lookup needs at least one match field');

    var idx = {};
    table.forEach(function (row) {
      var k = inputs.map(function (p) { return toStr(row[p.from]).toLowerCase(); }).join('');
      if (!idx[k]) idx[k] = row;
    });
    var tableCols = Object.keys(table[0] || {});
    var outCols = outputs && outputs.length ? outputs
      : tableCols.filter(function (c) { return !inputs.some(function (p) { return p.from === c; }); })
                 .map(function (c) { return { from: c, to: c }; });

    var rows = S.rows.map(function (r) {
      var k = inputs.map(function (p) { return toStr(r[p.to]).toLowerCase(); }).join('');
      var hit = idx[k];
      var x = shallow(r);
      if (hit) outCols.forEach(function (p) {
        if (outputNew && !isNull(x[p.to])) return;
        if (hit[p.from] !== undefined) x[p.to] = hit[p.from];
      });
      return x;
    });
    var newCols = outCols.map(function (p) { return p.to; });
    var fields = S.fields ? S.fields.concat(newCols.filter(function (c) { return S.fields.indexOf(c) < 0; })) : null;
    return new State(rows, fields, S.isEvents);
  };

  CMD.inputlookup = function (S, arg, ctx) {
    var o = takeOptions(arg, ['append', 'max', 'start']);
    var list = o.rest, name = null, whereExpr = null;
    for (var i = 0; i < list.length; i++) {
      if (/^where$/i.test(list[i])) { whereExpr = list.slice(i + 1).join(' '); break; }
      if (!name) name = unquote(list[i]);
    }
    if (!name) err('inputlookup needs a table name. Available: ' + Object.keys(ctx.lookups).join(', '));
    var table = ctx.lookups[name];
    if (!table) err('Lookup table "' + name + '" not found. Available: ' + Object.keys(ctx.lookups).join(', '));
    var rows = table.map(shallow);
    var cols = Object.keys(table[0] || {});
    var st = new State(rows, cols, false);
    if (whereExpr) st = CMD.where(st, whereExpr, ctx);
    if (boolOpt(o.opts.append, false)) return new State(S.rows.concat(st.rows), null, false);
    return st;
  };

  CMD.outputlookup = function (S, arg, ctx) {
    ctx.warnings.push('outputlookup is accepted but writes nothing in the playground.');
    return S;
  };

  /* ---------- generating ---------- */

  CMD.makeresults = function (S, arg, ctx) {
    var o = takeOptions(arg, ['count', 'annotate', 'splunk_server', 'format', 'data']);
    var n = o.opts.count !== undefined ? Number(o.opts.count) : 1;
    var rows = [];
    for (var i = 0; i < n; i++) {
      var r = { _time: ctx.now };
      if (boolOpt(o.opts.annotate, false)) { r.splunk_server = 'playground'; r._raw = ''; r.host = 'playground'; r.source = 'makeresults'; r.sourcetype = 'makeresults'; }
      rows.push(r);
    }
    return new State(rows, ['_time'], false);
  };

  CMD.gentimes = function (S, arg, ctx) {
    var o = takeOptions(arg, ['start', 'end', 'increment']);
    if (o.opts.start === undefined) err('gentimes needs start=');
    var inc = o.opts.increment ? parseSpan(o.opts.increment).secs : 86400;
    var start = L.relativeTime(ctx.now, o.opts.start);
    var end = o.opts.end !== undefined ? L.relativeTime(ctx.now, o.opts.end) : ctx.now;
    var rows = [], guard = 0;
    for (var t = start; t <= end && guard < 10000; t += inc, guard++) {
      rows.push({ starttime: t, starthuman: L.strftime(t, '%a %b %e %H:%M:%S %Y'), endtime: t + inc - 1, endhuman: L.strftime(t + inc - 1, '%a %b %e %H:%M:%S %Y') });
    }
    return new State(rows, ['starttime', 'starthuman', 'endtime', 'endhuman'], false);
  };

  CMD.eventcount = function (S, arg, ctx) {
    var o = takeOptions(arg, ['index', 'summarize', 'report_size']);
    var counts = {};
    ctx.allEvents.forEach(function (e) { counts[e.index] = (counts[e.index] || 0) + 1; });
    var rows = Object.keys(counts).sort().map(function (k) { return { index: k, count: counts[k] }; });
    return new State(rows, ['index', 'count'], false);
  };

  CMD.metadata = function (S, arg, ctx) {
    var o = takeOptions(arg, ['type', 'index']);
    var type = o.opts.type || 'sourcetypes';
    var key = type === 'hosts' ? 'host' : type === 'sources' ? 'source' : 'sourcetype';
    var m = {};
    ctx.allEvents.forEach(function (e) {
      var k = e[key];
      if (!m[k]) m[k] = { totalCount: 0, firstTime: Infinity, lastTime: -Infinity };
      m[k].totalCount++;
      m[k].firstTime = Math.min(m[k].firstTime, e._time);
      m[k].lastTime = Math.max(m[k].lastTime, e._time);
    });
    var rows = Object.keys(m).sort().map(function (k) {
      var o2 = {}; o2[key] = k;
      o2.totalCount = m[k].totalCount; o2.firstTime = m[k].firstTime; o2.lastTime = m[k].lastTime;
      o2.recentTime = m[k].lastTime;
      return o2;
    });
    return new State(rows, [key, 'totalCount', 'firstTime', 'lastTime', 'recentTime'], false);
  };

  /* ---------- joining ---------- */

  CMD.append = function (S, arg, ctx) {
    var sub = extractSubsearch(arg, 'append');
    var res = runPipeline(sub, Object.assign({}, ctx, { depth: ctx.depth + 1 }));
    return new State(S.rows.concat(res.rows), null, S.isEvents);
  };

  CMD.appendpipe = function (S, arg, ctx) {
    var sub = extractSubsearch(arg, 'appendpipe');
    var res = runOnRows(sub, S, ctx);
    return new State(S.rows.concat(res.rows), null, S.isEvents);
  };

  CMD.appendcols = function (S, arg, ctx) {
    var sub = extractSubsearch(arg, 'appendcols');
    var res = runPipeline(sub, Object.assign({}, ctx, { depth: ctx.depth + 1 }));
    var rows = S.rows.map(function (r, i) {
      var x = shallow(r);
      if (res.rows[i]) for (var k in res.rows[i]) if (Object.prototype.hasOwnProperty.call(res.rows[i], k)) x[k] = res.rows[i][k];
      return x;
    });
    return new State(rows, null, S.isEvents);
  };

  CMD.join = function (S, arg, ctx) {
    var o = takeOptions(arg, ['type', 'max', 'usetime', 'overwrite', 'earlier']);
    var subStart = arg.indexOf('[');
    if (subStart < 0) err('join needs a subsearch in [ ]');
    var fieldPart = arg.slice(0, subStart);
    var keys = atoms(fieldPart).map(unquote).filter(function (a) { return !/^(type|max|usetime|overwrite|earlier)=/.test(a); });
    var sub = extractSubsearch(arg, 'join');
    var res = runPipeline(sub, Object.assign({}, ctx, { depth: ctx.depth + 1 }));
    if (!keys.length) {
      var lf = S.cols(), rf = allFieldsOf(res.rows);
      keys = lf.filter(function (f) { return rf.indexOf(f) >= 0 && f.charAt(0) !== '_'; });
    }
    if (!keys.length) err('join could not determine a field to join on');
    var idx = {};
    res.rows.forEach(function (r) {
      var k = keys.map(function (f) { return toStr(r[f]); }).join('');
      if (!idx[k]) idx[k] = r;
    });
    var type = (o.opts.type || 'inner').toLowerCase();
    var rows = [];
    S.rows.forEach(function (r) {
      var k = keys.map(function (f) { return toStr(r[f]); }).join('');
      var hit = idx[k];
      if (!hit) { if (type === 'left' || type === 'outer') rows.push(r); return; }
      var x = shallow(r);
      for (var f in hit) if (Object.prototype.hasOwnProperty.call(hit, f) && f.charAt(0) !== '_') x[f] = hit[f];
      rows.push(x);
    });
    return new State(rows, null, S.isEvents);
  };

  CMD.set = function (S, arg, ctx) {
    var list = atoms(arg);
    var op = (list[0] || '').toLowerCase();
    var brackets = [];
    var re = /\[([\s\S]*?)\]/g, m;
    var depth = 0, start = -1;
    for (var i = 0; i < arg.length; i++) {
      if (arg[i] === '[') { if (depth === 0) start = i; depth++; }
      if (arg[i] === ']') { depth--; if (depth === 0) brackets.push(arg.slice(start + 1, i)); }
    }
    if (brackets.length !== 2) err('set needs two subsearches: | set union [search a] [search b]');
    var a = runPipeline(brackets[0], Object.assign({}, ctx, { depth: ctx.depth + 1 })).rows;
    var b = runPipeline(brackets[1], Object.assign({}, ctx, { depth: ctx.depth + 1 })).rows;
    var key = function (r) { return JSON.stringify(r); };
    var bk = {}; b.forEach(function (r) { bk[key(r)] = 1; });
    var out;
    if (op === 'union') {
      var seen = {}; out = [];
      a.concat(b).forEach(function (r) { var k = key(r); if (!seen[k]) { seen[k] = 1; out.push(r); } });
    } else if (op === 'diff') {
      var ak = {}; a.forEach(function (r) { ak[key(r)] = 1; });
      out = a.filter(function (r) { return !bk[key(r)]; }).concat(b.filter(function (r) { return !ak[key(r)]; }));
    } else if (op === 'intersect') {
      out = a.filter(function (r) { return bk[key(r)]; });
    } else err('set needs union, diff or intersect');
    return new State(out, null, false);
  };

  function extractSubsearch(arg, name) {
    var start = arg.indexOf('[');
    if (start < 0) err(name + ' needs a subsearch in [ ]');
    var depth = 0, q = null;
    for (var i = start; i < arg.length; i++) {
      var c = arg[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '[') depth++;
      if (c === ']') { depth--; if (depth === 0) return arg.slice(start + 1, i).trim(); }
    }
    err(name + ' has an unbalanced [ ]');
  }

  /* ---------- transactions ---------- */

  CMD.transaction = function (S, arg, ctx) {
    var o = takeOptions(arg, ['maxspan', 'maxpause', 'maxevents', 'startswith', 'endswith', 'keepevicted', 'mvlist', 'delim', 'unifyends', 'keeporphans']);
    var fields = o.rest.map(unquote);
    var maxspan = o.opts.maxspan ? parseSpan(o.opts.maxspan).secs : Infinity;
    var maxpause = o.opts.maxpause ? parseSpan(o.opts.maxpause).secs : Infinity;
    var maxevents = o.opts.maxevents ? Number(o.opts.maxevents) : Infinity;
    var startAst = o.opts.startswith ? parseSearch(o.opts.startswith, ctx) : null;
    var endAst = o.opts.endswith ? parseSearch(o.opts.endswith, ctx) : null;

    // work oldest-first
    var rows = S.rows.slice().sort(function (a, b) { return (numeric(a._time) || 0) - (numeric(b._time) || 0); });
    var open = {}, done = [];

    function close(key) {
      if (open[key]) { done.push(open[key]); delete open[key]; }
    }
    rows.forEach(function (r) {
      var key = fields.length ? groupKey(r, fields) : '__all__';
      if (fields.length && fields.some(function (f) { return isNull(r[f]); })) { return; }
      var t = numeric(r._time) || 0;
      var grp = open[key];
      if (grp) {
        if (t - grp.start > maxspan || t - grp.last > maxpause || grp.events.length >= maxevents ||
            (startAst && matchNodeFixed(startAst, r))) {
          close(key); grp = null;
        }
      }
      if (!grp) {
        if (startAst && !matchNodeFixed(startAst, r)) { /* still start a group so orphans survive */ }
        grp = open[key] = { start: t, last: t, events: [] };
      }
      grp.events.push(r);
      grp.last = t;
      if (endAst && matchNodeFixed(endAst, r)) close(key);
    });
    Object.keys(open).forEach(close);

    var out = done.map(function (g) {
      var first = g.events[0];
      var o2 = { _time: first._time, duration: g.last - g.start, eventcount: g.events.length };
      var mergeFields = {};
      g.events.forEach(function (e) {
        Object.keys(e).forEach(function (k) {
          if (k === '_raw' || k === '_time' || k.charAt(0) === '_') return;
          (mergeFields[k] = mergeFields[k] || []).push(e[k]);
        });
      });
      Object.keys(mergeFields).forEach(function (k) {
        var seen = {}, vals = [];
        mergeFields[k].forEach(function (v) {
          (isMV(v) ? v : [v]).forEach(function (x) { var s = toStr(x); if (!seen[s]) { seen[s] = 1; vals.push(x); } });
        });
        o2[k] = vals.length === 1 ? vals[0] : vals;
      });
      o2._raw = g.events.map(function (e) { return toStr(e._raw); });
      if (o2._raw.length === 1) o2._raw = o2._raw[0];
      return o2;
    });
    out.sort(function (a, b) { return b._time - a._time; });
    return new State(out, null, true);
  };

  /* ---------- conversions / enrichment ---------- */

  CMD.convert = function (S, arg, ctx) {
    var o = takeOptions(arg, ['timeformat']);
    var tf = o.opts.timeformat || '%m/%d/%Y %H:%M:%S';
    var list = o.rest, specs = [], i = 0;
    while (i < list.length) {
      var m = /^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/.exec(list[i]);
      if (!m) { i++; continue; }
      var spec = { fn: m[1].toLowerCase(), field: unquote(m[2]), alias: unquote(m[2]) };
      i++;
      if (i < list.length && /^as$/i.test(list[i])) { spec.alias = unquote(list[i + 1]); i += 2; }
      specs.push(spec);
    }
    if (!specs.length) err('convert needs a function, e.g. | convert ctime(_time) AS time');
    var rows = S.rows.map(function (r) {
      var x = shallow(r);
      specs.forEach(function (s) {
        var v = r[s.field];
        if (v === undefined) return;
        switch (s.fn) {
          case 'ctime': x[s.alias] = L.strftime(v, tf); break;
          case 'mktime': x[s.alias] = L.strptime(v, tf); break;
          case 'num': { var n = numeric(String(v).replace(/[^0-9.eE+-]/g, '')); if (n !== undefined) x[s.alias] = n; else delete x[s.alias]; break; }
          case 'auto': { var a = numeric(v); x[s.alias] = a !== undefined ? a : v; break; }
          case 'rmcomma': x[s.alias] = numeric(toStr(v).replace(/,/g, '')); break;
          case 'rmunit': { var mm = /^\s*([+-]?[\d.]+)/.exec(toStr(v)); if (mm) x[s.alias] = Number(mm[1]); break; }
          case 'dur2sec': {
            var p = toStr(v).split(':').map(Number).reverse(), sec = 0;
            for (var k = 0; k < p.length; k++) sec += (p[k] || 0) * Math.pow(60, k);
            x[s.alias] = sec; break;
          }
          case 'memk': {
            var mk = /^\s*([\d.]+)\s*([kmg]?)/i.exec(toStr(v));
            if (mk) x[s.alias] = Number(mk[1]) * ({ '': 1, k: 1, m: 1024, g: 1048576 }[(mk[2] || '').toLowerCase()]);
            break;
          }
          case 'none': break;
          default: err('convert does not support "' + s.fn + '()"');
        }
      });
      return x;
    });
    return new State(rows, S.fields, S.isEvents);
  };

  CMD.rangemap = function (S, arg) {
    var list = atoms(arg), field = null, dflt = 'None', ranges = [];
    list.forEach(function (a) {
      var m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(a);
      if (!m) return;
      var k = m[1], v = unquote(m[2]);
      if (k === 'field') { field = v; return; }
      if (k === 'default') { dflt = v; return; }
      var parts = v.split('-');
      if (parts.length >= 2) {
        var lo = Number(parts[0]), hi = Number(parts.slice(1).join('-'));
        ranges.push({ name: k, lo: lo, hi: hi });
      }
    });
    if (!field) err('rangemap needs field=<name>');
    var rows = S.rows.map(function (r) {
      var x = shallow(r), n = numeric(r[field]);
      var hits = [];
      if (n !== undefined) ranges.forEach(function (rg) { if (n >= rg.lo && n <= rg.hi) hits.push(rg.name); });
      x.range = hits.length === 0 ? dflt : (hits.length === 1 ? hits[0] : hits);
      return x;
    });
    var fields = S.fields ? S.fields.concat(S.fields.indexOf('range') < 0 ? ['range'] : []) : null;
    return new State(rows, fields, S.isEvents);
  };

  CMD.iplocation = function (S, arg, ctx) {
    var o = takeOptions(arg, ['prefix', 'allfields', 'lang']);
    var field = o.rest.length ? unquote(o.rest[0]) : 'clientip';
    var prefix = o.opts.prefix || '';
    var rows = S.rows.map(function (r) {
      var x = shallow(r), ip = toStr(r[field]);
      var blk = null;
      for (var i = 0; i < ctx.geoBlocks.length; i++) if (ip.indexOf(ctx.geoBlocks[i].prefix) === 0) { blk = ctx.geoBlocks[i]; break; }
      if (blk) {
        x[prefix + 'City'] = blk.City;
        x[prefix + 'Country'] = blk.Country;
        x[prefix + 'Region'] = blk.Region;
        x[prefix + 'lat'] = blk.lat;
        x[prefix + 'lon'] = blk.lon;
      }
      return x;
    });
    return new State(rows, null, S.isEvents);
  };

  CMD.accum = function (S, arg) {
    var list = atoms(arg), field = unquote(list[0] || ''), alias = field;
    if (list.length > 2 && /^as$/i.test(list[1])) alias = unquote(list[2]);
    if (!field) err('accum needs a numeric field');
    var run = 0;
    return new State(S.rows.map(function (r) {
      var x = shallow(r), n = numeric(r[field]);
      if (n !== undefined) { run += n; x[alias] = run; }
      return x;
    }), null, S.isEvents);
  };

  CMD.delta = function (S, arg) {
    var o = takeOptions(arg, ['p']);
    var list = o.rest, field = unquote(list[0] || ''), alias = 'delta(' + field + ')';
    if (list.length > 2 && /^as$/i.test(list[1])) alias = unquote(list[2]);
    if (!field) err('delta needs a numeric field');
    var p = o.opts.p ? Number(o.opts.p) : 1;
    var hist = [];
    return new State(S.rows.map(function (r) {
      var x = shallow(r), n = numeric(r[field]);
      if (n !== undefined) {
        if (hist.length >= p) x[alias] = n - hist[hist.length - p];
        hist.push(n);
      }
      return x;
    }), null, S.isEvents);
  };

  CMD.abstract = function (S, arg) {
    var o = takeOptions(arg, ['maxterms', 'maxlines']);
    var maxlines = o.opts.maxlines ? Number(o.opts.maxlines) : 5;
    return new State(S.rows.map(function (r) {
      var x = shallow(r);
      x._raw = toStr(r._raw).split('\n').slice(0, maxlines).join('\n');
      return x;
    }), S.fields, S.isEvents);
  };

  CMD.fieldsummary = function (S, arg, ctx) {
    var cols = S.cols().filter(function (c) { return c !== '_raw'; });
    var rows = cols.map(function (f) {
      var vals = valuesOf(S.rows, f);
      var nums = numsOf(S.rows, f);
      var distinct = {};
      vals.forEach(function (v) { distinct[toStr(v)] = (distinct[toStr(v)] || 0) + 1; });
      var o = {
        field: f, count: vals.length, distinct_count: Object.keys(distinct).length,
        is_exact: 1, max: nums.length ? Math.max.apply(null, nums) : null,
        mean: nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : null,
        min: nums.length ? Math.min.apply(null, nums) : null,
        numeric_count: nums.length,
        stdev: AGGS.stdev(S.rows, f)
      };
      Object.keys(o).forEach(function (k) { if (o[k] === null) delete o[k]; });
      return o;
    });
    return new State(rows, ['field', 'count', 'distinct_count', 'is_exact', 'max', 'mean', 'min', 'numeric_count', 'stdev'], false);
  };

  CMD.multikv = function (S) { return S; };
  CMD.localop = function (S) { return S; };
  CMD.noop = function (S) { return S; };

  CMD.format = function (S, arg) {
    var terms = S.rows.slice(0, 100).map(function (r) {
      var parts = [];
      Object.keys(r).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        if (isNull(r[k])) return;
        parts.push('(' + k + '="' + toStr(r[k]) + '")');
      });
      return '(' + parts.join(' AND ') + ')';
    });
    return new State([{ search: '(' + terms.join(' OR ') + ')' }], ['search'], false);
  };

  CMD.return = function (S, arg) {
    var list = atoms(arg), count = 1, i = 0, specs = [];
    if (list.length && /^\d+$/.test(list[0])) { count = Number(list[0]); i = 1; }
    for (; i < list.length; i++) specs.push(list[i]);
    var rows = S.rows.slice(0, count).map(function (r) {
      var o = {};
      specs.forEach(function (s) {
        var m = /^([A-Za-z_][A-Za-z0-9_]*)=\$([A-Za-z_][A-Za-z0-9_]*)\$$/.exec(s);
        if (m) { o[m[1]] = r[m[2]]; return; }
        var f = s.replace(/^\$|\$$/g, '');
        o[f] = r[f];
      });
      if (!specs.length) { var k = Object.keys(r)[0]; o[k] = r[k]; }
      return o;
    });
    return new State(rows, null, false);
  };

  CMD.map = function (S, arg, ctx) {
    ctx.warnings.push('map runs the subsearch once per row; the playground caps it at 10 rows.');
    var sub = extractSubsearch(arg, 'map');
    var out = [];
    S.rows.slice(0, 10).forEach(function (r) {
      var expanded = sub.replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g, function (m, f) { return toStr(r[f]); });
      out = out.concat(runPipeline(expanded, Object.assign({}, ctx, { depth: ctx.depth + 1 })).rows);
    });
    return new State(out, null, false);
  };

  /* =====================================================================
     Aliases for commands users often try
     ===================================================================== */
  var ALIASES = { 'stats_': 'stats', 'timechart_': 'timechart' };

  /* =====================================================================
     Pipeline runner
     ===================================================================== */

  var GENERATING = ['inputlookup', 'makeresults', 'gentimes', 'eventcount', 'metadata', 'set', 'search'];

  function baseEvents(ctx) {
    return ctx.allEvents;
  }

  function runOnRows(spl, S, ctx) {
    var segs = splitPipeline(spl);
    var cur = S;
    for (var i = 0; i < segs.length; i++) cur = applySegment(segs[i], cur, ctx, i === 0);
    return cur;
  }

  function applySegment(seg, S, ctx, isFirst) {
    var m = /^([A-Za-z_][A-Za-z0-9_]*)\b([\s\S]*)$/.exec(seg);
    var name = m ? m[1].toLowerCase() : null;
    var rest = m ? m[2] : '';
    if (name && (CMD[name] || ALIASES[name])) {
      var fn = CMD[ALIASES[name] || name];
      ctx.currentCommand = name;
      return fn(S, rest, ctx);
    }
    if (isFirst) return CMD.search(S, seg, ctx);
    if (name) err('Unknown command "' + name + '". Type it into the Command reference panel to see what is supported.');
    err('Could not parse "' + seg + '"');
  }

  function expandMacros(spl, ctx) {
    var guard = 0;
    while (/`[^`]+`/.test(spl) && guard++ < 10) {
      spl = spl.replace(/`([^`]+)`/g, function (all, body) {
        var mm = /^([A-Za-z0-9_]+)(?:\(([\s\S]*)\))?$/.exec(body.trim());
        if (!mm) return all;
        var def = ctx.macros[mm[1]] || ctx.macros[mm[1] + '(' + (mm[2] ? splitTop(mm[2], ',').length : 0) + ')'];
        if (!def) err('Unknown macro `' + mm[1] + '`. Available: ' + Object.keys(ctx.macros).join(', '));
        var args = mm[2] ? splitTop(mm[2], ',').map(function (s) { return unquote(s.trim()); }) : [];
        return def.replace(/\$([A-Za-z0-9_]+)\$/g, function (a, key) {
          var idx = Number(key);
          return isFinite(idx) ? (args[idx - 1] !== undefined ? args[idx - 1] : '') : (a);
        });
      });
    }
    return spl;
  }

  function runPipeline(spl, ctx) {
    spl = expandMacros(spl.trim(), ctx);
    var segs = splitPipeline(spl);
    if (!segs.length) err('Empty search');

    var first = segs[0];
    var fm = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(first);
    var firstName = fm ? fm[1].toLowerCase() : '';
    var startsWithPipe = spl.charAt(0) === '|';
    var isGenerating = startsWithPipe && CMD[firstName] && firstName !== 'search';

    var S;
    var startIdx = 0;
    if (isGenerating) {
      S = new State([], null, false);
    } else {
      // base search
      var searchStr = first;
      if (firstName === 'search') searchStr = first.slice(6);
      var ast = parseSearch(searchStr, ctx);
      var e0 = ctx.searchEarliest !== undefined ? ctx.searchEarliest : ctx.earliest;
      var l0 = ctx.searchLatest !== undefined ? ctx.searchLatest : ctx.latest;
      ctx.effectiveEarliest = e0; ctx.effectiveLatest = l0;
      var src = baseEvents(ctx);
      var rows = [];
      for (var i = 0; i < src.length; i++) {
        var ev = src[i];
        if (e0 !== null && e0 !== undefined && ev._time < e0) continue;
        if (l0 !== null && l0 !== undefined && ev._time > l0) continue;
        if (matchNodeFixed(ast, ev)) rows.push(ev);
      }
      S = new State(rows, null, true);
      startIdx = 1;
    }
    for (var k = startIdx; k < segs.length; k++) {
      S = applySegment(segs[k], S, ctx, false);
      if (!S || !S.rows) err('Command "' + segs[k].split(/\s/)[0] + '" produced no result set');
    }
    return S;
  }

  /* Public entry point */
  function runSearch(spl, opts) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var ctx = {
      now: opts.now || Math.floor(Date.now() / 1000),
      earliest: opts.earliest === undefined ? null : opts.earliest,
      latest: opts.latest === undefined ? null : opts.latest,
      allEvents: opts.events,
      lookups: opts.lookups || {},
      geoBlocks: opts.geoBlocks || [],
      macros: opts.macros || {},
      knownIndexes: opts.knownIndexes || null,
      warnings: [],
      depth: 0
    };
    ctx.searchMatcher = function (searchStr, ev) {
      try { return matchNodeFixed(parseSearch(searchStr, ctx), ev); } catch (e) { return false; }
    };
    var S = runPipeline(spl, ctx);
    var elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return {
      rows: S.rows,
      fields: S.cols(),
      isEvents: S.isEvents,
      chart: S.chart,
      warnings: ctx.warnings,
      elapsed: elapsed,
      earliest: ctx.effectiveEarliest,
      latest: ctx.effectiveLatest
    };
  }

  global.SPLEngine = {
    runSearch: runSearch,
    splitPipeline: splitPipeline,
    parseSearch: parseSearch,
    matchSearch: matchNodeFixed,
    commands: CMD,
    aggs: AGGS
  };

})(typeof window !== 'undefined' ? window : this);

/* =========================================================================
   SPL Playground - user interface
   ========================================================================= */
(function () {
  'use strict';

  var L = window.SPLLang, E = window.SPLEngine, C = window.SPLContent;

  var DATA = null;
  var STATE = {
    result: null, error: null, tab: 'events', vizType: 'auto',
    range: '-24h', rightTab: 'reference', done: {}, popField: null
  };

  /* Categorical series colours: held at a similar lightness so no one series
     shouts, and kept off the green accent so "a series" never reads as "the UI". */
  var PALETTE = ['#3f7fd0', '#e2703a', '#8e5cd9', '#12a08f', '#d24d78',
                 '#c39a2e', '#5a7fa8', '#b4574b', '#7d8f3f', '#9a6b9e',
                 '#4a9bb5', '#8b7355'];

  var RANGES = [
    { v: 'all',   t: 'All time (7 days of data)' },
    { v: '-15m',  t: 'Last 15 minutes' },
    { v: '-60m',  t: 'Last 60 minutes' },
    { v: '-4h',   t: 'Last 4 hours' },
    { v: '-24h',  t: 'Last 24 hours' },
    { v: '-7d',   t: 'Last 7 days' },
    { v: '@d',    t: 'Today' },
    { v: 'yday',  t: 'Yesterday' },
    { v: '@w0',   t: 'Week to date' }
  ];

  /* ---------- tiny DOM helpers ---------- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function fmtInt(n) { return Number(n).toLocaleString('en-US'); }

  /* ---------- persistence ---------- */
  function save(k, v) { try { localStorage.setItem('splpg.' + k, JSON.stringify(v)); } catch (e) {} }
  function load(k, d) {
    try { var v = localStorage.getItem('splpg.' + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }

  /* ---------- time range ---------- */
  function rangeBounds(v) {
    var now = Math.floor(Date.now() / 1000);
    if (v === 'all') return { earliest: null, latest: null };
    if (v === 'yday') return { earliest: L.relativeTime(now, '-1d@d'), latest: L.relativeTime(now, '@d') };
    if (v === '@d') return { earliest: L.relativeTime(now, '@d'), latest: now };
    if (v === '@w0') return { earliest: L.relativeTime(now, '@w0'), latest: now };
    return { earliest: L.relativeTime(now, v), latest: now };
  }

  /* =====================================================================
     Search execution
     ===================================================================== */
  function currentQuery() { return $('#spl').value.trim(); }

  function runSearch() {
    var q = currentQuery();
    if (!q) { STATE.result = null; STATE.error = null; render(); return; }
    var b = rangeBounds(STATE.range);
    save('lastQuery', q); save('lastRange', STATE.range);
    try {
      STATE.result = E.runSearch(q, {
        events: DATA.events, lookups: DATA.lookups, geoBlocks: DATA.geoBlocks,
        macros: C.MACROS, earliest: b.earliest, latest: b.latest,
        knownIndexes: DATA.indexes
      });
      STATE.error = null;
      if (STATE.result.isEvents) STATE.tab = 'events';
      else if (STATE.tab === 'events') STATE.tab = 'stats';
    } catch (e) {
      STATE.result = null;
      STATE.error = e && e.message ? e.message : String(e);
    }
    STATE.popField = null;
    render();
  }

  function setQuery(q, run) {
    $('#spl').value = q;
    if (run !== false) runSearch();
    $('#spl').focus();
  }

  /* =====================================================================
     Rendering
     ===================================================================== */
  function render() {
    renderStatus();
    renderSidebar();
    renderTabs();
    renderBody();
  }

  function renderStatus() {
    var box = clear($('#status'));
    var r = STATE.result;
    if (STATE.error) {
      $('#errzone').innerHTML = '';
      $('#errzone').appendChild(el('div', { class: 'errbox' }, [
        el('strong', { text: 'Search error: ' }), STATE.error
      ]));
      box.appendChild(el('span', { text: 'No results' }));
      return;
    }
    $('#errzone').innerHTML = '';
    if (!r) { box.appendChild(el('span', { text: 'Enter a search and press Run.' })); return; }

    var n = r.rows.length;
    box.appendChild(el('span', {}, [el('b', { text: fmtInt(n) }), ' ' + (r.isEvents ? (n === 1 ? 'event' : 'events') : (n === 1 ? 'result' : 'results'))]));
    box.appendChild(el('span', {}, ['in ', el('b', { text: r.elapsed.toFixed(1) + ' ms' })]));
    var b = rangeBounds(STATE.range);
    var e0 = r.earliest !== undefined && r.earliest !== null ? r.earliest : b.earliest;
    var l0 = r.latest !== undefined && r.latest !== null ? r.latest : b.latest;
    if (e0) box.appendChild(el('span', { text: L.strftime(e0, '%b %d %H:%M') + '  →  ' + (l0 ? L.strftime(l0, '%b %d %H:%M') : 'now') }));
    else box.appendChild(el('span', { text: 'all time' }));

    if (r.warnings && r.warnings.length) {
      var w = el('div', { class: 'warnbox' });
      r.warnings.forEach(function (x) { w.appendChild(el('div', { text: x })); });
      $('#errzone').appendChild(w);
    }
  }

  function renderSidebar() {
    var sb = clear($('#sidebar'));
    var r = STATE.result;
    if (!r || !r.rows.length) return;
    var sample = r.rows.slice(0, 1500);
    var stats = {};
    sample.forEach(function (row) {
      Object.keys(row).forEach(function (k) {
        if (k === '_raw' || k === '_cd' || k === 'punct') return;
        if (!stats[k]) stats[k] = { n: 0, vals: {} };
        stats[k].n++;
        var v = row[k];
        (Array.isArray(v) ? v : [v]).forEach(function (x) {
          var s = L.toStr(x);
          if (s === '') return;
          stats[k].vals[s] = (stats[k].vals[s] || 0) + 1;
        });
      });
    });
    var names = Object.keys(stats).sort(function (a, b) {
      if ((a[0] === '_') !== (b[0] === '_')) return a[0] === '_' ? 1 : -1;
      return a.localeCompare(b);
    });
    sb.appendChild(el('h4', { text: names.length + ' fields' }));
    names.forEach(function (k) {
      var dc = Object.keys(stats[k].vals).length;
      sb.appendChild(el('div', {
        class: 'fielditem',
        onclick: function (ev) { showFieldPop(ev.currentTarget, k, stats[k]); }
      }, [
        el('span', { class: 'fname', text: k, title: k }),
        el('span', { class: 'fcount', text: dc })
      ]));
    });
  }

  function showFieldPop(anchor, name, st) {
    var old = $('#fvpop'); if (old) old.remove();
    var entries = Object.keys(st.vals).map(function (v) { return { v: v, n: st.vals[v] }; });
    entries.sort(function (a, b) { return b.n - a.n; });
    var total = entries.reduce(function (s, e) { return s + e.n; }, 0);
    var top = entries.slice(0, 10);
    var tbl = el('table');
    top.forEach(function (e) {
      var pct = total ? (e.n / total * 100) : 0;
      tbl.appendChild(el('tr', {}, [
        el('td', { onclick: function () { appendFilter(name, e.v); } }, [
          document.createTextNode(e.v.length > 42 ? e.v.slice(0, 42) + '…' : e.v),
          el('div', { class: 'bar', style: 'width:' + Math.max(2, pct) + '%' })
        ]),
        el('td', { text: fmtInt(e.n) + '  ' + pct.toFixed(1) + '%' })
      ]));
    });
    var pop = el('div', { class: 'fvpop', id: 'fvpop' }, [
      el('span', { class: 'close', text: '×', onclick: function () { pop.remove(); } }),
      el('h5', { text: name }),
      el('div', { style: 'font-size:11.5px;color:var(--text-faint);margin-bottom:6px',
                  text: entries.length + ' distinct value' + (entries.length === 1 ? '' : 's') + ' in ' + fmtInt(st.n) + ' rows' }),
      tbl,
      el('div', { style: 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap' }, [
        el('button', { class: 'iconbtn', text: 'top ' + name,
          onclick: function () { setQuery(currentQuery() + ' | top ' + name); pop.remove(); } }),
        el('button', { class: 'iconbtn', text: 'stats count by ' + name,
          onclick: function () { setQuery(currentQuery() + ' | stats count by ' + name); pop.remove(); } })
      ])
    ]);
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.right + 8, window.innerWidth - 320) + 'px';
    pop.style.top = Math.min(r.top, window.innerHeight - 380) + 'px';
    setTimeout(function () {
      document.addEventListener('click', function h(ev) {
        if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', h); }
      });
    }, 0);
  }

  function appendFilter(name, value) {
    var q = currentQuery();
    var needsQuote = /[\s"]/.test(value);
    var term = name + '=' + (needsQuote ? '"' + value.replace(/"/g, '\\"') + '"' : value);
    var segs = q.split('|');
    segs[0] = segs[0].trim() + ' ' + term + ' ';
    setQuery(segs.join('|').replace(/\s+\|/g, ' |'));
    var pop = $('#fvpop'); if (pop) pop.remove();
  }

  function renderTabs() {
    var t = clear($('#tabs'));
    var r = STATE.result;
    if (!r) return;
    var defs = [];
    if (r.isEvents) defs.push({ k: 'events', l: 'Events', b: fmtInt(r.rows.length) });
    defs.push({ k: 'stats', l: r.isEvents ? 'Table' : 'Statistics', b: fmtInt(r.rows.length) });
    defs.push({ k: 'viz', l: 'Visualization' });
    if (!r.isEvents && STATE.tab === 'events') STATE.tab = 'stats';
    defs.forEach(function (d) {
      t.appendChild(el('button', {
        class: 'tab' + (STATE.tab === d.k ? ' active' : ''),
        onclick: function () { STATE.tab = d.k; renderTabs(); renderBody(); }
      }, [d.l, d.b ? el('span', { class: 'badge', text: d.b }) : null]));
    });
  }

  function renderBody() {
    var body = clear($('#tabbody'));
    var tl = clear($('#timeline'));
    var r = STATE.result;
    if (STATE.error) { return; }
    if (!r) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing searched yet' }),
        el('div', { text: 'Try one of the sample searches on the right, or start with:' }),
        el('div', { style: 'margin-top:10px;font-family:var(--mono);font-size:13px' }, [
          el('a', { href: '#', style: 'color:var(--accent-2)', text: 'index=web | stats count by status',
            onclick: function (e) { e.preventDefault(); setQuery('index=web | stats count by status'); } })
        ])
      ]));
      return;
    }
    if (!r.rows.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'No results found' }),
        el('div', { text: 'Widen the time range, check field name spelling (they are case sensitive), or remove a filter.' })
      ]));
      return;
    }
    if (r.isEvents) drawTimeline(tl, r.rows);
    if (STATE.tab === 'events') renderEvents(body, r);
    else if (STATE.tab === 'stats') renderTable(body, r);
    else renderViz(body, r);
  }

  /* ---------- events ---------- */
  function renderEvents(body, r) {
    // narrow screens scroll the whole document, so a 200-event page gets absurdly long
    var limit = window.innerWidth <= 820 ? 50 : 200;
    var rows = r.rows.slice(0, limit);
    var terms = highlightTerms(currentQuery());
    rows.forEach(function (ev) {
      var fields = Object.keys(ev).filter(function (k) {
        return k.charAt(0) !== '_' && k !== 'punct' && k !== 'linecount' && !Array.isArray(ev[k]);
      }).slice(0, 14);
      body.appendChild(el('div', { class: 'evt' }, [
        el('div', { class: 'evt-time', text: ev._time !== undefined ? L.strftime(ev._time, '%d/%m/%Y %H:%M:%S.%N') : '' }),
        el('div', { class: 'evt-raw', html: highlight(L.toStr(ev._raw !== undefined ? ev._raw : JSON.stringify(ev)), terms) }),
        el('div', { class: 'evt-fields' }, fields.map(function (k) {
          return el('span', {}, [el('b', { text: k }), document.createTextNode(' = '), el('i', { text: L.toStr(ev[k]) })]);
        }))
      ]));
    });
    if (r.rows.length > limit) {
      body.appendChild(el('div', { class: 'empty', style: 'padding:16px',
        text: 'Showing the first ' + limit + ' of ' + fmtInt(r.rows.length) + ' events. Add a filter or pipe to stats to summarise them.' }));
    }
  }

  function highlightTerms(q) {
    var base = q.split('|')[0];
    var out = [];
    (base.match(/"[^"]*"|[^\s()]+/g) || []).forEach(function (t) {
      t = t.replace(/^"|"$/g, '');
      if (/^(AND|OR|NOT|IN|search)$/i.test(t)) return;
      var m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(!=|>=|<=|=|<|>)\s*([\s\S]*)$/.exec(t);
      // metadata fields are not part of the raw text, so highlighting them
      // just paints unrelated substrings (index=web matching "AppleWebKit")
      if (m && /^(index|sourcetype|source|eventtype|tag|splunk_server|earliest|latest)$/i.test(m[1])) return;
      if (!m && /^(index|sourcetype|source|eventtype|tag|earliest|latest)$/i.test(t)) return;
      var v = m ? m[3] : t;
      v = v.replace(/^"|"$/g, '').replace(/\*/g, '');
      if (v.length >= 2 && !/^\d{9,}$/.test(v)) out.push(v);
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 8);
  }

  function highlight(text, terms) {
    var html = esc(text);
    terms.forEach(function (t) {
      try {
        var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        html = html.replace(re, '<span class="hl">$1</span>');
      } catch (e) {}
    });
    return html;
  }

  /* ---------- table ---------- */
  function renderTable(body, r) {
    var cols = r.fields.filter(function (c) { return c !== '_raw' || !r.isEvents; });
    if (r.isEvents) cols = ['_time'].concat(cols.filter(function (c) { return c !== '_time' && c !== '_raw'; }));
    if (!cols.length) cols = ['_raw'];
    var limit = 1000;
    var tbl = el('table', { class: 'res' });
    var thead = el('thead');
    thead.appendChild(el('tr', {}, cols.map(function (c) { return el('th', { text: c, title: c }); })));
    tbl.appendChild(thead);
    var tb = el('tbody');
    r.rows.slice(0, limit).forEach(function (row) {
      tb.appendChild(el('tr', {}, cols.map(function (c) { return cell(row[c], c); })));
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
    if (r.rows.length > limit) {
      body.appendChild(el('div', { class: 'empty', style: 'padding:16px',
        text: 'Showing the first ' + limit + ' of ' + fmtInt(r.rows.length) + ' rows.' }));
    }
  }

  function cell(v, colName) {
    if (v === undefined || v === null || v === '') return el('td', {}, [el('span', { class: 'nullv', text: '—' })]);
    if (Array.isArray(v)) {
      return el('td', { class: 'mono' }, v.slice(0, 12).map(function (x) {
        return el('span', { class: 'mv', text: L.toStr(x) });
      }).concat(v.length > 12 ? [el('span', { class: 'mv nullv', text: '+' + (v.length - 12) + ' more' })] : []));
    }
    if (colName === '_time' && typeof v === 'number') {
      return el('td', { class: 'mono', text: L.strftime(v, '%Y-%m-%d %H:%M:%S') });
    }
    var sev = severityOf(colName, v);
    if (sev) return el('td', {}, [el('span', { class: 'pill ' + sev, text: L.toStr(v) })]);
    var n = L.numeric(v);
    if (n !== undefined && typeof v !== 'boolean') {
      var s = Number.isInteger(n) ? fmtInt(n) : String(Math.round(n * 1e6) / 1e6);
      return el('td', { class: 'num', text: s });
    }
    var str = L.toStr(v);
    return el('td', { class: str.length > 60 ? 'mono' : '' , text: str.length > 400 ? str.slice(0, 400) + '…' : str });
  }

  /* Which columns carry state worth colouring, and what the values mean. */
  function severityOf(col, v) {
    if (!col) return null;
    var s = L.toStr(v);
    if (col === 'status' || col === 'http.status' || col === 'code') {
      if (/^2\d\d$/.test(s)) return 'ok';
      if (/^3\d\d$/.test(s)) return 'neutral';
      if (/^4\d\d$/.test(s)) return 'warn';
      if (/^5\d\d$/.test(s)) return 'bad';
      if (s === 'success') return 'ok';
      if (s === 'failure') return 'bad';
      return null;
    }
    if (col === 'level') {
      return s === 'ERROR' ? 'bad' : s === 'WARN' ? 'warn' : s === 'INFO' ? 'ok' : 'neutral';
    }
    if (col === 'action' || col === 'status_type') {
      if (/^(success|allowed|purchase)$/i.test(s)) return 'ok';
      if (/^(failure|blocked|dropped)$/i.test(s)) return 'bad';
      if (/error$/i.test(s)) return s.toLowerCase() === 'server error' ? 'bad' : 'warn';
      if (/^(redirect)$/i.test(s)) return 'neutral';
      return null;
    }
    if (col === 'EventCode') return s === '4625' ? 'bad' : s === '4720' || s === '4732' ? 'warn' : null;
    return null;
  }

  /* ---------- timeline ---------- */
  function drawTimeline(host, rows) {
    var times = rows.map(function (r) { return r._time; }).filter(function (t) { return typeof t === 'number'; });
    if (times.length < 2) return;
    var b = rangeBounds(STATE.range);
    var lo = b.earliest !== null ? b.earliest : Math.min.apply(null, times);
    var hi = b.latest !== null ? b.latest : Math.max.apply(null, times);
    if (hi <= lo) { hi = Math.max.apply(null, times); lo = Math.min.apply(null, times); }
    var N = 60, buckets = new Array(N).fill(0);
    times.forEach(function (t) {
      var i = Math.floor((t - lo) / (hi - lo + 1) * N);
      if (i >= 0 && i < N) buckets[i]++;
    });
    var max = Math.max.apply(null, buckets) || 1;
    var W = 1000, H = 62, pad = 14;
    var bw = (W - 4) / N;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    buckets.forEach(function (c, i) {
      var h = c === 0 ? 0 : Math.max(1.5, (c / max) * (H - pad - 4));
      svg += '<rect x="' + (2 + i * bw) + '" y="' + (H - pad - h) + '" width="' + (bw - 1.2) +
             '" height="' + h + '" fill="var(--accent)" opacity="' + (c ? .85 : 0) + '"><title>' +
             esc(L.strftime(lo + (hi - lo) * (i / N), '%b %d %H:%M') + ' — ' + c + ' events') + '</title></rect>';
    });
    svg += '<line x1="0" y1="' + (H - pad) + '" x2="' + W + '" y2="' + (H - pad) + '" stroke="var(--border)" stroke-width="1"/>';
    svg += '<text class="tl-label" x="2" y="' + (H - 3) + '">' + esc(L.strftime(lo, '%b %d %H:%M')) + '</text>';
    svg += '<text class="tl-label" x="' + (W - 2) + '" y="' + (H - 3) + '" text-anchor="end">' + esc(L.strftime(hi, '%b %d %H:%M')) + '</text>';
    svg += '<text class="tl-label" x="' + (W / 2) + '" y="' + (H - 3) + '" text-anchor="middle">peak ' + max + ' per bar</text>';
    svg += '</svg>';
    host.innerHTML = svg;
  }

  /* ---------- visualisation ---------- */
  function renderViz(body, r) {
    var spec = chartSpec(r);
    if (!spec) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing to chart yet' }),
        el('div', { text: 'Visualisations need a transforming command. Try piping to stats, chart, timechart, top or rare.' }),
        el('div', { style: 'margin-top:10px;font-family:var(--mono);font-size:12.5px' }, [
          el('a', { href: '#', style: 'color:var(--accent-2)', text: '… | timechart span=1h count',
            onclick: function (e) { e.preventDefault(); setQuery(currentQuery().split('|')[0] + ' | timechart span=1h count'); } })
        ])
      ]));
      return;
    }
    var wrap = el('div', { class: 'viz' });
    var picker = el('div', { class: 'vizpick' });
    [['auto', 'Auto'], ['column', 'Column'], ['line', 'Line'], ['bar', 'Bar']].forEach(function (p) {
      picker.appendChild(el('button', {
        class: STATE.vizType === p[0] ? 'on' : '',
        text: p[1],
        onclick: function () { STATE.vizType = p[0]; renderBody(); }
      }));
    });
    wrap.appendChild(picker);
    var type = STATE.vizType === 'auto' ? (spec.time ? 'column' : (spec.rows.length > 12 ? 'bar' : 'column')) : STATE.vizType;
    wrap.appendChild(drawChart(spec, type));
    var legend = el('div', { class: 'legend' });
    spec.series.forEach(function (s, i) {
      legend.appendChild(el('span', {}, [
        el('i', { style: 'background:' + PALETTE[i % PALETTE.length] }), s
      ]));
    });
    if (spec.series.length > 1) wrap.appendChild(legend);
    body.appendChild(wrap);
  }

  function chartSpec(r) {
    if (r.isEvents) return null;
    var cols = r.fields;
    if (!cols.length) return null;
    if (r.chart) {
      var series = r.chart.series.filter(function (s) {
        return r.rows.some(function (row) { return L.numeric(row[s]) !== undefined; });
      });
      if (!series.length) return null;
      return { x: r.chart.x, series: series, rows: r.rows, time: !!r.chart.time };
    }
    var xCol = cols[0];
    var series = cols.slice(1).filter(function (c) {
      return r.rows.some(function (row) { return L.numeric(row[c]) !== undefined; });
    });
    if (!series.length) return null;
    return { x: xCol, series: series, rows: r.rows.slice(0, 60), time: xCol === '_time' };
  }

  function drawChart(spec, type) {
    var W = 1000, H = 380;
    var padL = 62, padR = 14, padT = 12, padB = spec.time ? 40 : 78;
    if (type === 'bar') { padL = 150; padB = 34; }
    var rows = spec.rows.slice(0, type === 'bar' ? 40 : 400);
    var stacked = spec.series.length > 1 && type === 'column';

    var maxV = 0;
    rows.forEach(function (row) {
      if (stacked) {
        var s = 0;
        spec.series.forEach(function (k) { s += L.numeric(row[k]) || 0; });
        maxV = Math.max(maxV, s);
      } else spec.series.forEach(function (k) { maxV = Math.max(maxV, L.numeric(row[k]) || 0); });
    });
    if (maxV <= 0) maxV = 1;
    var ticks = niceTicks(maxV, 5);
    maxV = ticks[ticks.length - 1];

    var innerW = W - padL - padR, innerH = H - padT - padB;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';

    if (type === 'bar') {
      var bh = innerH / rows.length;
      ticks.forEach(function (t) {
        var x = padL + (t / maxV) * innerW;
        s += line(x, padT, x, padT + innerH, 'var(--border-soft)');
        s += text(x, H - 14, fmtTick(t), 'middle', 11);
      });
      rows.forEach(function (row, i) {
        var y = padT + i * bh;
        var lbl = L.toStr(row[spec.x]);
        s += text(padL - 8, y + bh / 2 + 4, lbl.length > 24 ? lbl.slice(0, 24) + '…' : lbl, 'end', 11);
        var w = ((L.numeric(row[spec.series[0]]) || 0) / maxV) * innerW;
        s += '<rect x="' + padL + '" y="' + (y + bh * .15) + '" width="' + Math.max(0, w) +
             '" height="' + (bh * .7) + '" fill="' + PALETTE[0] + '" rx="2"><title>' +
             esc(lbl + ': ' + L.toStr(row[spec.series[0]])) + '</title></rect>';
      });
      s += line(padL, padT, padL, padT + innerH, 'var(--border)');
      return svgNode(s + '</svg>');
    }

    ticks.forEach(function (t) {
      var y = padT + innerH - (t / maxV) * innerH;
      s += line(padL, y, W - padR, y, 'var(--border-soft)');
      s += text(padL - 8, y + 4, fmtTick(t), 'end', 11);
    });

    var step = innerW / rows.length;
    var labelEvery = Math.ceil(rows.length / (spec.time ? 10 : 18));

    if (type === 'line') {
      spec.series.forEach(function (k, si) {
        var pts = rows.map(function (row, i) {
          var v = L.numeric(row[k]) || 0;
          return [padL + step * (i + .5), padT + innerH - (v / maxV) * innerH];
        });
        // a soft area fill gives a single series some weight without adding noise
        if (spec.series.length === 1 && pts.length > 1) {
          s += '<polygon fill="' + PALETTE[si % PALETTE.length] + '" fill-opacity="0.10" points="' +
               pts[0][0].toFixed(1) + ',' + (padT + innerH) + ' ' +
               pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + ' ' +
               pts[pts.length - 1][0].toFixed(1) + ',' + (padT + innerH) + '"/>';
        }
        s += '<polyline fill="none" stroke="' + PALETTE[si % PALETTE.length] + '" stroke-width="2" ' +
             'stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        if (rows.length <= 80) pts.forEach(function (p, i) {
          s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5" fill="' + PALETTE[si % PALETTE.length] + '"><title>' +
               esc(labelOf(rows[i], spec) + '\n' + k + ': ' + L.toStr(rows[i][k])) + '</title></circle>';
        });
      });
    } else {
      rows.forEach(function (row, i) {
        var x0 = padL + step * i;
        var bw = Math.max(1, step * .8);
        var off = 0;
        spec.series.forEach(function (k, si) {
          var v = L.numeric(row[k]) || 0;
          var h = (v / maxV) * innerH;
          if (h <= 0) return;
          if (stacked) {
            s += '<rect x="' + (x0 + step * .1) + '" y="' + (padT + innerH - off - h) + '" width="' + bw +
                 '" height="' + h + '" fill="' + PALETTE[si % PALETTE.length] + '"><title>' +
                 esc(labelOf(row, spec) + '\n' + k + ': ' + L.toStr(row[k])) + '</title></rect>';
            off += h;
          } else {
            var gw = bw / spec.series.length;
            s += '<rect x="' + (x0 + step * .1 + si * gw) + '" y="' + (padT + innerH - h) + '" width="' + Math.max(1, gw - .5) +
                 '" height="' + h + '" fill="' + PALETTE[si % PALETTE.length] + '" rx="1"><title>' +
                 esc(labelOf(row, spec) + '\n' + k + ': ' + L.toStr(row[k])) + '</title></rect>';
          }
        });
      });
    }

    rows.forEach(function (row, i) {
      if (i % labelEvery !== 0) return;
      var x = padL + step * (i + .5);
      var lbl = labelOf(row, spec);
      if (spec.time) s += text(x, H - padB + 18, lbl, 'middle', 10.5);
      else s += '<text x="' + x + '" y="' + (H - padB + 12) + '" transform="rotate(-40 ' + x + ' ' + (H - padB + 12) +
                ')" text-anchor="end" font-size="10.5" fill="var(--text-faint)">' +
                esc(lbl.length > 22 ? lbl.slice(0, 22) + '…' : lbl) + '</text>';
    });
    s += line(padL, padT + innerH, W - padR, padT + innerH, 'var(--border)');
    return svgNode(s + '</svg>');
  }

  function labelOf(row, spec) {
    var v = row[spec.x];
    if (spec.time && typeof v === 'number') {
      var span = spec.rows.length > 1 ? Math.abs(spec.rows[1][spec.x] - spec.rows[0][spec.x]) : 3600;
      return L.strftime(v, span >= 86400 ? '%b %d' : (span >= 3600 ? '%b %d %H:%M' : '%H:%M'));
    }
    return L.toStr(v);
  }
  function line(x1, y1, x2, y2, c) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + c + '" stroke-width="1"/>';
  }
  function text(x, y, t, anchor, size) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="' + size +
           '" fill="var(--text-faint)">' + esc(t) + '</text>';
  }
  function svgNode(html) { var d = el('div'); d.innerHTML = html; return d.firstChild; }
  function niceTicks(max, count) {
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var stepM = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    var step = stepM * mag;
    var out = [];
    for (var v = 0; v <= max + step * .5; v += step) out.push(Math.round(v * 1e6) / 1e6);
    if (out.length < 2) out.push(step);
    return out;
  }
  function fmtTick(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'k';
    return String(Math.round(n * 100) / 100);
  }

  /* =====================================================================
     Right panel
     ===================================================================== */
  function renderRight() {
    var tabs = clear($('#rtabs'));
    [['reference', 'Commands'], ['functions', 'Functions'], ['samples', 'Samples'],
     ['exercises', 'Practice'], ['notes', 'Exam notes'], ['data', 'Data']].forEach(function (t) {
      tabs.appendChild(el('button', {
        class: 'rtab' + (STATE.rightTab === t[0] ? ' active' : ''),
        text: t[1],
        onclick: function () { STATE.rightTab = t[0]; save('rightTab', t[0]); renderRight(); }
      }));
    });
    var body = clear($('#rbody'));
    ({ reference: refPanel, functions: funcPanel, samples: samplePanel,
       exercises: exercisePanel, notes: notesPanel, data: dataPanel })[STATE.rightTab](body);
  }

  function refPanel(body) {
    var input = el('input', { class: 'rsearch', placeholder: 'Filter commands…', oninput: function () { draw(this.value); } });
    body.appendChild(input);
    var list = el('div');
    body.appendChild(list);
    function draw(q) {
      clear(list);
      q = (q || '').toLowerCase();
      var groups = {};
      C.COMMANDS.forEach(function (c) {
        if (q && c.name.indexOf(q) < 0 && c.desc.toLowerCase().indexOf(q) < 0 && c.group.toLowerCase().indexOf(q) < 0) return;
        (groups[c.group] = groups[c.group] || []).push(c);
      });
      var order = ['Filter', 'Fields', 'Report', 'Order', 'Extract', 'Enrich', 'Group', 'Multivalue', 'Reshape', 'Combine', 'Generate'];
      order.concat(Object.keys(groups).filter(function (g) { return order.indexOf(g) < 0; })).forEach(function (g) {
        if (!groups[g]) return;
        list.appendChild(el('div', { class: 'gh', text: g }));
        groups[g].forEach(function (c) { list.appendChild(cmdCard(c)); });
      });
      if (!list.children.length) list.appendChild(el('div', { class: 'empty', text: 'No command matches "' + q + '"' }));
    }
    draw('');
  }

  function cmdCard(c) {
    return el('details', { class: 'cmd' }, [
      el('summary', {}, [
        el('span', { class: 'cname', text: c.name }),
        c.exam ? el('span', { class: 'star', text: '★', title: 'Commonly tested' }) : null,
        el('span', { class: 'cgroup', text: c.group })
      ]),
      el('div', { class: 'cbody' }, [
        el('pre', { class: 'csyntax', text: c.syntax }),
        el('div', { text: c.desc })
      ].concat((c.examples || []).map(function (x) {
        return el('div', { class: 'cex', text: x, title: 'Click to run',
          onclick: function () { setQuery(x); } });
      })))
    ]);
  }

  function funcPanel(body) {
    var input = el('input', { class: 'rsearch', placeholder: 'Filter functions…', oninput: function () { draw(this.value); } });
    body.appendChild(input);
    var list = el('div');
    body.appendChild(list);
    function draw(q) {
      clear(list);
      q = (q || '').toLowerCase();
      list.appendChild(el('div', { class: 'gh', text: 'stats / chart / timechart functions' }));
      var t0 = el('table', { class: 'ref-table' });
      C.STATS_FUNCS.forEach(function (f) {
        if (q && f.n.toLowerCase().indexOf(q) < 0 && f.d.toLowerCase().indexOf(q) < 0) return;
        t0.appendChild(el('tr', {}, [el('td', { text: f.n }), el('td', { text: f.d })]));
      });
      list.appendChild(t0);
      var groups = {};
      C.EVAL_FUNCS.forEach(function (f) {
        if (q && f.n.toLowerCase().indexOf(q) < 0 && f.d.toLowerCase().indexOf(q) < 0) return;
        (groups[f.g] = groups[f.g] || []).push(f);
      });
      Object.keys(groups).forEach(function (g) {
        list.appendChild(el('div', { class: 'gh', text: 'eval – ' + g }));
        var t = el('table', { class: 'ref-table' });
        groups[g].forEach(function (f) {
          t.appendChild(el('tr', {}, [
            el('td', { text: f.n }),
            el('td', {}, [
              document.createTextNode(f.d),
              f.e ? el('span', { class: 'exline', text: '▸ ' + f.e, title: 'Click to try',
                onclick: function () { tryFunc(f.e); } }) : null
            ])
          ]));
        });
        list.appendChild(t);
      });
    }
    draw('');
  }

  function tryFunc(snippet) {
    var q;
    if (/^(where|eval)\b/.test(snippet)) {
      q = /\b(clientip|uri_path|bytes|status|host|productId|duration|src_ip|user)\b/.test(snippet)
        ? 'index=web | head 20 | ' + snippet
        : '| makeresults | ' + snippet;
      if (/\b(users|src_ip|action)\b/.test(snippet)) q = 'index=security | head 20 | ' + snippet;
    } else q = snippet;
    setQuery(q);
  }

  function samplePanel(body) {
    C.SAMPLES.forEach(function (g) {
      body.appendChild(el('div', { class: 'gh', text: g.g }));
      var ul = el('ul', { class: 'slist' });
      g.items.forEach(function (it) {
        ul.appendChild(el('li', { onclick: function () { setQuery(it.q); } }, [
          el('div', { class: 'st', text: it.t }),
          el('div', { class: 'sq', text: it.q })
        ]));
      });
      body.appendChild(ul);
    });
  }

  function notesPanel(body) {
    C.NOTES.forEach(function (n) {
      body.appendChild(el('div', { class: 'note' }, [
        el('h5', { text: n.t }), el('p', { text: n.b })
      ]));
    });
    body.appendChild(el('div', { class: 'gh', text: 'Macros defined here' }));
    var t = el('table', { class: 'ref-table' });
    Object.keys(C.MACROS).forEach(function (k) {
      t.appendChild(el('tr', {}, [
        el('td', { text: '`' + k + '`' }),
        el('td', {}, [el('span', { class: 'exline', text: C.MACROS[k],
          onclick: function () { setQuery('`' + k.replace('(1)', '(5)') + '`'); } })])
      ]));
    });
    body.appendChild(t);
  }

  function dataPanel(body) {
    var d = el('div', { class: 'datasets' });
    d.appendChild(el('p', { text: 'The playground ships with ' + fmtInt(DATA.events.length) +
      ' generated events spread over the last 7 days. Everything is deterministic, so the same search always gives the same answer.' }));
    var counts = {};
    DATA.events.forEach(function (e) {
      var k = e.index + ' ' + e.sourcetype;
      counts[k] = (counts[k] || 0) + 1;
    });
    var t = el('table');
    t.appendChild(el('tr', {}, [el('th', { text: 'index' }), el('th', { text: 'sourcetype' }), el('th', { text: 'events' })]));
    Object.keys(counts).sort().forEach(function (k) {
      var p = k.split(' ');
      t.appendChild(el('tr', {}, [
        el('td', {}, [el('code', { text: p[0] })]),
        el('td', {}, [el('code', { text: p[1] })]),
        el('td', { text: fmtInt(counts[k]) })
      ]));
    });
    d.appendChild(t);

    d.appendChild(el('div', { class: 'gh', text: 'Key fields by sourcetype' }));
    var fieldMap = [
      ['access_combined_wcookie', 'clientip, method, uri_path, uri_query, status, bytes, referer, useragent, JSESSIONID, action, productId, categoryId, response_time_ms, user'],
      ['linux_secure', 'user, src_ip, action, app, vendor_action'],
      ['WinEventLog:Security', 'EventCode, Account_Name, user, Logon_Type, Source_Network_Address, signature, action'],
      ['pan:traffic', 'src_ip, dest_ip, dest_port, protocol, action, bytes_in, bytes_out, bytes, rule'],
      ['vendor_sales', 'VendorID, productId, product_name, categoryId, price, quantity, sale_price'],
      ['app:json', 'JSON in _raw – use spath. level, service, duration_ms, trace_id, user']
    ];
    var t2 = el('table');
    t2.appendChild(el('tr', {}, [el('th', { text: 'sourcetype' }), el('th', { text: 'fields' })]));
    fieldMap.forEach(function (r) {
      t2.appendChild(el('tr', {}, [el('td', {}, [el('code', { text: r[0] })]), el('td', { text: r[1] })]));
    });
    d.appendChild(t2);

    d.appendChild(el('div', { class: 'gh', text: 'Lookup tables' }));
    var t3 = el('table');
    t3.appendChild(el('tr', {}, [el('th', { text: 'name' }), el('th', { text: 'columns' }), el('th', { text: 'rows' })]));
    Object.keys(DATA.lookups).forEach(function (k) {
      t3.appendChild(el('tr', {}, [
        el('td', {}, [el('code', { text: k, style: 'cursor:pointer', onclick: function () { setQuery('| inputlookup ' + k); } })]),
        el('td', { text: Object.keys(DATA.lookups[k][0] || {}).join(', ') }),
        el('td', { text: DATA.lookups[k].length })
      ]));
    });
    d.appendChild(t3);

    d.appendChild(el('div', { class: 'gh', text: 'Also available' }));
    d.appendChild(el('p', { text: 'Every event carries eventtype and tag fields, so searches like eventtype=failed_login or tag=authentication work. Fields host, source, sourcetype, index, splunk_server, linecount and punct behave as they do in Splunk.' }));
    body.appendChild(d);
  }

  /* ---------- exercises ---------- */
  function exercisePanel(body) {
    var total = C.EXERCISES.reduce(function (s, e) { return s + e.points; }, 0);
    var got = C.EXERCISES.reduce(function (s, e) { return s + (STATE.done[e.id] ? e.points : 0); }, 0);
    var head = el('div', { class: 'exhead' }, [
      el('div', { class: 'progressbar' }, [el('i', { style: 'width:' + (total ? got / total * 100 : 0) + '%' })]),
      el('span', { class: 'score', text: got + ' / ' + total + ' pts' }),
      el('button', { class: 'iconbtn', text: 'Reset', onclick: function () {
        if (confirm('Clear all exercise progress?')) { STATE.done = {}; save('done', {}); renderRight(); }
      } })
    ]);
    body.appendChild(head);
    body.appendChild(el('p', { style: 'font-size:12.5px;color:var(--text-dim);margin:0 0 12px',
      text: 'Write a search in the box on the left, then press Check. Your result is compared against a reference answer, so any query that produces the right table passes. Grading always runs over all 7 days of data, whatever the time picker says.' }));

    var lvl = null;
    C.EXERCISES.forEach(function (ex) {
      if (ex.level !== lvl) { lvl = ex.level; body.appendChild(el('div', { class: 'gh', text: lvl })); }
      body.appendChild(exerciseCard(ex));
    });
  }

  function exerciseCard(ex) {
    var msg = el('div');
    var card = el('details', { class: 'ex' + (STATE.done[ex.id] ? ' done' : '') }, [
      el('summary', {}, [
        el('span', { class: 'exmark', text: STATE.done[ex.id] ? '✓' : '' }),
        el('div', {}, [
          el('div', { class: 'exq', text: ex.q }),
          el('div', { class: 'exlvl', text: ex.points + ' pt' + (ex.points === 1 ? '' : 's') })
        ])
      ]),
      el('div', { class: 'exbody' }, [
        el('div', { class: 'exbtns' }, [
          el('button', { class: 'primary', text: 'Check my search', onclick: function () { check(); } }),
          el('button', { text: 'Hint', onclick: function () {
            clear(msg).appendChild(el('div', { class: 'exmsg info', text: ex.hint }));
          } }),
          el('button', { text: 'Show answer', onclick: function () {
            clear(msg).appendChild(el('div', {}, [
              el('div', { class: 'exmsg info', text: 'One correct answer (others may also work):' }),
              el('div', { class: 'exsol', text: ex.solution })
            ]));
          } }),
          el('button', { text: 'Load answer', onclick: function () { setQuery(ex.solution); } })
        ]),
        msg
      ])
    ]);

    function check() {
      var q = currentQuery();
      if (!q) { clear(msg).appendChild(el('div', { class: 'exmsg bad', text: 'Write a search in the box on the left first.' })); return; }
      var verdict = grade(q, ex);
      clear(msg).appendChild(el('div', { class: 'exmsg ' + (verdict.ok ? 'ok' : 'bad'), text: verdict.message }));
      if (verdict.ok && !STATE.done[ex.id]) {
        STATE.done[ex.id] = true; save('done', STATE.done);
        renderRight();
      }
    }
    return card;
  }

  function grade(userQuery, ex) {
    var opts = {
      events: DATA.events, lookups: DATA.lookups, geoBlocks: DATA.geoBlocks,
      macros: C.MACROS, earliest: null, latest: null, knownIndexes: DATA.indexes
    };
    var expected, actual;
    try { expected = E.runSearch(ex.solution, opts); }
    catch (e) { return { ok: false, message: 'The reference answer failed to run. Please report this.' }; }
    try { actual = E.runSearch(userQuery, opts); }
    catch (e) { return { ok: false, message: 'Your search did not run: ' + e.message }; }

    if (ex.compare === 'count') {
      if (actual.rows.length === expected.rows.length) {
        return { ok: true, message: 'Correct. ' + fmtInt(actual.rows.length) + ' events, which matches the reference answer.' };
      }
      return { ok: false, message: 'Not quite. Expected ' + fmtInt(expected.rows.length) +
        ' events but your search returned ' + fmtInt(actual.rows.length) + '.' };
    }

    var ecols = expected.fields.filter(function (c) { return c !== '_raw'; });
    var acols = actual.fields.filter(function (c) { return c !== '_raw'; });
    var missing = ecols.filter(function (c) { return acols.indexOf(c) < 0; });
    var extra = acols.filter(function (c) { return ecols.indexOf(c) < 0; });
    if (missing.length || extra.length) {
      var parts = [];
      if (missing.length) parts.push('missing ' + missing.join(', '));
      if (extra.length) parts.push('unexpected ' + extra.join(', '));
      return { ok: false, message: 'The columns do not match: ' + parts.join('; ') +
        '. Expected exactly: ' + ecols.join(', ') + '.' };
    }
    // Column ORDER is only graded where the exercise explicitly asks for it.
    if (ex.strictCols && ecols.join(' ') !== acols.join(' ')) {
      return { ok: false, message: 'Right columns, wrong order. Expected: ' + ecols.join(', ') +
        '. You produced: ' + acols.join(', ') + '.' };
    }
    if (actual.rows.length !== expected.rows.length) {
      return { ok: false, message: 'Expected ' + fmtInt(expected.rows.length) + ' row' +
        (expected.rows.length === 1 ? '' : 's') + ' but got ' + fmtInt(actual.rows.length) + '.' };
    }
    for (var i = 0; i < expected.rows.length; i++) {
      for (var j = 0; j < ecols.length; j++) {
        var c = ecols[j];
        if (normVal(expected.rows[i][c]) !== normVal(actual.rows[i][c])) {
          return { ok: false, message: 'Row ' + (i + 1) + ', column "' + c + '" differs. Expected "' +
            normVal(expected.rows[i][c]) + '" but got "' + normVal(actual.rows[i][c]) + '". Check ordering and filters.' };
        }
      }
    }
    return { ok: true, message: 'Correct. ' + fmtInt(actual.rows.length) + ' row' +
      (actual.rows.length === 1 ? '' : 's') + ' matching the reference answer exactly.' };
  }

  function normVal(v) {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.map(normVal).join('');
    var n = L.numeric(v);
    if (n !== undefined && typeof v !== 'boolean') return String(Math.round(n * 1e6) / 1e6);
    return L.toStr(v);
  }

  /* =====================================================================
     Boot
     ===================================================================== */
  function buildShell() {
    var app = el('div', { class: 'app' }, [
      el('div', { class: 'topbar' }, [
        el('div', { class: 'brand' }, [
          el('span', { class: 'dot' }),
          el('span', { text: 'SPL Playground' }),
          el('small', { text: 'Splunk search practice, no Splunk required' })
        ]),
        el('div', { class: 'spacer' }),
        el('button', { class: 'iconbtn', text: 'Copy link', title: 'Copy a shareable link to this search',
          onclick: copyLink }),
        el('button', { class: 'iconbtn', id: 'themebtn', text: 'Theme', onclick: toggleTheme }),
        el('button', { class: 'iconbtn', id: 'panelbtn', text: 'Study panel', onclick: togglePanel })
      ]),
      el('div', { class: 'main' }, [
        el('div', { class: 'left' }, [
          el('div', { class: 'searchzone' }, [
            el('div', { class: 'searchrow' }, [
              el('div', { class: 'spl-wrap' }, [
                el('textarea', { class: 'spl', id: 'spl', spellcheck: 'false',
                  placeholder: 'index=web | stats count by status' })
              ]),
              el('div', { class: 'searchside' }, [
                el('select', { class: 'time', id: 'timesel', onchange: function () {
                  STATE.range = this.value; runSearch();
                } }, RANGES.map(function (r) { return el('option', { value: r.v, text: r.t }); })),
                el('button', { class: 'run', text: 'Run search  ⏎', onclick: runSearch })
              ])
            ]),
            el('div', { class: 'hintline' }, [
              el('span', {}, [el('kbd', { text: 'Ctrl' }), ' + ', el('kbd', { text: 'Enter' }), ' to run']),
              el('span', { text: 'Field names are case sensitive' }),
              el('span', { text: 'earliest= / latest= in the search override the picker' })
            ])
          ]),
          el('div', { id: 'errzone' }),
          el('div', { class: 'status', id: 'status' }),
          el('div', { class: 'timeline', id: 'timeline' }),
          el('div', { class: 'results' }, [
            el('div', { class: 'sidebar', id: 'sidebar' }),
            el('div', { class: 'pane' }, [
              el('div', { class: 'tabs', id: 'tabs' }),
              el('div', { class: 'tabbody', id: 'tabbody' })
            ])
          ])
        ]),
        el('div', { class: 'right', id: 'right' }, [
          el('div', { class: 'rtabs', id: 'rtabs' }),
          el('div', { class: 'rbody', id: 'rbody' })
        ])
      ])
    ]);
    document.body.appendChild(app);
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.setAttribute('data-theme', next);
    else document.documentElement.removeAttribute('data-theme');
    save('theme', next);
  }
  function togglePanel() {
    $('#right').classList.toggle('hidden');
    $('#panelbtn').classList.toggle('on', !$('#right').classList.contains('hidden'));
  }
  function copyLink() {
    var url = location.origin + location.pathname + '#q=' + encodeURIComponent(currentQuery()) + '&t=' + encodeURIComponent(STATE.range);
    var done = function () {
      var b = $('#panelbtn'); // reuse any button for feedback
      var btn = document.querySelectorAll('.topbar .iconbtn')[0];
      var old = btn.textContent; btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
    else { prompt('Copy this link:', url); }
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return out.q ? out : null;
  }

  function init() {
    var theme = load('theme', '');
    if (theme) document.documentElement.setAttribute('data-theme', theme);

    buildShell();
    DATA = window.SPLData.generate();
    DATA.indexes = [];
    DATA.events.forEach(function (e) { if (DATA.indexes.indexOf(e.index) < 0) DATA.indexes.push(e.index); });

    STATE.done = load('done', {});
    STATE.rightTab = load('rightTab', 'reference');

    var hash = readHash();
    STATE.range = hash && hash.t ? hash.t : load('lastRange', '-24h');
    if (!RANGES.some(function (r) { return r.v === STATE.range; })) STATE.range = '-24h';
    $('#timesel').value = STATE.range;
    $('#spl').value = hash ? hash.q : load('lastQuery', 'index=web | stats count by status');

    $('#spl').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });
    $('#panelbtn').classList.add('on');

    renderRight();
    runSearch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

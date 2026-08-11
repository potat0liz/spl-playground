/* =========================================================================
   SPL Playground - language core
   Tokenizer, recursive-descent expression parser, evaluator and the
   eval() function library. Also: time-modifier parsing and strftime.
   ========================================================================= */
(function (global) {
  'use strict';

  /* =====================================================================
     Errors
     ===================================================================== */
  function SPLError(msg) { this.name = 'SPLError'; this.message = msg; }
  SPLError.prototype = Object.create(Error.prototype);
  function err(msg) { throw new SPLError(msg); }

  /* =====================================================================
     Value helpers - Splunk-ish typing
     ===================================================================== */
  var NULLV = null;

  function isNull(v) { return v === null || v === undefined || v === ''; }
  function isMV(v) { return Array.isArray(v); }

  /* Does this value look like a number? */
  function numeric(v) {
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      var s = v.trim();
      if (s === '') return undefined;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return undefined;
      var n = Number(s);
      return isFinite(n) ? n : undefined;
    }
    return undefined;
  }

  function toStr(v) {
    if (isNull(v)) return '';
    if (isMV(v)) return v.map(toStr).join('\n');
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      // trim float noise the way Splunk tends to
      var s = String(Math.round(v * 1e9) / 1e9);
      return s;
    }
    return String(v);
  }

  function truthy(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (isNull(v)) return false;
    var n = numeric(v);
    if (n !== undefined) return n !== 0;
    var s = String(v).toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    return true;
  }

  /* Generic comparison used by =, <, > ... and by sort. */
  function cmp(a, b) {
    var na = numeric(a), nb = numeric(b);
    if (na !== undefined && nb !== undefined) return na < nb ? -1 : na > nb ? 1 : 0;
    var sa = toStr(a), sb = toStr(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /* =====================================================================
     Tokenizer
     ===================================================================== */
  var PUNCT = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '=', '+', '-', '*', '/', '%',
               '.', '(', ')', ',', '[', ']'];

  function isIdentStart(c) { return /[A-Za-z_$]/.test(c); }
  function isIdentChar(c) { return /[A-Za-z0-9_]/.test(c); }

  function tokenize(input) {
    var toks = [], i = 0, n = input.length;
    while (i < n) {
      var c = input[i];
      if (/\s/.test(c)) { i++; continue; }
      if (input.startsWith('```', i)) {                     // SPL comment
        var e = input.indexOf('```', i + 3);
        i = (e === -1) ? n : e + 3; continue;
      }
      if (c === '"') {
        var j = i + 1, buf = '';
        while (j < n) {
          if (input[j] === '\\' && j + 1 < n) {
            var nx = input[j + 1];
            // Keep unrecognised escapes intact so regex literals survive quoting.
            buf += (nx === 'n') ? '\n' : (nx === 't') ? '\t' : (nx === 'r') ? '\r'
                 : (nx === '"' || nx === '\\') ? nx : '\\' + nx;
            j += 2; continue;
          }
          if (input[j] === '"') break;
          buf += input[j]; j++;
        }
        if (j >= n) err('Unbalanced quotes in expression');
        toks.push({ t: 'str', v: buf }); i = j + 1; continue;
      }
      if (c === "'") {                                       // 'field name'
        var k = input.indexOf("'", i + 1);
        if (k === -1) err('Unbalanced single quotes in expression');
        toks.push({ t: 'ident', v: input.slice(i + 1, k), quoted: true }); i = k + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(input[i + 1] || ''))) {
        var m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(input.slice(i));
        toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
      }
      if (isIdentStart(c)) {
        var j2 = i;
        while (j2 < n) {
          if (isIdentChar(input[j2])) { j2++; continue; }
          // dots / colons / braces are part of a field name only when glued to more name
          if ((input[j2] === '.' || input[j2] === ':') && isIdentChar(input[j2 + 1] || '')) { j2++; continue; }
          if (input[j2] === '{' && input[j2 + 1] === '}') { j2 += 2; continue; }
          break;
        }
        toks.push({ t: 'ident', v: input.slice(i, j2) }); i = j2; continue;
      }
      var matched = null;
      for (var p = 0; p < PUNCT.length; p++) {
        if (input.startsWith(PUNCT[p], i)) { matched = PUNCT[p]; break; }
      }
      if (matched) { toks.push({ t: 'op', v: matched }); i += matched.length; continue; }
      err('Unexpected character "' + c + '" in expression');
    }
    toks.push({ t: 'eof' });
    return toks;
  }

  /* =====================================================================
     Parser  (precedence climbing)
       OR  <  AND/XOR  <  NOT  <  compare  <  add(+ - .)  <  mul(* / %)
           <  unary  <  primary
     ===================================================================== */
  function Parser(toks) { this.toks = toks; this.p = 0; }
  Parser.prototype.peek = function () { return this.toks[this.p]; };
  Parser.prototype.next = function () { return this.toks[this.p++]; };
  Parser.prototype.isKw = function (kw) {
    var t = this.peek();
    return t.t === 'ident' && !t.quoted && t.v.toUpperCase() === kw;
  };
  Parser.prototype.isOp = function (o) { var t = this.peek(); return t.t === 'op' && t.v === o; };
  Parser.prototype.expectOp = function (o) {
    if (!this.isOp(o)) err('Expected "' + o + '" in expression');
    this.p++;
  };

  Parser.prototype.parse = function () {
    var e = this.parseOr();
    if (this.peek().t !== 'eof') err('Unexpected token near "' + toStr(this.peek().v) + '"');
    return e;
  };

  Parser.prototype.parseOr = function () {
    var l = this.parseAnd();
    while (this.isKw('OR') || this.isOp('||')) { this.next(); l = { t: 'bin', op: 'OR', l: l, r: this.parseAnd() }; }
    return l;
  };
  Parser.prototype.parseAnd = function () {
    var l = this.parseNot();
    while (this.isKw('AND') || this.isKw('XOR') || this.isOp('&&')) {
      var op = this.isOp('&&') ? 'AND' : this.peek().v.toUpperCase();
      this.next();
      l = { t: 'bin', op: op, l: l, r: this.parseNot() };
    }
    return l;
  };
  Parser.prototype.parseNot = function () {
    if (this.isKw('NOT')) { this.next(); return { t: 'un', op: 'NOT', e: this.parseNot() }; }
    return this.parseCmp();
  };
  Parser.prototype.parseCmp = function () {
    var l = this.parseAdd();
    for (;;) {
      var t = this.peek();
      if (t.t === 'op' && ['=', '==', '!=', '<', '>', '<=', '>='].indexOf(t.v) >= 0) {
        this.next();
        l = { t: 'bin', op: t.v === '=' ? '==' : t.v, l: l, r: this.parseAdd() };
      } else if (this.isKw('LIKE')) {
        this.next(); l = { t: 'call', name: 'like', args: [l, this.parseAdd()] };
      } else if (this.isKw('IN')) {
        this.next(); this.expectOp('(');
        var items = [];
        if (!this.isOp(')')) { items.push(this.parseOr()); while (this.isOp(',')) { this.next(); items.push(this.parseOr()); } }
        this.expectOp(')');
        l = { t: 'call', name: 'in', args: [l].concat(items) };
      } else break;
    }
    return l;
  };
  Parser.prototype.parseAdd = function () {
    var l = this.parseMul();
    for (;;) {
      var t = this.peek();
      if (t.t === 'op' && (t.v === '+' || t.v === '-' || t.v === '.')) {
        this.next(); l = { t: 'bin', op: t.v, l: l, r: this.parseMul() };
      } else break;
    }
    return l;
  };
  Parser.prototype.parseMul = function () {
    var l = this.parseUnary();
    for (;;) {
      var t = this.peek();
      if (t.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) {
        this.next(); l = { t: 'bin', op: t.v, l: l, r: this.parseUnary() };
      } else break;
    }
    return l;
  };
  Parser.prototype.parseUnary = function () {
    if (this.isOp('-')) { this.next(); return { t: 'un', op: '-', e: this.parseUnary() }; }
    if (this.isOp('+')) { this.next(); return this.parseUnary(); }
    return this.parsePrimary();
  };
  Parser.prototype.parsePrimary = function () {
    var t = this.next();
    if (t.t === 'num') return { t: 'num', v: t.v };
    if (t.t === 'str') return { t: 'str', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      var e = this.parseOr(); this.expectOp(')'); return e;
    }
    if (t.t === 'ident') {
      if (this.isOp('(') && !t.quoted) {
        this.next();
        var args = [];
        if (!this.isOp(')')) { args.push(this.parseOr()); while (this.isOp(',')) { this.next(); args.push(this.parseOr()); } }
        this.expectOp(')');
        return { t: 'call', name: t.v.toLowerCase(), args: args, raw: t.v };
      }
      var lv = t.v.toLowerCase();
      if (!t.quoted && lv === 'true') return { t: 'bool', v: true };
      if (!t.quoted && lv === 'false') return { t: 'bool', v: false };
      if (!t.quoted && lv === 'null') return { t: 'null' };
      return { t: 'field', name: t.v };
    }
    err('Unexpected token in expression' + (t.v !== undefined ? ' near "' + t.v + '"' : ''));
  };

  var exprCache = {};
  function parseExpr(src) {
    if (exprCache[src]) return exprCache[src];
    var ast = new Parser(tokenize(src)).parse();
    exprCache[src] = ast;
    return ast;
  }

  /* =====================================================================
     Time helpers
     ===================================================================== */
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MONF = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DAYF = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function z(n, w) { var s = String(Math.abs(n)); while (s.length < (w || 2)) s = '0' + s; return (n < 0 ? '-' : '') + s; }

  function strftime(epoch, fmt) {
    var n = numeric(epoch);
    if (n === undefined) return NULLV;
    var d = new Date(n * 1000);
    if (isNaN(d.getTime())) return NULLV;
    var out = '', i = 0;
    fmt = String(fmt);
    while (i < fmt.length) {
      if (fmt[i] !== '%') { out += fmt[i++]; continue; }
      var spec = fmt[i + 1], dash = false;
      if (spec === '-') { dash = true; spec = fmt[i + 2]; i++; }
      i += 2;
      switch (spec) {
        case 'Y': out += d.getFullYear(); break;
        case 'y': out += z(d.getFullYear() % 100); break;
        case 'm': out += dash ? (d.getMonth() + 1) : z(d.getMonth() + 1); break;
        case 'd': out += dash ? d.getDate() : z(d.getDate()); break;
        case 'e': out += String(d.getDate()).padStart(2, ' '); break;
        case 'H': out += dash ? d.getHours() : z(d.getHours()); break;
        case 'I': out += z(((d.getHours() + 11) % 12) + 1); break;
        case 'M': out += dash ? d.getMinutes() : z(d.getMinutes()); break;
        case 'S': out += dash ? d.getSeconds() : z(d.getSeconds()); break;
        case 'N': case 'f': case '3': out += z(d.getMilliseconds(), 3); break;
        case 'Q': out += z(d.getMilliseconds(), 3); break;
        case 'p': out += d.getHours() < 12 ? 'AM' : 'PM'; break;
        case 'b': case 'h': out += MON[d.getMonth()]; break;
        case 'B': out += MONF[d.getMonth()]; break;
        case 'a': out += DAY[d.getDay()]; break;
        case 'A': out += DAYF[d.getDay()]; break;
        case 'j': {
          var st = new Date(d.getFullYear(), 0, 0);
          out += z(Math.floor((d - st) / 86400000), 3); break;
        }
        case 'w': out += d.getDay(); break;
        case 'F': out += d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); break;
        case 'T': out += z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); break;
        case 'D': out += z(d.getMonth() + 1) + '/' + z(d.getDate()) + '/' + z(d.getFullYear() % 100); break;
        case 'R': out += z(d.getHours()) + ':' + z(d.getMinutes()); break;
        case 's': out += Math.floor(n); break;
        case 'z': {
          var off = -d.getTimezoneOffset();
          out += (off < 0 ? '-' : '+') + z(Math.floor(Math.abs(off) / 60)) + z(Math.abs(off) % 60); break;
        }
        case 'Z': out += 'LOCAL'; break;
        case 'U': case 'W': out += z(Math.floor((Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 6) / 7)); break;
        case '%': out += '%'; break;
        default: out += '%' + (spec === undefined ? '' : spec);
      }
    }
    return out;
  }

  function strptime(str, fmt) {
    str = toStr(str); fmt = String(fmt);
    var re = '', fields = [], i = 0;
    var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    while (i < fmt.length) {
      if (fmt[i] !== '%') { re += esc(fmt[i]); i++; continue; }
      var s = fmt[i + 1]; i += 2;
      switch (s) {
        case 'Y': re += '(\\d{4})'; fields.push('Y'); break;
        case 'y': re += '(\\d{2})'; fields.push('y'); break;
        case 'm': re += '(\\d{1,2})'; fields.push('m'); break;
        case 'd': case 'e': re += '\\s*(\\d{1,2})'; fields.push('d'); break;
        case 'H': re += '(\\d{1,2})'; fields.push('H'); break;
        case 'I': re += '(\\d{1,2})'; fields.push('I'); break;
        case 'M': re += '(\\d{1,2})'; fields.push('M'); break;
        case 'S': re += '(\\d{1,2})'; fields.push('S'); break;
        case 'N': case 'f': re += '(\\d{1,9})'; fields.push('f'); break;
        case 'p': re += '([AaPp][Mm])'; fields.push('p'); break;
        case 'b': case 'h': re += '([A-Za-z]{3})'; fields.push('b'); break;
        case 'B': re += '([A-Za-z]+)'; fields.push('B'); break;
        case 'a': re += '[A-Za-z]{3}'; break;
        case 'A': re += '[A-Za-z]+'; break;
        case 'Z': re += '[A-Za-z/_]+'; break;
        case 'z': re += '([+-]\\d{4})'; fields.push('z'); break;
        case 's': re += '(\\d+)'; fields.push('s'); break;
        case 'F': re += '(\\d{4})-(\\d{2})-(\\d{2})'; fields.push('Y', 'm', 'd'); break;
        case 'T': re += '(\\d{2}):(\\d{2}):(\\d{2})'; fields.push('H', 'M', 'S'); break;
        case '%': re += '%'; break;
        default: re += '.*?';
      }
    }
    var m = new RegExp(re).exec(str);
    if (!m) return NULLV;
    var v = { Y: 1970, m: 1, d: 1, H: 0, M: 0, S: 0, f: 0 }, pm = null, zoff = null;
    for (var k = 0; k < fields.length; k++) {
      var val = m[k + 1], f = fields[k];
      if (f === 'b') { v.m = MON.indexOf(val.slice(0, 1).toUpperCase() + val.slice(1, 3).toLowerCase()) + 1; }
      else if (f === 'B') { v.m = MONF.map(function (x) { return x.toLowerCase(); }).indexOf(val.toLowerCase()) + 1; }
      else if (f === 'p') { pm = val.toLowerCase() === 'pm'; }
      else if (f === 'y') { v.Y = 2000 + Number(val); }
      else if (f === 'I') { v.H = Number(val); }
      else if (f === 's') { return Number(val); }
      else if (f === 'z') { zoff = (val[0] === '-' ? -1 : 1) * (Number(val.slice(1, 3)) * 60 + Number(val.slice(3, 5))); }
      else v[f] = Number(val);
    }
    if (pm !== null) { if (pm && v.H < 12) v.H += 12; if (!pm && v.H === 12) v.H = 0; }
    var dt = new Date(v.Y, v.m - 1, v.d, v.H, v.M, v.S, v.f);
    var epoch = dt.getTime() / 1000;
    if (zoff !== null) epoch = Date.UTC(v.Y, v.m - 1, v.d, v.H, v.M, v.S) / 1000 - zoff * 60;
    return epoch;
  }

  var UNIT = {
    s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
    m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
    h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
    d: 'd', day: 'd', days: 'd',
    w: 'w', week: 'w', weeks: 'w',
    mon: 'mon', month: 'mon', months: 'mon',
    q: 'q', qtr: 'q', quarter: 'q', quarters: 'q',
    y: 'y', yr: 'y', year: 'y', years: 'y'
  };
  var UNIT_SECS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

  /* Parse a Splunk time modifier: -24h@h, @d, +1d, now, 1755000000, -1w@w1 */
  function relativeTime(base, mod) {
    if (isNull(mod)) return base;
    var s = String(mod).trim();
    if (s === 'now' || s === '') return base;
    if (/^-?\d{9,}(\.\d+)?$/.test(s)) return Number(s);
    var d = new Date(base * 1000);
    var re = /([+-])\s*(\d*)\s*([A-Za-z]+)|@\s*([A-Za-z]+)(\d?)/g, m, any = false;
    while ((m = re.exec(s)) !== null) {
      any = true;
      if (m[4] !== undefined) {                      // snap
        var su = UNIT[m[4].toLowerCase()];
        if (!su) err('Unknown snap unit "' + m[4] + '" in time modifier');
        d.setMilliseconds(0);
        if (su === 's') { /* nothing more */ }
        if (su === 'm') { d.setSeconds(0); }
        if (su === 'h') { d.setMinutes(0, 0, 0); }
        if (su === 'd') { d.setHours(0, 0, 0, 0); }
        if (su === 'w') {
          d.setHours(0, 0, 0, 0);
          var target = m[5] === '' ? 0 : Number(m[5]);
          var diff = (d.getDay() - target + 7) % 7;
          d.setDate(d.getDate() - diff);
        }
        if (su === 'mon') { d.setDate(1); d.setHours(0, 0, 0, 0); }
        if (su === 'q') { d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); d.setHours(0, 0, 0, 0); }
        if (su === 'y') { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
      } else {
        var sign = m[1] === '-' ? -1 : 1;
        var amt = m[2] === '' ? 1 : Number(m[2]);
        var u = UNIT[m[3].toLowerCase()];
        if (!u) err('Unknown time unit "' + m[3] + '" in time modifier');
        if (u === 'mon') d.setMonth(d.getMonth() + sign * amt);
        else if (u === 'q') d.setMonth(d.getMonth() + sign * amt * 3);
        else if (u === 'y') d.setFullYear(d.getFullYear() + sign * amt);
        else d.setTime(d.getTime() + sign * amt * UNIT_SECS[u] * 1000);
      }
    }
    if (!any) err('Could not parse time modifier "' + s + '"');
    return Math.floor(d.getTime() / 1000);
  }

  /* =====================================================================
     Regex translation: PCRE-flavoured Splunk regexes -> JS RegExp
     ===================================================================== */
  function toRegExp(pattern, extraFlags) {
    var flags = extraFlags || '';
    var p = String(pattern);
    // leading inline flags, e.g. (?i)
    var m = /^\(\?([imsx]+)\)/.exec(p);
    if (m) { flags += m[1].replace(/x/g, ''); p = p.slice(m[0].length); }
    p = p.replace(/\(\?<([A-Za-z_][A-Za-z0-9_]*)>/g, '(?<$1>');   // same syntax, kept explicit
    p = p.replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, '(?<$1>');  // python style
    flags = flags.split('').filter(function (v, i, a) { return a.indexOf(v) === i; }).join('');
    try { return new RegExp(p, flags); }
    catch (e) { err('Invalid regular expression: ' + e.message); }
  }

  function likeToRegExp(pat) {
    var out = '^', s = String(pat);
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '%') out += '[\\s\\S]*';
      else if (c === '_') out += '[\\s\\S]';
      else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(out + '$');
  }

  /* =====================================================================
     cidrmatch
     ===================================================================== */
  function ipToLong(ip) {
    var parts = String(ip).trim().split('.');
    if (parts.length !== 4) return null;
    var v = 0;
    for (var i = 0; i < 4; i++) {
      var o = Number(parts[i]);
      if (!isFinite(o) || o < 0 || o > 255 || parts[i] === '') return null;
      v = v * 256 + o;
    }
    return v;
  }
  function cidrMatch(cidr, ip) {
    var bits = String(cidr).split('/');
    var base = ipToLong(bits[0]);
    var mask = bits.length > 1 ? Number(bits[1]) : 32;
    var target = ipToLong(ip);
    if (base === null || target === null || !isFinite(mask) || mask < 0 || mask > 32) return false;
    if (mask === 0) return true;
    // Compare the network portion by dividing away the host bits.
    var block = Math.pow(2, 32 - mask);
    return Math.floor(base / block) === Math.floor(target / block);
  }

  /* =====================================================================
     eval() function library
     ctx = { event, ctx } where ctx carries lookups/search matcher
     ===================================================================== */
  function needArgs(name, args, min, max) {
    if (args.length < min || (max !== undefined && args.length > max)) {
      err('Function "' + name + '" expects ' + (max === min ? min : min + '-' + (max === undefined ? 'n' : max)) +
          ' argument(s), got ' + args.length);
    }
  }

  function num1(name, v) {
    var n = numeric(v);
    if (n === undefined) return NULLV;
    return n;
  }

  var FUNCS = {
    /* ---- comparison / null handling ---- */
    'isnull':    function (a) { return isNull(a[0]); },
    'isnotnull': function (a) { return !isNull(a[0]); },
    'isnum':     function (a) { return numeric(a[0]) !== undefined; },
    'isint':     function (a) { var n = numeric(a[0]); return n !== undefined && Number.isInteger(n); },
    'isstr':     function (a) { return !isNull(a[0]) && numeric(a[0]) === undefined && typeof a[0] !== 'boolean'; },
    'isbool':    function (a) { return typeof a[0] === 'boolean'; },
    'null':      function () { return NULLV; },
    'nullif':    function (a) { return cmp(a[0], a[1]) === 0 ? NULLV : a[0]; },
    'typeof':    function (a) {
      var v = a[0];
      if (isNull(v)) return 'Invalid';
      if (typeof v === 'boolean') return 'Boolean';
      if (numeric(v) !== undefined && typeof v === 'number') return 'Number';
      return 'String';
    },
    'true':  function () { return true; },
    'false': function () { return false; },

    /* ---- text ---- */
    'len':     function (a) { return isNull(a[0]) ? NULLV : toStr(a[0]).length; },
    'lower':   function (a) { return toStr(a[0]).toLowerCase(); },
    'upper':   function (a) { return toStr(a[0]).toUpperCase(); },
    'ltrim':   function (a) { var s = toStr(a[0]), t = a.length > 1 ? toStr(a[1]) : ' \t';
                              var i = 0; while (i < s.length && t.indexOf(s[i]) >= 0) i++; return s.slice(i); },
    'rtrim':   function (a) { var s = toStr(a[0]), t = a.length > 1 ? toStr(a[1]) : ' \t';
                              var i = s.length; while (i > 0 && t.indexOf(s[i - 1]) >= 0) i--; return s.slice(0, i); },
    'trim':    function (a) { return FUNCS.rtrim([FUNCS.ltrim(a)].concat(a.slice(1))); },
    'substr':  function (a) {
      var s = toStr(a[0]), start = numeric(a[1]);
      if (start === undefined) return NULLV;
      var i = start > 0 ? start - 1 : s.length + start;
      if (a.length > 2) { var l = numeric(a[2]); return s.substr(i, l); }
      return s.substr(i);
    },
    'replace': function (a) { return toStr(a[0]).replace(toRegExp(toStr(a[1]), 'g'), toStr(a[2]).replace(/\\(\d)/g, '$$$1')); },
    'urldecode': function (a) { try { return decodeURIComponent(toStr(a[0]).replace(/\+/g, ' ')); } catch (e) { return toStr(a[0]); } },
    'split':   function (a) { var parts = toStr(a[0]).split(toStr(a[1])); return parts.length > 1 ? parts : parts[0]; },
    'printf':  function (a) {
      var fmt = toStr(a[0]), args = a.slice(1), ai = 0;
      return fmt.replace(/%(-)?(0)?(\d+)?(?:\.(\d+))?([sdifxXeEg%])/g, function (all, left, zero, width, prec, conv) {
        if (conv === '%') return '%';
        var v = args[ai++], out;
        if (conv === 'd' || conv === 'i') out = String(Math.round(numeric(v) || 0));
        else if (conv === 'f') out = (numeric(v) || 0).toFixed(prec === undefined ? 6 : Number(prec));
        else if (conv === 'e' || conv === 'E') { out = (numeric(v) || 0).toExponential(prec === undefined ? 6 : Number(prec)); if (conv === 'E') out = out.toUpperCase(); }
        else if (conv === 'g') out = String(numeric(v) || 0);
        else if (conv === 'x') out = (Math.round(numeric(v) || 0) >>> 0).toString(16);
        else if (conv === 'X') out = (Math.round(numeric(v) || 0) >>> 0).toString(16).toUpperCase();
        else { out = toStr(v); if (prec !== undefined) out = out.slice(0, Number(prec)); }
        if (width) {
          var w = Number(width);
          while (out.length < w) out = left ? out + ' ' : (zero && conv !== 's' ? '0' + out : ' ' + out);
        }
        return out;
      });
    },

    /* ---- math ---- */
    'abs':   function (a) { var n = numeric(a[0]); return n === undefined ? NULLV : Math.abs(n); },
    'ceiling': function (a) { var n = numeric(a[0]); return n === undefined ? NULLV : Math.ceil(n); },
    'ceil':  function (a) { return FUNCS.ceiling(a); },
    'floor': function (a) { var n = numeric(a[0]); return n === undefined ? NULLV : Math.floor(n); },
    'round': function (a) {
      var n = numeric(a[0]); if (n === undefined) return NULLV;
      var p = a.length > 1 ? (numeric(a[1]) || 0) : 0;
      var f = Math.pow(10, p);
      return Math.round((n * f + (n >= 0 ? 1e-9 : -1e-9))) / f;
    },
    'sqrt':  function (a) { var n = numeric(a[0]); return n === undefined || n < 0 ? NULLV : Math.sqrt(n); },
    'exp':   function (a) { var n = numeric(a[0]); return n === undefined ? NULLV : Math.exp(n); },
    'ln':    function (a) { var n = numeric(a[0]); return n === undefined || n <= 0 ? NULLV : Math.log(n); },
    'log':   function (a) {
      var n = numeric(a[0]); if (n === undefined || n <= 0) return NULLV;
      var b = a.length > 1 ? numeric(a[1]) : 10;
      return Math.log(n) / Math.log(b);
    },
    'pow':   function (a) { var x = numeric(a[0]), y = numeric(a[1]); return (x === undefined || y === undefined) ? NULLV : Math.pow(x, y); },
    'pi':    function () { return Math.PI; },
    'exact': function (a) { return numeric(a[0]); },
    'sigfig': function (a) {
      var n = numeric(a[0]); if (n === undefined) return NULLV;
      return Number(n.toPrecision(a.length > 1 ? numeric(a[1]) : 6));
    },
    'random': function () { return Math.floor(Math.random() * 2147483647); },
    'min': function (a) { var f = a.filter(function (x) { return !isNull(x); }); if (!f.length) return NULLV;
                          return f.reduce(function (p, c) { return cmp(c, p) < 0 ? c : p; }); },
    'max': function (a) { var f = a.filter(function (x) { return !isNull(x); }); if (!f.length) return NULLV;
                          return f.reduce(function (p, c) { return cmp(c, p) > 0 ? c : p; }); },

    /* ---- multivalue ---- */
    'mvcount':  function (a) { return isNull(a[0]) ? NULLV : (isMV(a[0]) ? a[0].length : 1); },
    'mvindex':  function (a) {
      var mv = isMV(a[0]) ? a[0] : [a[0]];
      var s = numeric(a[1]); if (s === undefined) return NULLV;
      if (s < 0) s = mv.length + s;
      if (a.length > 2) {
        var e = numeric(a[2]); if (e < 0) e = mv.length + e;
        var slice = mv.slice(s, e + 1);
        return slice.length === 0 ? NULLV : (slice.length === 1 ? slice[0] : slice);
      }
      return s >= 0 && s < mv.length ? mv[s] : NULLV;
    },
    'mvjoin':   function (a) { var mv = isMV(a[0]) ? a[0] : [a[0]]; return mv.map(toStr).join(toStr(a[1])); },
    'mvappend': function (a) {
      var out = [];
      a.forEach(function (v) { if (isNull(v)) return; if (isMV(v)) out = out.concat(v); else out.push(v); });
      return out.length === 0 ? NULLV : (out.length === 1 ? out[0] : out);
    },
    'mvdedup':  function (a) {
      if (!isMV(a[0])) return a[0];
      var seen = {}, out = [];
      a[0].forEach(function (v) { var k = toStr(v); if (!seen[k]) { seen[k] = 1; out.push(v); } });
      return out.length === 1 ? out[0] : out;
    },
    'mvsort':   function (a) { if (!isMV(a[0])) return a[0]; return a[0].slice().sort(function (x, y) { return cmp(x, y); }); },
    'mvrange':  function (a) {
      var s = numeric(a[0]), e = numeric(a[1]), st = a.length > 2 ? numeric(a[2]) : 1, out = [];
      if (s === undefined || e === undefined || !st) return NULLV;
      for (var i = s; i < e; i += st) out.push(i);
      return out.length === 1 ? out[0] : out;
    },
    'mvzip': function (a) {
      var x = isMV(a[0]) ? a[0] : [a[0]], y = isMV(a[1]) ? a[1] : [a[1]];
      var d = a.length > 2 ? toStr(a[2]) : ',', out = [];
      for (var i = 0; i < Math.min(x.length, y.length); i++) out.push(toStr(x[i]) + d + toStr(y[i]));
      return out.length === 1 ? out[0] : out;
    },
    'commands': function (a) { return toStr(a[0]).split('|').map(function (s) { return s.trim().split(/\s+/)[0]; }); },

    /* ---- conversion ---- */
    'tostring': function (a) {
      var v = a[0];
      if (isNull(v)) return NULLV;
      var mode = a.length > 1 ? toStr(a[1]) : null;
      if (mode === 'commas') {
        var n = numeric(v); if (n === undefined) return toStr(v);
        var fixed = n.toFixed(2).split('.');
        return fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fixed[1];
      }
      if (mode === 'hex') { var h = numeric(v); return h === undefined ? toStr(v) : '0x' + (h >>> 0).toString(16); }
      if (mode === 'duration') {
        var s = Math.floor(numeric(v) || 0);
        var neg = s < 0; s = Math.abs(s);
        var d = Math.floor(s / 86400); s %= 86400;
        var hh = Math.floor(s / 3600); s %= 3600;
        var mm = Math.floor(s / 60), ss = s % 60;
        return (neg ? '-' : '') + (d ? d + '+' : '') + z(hh) + ':' + z(mm) + ':' + z(ss);
      }
      if (typeof v === 'boolean') return v ? 'True' : 'False';
      return toStr(v);
    },
    'tonumber': function (a) {
      var s = toStr(a[0]).trim();
      var base = a.length > 1 ? numeric(a[1]) : 10;
      var n = base === 10 ? numeric(s) : parseInt(s, base);
      return (n === undefined || (typeof n === 'number' && isNaN(n))) ? NULLV : n;
    },

    /* ---- time ---- */
    'now':      function (a, c) { return c.now; },
    'time':     function (a, c) { return c.now; },
    'strftime': function (a) { return strftime(a[0], a[1]); },
    'strptime': function (a) { return strptime(a[0], a[1]); },
    'relative_time': function (a) {
      var n = numeric(a[0]); if (n === undefined) return NULLV;
      return relativeTime(n, toStr(a[1]));
    },

    /* ---- predicates ---- */
    'like':      function (a) { return likeToRegExp(toStr(a[1])).test(toStr(a[0])); },
    'match':     function (a) { return toRegExp(toStr(a[1])).test(toStr(a[0])); },
    'in':        function (a) { var v = a[0]; return a.slice(1).some(function (x) { return cmp(v, x) === 0; }); },
    'cidrmatch': function (a) { return cidrMatch(toStr(a[0]), toStr(a[1])); },
    'searchmatch': function (a, c) {
      if (!c.searchMatcher) return false;
      return c.searchMatcher(toStr(a[0]), c.event);
    },

    /* ---- structured ---- */
    'spath': function (a) {
      var obj;
      try { obj = JSON.parse(toStr(a[0])); } catch (e) { return NULLV; }
      return jsonPath(obj, toStr(a[1]));
    },
    'json_extract': function (a) { return FUNCS.spath(a); },
    'json_valid': function (a) { try { JSON.parse(toStr(a[0])); return true; } catch (e) { return false; } },

    /* ---- misc ---- */
    'md5':  function (a) { return simpleHash(toStr(a[0]), 32); },
    'sha1': function (a) { return simpleHash(toStr(a[0]), 40); },
    'sha256': function (a) { return simpleHash(toStr(a[0]), 64); }
  };

  /* Not real crypto - deterministic stand-in so hash examples produce output. */
  function simpleHash(s, len) {
    var h1 = 0x12345678, h2 = 0x9abcdef0;
    for (var i = 0; i < s.length; i++) {
      h1 = (Math.imul(h1 ^ s.charCodeAt(i), 2654435761)) >>> 0;
      h2 = (Math.imul(h2 + s.charCodeAt(i), 1597334677)) >>> 0;
    }
    var out = '';
    while (out.length < len) {
      h1 = (Math.imul(h1 ^ (h1 >>> 13), 2246822519)) >>> 0;
      h2 = (Math.imul(h2 ^ (h2 >>> 16), 3266489917)) >>> 0;
      out += ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
    }
    return out.slice(0, len);
  }

  function jsonPath(obj, path) {
    if (obj === null || obj === undefined) return NULLV;
    var parts = String(path).split('.');
    var cur = [obj];
    for (var i = 0; i < parts.length; i++) {
      var key = parts[i], idx = null;
      var m = /^(.*?)\{(\d*)\}$/.exec(key);
      if (m) { key = m[1]; idx = m[2] === '' ? '*' : Number(m[2]); }
      var next = [];
      cur.forEach(function (o) {
        if (o === null || o === undefined) return;
        var v = key === '' ? o : o[key];
        if (v === undefined) return;
        if (idx === '*') { if (Array.isArray(v)) next = next.concat(v); else next.push(v); }
        else if (idx !== null) { if (Array.isArray(v) && v[idx] !== undefined) next.push(v[idx]); }
        else if (Array.isArray(v)) next = next.concat(v);
        else next.push(v);
      });
      cur = next;
    }
    var flat = cur.map(function (v) { return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v; });
    if (flat.length === 0) return NULLV;
    return flat.length === 1 ? flat[0] : flat;
  }

  /* =====================================================================
     Evaluator
     ===================================================================== */
  function evalNode(node, event, ctx) {
    switch (node.t) {
      case 'num':  return node.v;
      case 'str':  return node.v;
      case 'bool': return node.v;
      case 'null': return NULLV;
      case 'field': {
        var v = event[node.name];
        return v === undefined ? NULLV : v;
      }
      case 'un': {
        if (node.op === 'NOT') return !truthy(evalNode(node.e, event, ctx));
        var n = numeric(evalNode(node.e, event, ctx));
        return n === undefined ? NULLV : -n;
      }
      case 'bin': return evalBin(node, event, ctx);
      case 'call': return evalCall(node, event, ctx);
    }
    err('Cannot evaluate expression');
  }

  function evalBin(node, event, ctx) {
    var op = node.op;
    if (op === 'AND') return truthy(evalNode(node.l, event, ctx)) && truthy(evalNode(node.r, event, ctx));
    if (op === 'OR')  return truthy(evalNode(node.l, event, ctx)) || truthy(evalNode(node.r, event, ctx));
    if (op === 'XOR') return truthy(evalNode(node.l, event, ctx)) !== truthy(evalNode(node.r, event, ctx));

    var a = evalNode(node.l, event, ctx), b = evalNode(node.r, event, ctx);

    if (op === '.') {
      if (isNull(a) && isNull(b)) return NULLV;
      return toStr(a) + toStr(b);
    }
    if (['==', '!=', '<', '>', '<=', '>='].indexOf(op) >= 0) {
      if (isNull(a) || isNull(b)) return false;
      var c = cmp(a, b);
      switch (op) {
        case '==': return c === 0;
        case '!=': return c !== 0;
        case '<':  return c < 0;
        case '>':  return c > 0;
        case '<=': return c <= 0;
        case '>=': return c >= 0;
      }
    }
    var na = numeric(a), nb = numeric(b);
    if (na === undefined || nb === undefined) return NULLV;
    switch (op) {
      case '+': return na + nb;
      case '-': return na - nb;
      case '*': return na * nb;
      case '/': return nb === 0 ? NULLV : na / nb;
      case '%': return nb === 0 ? NULLV : na % nb;
    }
    err('Unsupported operator "' + op + '"');
  }

  /* Lazily-evaluated functions must be handled before argument evaluation. */
  function evalCall(node, event, ctx) {
    var name = node.name, args = node.args;

    if (name === 'if') {
      needArgs('if', args, 3, 3);
      return truthy(evalNode(args[0], event, ctx)) ? evalNode(args[1], event, ctx) : evalNode(args[2], event, ctx);
    }
    if (name === 'case') {
      if (args.length < 2 || args.length % 2 !== 0) err('case() requires an even number of arguments');
      for (var i = 0; i < args.length; i += 2) {
        if (truthy(evalNode(args[i], event, ctx))) return evalNode(args[i + 1], event, ctx);
      }
      return NULLV;
    }
    if (name === 'validate') {
      if (args.length < 2 || args.length % 2 !== 0) err('validate() requires an even number of arguments');
      for (var j = 0; j < args.length; j += 2) {
        if (!truthy(evalNode(args[j], event, ctx))) return evalNode(args[j + 1], event, ctx);
      }
      return NULLV;
    }
    if (name === 'coalesce') {
      for (var k = 0; k < args.length; k++) {
        var v = evalNode(args[k], event, ctx);
        if (!isNull(v)) return v;
      }
      return NULLV;
    }
    if (name === 'mvfilter' || name === 'mvmap') {
      needArgs(name, args, name === 'mvmap' ? 2 : 1, 2);
      var target = name === 'mvmap' ? args[0] : null;
      var body = name === 'mvmap' ? args[1] : args[0];
      var fieldName = target && target.t === 'field' ? target.name : firstFieldIn(body);
      if (!fieldName) err(name + '() must reference a field');
      var src = event[fieldName];
      var list = isMV(src) ? src : (isNull(src) ? [] : [src]);
      var out = [];
      for (var q = 0; q < list.length; q++) {
        var scoped = Object.create(event);
        scoped[fieldName] = list[q];
        if (name === 'mvfilter') { if (truthy(evalNode(body, scoped, ctx))) out.push(list[q]); }
        else { var r = evalNode(body, scoped, ctx); if (!isNull(r)) out.push(r); }
      }
      if (out.length === 0) return NULLV;
      return out.length === 1 ? out[0] : out;
    }

    var fn = FUNCS[name];
    if (!fn) err('Unknown eval function "' + (node.raw || name) + '()"');
    var vals = args.map(function (a) { return evalNode(a, event, ctx); });
    var c2 = { now: ctx.now, event: event, searchMatcher: ctx.searchMatcher, lookups: ctx.lookups };
    return fn(vals, c2);
  }

  function firstFieldIn(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.t === 'field') return node.name;
    var keys = ['l', 'r', 'e'];
    for (var i = 0; i < keys.length; i++) {
      if (node[keys[i]]) { var f = firstFieldIn(node[keys[i]]); if (f) return f; }
    }
    if (node.args) {
      for (var j = 0; j < node.args.length; j++) { var g = firstFieldIn(node.args[j]); if (g) return g; }
    }
    return null;
  }

  /* Collect field names referenced by an expression (used by fields auto-discovery) */
  function fieldsIn(node, acc) {
    acc = acc || [];
    if (!node || typeof node !== 'object') return acc;
    if (node.t === 'field') { if (acc.indexOf(node.name) < 0) acc.push(node.name); }
    ['l', 'r', 'e'].forEach(function (k) { if (node[k]) fieldsIn(node[k], acc); });
    if (node.args) node.args.forEach(function (a) { fieldsIn(a, acc); });
    return acc;
  }

  global.SPLLang = {
    SPLError: SPLError, err: err,
    tokenize: tokenize, parseExpr: parseExpr, evalNode: evalNode,
    numeric: numeric, toStr: toStr, truthy: truthy, cmp: cmp,
    isNull: isNull, isMV: isMV,
    strftime: strftime, strptime: strptime, relativeTime: relativeTime,
    toRegExp: toRegExp, likeToRegExp: likeToRegExp, cidrMatch: cidrMatch,
    jsonPath: jsonPath, fieldsIn: fieldsIn, FUNCS: FUNCS
  };

})(typeof window !== 'undefined' ? window : this);

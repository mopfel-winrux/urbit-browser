// browser-runtime: a headless DOM + page environment for QuickJS on urwasm.
//
// Bundled into desk/js/browser-runtime.js and evaluated once per page by the
// %browser Gall agent. The agent talks to it through the __browser API at the
// bottom of the bundle and provides these host functions on globalThis:
//
//   __host_fetch(url, method, headersJSON, body) -> JSON string
//       {status, headers:{}, body, url} or {error}
//   __host_log(level, text)
//
// Everything else (HTML parsing, DOM, events, timers, fetch/XHR, storage)
// lives here so that a page's own scripts can run unmodified.
'use strict';
(function () {
const R = {};               // runtime namespace (not exposed to page scripts)
const host = {
  fetch: typeof globalThis.__host_fetch === 'function' ? globalThis.__host_fetch : null,
  log: typeof globalThis.__host_log === 'function' ? globalThis.__host_log : null,
};

// ---------------------------------------------------------------- utilities
const LOG_LIMIT = 40;
R.console = [];             // [{level, text}] captured page console output
R.dialogs = [];             // alert/confirm/prompt/open records
function pushLog(level, args) {
  let text;
  try { text = Array.prototype.map.call(args, fmtLogArg).join(' '); } catch (e) { text = '<unprintable>'; }
  if (text.length > 500) text = text.slice(0, 500) + '…';
  if (R.console.length < LOG_LIMIT) R.console.push({ level, text });
  else if (R.console.length === LOG_LIMIT) R.console.push({ level: 'info', text: '… console output truncated' });
  if (host.log) { try { host.log(level, text); } catch (e) { /* ignore */ } }
}
function fmtLogArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return (a.name || 'Error') + ': ' + a.message;
  if (a && typeof a === 'object' && a.__isNode) return '<' + (a.nodeName || 'node') + '>';
  try { const s = JSON.stringify(a); return s === undefined ? String(a) : s; } catch (e) { return String(a); }
}

// Deterministic PRNG (xorshift32) so replays of the Lia script are stable.
let rngState = 0x9e3779b9;
function seedRandom(seed) { rngState = (seed >>> 0) || 0x9e3779b9; }
function random() {
  let x = rngState; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  rngState = x; return x / 4294967296;
}
R.seedRandom = seedRandom;

// Virtual clock: starts at the host-provided epoch and only advances when
// timers fire, so page scripts observe monotonic, deterministic time.
R.clock = { base: 0, now: 0 };
function vnow() { return R.clock.base + R.clock.now; }

// ------------------------------------------------------- entities & escapes
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
  trade: '™', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', bull: '•', middot: '·',
  times: '×', divide: '÷', deg: '°', plusmn: '±', frac12: '½', frac14: '¼',
  frac34: '¾', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§',
  para: '¶', laquo: '«', raquo: '»', larr: '←', rarr: '→', uarr: '↑',
  darr: '↓', harr: '↔', hearts: '♥', spades: '♠', clubs: '♣', diams: '♦',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏',
  shy: '­', iexcl: '¡', iquest: '¿', micro: 'µ', dagger: '†', Dagger: '‡',
  permil: '‰', prime: '′', Prime: '″', oline: '‾', frasl: '⁄', infin: '∞',
  ne: '≠', le: '≤', ge: '≥', sum: '∑', minus: '−', radic: '√', asymp: '≈',
  equiv: '≡', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', mu: 'μ',
  lambda: 'λ', sigma: 'σ', omega: 'ω', Omega: 'Ω', Delta: 'Δ', Sigma: 'Σ',
  check: '✓', cross: '✗', star: '☆', starf: '★', loz: '◊', ordm: 'º', ordf: 'ª',
  sup1: '¹', sup2: '²', sup3: '³', acute: '´', cedil: '¸', uml: '¨', macr: '¯',
  not: '¬', curren: '¤', brvbar: '¦', Agrave: 'À', Aacute: 'Á', Acirc: 'Â',
  Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È',
  Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î',
  Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô',
  Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û',
  Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß', agrave: 'à', aacute: 'á',
  acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í',
  icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó',
  ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', ugrave: 'ù', uacute: 'ú',
  ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ', OElig: 'Œ',
  oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
};
const LEGACY_NO_SEMI = new Set(['amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg', 'iexcl', 'pound', 'yen', 'sect', 'laquo', 'raquo', 'deg', 'para', 'middot', 'times', 'divide', 'shy', 'eacute', 'egrave', 'agrave', 'aacute', 'ouml', 'uuml', 'auml', 'szlig']);
const ENTITY_RE = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31})(;?)/g;
function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(ENTITY_RE, (m, body, semi) => {
    if (body.charCodeAt(0) === 35) {
      const cp = (body[1] === 'x' || body[1] === 'X') ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!(cp > 0) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
      return String.fromCodePoint(cp);
    }
    const v = ENTITIES[body];
    if (v === undefined) return m;
    if (!semi && !LEGACY_NO_SEMI.has(body)) return m;
    return v;
  });
}
function escapeText(s) { return s.replace(/[&<> ]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;'); }
function escapeAttr(s) { return s.replace(/[&" ]/g, c => c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&nbsp;'); }
R.decodeEntities = decodeEntities; R.escapeText = escapeText; R.escapeAttr = escapeAttr;

// ------------------------------------------------------------------ URLs
// A small WHATWG-ish URL implementation: enough for resolution, components
// and searchParams. Only http(s), about, data, javascript, blob, file schemes.
const SPECIAL_PORTS = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443', 'ftp:': '21' };
class URLSearchParams {
  constructor(init) {
    this._list = [];
    if (init == null) return;
    if (typeof init === 'string') { this._parse(init); }
    else if (init instanceof URLSearchParams) { this._list = init._list.map(p => [p[0], p[1]]); }
    else if (Array.isArray(init) || (typeof init[Symbol.iterator] === 'function' && !(init instanceof FormDataImpl))) { for (const [k, v] of init) this._list.push([String(k), String(v)]); }
    else if (init instanceof FormDataImpl) { for (const [k, v] of init.entries()) this._list.push([k, typeof v === 'string' ? v : (v && v.name) || '']); }
    else { for (const k of Object.keys(init)) this._list.push([k, String(init[k])]); }
  }
  _parse(s) {
    if (s[0] === '?') s = s.slice(1);
    this._list = [];
    if (!s) return;
    for (const part of s.split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = i < 0 ? part : part.slice(0, i), v = i < 0 ? '' : part.slice(i + 1);
      this._list.push([formDecode(k), formDecode(v)]);
    }
  }
  append(k, v) { this._list.push([String(k), String(v)]); this._update(); }
  delete(k) { this._list = this._list.filter(p => p[0] !== k); this._update(); }
  get(k) { const p = this._list.find(p => p[0] === k); return p ? p[1] : null; }
  getAll(k) { return this._list.filter(p => p[0] === k).map(p => p[1]); }
  has(k) { return this._list.some(p => p[0] === k); }
  set(k, v) { const i = this._list.findIndex(p => p[0] === k); if (i < 0) this._list.push([String(k), String(v)]); else { this._list[i][1] = String(v); this._list = this._list.filter((p, j) => j <= i || p[0] !== k); } this._update(); }
  sort() { this._list.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); this._update(); }
  forEach(fn, thisArg) { for (const [k, v] of this._list) fn.call(thisArg, v, k, this); }
  keys() { return this._list.map(p => p[0])[Symbol.iterator](); }
  values() { return this._list.map(p => p[1])[Symbol.iterator](); }
  entries() { return this._list.map(p => [p[0], p[1]])[Symbol.iterator](); }
  [Symbol.iterator]() { return this.entries(); }
  get size() { return this._list.length; }
  toString() { return this._list.map(p => formEncode(p[0]) + '=' + formEncode(p[1])).join('&'); }
  _update() { if (this._url) { const s = this.toString(); this._url._search = s ? '?' + s : ''; } }
}
function formEncode(s) { return encodeURIComponent(s).replace(/%20/g, '+').replace(/[!'()~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function formDecode(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }

const URL_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/;
class URLImpl {
  constructor(url, base) {
    url = String(url).trim();
    let parsed = parseURL(url);
    if (!parsed) {
      if (base === undefined) throw new TypeError('Invalid URL: ' + url);
      const b = base instanceof URLImpl ? base : new URLImpl(String(base));
      parsed = resolveRelative(url, b);
      if (!parsed) throw new TypeError('Invalid URL: ' + url);
    }
    Object.assign(this, parsed);
    this._sp = null;
  }
  get protocol() { return this._protocol; }
  set protocol(v) { v = String(v); if (!v.endsWith(':')) v += ':'; this._protocol = v.toLowerCase(); }
  get username() { return this._username; } set username(v) { this._username = String(v); }
  get password() { return this._password; } set password(v) { this._password = String(v); }
  get hostname() { return this._hostname; } set hostname(v) { this._hostname = String(v).toLowerCase(); }
  get port() { return this._port; } set port(v) { v = String(v); this._port = SPECIAL_PORTS[this._protocol] === v ? '' : v; }
  get host() { return this._hostname + (this._port ? ':' + this._port : ''); }
  set host(v) { const m = /^([^:]*)(?::(\d*))?$/.exec(String(v)); if (m) { this.hostname = m[1]; this.port = m[2] || ''; } }
  get origin() { return this._special ? this._protocol + '//' + this.host : 'null'; }
  get pathname() { return this._pathname; } set pathname(v) { v = String(v); this._pathname = this._special && v[0] !== '/' ? '/' + v : v; }
  get search() { return this._search; }
  set search(v) { v = String(v); this._search = v === '' || v === '?' ? '' : (v[0] === '?' ? v : '?' + v); if (this._sp) this._sp._parse(this._search); }
  get hash() { return this._hash; } set hash(v) { v = String(v); this._hash = v === '' || v === '#' ? '' : (v[0] === '#' ? v : '#' + v); }
  get searchParams() { if (!this._sp) { this._sp = new URLSearchParams(this._search); this._sp._url = this; } return this._sp; }
  get href() {
    if (!this._special) return this._protocol + this._pathname + this._search + this._hash;
    const auth = this._username ? this._username + (this._password ? ':' + this._password : '') + '@' : '';
    return this._protocol + '//' + auth + this.host + this._pathname + this._search + this._hash;
  }
  set href(v) { const p = parseURL(String(v)); if (!p) throw new TypeError('Invalid URL'); Object.assign(this, p); this._sp = null; }
  toString() { return this.href; }
  toJSON() { return this.href; }
  static canParse(u, b) { try { new URLImpl(u, b); return true; } catch (e) { return false; } }
  static createObjectURL() { return 'blob:' + (R.location ? R.location.origin : 'null') + '/' + Math.floor(random() * 1e9); }
  static revokeObjectURL() {}
}
function parseURL(url) {
  const m = URL_RE.exec(url);
  if (!m) return null;
  const protocol = m[1].toLowerCase() + ':';
  let rest = m[2];
  const special = protocol === 'http:' || protocol === 'https:' || protocol === 'ws:' || protocol === 'wss:' || protocol === 'ftp:' || protocol === 'file:';
  const out = { _protocol: protocol, _username: '', _password: '', _hostname: '', _port: '', _pathname: '', _search: '', _hash: '', _special: special };
  if (!special) {
    const hi = rest.indexOf('#'); if (hi >= 0) { out._hash = rest.slice(hi); rest = rest.slice(0, hi); }
    const qi = rest.indexOf('?'); if (qi >= 0) { out._search = rest.slice(qi); rest = rest.slice(0, qi); }
    out._pathname = rest;
    return out;
  }
  rest = rest.replace(/^[\\/]+/, '');
  if (protocol === 'file:' && !/^[\\/]/.test(m[2].slice(2))) { /* file:///path */ }
  let end = rest.length;
  for (let i = 0; i < rest.length; i++) { const c = rest[i]; if (c === '/' || c === '\\' || c === '?' || c === '#') { end = i; break; } }
  let authority = rest.slice(0, end); rest = rest.slice(end).replace(/\\/g, '/');
  const at = authority.lastIndexOf('@');
  if (at >= 0) { const cred = authority.slice(0, at); authority = authority.slice(at + 1); const ci = cred.indexOf(':'); out._username = ci < 0 ? cred : cred.slice(0, ci); out._password = ci < 0 ? '' : cred.slice(ci + 1); }
  const pm = /^(\[[^\]]*\]|[^:]*)(?::(\d*))?$/.exec(authority);
  if (!pm) return null;
  out._hostname = pm[1].toLowerCase();
  if (protocol !== 'file:' && !out._hostname) return null;
  out._port = pm[2] && pm[2] !== SPECIAL_PORTS[protocol] ? pm[2] : '';
  const hi = rest.indexOf('#'); if (hi >= 0) { out._hash = rest.slice(hi); rest = rest.slice(0, hi); }
  const qi = rest.indexOf('?'); if (qi >= 0) { out._search = rest.slice(qi); rest = rest.slice(0, qi); }
  out._pathname = normalizePath(rest || '/');
  return out;
}
function normalizePath(p) {
  const segs = p.split('/'); const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === '..') { if (out.length > 1) out.pop(); if (i === segs.length - 1) out.push(''); }
    else if (s === '.') { if (i === segs.length - 1) out.push(''); }
    else out.push(s);
  }
  let r = out.join('/'); if (r[0] !== '/') r = '/' + r; return r;
}
function resolveRelative(rel, base) {
  if (!base._special) {
    if (rel === '' || rel[0] === '#') { const o = { ...base }; o._hash = rel; return cloneURLFields(o); }
    return null;
  }
  const o = cloneURLFields(base);
  o._hash = '';
  if (rel === '') { return o; }
  if (rel[0] === '#') { o._hash = rel; return o; }
  if (rel.startsWith('//')) { const p = parseURL(base._protocol + rel); return p; }
  if (rel[0] === '?') { const hi = rel.indexOf('#'); o._search = hi < 0 ? rel : rel.slice(0, hi); o._hash = hi < 0 ? '' : rel.slice(hi); if (o._search === '?') o._search = ''; return o; }
  let path = rel, search = '', hash = '';
  const hi = path.indexOf('#'); if (hi >= 0) { hash = path.slice(hi); path = path.slice(0, hi); }
  const qi = path.indexOf('?'); if (qi >= 0) { search = path.slice(qi); path = path.slice(0, qi); }
  path = path.replace(/\\/g, '/');
  if (path[0] === '/') o._pathname = normalizePath(path);
  else { const dir = base._pathname.slice(0, base._pathname.lastIndexOf('/') + 1); o._pathname = normalizePath(dir + path); }
  o._search = search === '?' ? '' : search; o._hash = hash;
  return o;
}
function cloneURLFields(b) { return { _protocol: b._protocol, _username: b._username, _password: b._password, _hostname: b._hostname, _port: b._port, _pathname: b._pathname, _search: b._search, _hash: b._hash, _special: b._special }; }
function resolveURL(rel, base) { try { return new URLImpl(rel, base).href; } catch (e) { return null; } }
R.URL = URLImpl; R.URLSearchParams = URLSearchParams; R.resolveURL = resolveURL;

// ----------------------------------------------------------------- FormData
class FormDataImpl {
  constructor(form, submitter) { this._list = []; if (form && form.__isNode) { for (const [k, v] of R.collectFormData(form, submitter)) this._list.push([k, v]); } }
  append(k, v, filename) { this._list.push([String(k), typeof v === 'string' ? v : (v && typeof v === 'object' ? { name: filename || v.name || 'blob', type: v.type || '', size: v.size || 0 } : String(v))]); }
  delete(k) { this._list = this._list.filter(p => p[0] !== k); }
  get(k) { const p = this._list.find(p => p[0] === k); return p ? p[1] : null; }
  getAll(k) { return this._list.filter(p => p[0] === k).map(p => p[1]); }
  has(k) { return this._list.some(p => p[0] === k); }
  set(k, v, filename) { this.delete(k); this.append(k, v, filename); }
  forEach(fn, t) { for (const [k, v] of this._list) fn.call(t, v, k, this); }
  keys() { return this._list.map(p => p[0])[Symbol.iterator](); }
  values() { return this._list.map(p => p[1])[Symbol.iterator](); }
  entries() { return this._list.map(p => [p[0], p[1]])[Symbol.iterator](); }
  [Symbol.iterator]() { return this.entries(); }
}
R.FormData = FormDataImpl;

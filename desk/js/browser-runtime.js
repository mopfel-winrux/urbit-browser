// ==== 01-core.js
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
function collapse(s) { return s.replace(/[\s\u00a0]+/g, ' ').trim(); }
function escapeText(s) { return s.replace(/[&<> ]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;'); }
function escapeAttr(s) { return s.replace(/[&" ]/g, c => c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&nbsp;'); }
R.decodeEntities = decodeEntities; R.escapeText = escapeText; R.escapeAttr = escapeAttr; R.collapse = collapse;

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

// ==== 02-events.js
// ------------------------------------------------------------------ Events
class EventImpl {
  constructor(type, init) {
    init = init || {};
    this.type = String(type);
    this.bubbles = !!init.bubbles; this.cancelable = !!init.cancelable; this.composed = !!init.composed;
    this.target = null; this.currentTarget = null; this.eventPhase = 0;
    this.defaultPrevented = false; this.isTrusted = false; this.timeStamp = R.clock.now;
    this._stop = false; this._stopNow = false; this._dispatching = false;
  }
  get srcElement() { return this.target; }
  get returnValue() { return !this.defaultPrevented; }
  set returnValue(v) { if (!v) this.preventDefault(); }
  get cancelBubble() { return this._stop; }
  set cancelBubble(v) { if (v) this._stop = true; }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; this._stopNow = true; }
  composedPath() { return this._path ? this._path.slice() : []; }
  initEvent(type, bubbles, cancelable) { this.type = type; this.bubbles = !!bubbles; this.cancelable = !!cancelable; }
}
EventImpl.NONE = 0; EventImpl.CAPTURING_PHASE = 1; EventImpl.AT_TARGET = 2; EventImpl.BUBBLING_PHASE = 3;
class UIEventImpl extends EventImpl { constructor(t, i) { super(t, i); i = i || {}; this.detail = i.detail || 0; this.view = i.view || null; } }
class MouseEventImpl extends UIEventImpl {
  constructor(t, i) { super(t, i); i = i || {}; for (const k of ['screenX', 'screenY', 'clientX', 'clientY', 'button', 'buttons']) this[k] = i[k] || 0; for (const k of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) this[k] = !!i[k]; this.relatedTarget = i.relatedTarget || null; this.pageX = this.clientX; this.pageY = this.clientY; this.offsetX = 0; this.offsetY = 0; this.x = this.clientX; this.y = this.clientY; this.movementX = 0; this.movementY = 0; }
  getModifierState() { return false; }
}
class PointerEventImpl extends MouseEventImpl { constructor(t, i) { super(t, i); i = i || {}; this.pointerId = i.pointerId || 1; this.pointerType = i.pointerType || 'mouse'; this.isPrimary = true; this.width = 1; this.height = 1; this.pressure = 0; } }
class WheelEventImpl extends MouseEventImpl { constructor(t, i) { super(t, i); i = i || {}; this.deltaX = i.deltaX || 0; this.deltaY = i.deltaY || 0; this.deltaZ = 0; this.deltaMode = 0; } }
// subclasses that only add defaulted fields
const eventClass = (Base, fields) => class extends Base { constructor(t, i) { super(t, i); i = i || {}; for (const k of Object.keys(fields)) this[k] = i[k] === undefined ? fields[k] : i[k]; } };
const FocusEventImpl = eventClass(UIEventImpl, { relatedTarget: null });
const KEY_CODES = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32, Space: 32, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
class KeyboardEventImpl extends UIEventImpl {
  constructor(t, i) { super(t, i); i = i || {}; this.key = i.key || ''; this.code = i.code || ''; this.location = 0; this.repeat = !!i.repeat; this.isComposing = false; for (const k of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) this[k] = !!i[k]; this.keyCode = i.keyCode !== undefined ? i.keyCode : (KEY_CODES[this.key] !== undefined ? KEY_CODES[this.key] : (this.key.length === 1 ? this.key.toUpperCase().charCodeAt(0) : 0)); this.which = this.keyCode; this.charCode = this.key.length === 1 ? this.key.charCodeAt(0) : 0; }
  getModifierState() { return false; }
}
const InputEventImpl = eventClass(UIEventImpl, { data: null, inputType: '', isComposing: false });
class CustomEventImpl extends eventClass(EventImpl, { detail: null }) { initCustomEvent(t, b, c, d) { this.initEvent(t, b, c); this.detail = d; } }
const SubmitEventImpl = eventClass(EventImpl, { submitter: null });
const PopStateEventImpl = eventClass(EventImpl, { state: null });
const HashChangeEventImpl = eventClass(EventImpl, { oldURL: '', newURL: '' });
const StorageEventImpl = eventClass(EventImpl, { key: null, oldValue: null, newValue: null, url: '', storageArea: null });
const ErrorEventImpl = eventClass(EventImpl, { message: '', filename: '', lineno: 0, colno: 0, error: undefined });
const PromiseRejectionEventImpl = eventClass(EventImpl, { promise: undefined, reason: undefined });
const ProgressEventImpl = eventClass(EventImpl, { lengthComputable: false, loaded: 0, total: 0 });
const MessageEventImpl = eventClass(EventImpl, { data: null, origin: '', lastEventId: '', source: null, ports: [] });
const TransitionEventImpl = eventClass(EventImpl, { propertyName: '', elapsedTime: 0, pseudoElement: '' });
const AnimationEventImpl = eventClass(EventImpl, { animationName: '', elapsedTime: 0, pseudoElement: '' });
const DragEventImpl = eventClass(MouseEventImpl, { dataTransfer: null });
const TouchEventImpl = eventClass(UIEventImpl, { touches: [], targetTouches: [], changedTouches: [] });
const ClipboardEventImpl = eventClass(EventImpl, { clipboardData: null });
const BeforeUnloadEventImpl = eventClass(EventImpl, {});
const CompositionEventImpl = eventClass(UIEventImpl, { data: '' });

const listenersKey = Symbol('listeners');
class EventTargetImpl {
  constructor() { this[listenersKey] = null; }
  addEventListener(type, fn, opts) {
    if (!fn) return;
    type = String(type);
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const once = !!(opts && typeof opts === 'object' && opts.once);
    let map = this[listenersKey]; if (!map) map = this[listenersKey] = Object.create(null);
    let list = map[type]; if (!list) list = map[type] = [];
    if (list.some(l => l.fn === fn && l.capture === capture)) return;
    list.push({ fn, capture, once });
    if (opts && typeof opts === 'object' && opts.signal && typeof opts.signal.addEventListener === 'function') {
      opts.signal.addEventListener('abort', () => this.removeEventListener(type, fn, capture));
    }
  }
  removeEventListener(type, fn, opts) {
    const map = this[listenersKey]; if (!map) return;
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const list = map[String(type)]; if (!list) return;
    const i = list.findIndex(l => l.fn === fn && l.capture === capture);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(ev) {
    if (!(ev instanceof EventImpl)) throw new TypeError('dispatchEvent: not an Event');
    if (ev._dispatching) throw new Error('InvalidStateError: event already dispatched');
    return dispatch(this, ev);
  }
}
function eventPath(target) {
  const path = [];
  let n = target;
  while (n) {
    path.push(n);
    if (n === R.window) break;
    if (n.__isNode) {
      if (n.nodeType === 9) { n = R.window; continue; }
      if (n._host) { n = n._host; continue; }        // shadow root -> host
      n = n.parentNode;
    } else n = null;
  }
  return path;
}
function invokeListeners(node, ev, phase) {
  ev.currentTarget = node; ev.eventPhase = phase;
  const type = ev.type;
  // on<type> IDL handler and inline attribute
  if (phase !== 1) {
    const h = node._handlers && node._handlers[type];
    if (h) { try { const r = h.call(node, ev); if (r === false && type !== 'mouseover') ev.preventDefault(); if (type === 'beforeunload' && r != null) {} } catch (e) { reportError(e, 'on' + type + ' handler'); } if (ev._stopNow) return; }
    else if (node.__isNode && node.nodeType === 1 && node._attrs && node._attrs['on' + type] !== undefined) {
      const code = node._attrs['on' + type];
      try { const fn = new Function('event', code); const r = fn.call(node, ev); if (r === false) ev.preventDefault(); } catch (e) { reportError(e, 'on' + type + ' attribute'); }
      if (ev._stopNow) return;
    }
  }
  const map = node[listenersKey]; if (!map) return;
  const list = map[type]; if (!list || !list.length) return;
  for (const l of list.slice()) {
    if (phase === 1 && !l.capture) continue;
    if (phase === 3 && l.capture) continue;
    if (l.once) { const i = list.indexOf(l); if (i >= 0) list.splice(i, 1); }
    try {
      if (typeof l.fn === 'function') l.fn.call(node, ev);
      else if (l.fn && typeof l.fn.handleEvent === 'function') l.fn.handleEvent(ev);
    } catch (e) { reportError(e, type + ' listener'); }
    if (ev._stopNow) return;
  }
}
function dispatch(target, ev) {
  ev.target = target; ev._dispatching = true; ev._stop = false; ev._stopNow = false;
  const path = eventPath(target); ev._path = path;
  for (let i = path.length - 1; i > 0 && !ev._stop; i--) invokeListeners(path[i], ev, 1);
  if (!ev._stop) invokeListeners(target, ev, 2);
  if (ev.bubbles) for (let i = 1; i < path.length && !ev._stop; i++) invokeListeners(path[i], ev, 3);
  ev._dispatching = false; ev.currentTarget = null; ev.eventPhase = 0;
  return !ev.defaultPrevented;
}
function reportError(e, where) {
  const msg = (e && e.message !== undefined) ? ((e.name || 'Error') + ': ' + e.message) : String(e);
  pushLog('error', [where ? '[' + where + '] ' + msg : msg]);
  R.errors = (R.errors || 0) + 1;
  try {
    if (R.window && (R.window._handlers && R.window._handlers.error || (R.window[listenersKey] && R.window[listenersKey].error))) {
      const ev = new ErrorEventImpl('error', { message: msg, error: e, cancelable: true });
      dispatch(R.window, ev);
    }
  } catch (e2) { /* ignore */ }
}
function fire(target, type, init, Cls) {
  const ev = new (Cls || EventImpl)(type, Object.assign({ bubbles: true, cancelable: true }, init || {}));
  ev.isTrusted = true;
  return dispatch(target, ev);
}
R.Event = EventImpl; R.EventTarget = EventTargetImpl; R.dispatch = dispatch; R.fire = fire; R.reportError = reportError; R.pushLog = pushLog;
R.eventClasses = { Event: EventImpl, UIEvent: UIEventImpl, MouseEvent: MouseEventImpl, PointerEvent: PointerEventImpl, WheelEvent: WheelEventImpl, FocusEvent: FocusEventImpl, KeyboardEvent: KeyboardEventImpl, InputEvent: InputEventImpl, CustomEvent: CustomEventImpl, SubmitEvent: SubmitEventImpl, PopStateEvent: PopStateEventImpl, HashChangeEvent: HashChangeEventImpl, StorageEvent: StorageEventImpl, ErrorEvent: ErrorEventImpl, PromiseRejectionEvent: PromiseRejectionEventImpl, ProgressEvent: ProgressEventImpl, MessageEvent: MessageEventImpl, TransitionEvent: TransitionEventImpl, AnimationEvent: AnimationEventImpl, DragEvent: DragEventImpl, TouchEvent: TouchEventImpl, ClipboardEvent: ClipboardEventImpl, BeforeUnloadEvent: BeforeUnloadEventImpl, CompositionEvent: CompositionEventImpl };

// ==== 03-dom.js
// --------------------------------------------------------------------- DOM
const BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'center', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'caption', 'colgroup', 'option', 'optgroup', 'br', 'textarea', 'select', 'noscript', 'iframe', 'canvas', 'video', 'audio']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen', 'command']);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
const RCDATA_TAGS = new Set(['textarea', 'title']);
const BOOL_ATTRS = new Set(['hidden', 'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple', 'autofocus', 'open', 'defer', 'async', 'novalidate', 'formnovalidate', 'reversed', 'ismap', 'controls', 'autoplay', 'loop', 'muted', 'default', 'inert', 'nomodule']);

let nodeSerial = 0;
class NodeImpl extends EventTargetImpl {
  constructor(doc) { super(); this.__isNode = true; this._serial = ++nodeSerial; this.ownerDocument = doc || null; this.parentNode = null; this.childNodes = []; this._handlers = null; }
  get parentElement() { const p = this.parentNode; return p && p.nodeType === 1 ? p : null; }
  get firstChild() { return this.childNodes.length ? this.childNodes[0] : null; }
  get lastChild() { return this.childNodes.length ? this.childNodes[this.childNodes.length - 1] : null; }
  // index in the parent, verified against a cached hint so sibling walks stay O(1)
  get _index() { const p = this.parentNode; if (!p) return -1; const cn = p.childNodes; let i = this._idx; if (!(i >= 0 && i < cn.length && cn[i] === this)) { i = cn.indexOf(this); this._idx = i; } return i; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = this._index; return i + 1 < p.childNodes.length ? p.childNodes[i + 1] : null; }
  get previousSibling() { const p = this.parentNode; if (!p) return null; const i = this._index; return i > 0 ? p.childNodes[i - 1] : null; }
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  get previousElementSibling() { let n = this.previousSibling; while (n && n.nodeType !== 1) n = n.previousSibling; return n; }
  get isConnected() { let n = this; while (n) { if (n.nodeType === 9) return true; n = n._host || n.parentNode; } return false; }
  get baseURI() { return R.location ? R.location.href : ''; }
  get nodeValue() { return null; } set nodeValue(v) {}
  get textContent() { const parts = []; (function rec(n) { const cn = n.childNodes; for (let i = 0; i < cn.length; i++) { const c = cn[i]; if (c.nodeType === 3) parts.push(c.data); else if (c.nodeType === 1 || c.nodeType === 11) rec(c); } })(this); return parts.join(''); }
  set textContent(v) { this._clearChildren(); if (v != null && v !== '') this.appendChild(this.ownerDocument.createTextNode(String(v))); }
  getRootNode() { let n = this; while (n.parentNode || n._host) n = n.parentNode || n._host; return n; }
  hasChildNodes() { return this.childNodes.length > 0; }
  contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  _clearChildren() { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; }
  _validChild(c) { if (!c || !c.__isNode) throw new TypeError('Node expected'); if (c === this || c.contains(this)) throw new Error('HierarchyRequestError'); }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    this._validChild(c);
    if (c.nodeType === 11) { const kids = c.childNodes.slice(); for (const k of kids) this.insertBefore(k, ref); return c; }
    if (c.parentNode) c.parentNode.removeChild(c);
    let i = ref ? this.childNodes.indexOf(ref) : -1;
    if (ref && i < 0) throw new Error('NotFoundError: reference node is not a child');
    if (i < 0) { c._idx = this.childNodes.length; this.childNodes.push(c); } else { this.childNodes.splice(i, 0, c); c._idx = i; }
    c.parentNode = this;
    if (this.ownerDocument && c.ownerDocument !== this.ownerDocument) adoptTree(c, this.ownerDocument);
    R.onInsert && R.onInsert(c, this);
    return c;
  }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i < 0) throw new Error('NotFoundError: node is not a child'); this.childNodes.splice(i, 1); c.parentNode = null; R.onRemove && R.onRemove(c, this); return c; }
  replaceChild(n, old) { const i = this.childNodes.indexOf(old); if (i < 0) throw new Error('NotFoundError'); this.insertBefore(n, old); this.removeChild(old); return old; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  append(...ns) { for (const n of ns) this.appendChild(toNode(this, n)); }
  prepend(...ns) { const f = this.firstChild; for (const n of ns) this.insertBefore(toNode(this, n), f); }
  before(...ns) { const p = this.parentNode; if (!p) return; for (const n of ns) p.insertBefore(toNode(this, n), this); }
  after(...ns) { const p = this.parentNode; if (!p) return; const nx = this.nextSibling; for (const n of ns) p.insertBefore(toNode(this, n), nx); }
  replaceWith(...ns) { const p = this.parentNode; if (!p) return; const nx = this.nextSibling; p.removeChild(this); for (const n of ns) p.insertBefore(toNode(this, n), nx); }
  replaceChildren(...ns) { this._clearChildren(); this.append(...ns); }
  cloneNode(deep) { const c = this._cloneShallow(); if (deep) for (const k of this.childNodes) c.appendChild(k.cloneNode(true)); return c; }
  _cloneShallow() { throw new Error('cannot clone'); }
  normalize() { for (let i = 0; i < this.childNodes.length; i++) { const c = this.childNodes[i]; if (c.nodeType === 3) { while (i + 1 < this.childNodes.length && this.childNodes[i + 1].nodeType === 3) { c.data += this.childNodes[i + 1].data; this.removeChild(this.childNodes[i + 1]); } if (c.data === '') { this.removeChild(c); i--; } } else c.normalize(); } }
  isEqualNode(o) { return !!o && o.outerHTML === this.outerHTML; }
  isSameNode(o) { return o === this; }
  compareDocumentPosition(o) { if (o === this) return 0; if (this.contains(o)) return 20; if (o.contains(this)) return 10; const a = docOrder(this), b = docOrder(o); return a < b ? 4 : 2; }
  lookupNamespaceURI() { return null; }
  isDefaultNamespace() { return true; }
}
for (const [k, v] of Object.entries({ ELEMENT_NODE: 1, ATTRIBUTE_NODE: 2, TEXT_NODE: 3, CDATA_SECTION_NODE: 4, PROCESSING_INSTRUCTION_NODE: 7, COMMENT_NODE: 8, DOCUMENT_NODE: 9, DOCUMENT_TYPE_NODE: 10, DOCUMENT_FRAGMENT_NODE: 11, DOCUMENT_POSITION_DISCONNECTED: 1, DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_CONTAINS: 8, DOCUMENT_POSITION_CONTAINED_BY: 16 })) { NodeImpl[k] = v; NodeImpl.prototype[k] = v; }
function docOrder(n) { const out = []; while (n) { const p = n.parentNode; out.unshift(p ? p.childNodes.indexOf(n) : 0); n = p; } return out.map(i => String(i).padStart(6, '0')).join('.'); }
function toNode(ctx, n) { return n && n.__isNode ? n : ctx.ownerDocument.createTextNode(String(n)); }
function adoptTree(n, doc) { n.ownerDocument = doc; for (const c of n.childNodes) adoptTree(c, doc); }

class CharacterDataImpl extends NodeImpl {
  constructor(doc, data) { super(doc); this.data = String(data); }
  get length() { return this.data.length; }
  get nodeValue() { return this.data; } set nodeValue(v) { this.data = String(v); }
  get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
  substringData(o, c) { return this.data.substr(o, c); }
  appendData(s) { this.data += s; } insertData(o, s) { this.data = this.data.slice(0, o) + s + this.data.slice(o); }
  deleteData(o, c) { this.data = this.data.slice(0, o) + this.data.slice(o + c); } replaceData(o, c, s) { this.data = this.data.slice(0, o) + s + this.data.slice(o + c); }
}
class TextImpl extends CharacterDataImpl {
  constructor(doc, data) { super(doc, data); this.nodeType = 3; this.nodeName = '#text'; }
  get wholeText() { return this.data; }
  splitText(o) { const t = new TextImpl(this.ownerDocument, this.data.slice(o)); this.data = this.data.slice(0, o); if (this.parentNode) this.parentNode.insertBefore(t, this.nextSibling); return t; }
  _cloneShallow() { return new TextImpl(this.ownerDocument, this.data); }
  get outerHTML() { return escapeText(this.data); }
}
class CommentImpl extends CharacterDataImpl {
  constructor(doc, data) { super(doc, data); this.nodeType = 8; this.nodeName = '#comment'; }
  _cloneShallow() { return new CommentImpl(this.ownerDocument, this.data); }
  get outerHTML() { return '<!--' + this.data + '-->'; }
}
// ParentNode: shared by DocumentFragment, Element and Document
function classTokens(value) { return value ? value.split(/\s+/).filter(Boolean) : []; }
function mixinParentNode(Cls) {
  Object.defineProperties(Cls.prototype, {
    children: { get() { return this.childNodes.filter(c => c.nodeType === 1); }, configurable: true },
    childElementCount: { get() { let n = 0; for (const c of this.childNodes) if (c.nodeType === 1) n++; return n; }, configurable: true },
    firstElementChild: { get() { for (const c of this.childNodes) if (c.nodeType === 1) return c; return null; }, configurable: true },
    lastElementChild: { get() { const cn = this.childNodes; for (let i = cn.length - 1; i >= 0; i--) if (cn[i].nodeType === 1) return cn[i]; return null; }, configurable: true },
  });
  Cls.prototype.querySelector = function (s) { return R.querySelector(this, s); };
  Cls.prototype.querySelectorAll = function (s) { return R.querySelectorAll(this, s); };
  Cls.prototype.getElementsByTagName = function (t) { t = String(t); const lower = t.toLowerCase(); return collect(this, e => t === '*' || e.localName === lower); };
  Cls.prototype.getElementsByTagNameNS = function (ns, t) { return this.getElementsByTagName(t); };
  Cls.prototype.getElementsByClassName = function (c) { const cs = classTokens(String(c)); return collect(this, e => { const l = classTokens(e._attrs.class); return cs.every(x => l.includes(x)); }); };
}
// a live DOMTokenList over any space-separated attribute
function tokenList(el, attr) { return makeClassList({ _attrs: { get class() { return el._attrs[attr] || ''; } }, setAttribute: (k, v) => el.setAttribute(attr, v) }); }
class DocumentFragmentImpl extends NodeImpl {
  constructor(doc) { super(doc); this.nodeType = 11; this.nodeName = '#document-fragment'; }
  _cloneShallow() { return new DocumentFragmentImpl(this.ownerDocument); }
  getElementById(id) { return findFirst(this, e => e._attrs.id === id); }
  get outerHTML() { return this.innerHTML; }
  get innerHTML() { return this.childNodes.map(c => c.outerHTML).join(''); }
  set innerHTML(v) { this._clearChildren(); R.parseFragmentInto(String(v), this, null); }
}
mixinParentNode(DocumentFragmentImpl);
class ShadowRootImpl extends DocumentFragmentImpl {
  constructor(doc, host, mode) { super(doc); this._host = host; this.mode = mode || 'open'; this.nodeName = '#shadow-root'; }
  get host() { return this._host; }
  get activeElement() { return this.ownerDocument.activeElement; }
  get adoptedStyleSheets() { return this._ass || (this._ass = []); } set adoptedStyleSheets(v) { this._ass = v; }
  get styleSheets() { return []; }
}

// ------------------------------------------------------------- Element
const camel = s => s.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
function makeStyle(el) {
  const decl = {
    _parse() { const out = []; const raw = el._attrs.style; if (!raw) return out; for (const part of raw.split(';')) { const i = part.indexOf(':'); if (i < 0) continue; const k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim(); if (k) out.push([k, v.replace(/\s*!important$/i, '')]); } return out; },
    _write(list) { if (!list.length) { if (el._attrs.style !== undefined) el.removeAttribute('style'); return; } el.setAttribute('style', list.map(p => p[0] + ': ' + p[1]).join('; ') + ';'); },
    getPropertyValue(k) { k = String(k).toLowerCase(); const p = decl._parse().find(p => p[0] === k); return p ? p[1] : ''; },
    getPropertyPriority() { return ''; },
    setProperty(k, v, prio) { k = String(k).toLowerCase(); const list = decl._parse().filter(p => p[0] !== k); if (v != null && v !== '') list.push([k, String(v)]); decl._write(list); },
    removeProperty(k) { k = String(k).toLowerCase(); const list = decl._parse(); const old = list.find(p => p[0] === k); decl._write(list.filter(p => p[0] !== k)); return old ? old[1] : ''; },
    item(i) { const l = decl._parse(); return l[i] ? l[i][0] : ''; },
    get cssText() { return el._attrs.style || ''; },
    set cssText(v) { if (v) el.setAttribute('style', String(v)); else el.removeAttribute('style'); },
    get length() { return decl._parse().length; },
    get parentRule() { return null; },
  };
  return new Proxy(decl, {
    get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; if (/^\d+$/.test(k)) return t.item(+k); return t.getPropertyValue(k.startsWith('--') ? k : kebab(k)); },
    set(t, k, v) { if (k === 'cssText') { t.cssText = v; return true; } if (typeof k !== 'string') return true; t.setProperty(k.startsWith('--') ? k : kebab(k), v); return true; },
    has(t, k) { return k in t || typeof k === 'string'; },
    ownKeys(t) { return t._parse().map(p => camel(p[0])); },
    getOwnPropertyDescriptor(t, k) { return { enumerable: true, configurable: true, value: t.getPropertyValue(kebab(String(k))) }; },
  });
}
function makeClassList(el) {
  const get = () => (el._attrs.class || '').split(/\s+/).filter(Boolean);
  const set = list => el.setAttribute('class', list.join(' '));
  const api = {
    add(...cs) { const l = get(); for (const c of cs) if (!l.includes(String(c))) l.push(String(c)); set(l); },
    remove(...cs) { set(get().filter(c => !cs.map(String).includes(c))); },
    toggle(c, force) { c = String(c); const l = get(); const has = l.includes(c); if (force === true || (force === undefined && !has)) { if (!has) { l.push(c); set(l); } return true; } set(l.filter(x => x !== c)); return false; },
    contains(c) { return get().includes(String(c)); },
    replace(a, b) { const l = get(); const i = l.indexOf(String(a)); if (i < 0) return false; l[i] = String(b); set(l); return true; },
    item(i) { return get()[i] || null; },
    supports() { return true; },
    forEach(fn, t) { get().forEach((c, i) => fn.call(t, c, i, api)); },
    entries() { return get().entries(); }, keys() { return get().keys(); }, values() { return get().values(); },
    [Symbol.iterator]() { return get()[Symbol.iterator](); },
    get length() { return get().length; },
    get value() { return el._attrs.class || ''; }, set value(v) { el.setAttribute('class', String(v)); },
    toString() { return el._attrs.class || ''; },
  };
  return new Proxy(api, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) return get()[+k]; return t[k]; } });
}
function makeDataset(el) {
  return new Proxy({}, {
    get(t, k) { if (typeof k !== 'string') return undefined; return el._attrs['data-' + kebab(k)]; },
    set(t, k, v) { el.setAttribute('data-' + kebab(String(k)), String(v)); return true; },
    deleteProperty(t, k) { el.removeAttribute('data-' + kebab(String(k))); return true; },
    has(t, k) { return typeof k === 'string' && ('data-' + kebab(k)) in el._attrs; },
    ownKeys() { return Object.keys(el._attrs).filter(a => a.startsWith('data-')).map(a => camel(a.slice(5))); },
    getOwnPropertyDescriptor(t, k) { const a = 'data-' + kebab(String(k)); if (!(a in el._attrs)) return undefined; return { enumerable: true, configurable: true, value: el._attrs[a] }; },
  });
}

class ElementImpl extends NodeImpl {
  constructor(doc, tag, ns) {
    super(doc);
    this.nodeType = 1; this.localName = tag; this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml';
    this._html = this.namespaceURI === 'http://www.w3.org/1999/xhtml';
    this.tagName = this._html ? tag.toUpperCase() : tag; this.nodeName = this.tagName;
    this._attrs = Object.create(null); this._attrOrder = [];
    this._style = null; this._classList = null; this._dataset = null; this.shadowRoot = null;
    this._scrollTop = 0; this._scrollLeft = 0;
  }
  _cloneShallow() { const e = this.ownerDocument._createElementRaw(this.localName, this.namespaceURI); for (const k of this._attrOrder) e.setAttribute(k, this._attrs[k]); if (this._value !== undefined) e._value = this._value; if (this._checked !== undefined) e._checked = this._checked; return e; }
  // attributes
  getAttribute(n) { n = String(n); if (this._html) n = n.toLowerCase(); const v = this._attrs[n]; return v === undefined ? null : v; }
  getAttributeNS(ns, n) { return this.getAttribute(n); }
  setAttribute(n, v) {
    n = String(n); if (this._html) n = n.toLowerCase(); v = String(v);
    const had = n in this._attrs; const old = this._attrs[n];
    this._attrs[n] = v; if (!had) this._attrOrder.push(n);
    R.onAttr && R.onAttr(this, n, old, v);
  }
  setAttributeNS(ns, n, v) { this.setAttribute(n, v); }
  removeAttribute(n) { n = String(n); if (this._html) n = n.toLowerCase(); if (!(n in this._attrs)) return; const old = this._attrs[n]; delete this._attrs[n]; this._attrOrder = this._attrOrder.filter(a => a !== n); R.onAttr && R.onAttr(this, n, old, null); }
  removeAttributeNS(ns, n) { this.removeAttribute(n); }
  hasAttribute(n) { n = String(n); if (this._html) n = n.toLowerCase(); return n in this._attrs; }
  hasAttributeNS(ns, n) { return this.hasAttribute(n); }
  hasAttributes() { return this._attrOrder.length > 0; }
  getAttributeNames() { return this._attrOrder.slice(); }
  toggleAttribute(n, force) { n = String(n).toLowerCase(); const has = n in this._attrs; if (force === true || (force === undefined && !has)) { if (!has) this.setAttribute(n, ''); return true; } this.removeAttribute(n); return false; }
  get attributes() { const list = this._attrOrder.map(n => ({ name: n, localName: n, value: this._attrs[n], nodeName: n, nodeValue: this._attrs[n], ownerElement: this, specified: true, nodeType: 2 })); const o = list; o.getNamedItem = n => list.find(a => a.name === n) || null; o.item = i => list[i] || null; o.length = list.length; return o; }
  getAttributeNode(n) { return this.attributes.getNamedItem(String(n).toLowerCase()); }
  setAttributeNode(a) { this.setAttribute(a.name, a.value); return null; }
  // reflected props
  get id() { return this._attrs.id || ''; } set id(v) { this.setAttribute('id', v); }
  get className() { return this._attrs.class || ''; } set className(v) { this.setAttribute('class', v); }
  get classList() { return this._classList || (this._classList = makeClassList(this)); }
  get style() { return this._style || (this._style = makeStyle(this)); }
  set style(v) { if (v == null || v === '') this.removeAttribute('style'); else this.setAttribute('style', String(v)); }
  get dataset() { return this._dataset || (this._dataset = makeDataset(this)); }
  get slot() { return this._attrs.slot || ''; } set slot(v) { this.setAttribute('slot', v); }
  get part() { return tokenList(this, 'part'); }
  get prefix() { return null; }
  get assignedSlot() { return null; }
  // html
  get innerHTML() { if (this.localName === 'template' && this._content) return this._content.innerHTML; return this.childNodes.map(c => c.outerHTML).join(''); }
  set innerHTML(v) { if (this.localName === 'template') { this.content._clearChildren(); R.parseFragmentInto(String(v), this.content, this); return; } this._clearChildren(); R.parseFragmentInto(String(v), this, this); }
  get outerHTML() { return serializeElement(this); }
  set outerHTML(v) { const p = this.parentNode; if (!p) return; const frag = this.ownerDocument.createDocumentFragment(); R.parseFragmentInto(String(v), frag, p.nodeType === 1 ? p : null); p.replaceChild(frag, this); }
  insertAdjacentHTML(pos, html) { const frag = this.ownerDocument.createDocumentFragment(); R.parseFragmentInto(String(html), frag, this); this.insertAdjacentElement(pos, frag); }
  insertAdjacentElement(pos, el) {
    pos = String(pos).toLowerCase();
    if (pos === 'beforebegin') { this.parentNode && this.parentNode.insertBefore(el, this); }
    else if (pos === 'afterbegin') this.insertBefore(el, this.firstChild);
    else if (pos === 'beforeend') this.appendChild(el);
    else if (pos === 'afterend') { this.parentNode && this.parentNode.insertBefore(el, this.nextSibling); }
    return el;
  }
  insertAdjacentText(pos, text) { this.insertAdjacentElement(pos, this.ownerDocument.createTextNode(String(text))); }
  get innerText() { return R.innerText(this); }
  set innerText(v) { this._clearChildren(); const parts = String(v).split(/\r?\n/); parts.forEach((p, i) => { if (i) this.appendChild(this.ownerDocument.createElement('br')); if (p) this.appendChild(this.ownerDocument.createTextNode(p)); }); }
  get outerText() { return this.innerText; }
  matches(s) { return R.matches(this, s); }
  webkitMatchesSelector(s) { return this.matches(s); }
  closest(s) { let n = this; while (n && n.nodeType === 1) { if (R.matches(n, s)) return n; n = n.parentNode; } return null; }
  // shadow dom
  attachShadow(init) { if (this.shadowRoot) throw new Error('NotSupportedError: shadow root already attached'); this.shadowRoot = new ShadowRootImpl(this.ownerDocument, this, init && init.mode); return this.shadowRoot; }
  // geometry & focus & misc (headless: everything is at the origin)
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } }; }
  getClientRects() { return []; }
  get clientWidth() { return 0; } get clientHeight() { return 0; } get clientTop() { return 0; } get clientLeft() { return 0; }
  get offsetWidth() { return 0; } get offsetHeight() { return 0; } get offsetTop() { return 0; } get offsetLeft() { return 0; } get offsetParent() { return this.parentElement; }
  get scrollWidth() { return 0; } get scrollHeight() { return 0; }
  get scrollTop() { return this._scrollTop; } set scrollTop(v) { this._scrollTop = +v || 0; }
  get scrollLeft() { return this._scrollLeft; } set scrollLeft(v) { this._scrollLeft = +v || 0; }
  scrollIntoView() {} scrollTo() {} scrollBy() {} scroll() {} scrollIntoViewIfNeeded() {}
  focus() { R.setFocus(this); } blur() { if (this.ownerDocument.activeElement === this) R.setFocus(null); }
  click() { R.userClick(this); }
  animate() { const p = Promise.resolve(); return { finished: p, ready: p, cancel() {}, play() {}, pause() {}, finish() {}, reverse() {}, addEventListener() {}, removeEventListener() {}, onfinish: null, currentTime: 0, playState: 'finished' }; }
  getAnimations() { return []; }
  requestFullscreen() { return Promise.resolve(); }
  requestPointerLock() {}
  setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return false; }
  checkVisibility() { return R.isVisible(this); }
  computedStyleMap() { return { get: () => null }; }
  get tabIndex() { const t = parseInt(this._attrs.tabindex, 10); if (!isNaN(t)) return t; return R.isFocusable(this) ? 0 : -1; } set tabIndex(v) { this.setAttribute('tabindex', v); }
  get title() { return this._attrs.title || ''; } set title(v) { this.setAttribute('title', v); }
  get lang() { return this._attrs.lang || ''; } set lang(v) { this.setAttribute('lang', v); }
  get dir() { return this._attrs.dir || ''; } set dir(v) { this.setAttribute('dir', v); }
  get hidden() { return 'hidden' in this._attrs; } set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get inert() { return 'inert' in this._attrs; } set inert(v) { if (v) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  get draggable() { return this._attrs.draggable === 'true'; } set draggable(v) { this.setAttribute('draggable', v ? 'true' : 'false'); }
  get contentEditable() { return this._attrs.contenteditable || 'inherit'; } set contentEditable(v) { this.setAttribute('contenteditable', v); }
  get isContentEditable() { const v = this._attrs.contenteditable; return v === '' || v === 'true' || v === 'plaintext-only'; }
  get accessKey() { return this._attrs.accesskey || ''; }
  get role() { return this._attrs.role || null; } set role(v) { this.setAttribute('role', v); }
  get ariaLabel() { return this._attrs['aria-label'] || null; } set ariaLabel(v) { this.setAttribute('aria-label', v); }
  get ariaHidden() { return this._attrs['aria-hidden'] || null; } set ariaHidden(v) { this.setAttribute('aria-hidden', v); }
  get ariaExpanded() { return this._attrs['aria-expanded'] || null; } set ariaExpanded(v) { this.setAttribute('aria-expanded', v); }
  get nonce() { return this._attrs.nonce || ''; }
  get isConnectedToDocument() { return this.isConnected; }
  toString() { return '[object ' + this.constructor.name.replace(/Impl$/, '') + ']'; }
}
function collect(root, pred) { const out = []; walk(root, n => { if (n.nodeType === 1 && pred(n)) out.push(n); }); return out; }
function findFirst(root, pred) { let found = null; walk(root, n => { if (!found && n.nodeType === 1 && pred(n)) { found = n; return false; } }); return found; }
function walk(root, fn) { const cn = root.childNodes; for (let i = 0; i < cn.length; i++) { const c = cn[i]; if (fn(c) === false) return false; if (c.childNodes.length && walk(c, fn) === false) return false; } return true; }
mixinParentNode(ElementImpl);
function serializeElement(el) {
  let s = '<' + el.localName;
  for (const k of el._attrOrder) s += ' ' + k + '="' + escapeAttr(el._attrs[k]) + '"';
  s += '>';
  if (VOID_TAGS.has(el.localName) && el._html) return s;
  if (el.localName === 'template' && el._content) s += el._content.innerHTML;
  else if (RAW_TEXT_TAGS.has(el.localName) && el._html) s += el.childNodes.map(c => c.nodeType === 3 ? c.data : c.outerHTML).join('');
  else s += el.childNodes.map(c => c.outerHTML).join('');
  return s + '</' + el.localName + '>';
}
R.tableRows = t => { const out = []; for (const c of t.childNodes) { if (c.nodeType !== 1) continue; if (c.localName === 'tr') out.push(c); else if (c.localName === 'thead' || c.localName === 'tbody' || c.localName === 'tfoot') for (const r of c.childNodes) if (r.nodeType === 1 && r.localName === 'tr') out.push(r); } return out; };
R.walk = walk; R.collect = collect; R.classTokens = classTokens; R.mixinParentNode = mixinParentNode; R.tokenList = tokenList;

// -------------------------------------------------- HTML element classes
class HTMLElementImpl extends ElementImpl {}
class HTMLUnknownElementImpl extends HTMLElementImpl {}
class HTMLAnchorElementImpl extends HTMLElementImpl {
  get href() { const h = this._attrs.href; if (h === undefined) return ''; return R.resolveURL(h, R.base()) || h; } set href(v) { this.setAttribute('href', v); }
  get target() { return this._attrs.target || ''; } set target(v) { this.setAttribute('target', v); }
  get rel() { return this._attrs.rel || ''; } set rel(v) { this.setAttribute('rel', v); }
  get download() { return this._attrs.download || ''; }
  get text() { return this.textContent; } set text(v) { this.textContent = v; }
  get relList() { return tokenList(this, 'rel'); }
  toString() { return this.href; }
}
for (const p of ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin']) Object.defineProperty(HTMLAnchorElementImpl.prototype, p, { get() { try { return new R.URL(this.href)[p]; } catch (e) { return ''; } }, configurable: true });
class HTMLAreaElementImpl extends HTMLAnchorElementImpl {}
class HTMLImageElementImpl extends HTMLElementImpl {
  get src() { const s = this._attrs.src; return s === undefined ? '' : (R.resolveURL(s, R.base()) || s); } set src(v) { this.setAttribute('src', v); R.queueTimer(() => fire(this, 'load', { bubbles: false }), 0); }
  get alt() { return this._attrs.alt || ''; } set alt(v) { this.setAttribute('alt', v); }
  get srcset() { return this._attrs.srcset || ''; } set srcset(v) { this.setAttribute('srcset', v); }
  get complete() { return true; } get naturalWidth() { return 0; } get naturalHeight() { return 0; }
  get width() { return parseInt(this._attrs.width, 10) || 0; } set width(v) { this.setAttribute('width', v); }
  get height() { return parseInt(this._attrs.height, 10) || 0; } set height(v) { this.setAttribute('height', v); }
  get loading() { return this._attrs.loading || 'eager'; } set loading(v) { this.setAttribute('loading', v); }
  get currentSrc() { return this.src; }
  decode() { return Promise.resolve(); }
}
class HTMLScriptElementImpl extends HTMLElementImpl {
  get src() { const s = this._attrs.src; return s === undefined ? '' : (R.resolveURL(s, R.base()) || s); } set src(v) { this.setAttribute('src', v); }
  get type() { return this._attrs.type || ''; } set type(v) { this.setAttribute('type', v); }
  get text() { return this.textContent; } set text(v) { this.textContent = v; }
  get async() { return 'async' in this._attrs; } set async(v) { this.toggleAttribute('async', !!v); }
  get defer() { return 'defer' in this._attrs; } set defer(v) { this.toggleAttribute('defer', !!v); }
  get noModule() { return 'nomodule' in this._attrs; }
  get crossOrigin() { return this._attrs.crossorigin || null; } set crossOrigin(v) { this.setAttribute('crossorigin', v); }
  static supports(t) { return t === 'classic' || t === 'module'; }
}
class HTMLStyleElementImpl extends HTMLElementImpl { get sheet() { return { cssRules: [], insertRule() { return 0; }, deleteRule() {}, disabled: false }; } get media() { return this._attrs.media || ''; } get disabled() { return false; } set disabled(v) {} }
class HTMLLinkElementImpl extends HTMLElementImpl {
  get href() { const h = this._attrs.href; return h === undefined ? '' : (R.resolveURL(h, R.base()) || h); } set href(v) { this.setAttribute('href', v); }
  get rel() { return this._attrs.rel || ''; } set rel(v) { this.setAttribute('rel', v); }
  get relList() { return tokenList(this, 'rel'); }
  get sheet() { return null; } get media() { return this._attrs.media || ''; } set media(v) { this.setAttribute('media', v); }
  get as() { return this._attrs.as || ''; } set as(v) { this.setAttribute('as', v); }
  get disabled() { return 'disabled' in this._attrs; } set disabled(v) { this.toggleAttribute('disabled', !!v); }
}
class HTMLMetaElementImpl extends HTMLElementImpl { get name() { return this._attrs.name || ''; } get content() { return this._attrs.content || ''; } set content(v) { this.setAttribute('content', v); } get httpEquiv() { return this._attrs['http-equiv'] || ''; } }
class HTMLBaseElementImpl extends HTMLElementImpl { get href() { return this._attrs.href || ''; } }
class HTMLTitleElementImpl extends HTMLElementImpl { get text() { return this.textContent; } set text(v) { this.textContent = v; } }
class HTMLTemplateElementImpl extends HTMLElementImpl {
  get content() { if (!this._content) { this._content = new DocumentFragmentImpl(this.ownerDocument); } return this._content; }
  _cloneShallow() { const e = super._cloneShallow(); if (this._content) for (const c of this._content.childNodes) e.content.appendChild(c.cloneNode(true)); return e; }
}
class HTMLLabelElementImpl extends HTMLElementImpl {
  get htmlFor() { return this._attrs.for || ''; } set htmlFor(v) { this.setAttribute('for', v); }
  get control() { if (this._attrs.for) return this.ownerDocument.getElementById(this._attrs.for); return findFirst(this, e => R.isLabelable(e)); }
  get form() { const c = this.control; return c ? c.form : null; }
}
class HTMLDetailsElementImpl extends HTMLElementImpl { get open() { return 'open' in this._attrs; } set open(v) { const was = this.open; this.toggleAttribute('open', !!v); if (was !== !!v) R.queueTimer(() => fire(this, 'toggle', { bubbles: false, cancelable: false }), 0); } }
class HTMLDialogElementImpl extends HTMLElementImpl {
  get open() { return 'open' in this._attrs; } set open(v) { this.toggleAttribute('open', !!v); }
  get returnValue() { return this._returnValue || ''; } set returnValue(v) { this._returnValue = String(v); }
  show() { this.setAttribute('open', ''); } showModal() { this.setAttribute('open', ''); }
  close(v) { if (v !== undefined) this._returnValue = String(v); this.removeAttribute('open'); R.queueTimer(() => fire(this, 'close', { bubbles: false, cancelable: false }), 0); }
}
class HTMLCanvasElementImpl extends HTMLElementImpl {
  get width() { return parseInt(this._attrs.width, 10) || 300; } set width(v) { this.setAttribute('width', v); }
  get height() { return parseInt(this._attrs.height, 10) || 150; } set height(v) { this.setAttribute('height', v); }
  getContext() { return null; } toDataURL() { return 'data:,'; } toBlob(cb) { if (cb) R.queueTimer(() => cb(null), 0); } captureStream() { return null; }
}
class HTMLMediaElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this.paused = true; this.currentTime = 0; this.volume = 1; this.muted = false; this.playbackRate = 1; this.readyState = 0; this.networkState = 0; this.duration = NaN; this.ended = false; }
  play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() {} canPlayType() { return ''; } addTextTrack() { return {}; }
  get src() { return this._attrs.src || ''; } set src(v) { this.setAttribute('src', v); }
  get textTracks() { return []; }
}
class HTMLIFrameElementImpl extends HTMLElementImpl {
  get src() { return this._attrs.src || ''; } set src(v) { this.setAttribute('src', v); }
  get contentWindow() { return null; } get contentDocument() { return null; }
  get name() { return this._attrs.name || ''; } get sandbox() { return tokenList(this, 'sandbox'); }
}
class HTMLTableElementImpl extends HTMLElementImpl {
  get rows() { return R.tableRows(this); }
  get tBodies() { return this.children.filter(e => e.localName === 'tbody'); }
  get tHead() { return this.children.find(e => e.localName === 'thead') || null; } get tFoot() { return this.children.find(e => e.localName === 'tfoot') || null; }
  get caption() { return this.children.find(e => e.localName === 'caption') || null; }
  createTBody() { const t = this.ownerDocument.createElement('tbody'); this.appendChild(t); return t; }
  createTHead() { let t = this.tHead; if (!t) { t = this.ownerDocument.createElement('thead'); this.insertBefore(t, this.firstChild); } return t; }
  insertRow(i) { const body = this.tBodies[0] || this.createTBody(); return body.insertRow(i); }
  deleteRow(i) { const r = this.rows[i < 0 ? this.rows.length - 1 : i]; if (r) r.remove(); }
}
class HTMLTableSectionElementImpl extends HTMLElementImpl {
  get rows() { return this.children.filter(e => e.localName === 'tr'); }
  insertRow(i) { const tr = this.ownerDocument.createElement('tr'); const rows = this.rows; if (i === undefined || i < 0 || i >= rows.length) this.appendChild(tr); else this.insertBefore(tr, rows[i]); return tr; }
  deleteRow(i) { const r = this.rows[i]; if (r) r.remove(); }
}
class HTMLTableRowElementImpl extends HTMLElementImpl {
  get cells() { return this.children.filter(e => e.localName === 'td' || e.localName === 'th'); }
  get rowIndex() { const t = this.closest('table'); return t ? t.rows.indexOf(this) : -1; }
  get sectionRowIndex() { return this.parentNode ? this.parentNode.children.filter(e => e.localName === 'tr').indexOf(this) : -1; }
  insertCell(i) { const td = this.ownerDocument.createElement('td'); const cells = this.cells; if (i === undefined || i < 0 || i >= cells.length) this.appendChild(td); else this.insertBefore(td, cells[i]); return td; }
  deleteCell(i) { const c = this.cells[i]; if (c) c.remove(); }
}
class HTMLTableCellElementImpl extends HTMLElementImpl {
  get cellIndex() { return this.parentNode ? this.parentNode.children.filter(e => e.localName === 'td' || e.localName === 'th').indexOf(this) : -1; }
  get colSpan() { return parseInt(this._attrs.colspan, 10) || 1; } set colSpan(v) { this.setAttribute('colspan', v); }
  get rowSpan() { return parseInt(this._attrs.rowspan, 10) || 1; } set rowSpan(v) { this.setAttribute('rowspan', v); }
  get headers() { return this._attrs.headers || ''; } get scope() { return this._attrs.scope || ''; }
}
class HTMLSlotElementImpl extends HTMLElementImpl { assignedNodes() { return []; } assignedElements() { return []; } get name() { return this._attrs.name || ''; } set name(v) { this.setAttribute('name', v); } }
class HTMLTimeElementImpl extends HTMLElementImpl { get dateTime() { return this._attrs.datetime || ''; } set dateTime(v) { this.setAttribute('datetime', v); } }
class HTMLProgressElementImpl extends HTMLElementImpl { get value() { return parseFloat(this._attrs.value) || 0; } set value(v) { this.setAttribute('value', v); } get max() { return parseFloat(this._attrs.max) || 1; } set max(v) { this.setAttribute('max', v); } get position() { return this._attrs.value === undefined ? -1 : this.value / this.max; } }
class HTMLMeterElementImpl extends HTMLProgressElementImpl { get min() { return parseFloat(this._attrs.min) || 0; } }
class HTMLOListElementImpl extends HTMLElementImpl { get start() { return parseInt(this._attrs.start, 10) || 1; } set start(v) { this.setAttribute('start', v); } get reversed() { return 'reversed' in this._attrs; } get type() { return this._attrs.type || ''; } }
class HTMLLIElementImpl extends HTMLElementImpl { get value() { return parseInt(this._attrs.value, 10) || 0; } set value(v) { this.setAttribute('value', v); } }
class HTMLBodyElementImpl extends HTMLElementImpl {}
class HTMLHtmlElementImpl extends HTMLElementImpl {}
class HTMLHeadElementImpl extends HTMLElementImpl {}
class HTMLDivElementImpl extends HTMLElementImpl {}
class HTMLSpanElementImpl extends HTMLElementImpl {}
class HTMLParagraphElementImpl extends HTMLElementImpl {}
class HTMLHeadingElementImpl extends HTMLElementImpl {}
class HTMLBRElementImpl extends HTMLElementImpl {}
class HTMLHRElementImpl extends HTMLElementImpl {}
class HTMLPreElementImpl extends HTMLElementImpl {}
class HTMLUListElementImpl extends HTMLElementImpl {}
class HTMLQuoteElementImpl extends HTMLElementImpl { get cite() { return this._attrs.cite || ''; } }
class HTMLSourceElementImpl extends HTMLElementImpl { get src() { return this._attrs.src || ''; } set src(v) { this.setAttribute('src', v); } get srcset() { return this._attrs.srcset || ''; } set srcset(v) { this.setAttribute('srcset', v); } }
class HTMLPictureElementImpl extends HTMLElementImpl {}
class HTMLObjectElementImpl extends HTMLElementImpl { get contentDocument() { return null; } get data() { return this._attrs.data || ''; } }
class HTMLEmbedElementImpl extends HTMLElementImpl {}
class HTMLMapElementImpl extends HTMLElementImpl {}
class HTMLDataElementImpl extends HTMLElementImpl { get value() { return this._attrs.value || ''; } set value(v) { this.setAttribute('value', v); } }
class HTMLDataListElementImpl extends HTMLElementImpl { get options() { return collect(this, e => e.localName === 'option'); } }
class HTMLOutputElementImpl extends HTMLElementImpl { get value() { return this.textContent; } set value(v) { this.textContent = v; } get name() { return this._attrs.name || ''; } get form() { return this.closest('form'); } }
class HTMLFieldSetElementImpl extends HTMLElementImpl { get disabled() { return 'disabled' in this._attrs; } set disabled(v) { this.toggleAttribute('disabled', !!v); } get elements() { return collect(this, R.isFormControl); } get form() { return this.closest('form'); } get name() { return this._attrs.name || ''; } get type() { return 'fieldset'; } }
class HTMLLegendElementImpl extends HTMLElementImpl {}
class HTMLModElementImpl extends HTMLElementImpl {}
class HTMLMenuElementImpl extends HTMLElementImpl {}
class HTMLDListElementImpl extends HTMLElementImpl {}
class HTMLTrackElementImpl extends HTMLElementImpl {}
class HTMLParamElementImpl extends HTMLElementImpl {}
class SVGElementImpl extends ElementImpl {
  get ownerSVGElement() { return this.closest('svg'); } get viewportElement() { return null; }
  getBBox() { return { x: 0, y: 0, width: 0, height: 0 }; } getScreenCTM() { return null; } getCTM() { return null; } createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return this; } }; }
  get className() { const c = this._attrs.class || ''; return { baseVal: c, animVal: c }; } set className(v) { this.setAttribute('class', v); }
  get style() { return super.style; } set style(v) { super.style = v; }
  focus() { R.setFocus(this); } blur() {}
}
const ELEMENT_CLASSES = {
  a: HTMLAnchorElementImpl, area: HTMLAreaElementImpl, img: HTMLImageElementImpl, script: HTMLScriptElementImpl, style: HTMLStyleElementImpl, link: HTMLLinkElementImpl, meta: HTMLMetaElementImpl, base: HTMLBaseElementImpl, title: HTMLTitleElementImpl, template: HTMLTemplateElementImpl, label: HTMLLabelElementImpl, details: HTMLDetailsElementImpl, dialog: HTMLDialogElementImpl, canvas: HTMLCanvasElementImpl, video: HTMLMediaElementImpl, audio: HTMLMediaElementImpl, iframe: HTMLIFrameElementImpl, table: HTMLTableElementImpl, thead: HTMLTableSectionElementImpl, tbody: HTMLTableSectionElementImpl, tfoot: HTMLTableSectionElementImpl, tr: HTMLTableRowElementImpl, td: HTMLTableCellElementImpl, th: HTMLTableCellElementImpl, slot: HTMLSlotElementImpl, time: HTMLTimeElementImpl, progress: HTMLProgressElementImpl, meter: HTMLMeterElementImpl, ol: HTMLOListElementImpl, li: HTMLLIElementImpl, body: HTMLBodyElementImpl, html: HTMLHtmlElementImpl, head: HTMLHeadElementImpl, div: HTMLDivElementImpl, span: HTMLSpanElementImpl, p: HTMLParagraphElementImpl, h1: HTMLHeadingElementImpl, h2: HTMLHeadingElementImpl, h3: HTMLHeadingElementImpl, h4: HTMLHeadingElementImpl, h5: HTMLHeadingElementImpl, h6: HTMLHeadingElementImpl, br: HTMLBRElementImpl, hr: HTMLHRElementImpl, pre: HTMLPreElementImpl, ul: HTMLUListElementImpl, blockquote: HTMLQuoteElementImpl, q: HTMLQuoteElementImpl, source: HTMLSourceElementImpl, picture: HTMLPictureElementImpl, object: HTMLObjectElementImpl, embed: HTMLEmbedElementImpl, map: HTMLMapElementImpl, data: HTMLDataElementImpl, datalist: HTMLDataListElementImpl, output: HTMLOutputElementImpl, fieldset: HTMLFieldSetElementImpl, legend: HTMLLegendElementImpl, ins: HTMLModElementImpl, del: HTMLModElementImpl, menu: HTMLMenuElementImpl, dl: HTMLDListElementImpl, track: HTMLTrackElementImpl, param: HTMLParamElementImpl,
};
R.classes = { Node: NodeImpl, CharacterData: CharacterDataImpl, Text: TextImpl, Comment: CommentImpl, DocumentFragment: DocumentFragmentImpl, ShadowRoot: ShadowRootImpl, Element: ElementImpl, HTMLElement: HTMLElementImpl, HTMLUnknownElement: HTMLUnknownElementImpl, SVGElement: SVGElementImpl, SVGSVGElement: SVGElementImpl, SVGGraphicsElement: SVGElementImpl, HTMLAnchorElement: HTMLAnchorElementImpl, HTMLAreaElement: HTMLAreaElementImpl, HTMLImageElement: HTMLImageElementImpl, HTMLScriptElement: HTMLScriptElementImpl, HTMLStyleElement: HTMLStyleElementImpl, HTMLLinkElement: HTMLLinkElementImpl, HTMLMetaElement: HTMLMetaElementImpl, HTMLBaseElement: HTMLBaseElementImpl, HTMLTitleElement: HTMLTitleElementImpl, HTMLTemplateElement: HTMLTemplateElementImpl, HTMLLabelElement: HTMLLabelElementImpl, HTMLDetailsElement: HTMLDetailsElementImpl, HTMLDialogElement: HTMLDialogElementImpl, HTMLCanvasElement: HTMLCanvasElementImpl, HTMLMediaElement: HTMLMediaElementImpl, HTMLVideoElement: HTMLMediaElementImpl, HTMLAudioElement: HTMLMediaElementImpl, HTMLIFrameElement: HTMLIFrameElementImpl, HTMLTableElement: HTMLTableElementImpl, HTMLTableSectionElement: HTMLTableSectionElementImpl, HTMLTableRowElement: HTMLTableRowElementImpl, HTMLTableCellElement: HTMLTableCellElementImpl, HTMLSlotElement: HTMLSlotElementImpl, HTMLTimeElement: HTMLTimeElementImpl, HTMLProgressElement: HTMLProgressElementImpl, HTMLMeterElement: HTMLMeterElementImpl, HTMLOListElement: HTMLOListElementImpl, HTMLLIElement: HTMLLIElementImpl, HTMLBodyElement: HTMLBodyElementImpl, HTMLHtmlElement: HTMLHtmlElementImpl, HTMLHeadElement: HTMLHeadElementImpl, HTMLDivElement: HTMLDivElementImpl, HTMLSpanElement: HTMLSpanElementImpl, HTMLParagraphElement: HTMLParagraphElementImpl, HTMLHeadingElement: HTMLHeadingElementImpl, HTMLBRElement: HTMLBRElementImpl, HTMLHRElement: HTMLHRElementImpl, HTMLPreElement: HTMLPreElementImpl, HTMLUListElement: HTMLUListElementImpl, HTMLQuoteElement: HTMLQuoteElementImpl, HTMLSourceElement: HTMLSourceElementImpl, HTMLPictureElement: HTMLPictureElementImpl, HTMLObjectElement: HTMLObjectElementImpl, HTMLEmbedElement: HTMLEmbedElementImpl, HTMLMapElement: HTMLMapElementImpl, HTMLDataElement: HTMLDataElementImpl, HTMLDataListElement: HTMLDataListElementImpl, HTMLOutputElement: HTMLOutputElementImpl, HTMLFieldSetElement: HTMLFieldSetElementImpl, HTMLLegendElement: HTMLLegendElementImpl, HTMLModElement: HTMLModElementImpl, HTMLMenuElement: HTMLMenuElementImpl, HTMLDListElement: HTMLDListElementImpl, HTMLTrackElement: HTMLTrackElementImpl, HTMLParamElement: HTMLParamElementImpl };
R.elementClasses = ELEMENT_CLASSES;
R.consts = { BLOCK_TAGS, VOID_TAGS, RAW_TEXT_TAGS, RCDATA_TAGS, BOOL_ATTRS };

// ==== 04-parser.js
// ------------------------------------------------------------ HTML parser
// A tolerant HTML5-ish tokenizer + tree builder. It implements the parts of
// the spec that matter for real pages (void/raw-text elements, implied end
// tags, head/body synthesis, document.write during parsing) and keeps the
// rest simple. Scripts run during parsing when a script runner is supplied.
const HEAD_TAGS = new Set(['base', 'basefont', 'bgsound', 'link', 'meta', 'noscript', 'script', 'style', 'template', 'title']);
const P_CLOSERS = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'ul', 'listing', 'plaintext', 'xmp']);
const SCOPE_STOPS = new Set(['html', 'body', 'table', 'td', 'th', 'template', 'button', 'select', 'ul', 'ol', 'dl', 'marquee', 'object', 'applet']);
const CLOSE_ON_OPEN = {
  li: { targets: ['li'], stops: ['ul', 'ol', 'menu', 'dir', 'html', 'body', 'table', 'td', 'th', 'template'] },
  dt: { targets: ['dt', 'dd'], stops: ['dl', 'html', 'body', 'table', 'td', 'th', 'template'] },
  dd: { targets: ['dt', 'dd'], stops: ['dl', 'html', 'body', 'table', 'td', 'th', 'template'] },
  option: { targets: ['option'], stops: ['select', 'datalist', 'optgroup', 'html', 'body', 'template'] },
  optgroup: { targets: ['option', 'optgroup'], stops: ['select', 'html', 'body', 'template'] },
  tr: { targets: ['tr', 'td', 'th'], stops: ['table', 'thead', 'tbody', 'tfoot', 'html', 'body', 'template'] },
  td: { targets: ['td', 'th'], stops: ['tr', 'table', 'html', 'body', 'template'] },
  th: { targets: ['td', 'th'], stops: ['tr', 'table', 'html', 'body', 'template'] },
  thead: { targets: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup'], stops: ['table', 'html', 'body', 'template'] },
  tbody: { targets: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup'], stops: ['table', 'html', 'body', 'template'] },
  tfoot: { targets: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup'], stops: ['table', 'html', 'body', 'template'] },
  caption: { targets: ['tr', 'td', 'th', 'thead', 'tbody', 'tfoot'], stops: ['table', 'html', 'body', 'template'] },
  colgroup: { targets: ['tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup'], stops: ['table', 'html', 'body', 'template'] },
  h1: { targets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], stops: ['div', 'section', 'article', 'body', 'html', 'td', 'th', 'li', 'template'] },
  h2: { targets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], stops: ['div', 'section', 'article', 'body', 'html', 'td', 'th', 'li', 'template'] },
  h3: { targets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], stops: ['div', 'section', 'article', 'body', 'html', 'td', 'th', 'li', 'template'] },
  h4: { targets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], stops: ['div', 'section', 'article', 'body', 'html', 'td', 'th', 'li', 'template'] },
  h5: { targets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], stops: ['div', 'section', 'article', 'body', 'html', 'td', 'th', 'li', 'template'] },
  h6: { targets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], stops: ['div', 'section', 'article', 'body', 'html', 'td', 'th', 'li', 'template'] },
};
const SVG_NS = 'http://www.w3.org/2000/svg', MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const SVG_CASE = { altglyph: 'altGlyph', altglyphdef: 'altGlyphDef', altglyphitem: 'altGlyphItem', animatecolor: 'animateColor', animatemotion: 'animateMotion', animatetransform: 'animateTransform', clippath: 'clipPath', feblend: 'feBlend', fecolormatrix: 'feColorMatrix', fecomponenttransfer: 'feComponentTransfer', fecomposite: 'feComposite', feconvolvematrix: 'feConvolveMatrix', fediffuselighting: 'feDiffuseLighting', fedisplacementmap: 'feDisplacementMap', fedistantlight: 'feDistantLight', feflood: 'feFlood', fefunca: 'feFuncA', fefuncb: 'feFuncB', fefuncg: 'feFuncG', fefuncr: 'feFuncR', fegaussianblur: 'feGaussianBlur', feimage: 'feImage', femerge: 'feMerge', femergenode: 'feMergeNode', femorphology: 'feMorphology', feoffset: 'feOffset', fepointlight: 'fePointLight', fespecularlighting: 'feSpecularLighting', fespotlight: 'feSpotLight', fetile: 'feTile', feturbulence: 'feTurbulence', foreignobject: 'foreignObject', glyphref: 'glyphRef', lineargradient: 'linearGradient', radialgradient: 'radialGradient', textpath: 'textPath' };

const END_TAG_RE = /([a-zA-Z][^\s/>]*)/y;
class Parser {
  constructor(doc, opts) {
    this.doc = doc; this.opts = opts || {};
    this.fragment = !!this.opts.fragment;
    this.root = this.opts.root || doc;
    this.stack = [this.root];
    this.html = null; this.head = null; this.body = null;
    this.input = ''; this.pos = 0;
    this.scriptRunner = this.opts.scriptRunner || null;   // (scriptEl) => void, may call document.write
    this.deferred = [];
    this.formPtr = null;
    if (this.fragment && this.opts.context) {
      const ctx = this.opts.context.localName;
      this.rawContext = (RAW_TEXT_TAGS.has(ctx) || RCDATA_TAGS.has(ctx)) ? ctx : null;
    }
  }
  get current() { return this.stack[this.stack.length - 1]; }
  // document.write inserts text at the tokenizer's position
  write(s) { this.input = this.input.slice(0, this.pos) + s + this.input.slice(this.pos); }

  parse(input) {
    this.input = input; this.pos = 0;
    if (this.rawContext) { this.appendText(this.rawContext === 'script' || this.rawContext === 'style' ? input : decodeEntities(input)); return; }
    while (this.pos < this.input.length) {
      const s = this.input;
      const lt = s.indexOf('<', this.pos);
      if (lt < 0) { this.appendText(decodeEntities(s.slice(this.pos))); this.pos = s.length; break; }
      if (lt > this.pos) { this.appendText(decodeEntities(s.slice(this.pos, lt))); this.pos = lt; }
      const c = s.charCodeAt(lt + 1);
      if (c === 33) { // <!
        if (s.startsWith('<!--', lt)) { let end = s.indexOf('-->', lt + 4); if (end < 0) end = s.length; this.appendComment(s.slice(lt + 4, end)); this.pos = Math.min(end + 3, s.length); continue; }
        if (s.startsWith('<![CDATA[', lt)) { let end = s.indexOf(']]>', lt + 9); if (end < 0) end = s.length; this.appendText(s.slice(lt + 9, end)); this.pos = Math.min(end + 3, s.length); continue; }
        let end = s.indexOf('>', lt); if (end < 0) end = s.length; this.pos = end + 1; continue; // doctype & bogus comments
      }
      if (c === 63) { let end = s.indexOf('>', lt); if (end < 0) end = s.length; this.pos = end + 1; continue; } // <?
      if (c === 47) { // </
        END_TAG_RE.lastIndex = lt + 2;
        const m = END_TAG_RE.exec(s);
        let end = s.indexOf('>', lt); if (end < 0) end = s.length;
        this.pos = end + 1;
        if (m) this.endTag(m[1].toLowerCase());
        continue;
      }
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) { this.appendText('<'); this.pos = lt + 1; continue; }
      // start tag
      const tag = this.readStartTag(lt);
      if (!tag) { this.appendText('<'); this.pos = lt + 1; continue; }
      this.startTag(tag.name, tag.attrs, tag.selfClosing);
      // raw text / rcdata content
      const name = tag.name;
      if (this.current && this.current.localName === name && (RAW_TEXT_TAGS.has(name) || RCDATA_TAGS.has(name) || (name === 'noscript' && this.scriptRunner)) && this.current.namespaceURI !== SVG_NS) {
        const closeRe = new RegExp('</' + name + '(?=[\\s/>])', 'ig'); closeRe.lastIndex = this.pos;
        const m2 = closeRe.exec(this.input);
        const end = m2 ? m2.index : this.input.length;
        let text = this.input.slice(this.pos, end);
        if (RCDATA_TAGS.has(name)) text = decodeEntities(text);
        if (name === 'textarea' || name === 'pre' || name === 'listing') { if (text[0] === '\n') text = text.slice(1); }
        if (text) this.appendText(text, true);
        if (m2) { let gt = this.input.indexOf('>', m2.index); if (gt < 0) gt = this.input.length; this.pos = gt + 1; } else this.pos = this.input.length;
        const el = this.current; this.stack.pop();
        if (name === 'script') this.handleScript(el);
        if (name === 'style' && !this.fragment && this.opts.onStyle) this.opts.onStyle(el);
        continue;
      }
      if (name === 'pre' || name === 'listing') { if (this.input[this.pos] === '\n') this.pos++; }
    }
    if (!this.fragment) this.finish();
  }
  readStartTag(lt) {
    const s = this.input; let i = lt + 1; const n = s.length;
    let j = i; while (j < n) { const ch = s.charCodeAt(j); if (ch === 32 || ch === 9 || ch === 10 || ch === 12 || ch === 13 || ch === 47 || ch === 62) break; j++; }
    const name = s.slice(i, j).toLowerCase(); i = j;
    const attrs = []; let selfClosing = false;
    for (;;) {
      while (i < n) { const ch = s.charCodeAt(i); if (ch === 32 || ch === 9 || ch === 10 || ch === 12 || ch === 13) i++; else break; }
      if (i >= n) { this.pos = n; return { name, attrs, selfClosing }; }
      let ch = s[i];
      if (ch === '>') { this.pos = i + 1; return { name, attrs, selfClosing }; }
      if (ch === '/') { if (s[i + 1] === '>') { this.pos = i + 2; return { name, attrs, selfClosing: true }; } i++; continue; }
      // attribute name
      j = i; while (j < n) { const c2 = s.charCodeAt(j); if (c2 === 32 || c2 === 9 || c2 === 10 || c2 === 12 || c2 === 13 || c2 === 47 || c2 === 62 || c2 === 61) break; j++; }
      if (j === i) { j = i + 1; }
      const an = s.slice(i, j).toLowerCase(); i = j;
      while (i < n) { const c2 = s.charCodeAt(i); if (c2 === 32 || c2 === 9 || c2 === 10 || c2 === 12 || c2 === 13) i++; else break; }
      let av = '';
      if (s[i] === '=') {
        i++;
        while (i < n) { const c2 = s.charCodeAt(i); if (c2 === 32 || c2 === 9 || c2 === 10 || c2 === 12 || c2 === 13) i++; else break; }
        const q = s[i];
        if (q === '"' || q === "'") { let e = s.indexOf(q, i + 1); if (e < 0) e = n; av = s.slice(i + 1, e); i = e + 1; }
        else { j = i; while (j < n) { const c2 = s.charCodeAt(j); if (c2 === 32 || c2 === 9 || c2 === 10 || c2 === 12 || c2 === 13 || c2 === 62) break; j++; } av = s.slice(i, j); i = j; }
        av = decodeEntities(av);
      }
      if (an && !attrs.some(a => a[0] === an)) attrs.push([an, av]);
    }
  }
  // ---- tree construction
  ensureHtml() { if (this.fragment) return; if (!this.html) { this.html = this.doc._createElementRaw('html'); this.root.appendChild(this.html); this.stack = [this.html]; this.doc._html = this.html; } }
  ensureHead() { if (this.fragment) return; this.ensureHtml(); if (!this.head) { this.head = this.doc._createElementRaw('head'); this.html.insertBefore(this.head, this.html.firstChild); this.doc._head = this.head; } }
  ensureBody() { if (this.fragment) return; this.ensureHead(); if (!this.body) { this.body = this.doc._createElementRaw('body'); this.html.appendChild(this.body); this.doc._body = this.body; if (this.stack.length === 1 || this.stack[this.stack.length - 1] === this.head) this.stack = [this.html, this.body]; } }
  inHeadPhase() { return !this.fragment && !this.body; }
  appendText(text, verbatim) {
    if (!text) return;
    if (this.inHeadPhase()) {
      const cur = this.current;
      if (cur === this.root || cur === this.html || cur === this.head) {
        if (/^[\s]*$/.test(text)) { return; }
        if (cur !== this.head || !verbatim) { this.ensureBody(); }
      }
    }
    const cur = this.current;
    const last = cur.lastChild;
    if (last && last.nodeType === 3) last.data += text;
    else cur.appendChild(new TextImpl(this.doc, text));
  }
  appendComment(data) { const cur = this.current; if (this.fragment || cur !== this.root) cur.appendChild(new CommentImpl(this.doc, data)); else { this.root.appendChild(new CommentImpl(this.doc, data)); } }
  findInStack(name, stops) {
    for (let i = this.stack.length - 1; i > 0; i--) {
      const el = this.stack[i]; const ln = el.localName;
      if (ln === name) return i;
      if (stops && stops.has ? stops.has(ln) : (stops && stops.includes(ln))) return -1;
    }
    return -1;
  }
  popTo(index) { while (this.stack.length > index) this.stack.pop(); }
  closeP() { const i = this.findInStack('p', SCOPE_STOPS); if (i > 0) this.popTo(i); }
  startTag(name, attrs, selfClosing) {
    const cur = this.current;
    const foreign = cur.namespaceURI === SVG_NS || cur.namespaceURI === MATHML_NS;
    if (!this.fragment) {
      if (name === 'html') { this.ensureHtml(); for (const [k, v] of attrs) if (!this.html.hasAttribute(k)) this.html.setAttribute(k, v); return; }
      if (name === 'head') { this.ensureHead(); if (!this.body) this.stack = [this.html, this.head]; for (const [k, v] of attrs) this.head.setAttribute(k, v); return; }
      if (name === 'body') { this.ensureBody(); for (const [k, v] of attrs) if (!this.body.hasAttribute(k)) this.body.setAttribute(k, v); this.stack = [this.html, this.body]; return; }
      if (name === 'frameset' || name === 'frame') return;
      if (this.inHeadPhase()) {
        if (HEAD_TAGS.has(name) && (this.current === this.root || this.current === this.html || this.current === this.head || this.current === this.doc)) { this.ensureHead(); this.stack = [this.html, this.head]; }
        else this.ensureBody();
      } else if (this.current === this.html) { this.stack = [this.html, this.body]; }
    }
    if (!foreign) {
      const rule = CLOSE_ON_OPEN[name];
      if (rule) { for (let i = this.stack.length - 1; i > 0; i--) { const ln = this.stack[i].localName; if (rule.targets.includes(ln)) { this.popTo(i); break; } if (rule.stops.includes(ln)) break; } }
      if (P_CLOSERS.has(name)) this.closeP();
      if (name === 'a') { const i = this.findInStack('a', SCOPE_STOPS); if (i > 0) this.popTo(i); }
      if (name === 'button') { const i = this.findInStack('button', SCOPE_STOPS); if (i > 0) this.popTo(i); }
      if (name === 'form' && this.formPtr && !this.fragment) return;
      if (name === 'image') name = 'img';
    }
    let ns = null;
    if (name === 'svg') ns = SVG_NS; else if (name === 'math') ns = MATHML_NS;
    else if (foreign && !(cur.localName === 'foreignObject' || cur.localName === 'desc' || cur.localName === 'title')) ns = cur.namespaceURI;
    const el = this.doc._createElementRaw(ns === SVG_NS && SVG_CASE[name] ? SVG_CASE[name] : name, ns || undefined);
    for (const [k, v] of attrs) el.setAttribute(k, v);
    if (name === 'form') this.formPtr = el;
    this.current.appendChild(el);
    if (name === 'base' && !this.fragment && R.baseHref === null && el._attrs.href !== undefined) { const b = R.resolveURL(el._attrs.href, R.location.href); if (b) R.baseHref = b; }
    if (name === 'link' && !this.fragment && this.opts.onStyle) this.opts.onStyle(el);
    if (this.opts.onElement) this.opts.onElement(el);
    const isVoid = (!ns && VOID_TAGS.has(name)) || (ns && selfClosing);
    if (!isVoid) this.stack.push(el);
    else if (name === 'script') this.handleScript(el);
    if (name === 'template') { el.content; el._parsingTemplate = true; }
  }
  endTag(name) {
    if (name === 'br') { this.startTag('br', [], false); return; }
    if (name === 'noscript' && !this.scriptRunner) { const i = this.findInStack('noscript', null); if (i > 0) { const el = this.stack[i]; this.popTo(i); const p = el.parentNode; if (p) { while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); } } return; }
    if (name === 'p') { const i = this.findInStack('p', SCOPE_STOPS); if (i < 0) { this.startTag('p', [], false); this.stack.pop(); return; } this.popTo(i); return; }
    if (!this.fragment && (name === 'html' || name === 'body' || name === 'head')) { if (name === 'head' && this.head && this.current === this.head) this.stack = [this.html]; return; }
    if (name === 'form') { this.formPtr = null; }
    for (let i = this.stack.length - 1; i > 0; i--) {
      const el = this.stack[i];
      if (el.localName === name || (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' && el.localName.toLowerCase() === name)) { this.popTo(i); return; }
      if (el.localName === 'template' || (el.localName === 'table' && name !== 'table') || el.localName === 'html' || el.localName === 'body') return;
    }
  }
  handleScript(el) {
    if (!this.scriptRunner) return;
    if (el._attrs.defer !== undefined || el._attrs.async !== undefined || el._attrs.type === 'module') { this.deferred.push(el); return; }
    this.scriptRunner(el, this);
  }
  finish() {
    this.ensureBody();
    // hoist template contents
    R.walk(this.root, n => { if (n.nodeType === 1 && n.localName === 'template' && n._parsingTemplate) { delete n._parsingTemplate; const c = n.content; for (const k of n.childNodes.slice()) c.appendChild(k); } });
    this.stack = [this.html, this.body];
  }
}
function parseFragmentInto(html, target, contextEl) {
  const doc = target.ownerDocument;
  const p = new Parser(doc, { fragment: true, root: target, context: contextEl, scriptRunner: null });
  p.parse(String(html));
  R.walk(target, n => { if (n.nodeType === 1 && n.localName === 'template' && n._parsingTemplate) { delete n._parsingTemplate; const c = n.content; for (const k of n.childNodes.slice()) c.appendChild(k); } });
}
R.Parser = Parser; R.parseFragmentInto = parseFragmentInto;

// ==== 05-selectors.js
// ------------------------------------------------------------ Selectors
// Selector grammar: selector-list of complex selectors; compound selectors
// made of type/universal, #id, .class, [attr op value i], :pseudo(args).
const selectorCache = new Map();
function parseSelectorList(src) {
  src = String(src);
  let cached = selectorCache.get(src);
  if (cached) return cached;
  const p = new SelParser(src);
  const list = p.parseList();
  if (p.pos < p.s.length) throw syntaxError(src);
  if (selectorCache.size > 500) selectorCache.clear();
  selectorCache.set(src, list);
  return list;
}
function syntaxError(src) { const e = new Error("Failed to execute 'querySelector': '" + src + "' is not a valid selector."); e.name = 'SyntaxError'; return e; }
const IDENT_RE = /^-?(?:[a-zA-Z_ -￿]|\\.)(?:[a-zA-Z0-9_\- -￿]|\\.)*/;
class SelParser {
  constructor(s) { this.s = s; this.pos = 0; }
  ws() { while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++; }
  ident() { const m = IDENT_RE.exec(this.s.slice(this.pos)); if (!m) return null; this.pos += m[0].length; return m[0].replace(/\\(.)/g, '$1'); }
  parseList() { const out = []; for (;;) { this.ws(); out.push(this.parseComplex()); this.ws(); if (this.s[this.pos] === ',') { this.pos++; continue; } break; } return out; }
  parseComplex() {
    // returns array of {compound, combinator} from left to right
    const parts = []; let comb = null;
    for (;;) {
      this.ws();
      const c = this.parseCompound();
      if (!c) { if (parts.length && comb) throw syntaxError(this.s); break; }
      parts.push({ compound: c, combinator: comb });
      const save = this.pos; this.ws();
      const ch = this.s[this.pos];
      if (ch === '>' || ch === '+' || ch === '~') { comb = ch; this.pos++; continue; }
      if (ch === ',' || ch === ')' || this.pos >= this.s.length) { this.pos = save; break; }
      if (this.pos > save) { comb = ' '; continue; }
      break;
    }
    if (!parts.length) throw syntaxError(this.s);
    return parts;
  }
  parseCompound() {
    const c = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
    let any = false;
    for (;;) {
      const ch = this.s[this.pos];
      if (ch === '*') { this.pos++; c.tag = '*'; any = true; continue; }
      if (ch === '#') { this.pos++; const id = this.ident(); if (id == null) throw syntaxError(this.s); c.id = id; any = true; continue; }
      if (ch === '.') { this.pos++; const cl = this.ident(); if (cl == null) throw syntaxError(this.s); c.classes.push(cl); any = true; continue; }
      if (ch === '[') {
        this.pos++; this.ws(); const name = this.ident(); if (name == null) throw syntaxError(this.s); this.ws();
        let op = null, val = null, ci = false;
        const m = /^([~|^$*]?=)/.exec(this.s.slice(this.pos));
        if (m) {
          op = m[1]; this.pos += op.length; this.ws();
          const q = this.s[this.pos];
          if (q === '"' || q === "'") { const e = this.s.indexOf(q, this.pos + 1); if (e < 0) throw syntaxError(this.s); val = this.s.slice(this.pos + 1, e); this.pos = e + 1; }
          else { val = this.ident(); if (val == null) { const m2 = /^[^\]\s]+/.exec(this.s.slice(this.pos)); if (!m2) throw syntaxError(this.s); val = m2[0]; this.pos += val.length; } }
          this.ws(); if (/^[iIsS]\s*\]/.test(this.s.slice(this.pos))) { ci = /^[iI]/.test(this.s.slice(this.pos)); this.pos++; this.ws(); }
        }
        if (this.s[this.pos] !== ']') throw syntaxError(this.s); this.pos++;
        c.attrs.push({ name: name.toLowerCase(), op, val, ci }); any = true; continue;
      }
      if (ch === ':') {
        this.pos++; if (this.s[this.pos] === ':') { this.pos++; const n = this.ident(); if (n == null) throw syntaxError(this.s); c.pseudos.push({ name: '::' + n, arg: null }); any = true; continue; }
        const name = this.ident(); if (name == null) throw syntaxError(this.s);
        let arg = null;
        if (this.s[this.pos] === '(') {
          this.pos++;
          const lname = name.toLowerCase();
          if (lname === 'not' || lname === 'is' || lname === 'where' || lname === 'has' || lname === 'matches' || lname === '-webkit-any') {
            this.ws();
            // :has() may start with a combinator
            let rel = null; if (lname === 'has' && /[>+~]/.test(this.s[this.pos])) { rel = this.s[this.pos]; this.pos++; }
            arg = this.parseList(); this.ws();
            if (rel) arg.relative = rel;
            if (this.s[this.pos] !== ')') throw syntaxError(this.s); this.pos++;
          } else {
            let depth = 1; const start = this.pos;
            while (this.pos < this.s.length && depth) { if (this.s[this.pos] === '(') depth++; else if (this.s[this.pos] === ')') depth--; this.pos++; }
            if (depth) throw syntaxError(this.s);
            arg = this.s.slice(start, this.pos - 1).trim();
          }
        }
        const lname2 = name.toLowerCase();
        if (arg === null && /^(not|is|where|has|matches|-webkit-any|nth-child|nth-last-child|nth-of-type|nth-last-of-type|lang)$/.test(lname2)) throw syntaxError(this.s);
        c.pseudos.push({ name: lname2, arg }); any = true; continue;
      }
      const t = this.ident();
      if (t != null) { if (c.tag) throw syntaxError(this.s); c.tag = t.toLowerCase(); any = true; continue; }
      break;
    }
    return any ? c : null;
  }
}
function parseNth(arg) {
  arg = arg.replace(/\s+/g, '').toLowerCase();
  if (arg === 'odd') return [2, 1]; if (arg === 'even') return [2, 0];
  const m = /^([+-]?\d*)?n([+-]\d+)?$/.exec(arg);
  if (m) { const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10); return [a, m[2] ? parseInt(m[2], 10) : 0]; }
  const b = parseInt(arg, 10); if (isNaN(b)) return null; return [0, b];
}
function nthMatch(ab, idx) { const [a, b] = ab; if (a === 0) return idx === b; const d = idx - b; return d % a === 0 && d / a >= 0; }
function matchCompound(el, c, scope) {
  if (c.tag && c.tag !== '*') { if (el._html ? el.localName !== c.tag : el.localName.toLowerCase() !== c.tag) return false; }
  if (c.id !== null && el._attrs.id !== c.id) return false;
  if (c.classes.length) { const cl = el._attrs.class; if (!cl) return false; if (el._classCacheSrc !== cl) { el._classCacheSrc = cl; el._classCache = classTokens(cl); } const list = el._classCache; for (const x of c.classes) if (!list.includes(x)) return false; }
  for (const a of c.attrs) {
    const v = el._attrs[a.name]; if (v === undefined) return false;
    if (!a.op) continue;
    let av = v, tv = a.val;
    if (a.ci || a.name === 'type' || a.name === 'lang' || a.name === 'dir' || a.name === 'rel') { av = av.toLowerCase(); tv = tv.toLowerCase(); }
    switch (a.op) {
      case '=': if (av !== tv) return false; break;
      case '~=': if (!av.split(/\s+/).includes(tv) || tv === '') return false; break;
      case '|=': if (!(av === tv || av.startsWith(tv + '-'))) return false; break;
      case '^=': if (!tv || !av.startsWith(tv)) return false; break;
      case '$=': if (!tv || !av.endsWith(tv)) return false; break;
      case '*=': if (!tv || !av.includes(tv)) return false; break;
    }
  }
  for (const p of c.pseudos) {
    switch (p.name) {
      case 'not': if (p.arg.some(cx => matchComplex(el, cx, scope))) return false; break;
      case 'is': case 'where': case 'matches': case '-webkit-any': if (!p.arg.some(cx => matchComplex(el, cx, scope))) return false; break;
      case 'has': {
        const rel = p.arg.relative;
        let ok = false;
        if (rel === '>') ok = el.children.some(ch => p.arg.some(cx => matchComplex(ch, cx, el)));
        else if (rel === '+') { const s = el.nextElementSibling; ok = !!s && p.arg.some(cx => matchComplex(s, cx, el.parentNode)); }
        else if (rel === '~') { let s = el.nextElementSibling; while (s && !ok) { ok = p.arg.some(cx => matchComplex(s, cx, el.parentNode)); s = s.nextElementSibling; } }
        else { R.walk(el, n => { if (n.nodeType === 1 && p.arg.some(cx => matchComplex(n, cx, el))) { ok = true; return false; } }); }
        if (!ok) return false; break;
      }
      case 'first-child': if (el.previousElementSibling) return false; break;
      case 'last-child': if (el.nextElementSibling) return false; break;
      case 'only-child': if (el.previousElementSibling || el.nextElementSibling) return false; break;
      case 'first-of-type': { let s = el.previousElementSibling; while (s) { if (s.localName === el.localName) return false; s = s.previousElementSibling; } break; }
      case 'last-of-type': { let s = el.nextElementSibling; while (s) { if (s.localName === el.localName) return false; s = s.nextElementSibling; } break; }
      case 'only-of-type': { if (!matchCompound(el, { tag: null, id: null, classes: [], attrs: [], pseudos: [{ name: 'first-of-type' }, { name: 'last-of-type' }] }, scope)) return false; break; }
      case 'nth-child': case 'nth-last-child': case 'nth-of-type': case 'nth-last-of-type': {
        const ab = parseNth(p.arg || ''); if (!ab) return false;
        const ofType = p.name.endsWith('of-type'); const last = p.name.includes('last');
        let idx = 1; let s = last ? el.nextElementSibling : el.previousElementSibling;
        while (s) { if (!ofType || s.localName === el.localName) idx++; s = last ? s.nextElementSibling : s.previousElementSibling; }
        if (!nthMatch(ab, idx)) return false; break;
      }
      case 'empty': if (el.childNodes.some(n => n.nodeType === 1 || (n.nodeType === 3 && n.data !== ''))) return false; break;
      case 'root': if (el !== el.ownerDocument.documentElement) return false; break;
      case 'scope': if (scope ? el !== scope : el !== el.ownerDocument.documentElement) return false; break;
      case 'checked': if (!((el.localName === 'input' && (el.type === 'checkbox' || el.type === 'radio') && el.checked) || (el.localName === 'option' && el.selected))) return false; break;
      case 'disabled': if (!R.isDisabled(el)) return false; break;
      case 'enabled': if (!R.isFormControl(el) || R.isDisabled(el)) return false; break;
      case 'required': if (!('required' in el._attrs)) return false; break;
      case 'optional': if (!R.isFormControl(el) || ('required' in el._attrs)) return false; break;
      case 'read-only': if (R.isEditable(el)) return false; break;
      case 'read-write': if (!R.isEditable(el)) return false; break;
      case 'placeholder-shown': if (!(el._attrs.placeholder && !el.value)) return false; break;
      case 'focus': case 'focus-visible': if (el.ownerDocument.activeElement !== el) return false; break;
      case 'focus-within': { const a = el.ownerDocument.activeElement; if (!a || !el.contains(a)) return false; break; }
      case 'hover': case 'active': case 'visited': case 'target': case 'fullscreen': case 'defined': if (p.name === 'defined') break; return false;
      case 'link': case 'any-link': if (!((el.localName === 'a' || el.localName === 'area') && 'href' in el._attrs)) return false; break;
      case 'lang': { let n = el; let l = null; while (n && n.nodeType === 1) { if (n._attrs.lang !== undefined) { l = n._attrs.lang; break; } n = n.parentNode; } if (!l || !(l.toLowerCase() === p.arg.toLowerCase() || l.toLowerCase().startsWith(p.arg.toLowerCase() + '-'))) return false; break; }
      case 'valid': break; case 'invalid': return false;
      case 'indeterminate': if (!(el.localName === 'input' && el.indeterminate)) return false; break;
      case 'default': if (!(el.localName === 'option' && 'selected' in el._attrs) && !(el.localName === 'input' && 'checked' in el._attrs)) return false; break;
      case 'host': case 'host-context': return false;
      default: return false;   // unknown pseudo-classes never match (stylesheets use many we do not model)
    }
  }
  return true;
}
function matchComplex(el, parts, scope) {
  // match right-to-left
  let i = parts.length - 1;
  if (!matchCompound(el, parts[i].compound, scope)) return false;
  return matchRest(el, parts, i, scope);
}
function matchRest(el, parts, i, scope) {
  if (i === 0) return true;
  const comb = parts[i].combinator; const prev = parts[i - 1].compound;
  if (comb === '>') { const p = el.parentNode; return !!p && p.nodeType === 1 && matchCompound(p, prev, scope) && matchRest(p, parts, i - 1, scope); }
  if (comb === '+') { const s = el.previousElementSibling; return !!s && matchCompound(s, prev, scope) && matchRest(s, parts, i - 1, scope); }
  if (comb === '~') { let s = el.previousElementSibling; while (s) { if (matchCompound(s, prev, scope) && matchRest(s, parts, i - 1, scope)) return true; s = s.previousElementSibling; } return false; }
  let p = el.parentNode;
  while (p && p.nodeType === 1) { if (matchCompound(p, prev, scope) && matchRest(p, parts, i - 1, scope)) return true; p = p.parentNode; }
  return false;
}
function matches(el, src) { const list = parseSelectorList(src); return list.some(cx => matchComplex(el, cx, null)); }
function querySelectorAll(root, src) {
  const list = parseSelectorList(src);
  const scope = root.nodeType === 1 ? root : null;
  // fast path for #id
  const out = [];
  R.walk(root, n => { if (n.nodeType === 1 && list.some(cx => matchComplex(n, cx, scope))) out.push(n); });
  return out;
}
function querySelector(root, src) {
  const list = parseSelectorList(src);
  const scope = root.nodeType === 1 ? root : null;
  let found = null;
  R.walk(root, n => { if (n.nodeType === 1 && list.some(cx => matchComplex(n, cx, scope))) { found = n; return false; } });
  return found;
}
R.matches = matches; R.querySelector = querySelector; R.querySelectorAll = querySelectorAll;

// ==== 06-forms.js
// ------------------------------------------------------------ Form controls
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'color', 'range', '']);
class HTMLFormElementImpl extends HTMLElementImpl {
  get elements() { return R.collect(this, e => R.isFormControl(e) && e.form === this); }
  get length() { return this.elements.length; }
  get action() { const a = this._attrs.action; return a ? (R.resolveURL(a, R.base()) || a) : R.location.href; } set action(v) { this.setAttribute('action', v); }
  get method() { const m = (this._attrs.method || 'get').toLowerCase(); return m === 'post' || m === 'dialog' ? m : 'get'; } set method(v) { this.setAttribute('method', v); }
  get enctype() { const e = (this._attrs.enctype || '').toLowerCase(); return e === 'multipart/form-data' || e === 'text/plain' ? e : 'application/x-www-form-urlencoded'; } set enctype(v) { this.setAttribute('enctype', v); }
  get encoding() { return this.enctype; }
  get target() { return this._attrs.target || ''; } set target(v) { this.setAttribute('target', v); }
  get name() { return this._attrs.name || ''; } set name(v) { this.setAttribute('name', v); }
  get noValidate() { return 'novalidate' in this._attrs; } set noValidate(v) { this.toggleAttribute('novalidate', !!v); }
  get autocomplete() { return this._attrs.autocomplete || 'on'; }
  submit() { R.submitForm(this, null, false); }
  requestSubmit(submitter) { R.submitForm(this, submitter || null, true); }
  reset() { for (const e of this.elements) if (e._reset) e._reset(); R.fire(this, 'reset', { cancelable: true }); }
  checkValidity() { return this.elements.every(e => !e.checkValidity || e.checkValidity()); }
  reportValidity() { return this.checkValidity(); }
  item(i) { return this.elements[i] || null; }
  namedItem(n) { return this.elements.find(e => e._attrs.name === n || e._attrs.id === n) || null; }
}
function formOf(el) { const fa = el._attrs.form; if (fa !== undefined) return el.ownerDocument.getElementById(fa); return el.closest('form'); }
const validity = { valid: true, valueMissing: false, typeMismatch: false, patternMismatch: false, tooLong: false, tooShort: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false, badInput: false, customError: false };
function mixinControl(Cls) {
  Object.defineProperties(Cls.prototype, {
    form: { get() { return formOf(this); }, configurable: true },
    name: { get() { return this._attrs.name || ''; }, set(v) { this.setAttribute('name', v); }, configurable: true },
    disabled: { get() { return 'disabled' in this._attrs; }, set(v) { this.toggleAttribute('disabled', !!v); }, configurable: true },
    required: { get() { return 'required' in this._attrs; }, set(v) { this.toggleAttribute('required', !!v); }, configurable: true },
    readOnly: { get() { return 'readonly' in this._attrs; }, set(v) { this.toggleAttribute('readonly', !!v); }, configurable: true },
    autofocus: { get() { return 'autofocus' in this._attrs; }, configurable: true },
    labels: { get() { return R.labelsFor(this); }, configurable: true },
    validity: { get() { return { ...validity }; }, configurable: true },
    validationMessage: { get() { return ''; }, configurable: true },
    willValidate: { get() { return !this.disabled; }, configurable: true },
  });
  Cls.prototype.checkValidity = function () { return true; };
  Cls.prototype.reportValidity = function () { return true; };
  Cls.prototype.setCustomValidity = function () {};
}
class HTMLInputElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this._value = undefined; this._checked = undefined; this.indeterminate = false; this._dirtyValue = false; this.files = null; this.selectionStart = 0; this.selectionEnd = 0; this.selectionDirection = 'none'; }
  get type() { const t = (this._attrs.type || 'text').toLowerCase(); return t; } set type(v) { this.setAttribute('type', v); }
  get value() {
    const t = this.type;
    if (t === 'checkbox' || t === 'radio') return this._attrs.value !== undefined ? this._attrs.value : 'on';
    if (t === 'file') return this.files && this.files.length ? 'C:\\fakepath\\' + this.files[0].name : '';
    if (this._value !== undefined) return this._value;
    return this._attrs.value !== undefined ? this._attrs.value : '';
  }
  set value(v) { const t = this.type; if (t === 'file') { if (v === '') this.files = null; return; } this._value = String(v == null ? '' : v); this._dirtyValue = true; this.selectionStart = this.selectionEnd = this._value.length; }
  get defaultValue() { return this._attrs.value || ''; } set defaultValue(v) { this.setAttribute('value', v); }
  get checked() { return this._checked !== undefined ? this._checked : ('checked' in this._attrs); }
  set checked(v) { this._checked = !!v; if (this._checked && this.type === 'radio') R.uncheckRadioGroup(this); }
  get defaultChecked() { return 'checked' in this._attrs; } set defaultChecked(v) { this.toggleAttribute('checked', !!v); }
  get valueAsNumber() { const n = parseFloat(this.value); return isNaN(n) ? NaN : n; } set valueAsNumber(v) { this.value = String(v); }
  get valueAsDate() { const d = new Date(this.value); return isNaN(d) ? null : d; }
  get placeholder() { return this._attrs.placeholder || ''; } set placeholder(v) { this.setAttribute('placeholder', v); }
  get maxLength() { return parseInt(this._attrs.maxlength, 10) || -1; } get minLength() { return parseInt(this._attrs.minlength, 10) || -1; }
  get max() { return this._attrs.max || ''; } set max(v) { this.setAttribute('max', v); } get min() { return this._attrs.min || ''; } set min(v) { this.setAttribute('min', v); } get step() { return this._attrs.step || ''; } set step(v) { this.setAttribute('step', v); }
  get pattern() { return this._attrs.pattern || ''; } get accept() { return this._attrs.accept || ''; } get multiple() { return 'multiple' in this._attrs; } set multiple(v) { this.toggleAttribute('multiple', !!v); }
  get autocomplete() { return this._attrs.autocomplete || ''; } set autocomplete(v) { this.setAttribute('autocomplete', v); }
  get list() { const l = this._attrs.list; return l ? this.ownerDocument.getElementById(l) : null; }
  get src() { return this._attrs.src || ''; } get alt() { return this._attrs.alt || ''; }
  get size() { return parseInt(this._attrs.size, 10) || 20; }
  get formAction() { return this._attrs.formaction || ''; } get formMethod() { return this._attrs.formmethod || ''; }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; }
  setRangeText(t) { this.value = t; }
  stepUp() {} stepDown() {} showPicker() {}
  _reset() { this._value = undefined; this._checked = undefined; this._dirtyValue = false; }
}
mixinControl(HTMLInputElementImpl);
class HTMLTextAreaElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this._value = undefined; this.selectionStart = 0; this.selectionEnd = 0; }
  get type() { return 'textarea'; }
  get value() { return this._value !== undefined ? this._value : this.textContent; } set value(v) { this._value = String(v == null ? '' : v); this.selectionStart = this.selectionEnd = this._value.length; }
  get defaultValue() { return this.textContent; } set defaultValue(v) { this.textContent = v; }
  get textLength() { return this.value.length; }
  get placeholder() { return this._attrs.placeholder || ''; } set placeholder(v) { this.setAttribute('placeholder', v); }
  get rows() { return parseInt(this._attrs.rows, 10) || 2; } get cols() { return parseInt(this._attrs.cols, 10) || 20; }
  get maxLength() { return parseInt(this._attrs.maxlength, 10) || -1; }
  get wrap() { return this._attrs.wrap || ''; }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; } setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; } setRangeText(t) { this.value = t; }
  _reset() { this._value = undefined; }
}
mixinControl(HTMLTextAreaElementImpl);
class HTMLButtonElementImpl extends HTMLElementImpl {
  get type() { const t = (this._attrs.type || 'submit').toLowerCase(); return t === 'button' || t === 'reset' ? t : 'submit'; } set type(v) { this.setAttribute('type', v); }
  get value() { return this._attrs.value || ''; } set value(v) { this.setAttribute('value', v); }
  get formAction() { return this._attrs.formaction || ''; } get formMethod() { return this._attrs.formmethod || ''; } get formTarget() { return this._attrs.formtarget || ''; }
}
mixinControl(HTMLButtonElementImpl);
class HTMLOptionElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this._selected = undefined; }
  get value() { return this._attrs.value !== undefined ? this._attrs.value : this.text; } set value(v) { this.setAttribute('value', v); }
  get text() { return R.collapse(this.textContent); } set text(v) { this.textContent = v; }
  get label() { return this._attrs.label !== undefined ? this._attrs.label : this.text; } set label(v) { this.setAttribute('label', v); }
  get selected() { return this._selected !== undefined ? this._selected : ('selected' in this._attrs); }
  set selected(v) { this._selected = !!v; const s = this.closest('select'); if (s && this._selected && !s.multiple) for (const o of s.options) if (o !== this) o._selected = false; }
  get defaultSelected() { return 'selected' in this._attrs; } set defaultSelected(v) { this.toggleAttribute('selected', !!v); }
  get disabled() { return 'disabled' in this._attrs || (this.parentNode && this.parentNode.localName === 'optgroup' && 'disabled' in this.parentNode._attrs); } set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get index() { const s = this.closest('select'); return s ? s.options.indexOf(this) : 0; }
  get form() { const s = this.closest('select'); return s ? s.form : null; }
}
class HTMLOptGroupElementImpl extends HTMLElementImpl { get label() { return this._attrs.label || ''; } get disabled() { return 'disabled' in this._attrs; } }
class HTMLSelectElementImpl extends HTMLElementImpl {
  get type() { return this.multiple ? 'select-multiple' : 'select-one'; }
  get multiple() { return 'multiple' in this._attrs; } set multiple(v) { this.toggleAttribute('multiple', !!v); }
  get size() { return parseInt(this._attrs.size, 10) || 0; }
  get options() { const out = R.collect(this, e => e.localName === 'option'); out.item = i => out[i] || null; out.namedItem = n => out.find(o => o._attrs.id === n || o._attrs.name === n) || null; return out; }
  get length() { return this.options.length; }
  get selectedOptions() { return this.options.filter(o => o.selected); }
  get selectedIndex() { const os = this.options; let i = os.findIndex(o => o.selected); if (i < 0 && os.length && !this.multiple && this.size <= 1) { i = os.findIndex(o => !o.disabled); } return i; }
  set selectedIndex(i) { const os = this.options; os.forEach((o, j) => { o._selected = j === i; }); }
  get value() { const os = this.options; let o = os.find(o => o.selected); if (!o && !this.multiple && this.size <= 1) o = os.find(o => !o.disabled); return o ? o.value : ''; }
  set value(v) { v = String(v); const os = this.options; let hit = false; for (const o of os) { if (!hit && o.value === v) { o._selected = true; hit = true; } else o._selected = false; } }
  item(i) { return this.options[i] || null; } namedItem(n) { return this.options.namedItem(n); }
  add(o, before) { if (before == null) this.appendChild(o); else this.insertBefore(o, typeof before === 'number' ? this.options[before] : before); }
  remove(i) { if (typeof i === 'number') { const o = this.options[i]; if (o) o.remove(); } else super.remove(); }
  _reset() { for (const o of this.options) o._selected = undefined; }
  showPicker() {}
}
mixinControl(HTMLSelectElementImpl);
Object.assign(ELEMENT_CLASSES, { form: HTMLFormElementImpl, input: HTMLInputElementImpl, textarea: HTMLTextAreaElementImpl, button: HTMLButtonElementImpl, option: HTMLOptionElementImpl, optgroup: HTMLOptGroupElementImpl, select: HTMLSelectElementImpl });
Object.assign(R.classes, { HTMLFormElement: HTMLFormElementImpl, HTMLInputElement: HTMLInputElementImpl, HTMLTextAreaElement: HTMLTextAreaElementImpl, HTMLButtonElement: HTMLButtonElementImpl, HTMLOptionElement: HTMLOptionElementImpl, HTMLOptGroupElement: HTMLOptGroupElementImpl, HTMLSelectElement: HTMLSelectElementImpl });

R.isFormControl = el => el.nodeType === 1 && (el.localName === 'input' || el.localName === 'select' || el.localName === 'textarea' || el.localName === 'button' || el.localName === 'fieldset' || el.localName === 'output' || el.localName === 'object');
R.isLabelable = el => el.nodeType === 1 && (el.localName === 'input' && el.type !== 'hidden' || el.localName === 'select' || el.localName === 'textarea' || el.localName === 'button' || el.localName === 'meter' || el.localName === 'output' || el.localName === 'progress');
R.isDisabled = el => { if (!R.isFormControl(el) && el.localName !== 'option' && el.localName !== 'optgroup') return false; if ('disabled' in el._attrs) return true; let p = el.parentNode; while (p && p.nodeType === 1) { if (p.localName === 'fieldset' && 'disabled' in p._attrs) { const legend = p.children.find(c => c.localName === 'legend'); if (!(legend && legend.contains(el))) return true; } p = p.parentNode; } return false; };
R.isEditable = el => (el.localName === 'input' && TEXT_INPUT_TYPES.has(el.type) && !('readonly' in el._attrs) && !R.isDisabled(el)) || (el.localName === 'textarea' && !('readonly' in el._attrs) && !R.isDisabled(el)) || el.isContentEditable;
R.isTextInput = el => (el.localName === 'input' && TEXT_INPUT_TYPES.has(el.type)) || el.localName === 'textarea';
R.uncheckRadioGroup = el => { const name = el._attrs.name; if (!name) return; const form = el.form; const root = form || el.ownerDocument; for (const o of R.collect(root, e => e.localName === 'input' && e.type === 'radio' && e._attrs.name === name && e.form === form)) if (o !== el) o._checked = false; };
R.collectFormData = (form, submitter) => {
  const out = [];
  for (const el of form.elements) {
    if (R.isDisabled(el) || !el._attrs.name) continue;
    const ln = el.localName, name = el._attrs.name;
    if (ln === 'button') { if (el === submitter) out.push([name, el.value]); continue; }
    if (ln === 'fieldset' || ln === 'object' || ln === 'output') continue;
    if (ln === 'input') {
      const t = el.type;
      if (t === 'submit' || t === 'image' || t === 'reset' || t === 'button') { if (el === submitter && t !== 'reset' && t !== 'button') { if (t === 'image') { out.push([name + '.x', '0']); out.push([name + '.y', '0']); } else out.push([name, el.value]); } continue; }
      if ((t === 'checkbox' || t === 'radio') && !el.checked) continue;
      if (t === 'file') { if (el.files && el.files.length) for (const f of el.files) out.push([name, f]); else out.push([name, { name: '', type: 'application/octet-stream', size: 0, _text: '' }]); continue; }
      out.push([name, el.value]); continue;
    }
    if (ln === 'select') { for (const o of el.options) if (o.selected && !o.disabled) out.push([name, o.value]); continue; }
    if (ln === 'textarea') { out.push([name, el.value.replace(/\r?\n/g, '\r\n')]); continue; }
  }
  if (submitter && submitter.localName === 'input' && submitter.type === 'submit' && submitter._attrs.name && !form.elements.includes(submitter)) out.push([submitter._attrs.name, submitter.value]);
  return out;
};
// Build a navigation request from a form submission (the agent performs it).
R.submitForm = (form, submitter, fireEvents) => {
  if (R.pendingNavigation) return;
  if (fireEvents) { if (!R.fire(form, 'submit', { cancelable: true, submitter }, R.eventClasses.SubmitEvent)) return; if (R.pendingNavigation) return; }
  let method = form.method, action = form.action, enctype = form.enctype;
  if (submitter) {
    if (submitter._attrs.formaction) action = R.resolveURL(submitter._attrs.formaction, R.base()) || action;
    if (submitter._attrs.formmethod) { const m = submitter._attrs.formmethod.toLowerCase(); if (m === 'post' || m === 'get' || m === 'dialog') method = m; }
    if (submitter._attrs.formenctype) enctype = submitter._attrs.formenctype.toLowerCase();
  }
  if (method === 'dialog') { const d = form.closest('dialog'); if (d) d.close(submitter && submitter.value); return; }
  const data = R.collectFormData(form, submitter);
  const pairs = data.map(([k, v]) => [k, typeof v === 'string' ? v : v.name]);
  const encoded = pairs.map(([k, v]) => formEncode(k) + '=' + formEncode(v)).join('&');
  if (method === 'get') {
    let u; try { u = new R.URL(action); } catch (e) { return; }
    if (u.protocol === 'http:' || u.protocol === 'https:') { u.search = encoded ? '?' + encoded : ''; u.hash = ''; }
    R.pendingNavigation = { url: u.href, method: 'GET', reason: 'form' };
  } else {
    let ct = 'application/x-www-form-urlencoded', body = encoded;
    if (enctype === 'text/plain') { ct = 'text/plain'; body = pairs.map(([k, v]) => k + '=' + v).join('\r\n') + '\r\n'; }
    else if (enctype === 'multipart/form-data') {
      const boundary = '----UrbitBrowserBoundary' + Math.floor(random() * 1e9);
      ct = 'multipart/form-data; boundary=' + boundary;
      body = data.map(([k, v]) => '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k.replace(/"/g, '%22') + '"' + (typeof v === 'string' ? '' : '; filename="' + v.name.replace(/"/g, '%22') + '"\r\nContent-Type: ' + (v.type || 'application/octet-stream')) + '\r\n\r\n' + (typeof v === 'string' ? v : (v._text || '')) + '\r\n').join('') + '--' + boundary + '--\r\n';
    }
    R.pendingNavigation = { url: action, method: 'POST', body, contentType: ct, reason: 'form' };
  }
};

// ==== 07-window.js
// --------------------------------------------------------------- Document
const KNOWN_HTML = new Set(['a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr', 'center', 'font', 'marquee', 'nobr', 'strike', 'tt', 'big', 'acronym', 'applet', 'basefont', 'dir', 'frame', 'frameset', 'noframes', 'noembed', 'plaintext', 'xmp', 'listing', 'image']);
class DocumentImpl extends NodeImpl {
  constructor() {
    super(null); this.nodeType = 9; this.nodeName = '#document'; this.ownerDocument = null;
    this._html = null; this._head = null; this._body = null; this._active = null;
    this.readyState = 'loading'; this.currentScript = null; this._parser = null;
    this._isMain = false;
  }
  get documentElement() { if (this._html && this._html.parentNode === this) return this._html; return this.childNodes.find(c => c.nodeType === 1) || null; }
  get head() { const h = this.documentElement; return h ? (h.children.find(c => c.localName === 'head') || null) : null; }
  get body() { const h = this.documentElement; return h ? (h.children.find(c => c.localName === 'body' || c.localName === 'frameset') || null) : null; }
  set body(v) { const old = this.body; if (old) old.replaceWith(v); else this.documentElement.appendChild(v); }
  get title() { const t = R.querySelector(this, 'title'); return t ? R.collapse(t.textContent) : ''; }
  set title(v) { let t = R.querySelector(this, 'title'); if (!t) { t = this.createElement('title'); (this.head || this.documentElement || this).appendChild(t); } t.textContent = String(v); }
  get URL() { return this._isMain ? R.location.href : (this._url || 'about:blank'); }
  get documentURI() { return this.URL; }
  get location() { return this._isMain ? R.location : null; }
  set location(v) { if (this._isMain) R.location.href = v; }
  get defaultView() { return this._isMain ? R.window : null; }
  get referrer() { return this._referrer || ''; }
  get domain() { try { return new R.URL(this.URL).hostname; } catch (e) { return ''; } } set domain(v) {}
  get cookie() { return this._isMain ? R.cookieString() : ''; }
  set cookie(v) { if (this._isMain) R.setCookie(String(v)); }
  get activeElement() { return this._active && this._active.isConnected ? this._active : this.body; }
  get hidden() { return false; } get visibilityState() { return 'visible'; } hasFocus() { return true; }
  get characterSet() { return 'UTF-8'; } get charset() { return 'UTF-8'; } get inputEncoding() { return 'UTF-8'; }
  get compatMode() { return 'CSS1Compat'; } get contentType() { return 'text/html'; }
  get doctype() { return { name: 'html', publicId: '', systemId: '', nodeType: 10, nodeName: 'html' }; }
  get implementation() { return { createHTMLDocument(title) { const d = new DocumentImpl(); d._url = 'about:blank'; new R.Parser(d).parse('<!doctype html><html><head><title>' + escapeText(title == null ? '' : String(title)) + '</title></head><body></body></html>'); return d; }, hasFeature() { return true; }, createDocumentType(n) { return { name: n, nodeType: 10 }; }, createDocument() { const d = new DocumentImpl(); return d; } }; }
  get scrollingElement() { return this.documentElement; }
  get fullscreenElement() { return null; } get pointerLockElement() { return null; } get pictureInPictureElement() { return null; }
  get fullscreenEnabled() { return false; }
  get styleSheets() { return []; } get adoptedStyleSheets() { return this._ass || (this._ass = []); } set adoptedStyleSheets(v) { this._ass = v; }
  get fonts() { return { ready: Promise.resolve(), status: 'loaded', load() { return Promise.resolve([]); }, check() { return true; }, add() {}, delete() {}, addEventListener() {}, removeEventListener() {}, forEach() {}, size: 0 }; }
  get timeline() { return { currentTime: R.clock.now }; }
  get lastModified() { return new Date(R.clock.base).toLocaleString(); }
  get dir() { return this.documentElement ? this.documentElement.dir : ''; } set dir(v) { if (this.documentElement) this.documentElement.dir = v; }
  get designMode() { return 'off'; } set designMode(v) {}
  get all() { return R.collect(this, () => true); }
  get forms() { return R.collect(this, e => e.localName === 'form'); }
  get images() { return R.collect(this, e => e.localName === 'img'); }
  get links() { return R.collect(this, e => (e.localName === 'a' || e.localName === 'area') && 'href' in e._attrs); }
  get anchors() { return R.collect(this, e => e.localName === 'a' && 'name' in e._attrs); }
  get scripts() { return R.collect(this, e => e.localName === 'script'); }
  get embeds() { return R.collect(this, e => e.localName === 'embed'); } get plugins() { return this.embeds; }
  _createElementRaw(tag, ns) {
    if (ns === SVG_NS) return new SVGElementImpl(this, tag, ns);
    if (ns && ns !== 'http://www.w3.org/1999/xhtml') return new ElementImpl(this, tag, ns);
    const Cls = ELEMENT_CLASSES[tag];
    if (Cls) return new Cls(this, tag);
    if (KNOWN_HTML.has(tag)) return new HTMLElementImpl(this, tag);
    if (tag.indexOf('-') > 0) { const el = new HTMLElementImpl(this, tag); const def = R.customElements.get(tag); if (def) R.upgradeCustom(el, def); return el; }
    return new HTMLUnknownElementImpl(this, tag);
  }
  createElement(tag, opts) { tag = String(tag); if (!/^[a-zA-Z][^\s\/>]*$/.test(tag)) { const e = new Error("Failed to execute 'createElement': The tag name provided ('" + tag + "') is not a valid name."); e.name = 'InvalidCharacterError'; throw e; } const el = this._createElementRaw(tag.toLowerCase()); if (opts && opts.is) el.setAttribute('is', opts.is); return el; }
  createElementNS(ns, qname, opts) { qname = String(qname); const i = qname.indexOf(':'); const local = i >= 0 ? qname.slice(i + 1) : qname; if (ns === 'http://www.w3.org/1999/xhtml' || !ns) return this.createElement(local, opts); return this._createElementRaw(local, ns); }
  createTextNode(t) { return new TextImpl(this, t == null ? '' : String(t)); }
  createComment(t) { return new CommentImpl(this, t == null ? '' : String(t)); }
  createCDATASection(t) { return this.createTextNode(t); }
  createProcessingInstruction(t, d) { return this.createComment(t + ' ' + d); }
  createDocumentFragment() { return new DocumentFragmentImpl(this); }
  createAttribute(n) { return { name: String(n).toLowerCase(), value: '', nodeType: 2 }; }
  createEvent(type) { const map = { UIEvents: 'UIEvent', MouseEvents: 'MouseEvent', HTMLEvents: 'Event', Events: 'Event', KeyboardEvents: 'KeyboardEvent', CustomEvent: 'CustomEvent' }; const Cls = R.eventClasses[map[type] || type] || EventImpl; return new Cls(''); }
  createRange() { return new RangeImpl(this); }
  createTreeWalker(root, whatToShow, filter) { return new TreeWalkerImpl(root, whatToShow, filter); }
  createNodeIterator(root, whatToShow, filter) { return new TreeWalkerImpl(root, whatToShow, filter); }
  createExpression() { throw new Error('XPath is not supported'); } evaluate() { throw new Error('XPath is not supported'); }
  importNode(n, deep) { const c = n.cloneNode(!!deep); adoptTree(c, this); return c; }
  adoptNode(n) { if (n.parentNode) n.parentNode.removeChild(n); adoptTree(n, this); return n; }
  _index() {
    if (this._idxGen === R.cssGeneration && this._ids) return;
    const ids = new Map(), labels = new Map();
    R.walk(this, n => {
      if (n.nodeType !== 1) return;
      const id = n._attrs.id; if (id !== undefined && !ids.has(id)) ids.set(id, n);
      if (n.localName === 'label') { const f = n._attrs.for; if (f !== undefined) { const l = labels.get('#' + f) || []; l.push(n); labels.set('#' + f, l); } else { const c = findFirst(n, R.isLabelable); if (c) { const l = labels.get(c) || []; l.push(n); labels.set(c, l); } } }
    });
    this._ids = ids; this._labels = labels; this._idxGen = R.cssGeneration;
  }
  getElementById(id) { this._index(); return this._ids.get(String(id)) || null; }
  _labelsFor(el) { this._index(); const byFor = el._attrs.id !== undefined ? (this._labels.get('#' + el._attrs.id) || []) : []; const wrapping = this._labels.get(el) || []; return byFor.concat(wrapping); }
  getElementsByName(n) { n = String(n); return R.collect(this, e => e._attrs.name === n); }
  elementFromPoint() { return null; } elementsFromPoint() { return []; } caretRangeFromPoint() { return null; } caretPositionFromPoint() { return null; }
  getSelection() { return R.window.getSelection(); }
  execCommand() { return false; } queryCommandSupported() { return false; } queryCommandEnabled() { return false; } queryCommandState() { return false; } queryCommandValue() { return ''; }
  exitFullscreen() { return Promise.resolve(); } exitPointerLock() {} exitPictureInPicture() { return Promise.resolve(); }
  hasStorageAccess() { return Promise.resolve(false); } requestStorageAccess() { return Promise.reject(new Error('NotAllowedError')); }
  open() { if (this._parser) return this; this._clearChildren(); this._html = this._head = this._body = null; return this; }
  close() {}
  write(...parts) {
    const s = parts.join('');
    if (this._parser) { this._parser.write(s); return; }
    // after parsing: append to body
    const target = this.body || this.documentElement || this;
    const p = new R.Parser(this, { fragment: true, root: target, scriptRunner: R.scriptRunner && this._isMain ? R.scriptRunner : null });
    p.parse(s);
  }
  writeln(...parts) { this.write(parts.join('') + '\n'); }
  _cloneShallow() { return new DocumentImpl(); }
  get outerHTML() { return this.childNodes.map(c => c.outerHTML).join(''); }
  get innerHTML() { return this.outerHTML; }
  toString() { return '[object HTMLDocument]'; }
}
class RangeImpl {
  constructor(doc) { this.startContainer = doc; this.endContainer = doc; this.startOffset = 0; this.endOffset = 0; this.collapsed = true; this.commonAncestorContainer = doc; }
  setStart(n, o) { this.startContainer = n; this.startOffset = o; } setEnd(n, o) { this.endContainer = n; this.endOffset = o; }
  setStartBefore(n) { this.setStart(n.parentNode, 0); } setStartAfter(n) { this.setStart(n.parentNode, 0); } setEndBefore(n) { this.setEnd(n.parentNode, 0); } setEndAfter(n) { this.setEnd(n.parentNode, 0); }
  selectNode(n) { this.startContainer = this.endContainer = n.parentNode || n; } selectNodeContents(n) { this.startContainer = this.endContainer = n; this.endOffset = n.childNodes.length; }
  collapse() { this.collapsed = true; } cloneRange() { return Object.assign(new RangeImpl(this.startContainer), this); } detach() {}
  deleteContents() {} extractContents() { return this.startContainer.ownerDocument ? this.startContainer.ownerDocument.createDocumentFragment() : new DocumentFragmentImpl(null); } cloneContents() { return this.extractContents(); }
  insertNode(n) { this.startContainer.appendChild(n); } surroundContents(n) { this.startContainer.appendChild(n); }
  createContextualFragment(html) { const doc = this.startContainer.ownerDocument || this.startContainer; const f = doc.createDocumentFragment(); R.parseFragmentInto(String(html), f, this.startContainer.nodeType === 1 ? this.startContainer : null); return f; }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; } getClientRects() { return []; }
  toString() { return ''; } compareBoundaryPoints() { return 0; } isPointInRange() { return false; } comparePoint() { return 0; } intersectsNode() { return false; }
}
class TreeWalkerImpl {
  constructor(root, whatToShow, filter) { this.root = root; this.currentNode = root; this.whatToShow = whatToShow === undefined ? 0xffffffff : whatToShow; this.filter = filter || null; this._referenceNode = root; this._pointerBeforeReferenceNode = true; }
  _accept(n) { const mask = n.nodeType === 1 ? 1 : n.nodeType === 3 ? 4 : n.nodeType === 8 ? 128 : n.nodeType === 9 ? 256 : n.nodeType === 11 ? 1024 : 0; if (!(this.whatToShow & mask)) return 3; if (!this.filter) return 1; const f = typeof this.filter === 'function' ? this.filter : this.filter.acceptNode; const r = f ? f.call(this.filter, n) : 1; return r === undefined ? 1 : r; }
  _following(n) { if (n.childNodes.length) return n.childNodes[0]; while (n && n !== this.root) { if (n.nextSibling) return n.nextSibling; n = n.parentNode; } return null; }
  _preceding(n) { if (n === this.root) return null; let p = n.previousSibling; if (!p) return n.parentNode === this.root ? null : n.parentNode; while (p.childNodes.length) p = p.childNodes[p.childNodes.length - 1]; return p; }
  nextNode() { let n = this._following(this.currentNode); while (n) { if (this._accept(n) === 1) { this.currentNode = n; return n; } n = this._following(n); } return null; }
  previousNode() { let n = this._preceding(this.currentNode); while (n) { if (this._accept(n) === 1) { this.currentNode = n; return n; } n = this._preceding(n); } return null; }
  parentNode() { let n = this.currentNode.parentNode; while (n && n !== this.root.parentNode) { if (this._accept(n) === 1) { this.currentNode = n; return n; } n = n.parentNode; } return null; }
  firstChild() { for (const c of this.currentNode.childNodes) if (this._accept(c) === 1) { this.currentNode = c; return c; } return null; }
  lastChild() { const cs = this.currentNode.childNodes; for (let i = cs.length - 1; i >= 0; i--) if (this._accept(cs[i]) === 1) { this.currentNode = cs[i]; return cs[i]; } return null; }
  nextSibling() { let n = this.currentNode.nextSibling; while (n) { if (this._accept(n) === 1) { this.currentNode = n; return n; } n = n.nextSibling; } return null; }
  previousSibling() { let n = this.currentNode.previousSibling; while (n) { if (this._accept(n) === 1) { this.currentNode = n; return n; } n = n.previousSibling; } return null; }
  get referenceNode() { return this.currentNode; }
  detach() {}
}
R.mixinParentNode(DocumentImpl);
R.labelsFor = el => { const d = el.ownerDocument; return d && d._isMain ? d._labelsFor(el) : R.collect(d || el.getRootNode(), e => e.localName === 'label' && ((el._attrs.id && e._attrs.for === el._attrs.id) || (!e._attrs.for && e.contains(el)))); };
R.classes.Document = DocumentImpl; R.classes.HTMLDocument = DocumentImpl; R.classes.XMLDocument = DocumentImpl; R.classes.Range = RangeImpl; R.classes.TreeWalker = TreeWalkerImpl; R.classes.NodeIterator = TreeWalkerImpl;

// ------------------------------------------------------------ Visibility
R.baseHref = null;
R.base = () => R.baseHref || R.location.href;
R.isVisible = el => {
  let n = el;
  while (n && n.nodeType === 1) {
    if (n.localName === 'template' || n.localName === 'head' || n.localName === 'noscript') return false;
    if (n.localName === 'input' && n.type === 'hidden') return false;
    if (R.cssHidden(n)) return false;
    if (n.localName === 'dialog' && !('open' in n._attrs)) return false;
    if (n.localName === 'details' && !('open' in n._attrs) && n !== el) { const summary = n.children.find(c => c.localName === 'summary'); if (!summary || !summary.contains(el)) return false; }
    if (n.localName === 'select' && n !== el) return false;
    n = n.parentNode;
  }
  return true;
};
R.isFocusable = el => el.nodeType === 1 && !R.isDisabled(el) && (((el.localName === 'a' || el.localName === 'area') && 'href' in el._attrs) || (R.isFormControl(el) && el.localName !== 'fieldset' && !(el.localName === 'input' && el.type === 'hidden')) || el.localName === 'iframe' || el.localName === 'summary' || el.isContentEditable || (el._attrs.tabindex !== undefined && el._attrs.tabindex !== '-1'));
R.setFocus = el => {
  const doc = R.document; const old = doc._active;
  if (el && (!R.isFocusable(el) || !el.isConnected)) return;
  if (old === el) return;
  doc._active = el || null;
  if (old && old.isConnected) { R.fire(old, 'blur', { bubbles: false, cancelable: false, relatedTarget: el }, R.eventClasses.FocusEvent); R.fire(old, 'focusout', { cancelable: false, relatedTarget: el }, R.eventClasses.FocusEvent); if (old._dirtyValue && R.isTextInput(old)) { old._dirtyValue = false; R.fire(old, 'change', { cancelable: false }); } }
  if (el) { R.fire(el, 'focus', { bubbles: false, cancelable: false, relatedTarget: old }, R.eventClasses.FocusEvent); R.fire(el, 'focusin', { cancelable: false, relatedTarget: old }, R.eventClasses.FocusEvent); }
};
R.innerText = el => {
  if (!R.isVisible(el)) return el.textContent;
  let out = '';
  const rec = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += n.localName === 'pre' || n.localName === 'textarea' ? c.data : c.data.replace(/\s+/g, ' '); continue; }
      if (c.nodeType !== 1 || !R.isVisible(c) || c.localName === 'script' || c.localName === 'style') continue;
      if (c.localName === 'br') { out += '\n'; continue; }
      const block = BLOCK_TAGS.has(c.localName);
      if (block && out && !out.endsWith('\n')) out += '\n';
      if (c.localName === 'td' || c.localName === 'th') { rec(c); out += '\t'; continue; }
      rec(c);
      if (block && !out.endsWith('\n')) out += '\n';
    }
  };
  rec(el);
  return out.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

// ------------------------------------------------------------- Location
class LocationImpl {
  constructor() { this._url = new URLImpl('about:blank'); }
  _set(href) { this._url = new URLImpl(href); }
  get href() { return this._url.href; }
  set href(v) { this.assign(v); }
  assign(v) {
    const target = R.resolveURL(String(v), this._url.href); if (!target) return;
    if (/^javascript:/i.test(target)) { R.evalScript(decodeURIComponent(target.slice(11)), 'javascript: url'); return; }
    const t = new URLImpl(target);
    if (t.href.split('#')[0] === this._url.href.split('#')[0] && t.hash !== undefined && (t.hash || target.includes('#'))) { R.setHash(t.hash); return; }
    if (!R.pendingNavigation) R.pendingNavigation = { url: t.href, method: 'GET', reason: 'location' };
  }
  replace(v) { this.assign(v); if (R.pendingNavigation) R.pendingNavigation.replace = true; }
  reload() { if (!R.pendingNavigation) R.pendingNavigation = { url: this._url.href, method: 'GET', reason: 'reload' }; }
  toString() { return this._url.href; }
  get ancestorOrigins() { return []; }
}
for (const p of ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin']) {
  Object.defineProperty(LocationImpl.prototype, p, {
    get() { return this._url[p]; },
    set(v) { if (p === 'origin') return; if (p === 'hash') { R.setHash(String(v)); return; } const u = new URLImpl(this._url.href); u[p] = v; this.assign(u.href); },
    configurable: true,
  });
}
R.setHash = h => {
  h = String(h); if (h && h[0] !== '#') h = '#' + h; if (h === '#') h = '';
  const old = R.location._url.href; const u = new URLImpl(old); u.hash = h;
  if (u.href === old) return;
  R.location._url = u; R.history._push({ state: null, url: u.href }, true);
  R.queueTimer(() => { R.fire(R.window, 'hashchange', { cancelable: false, oldURL: old, newURL: u.href }, R.eventClasses.HashChangeEvent); }, 0);
};
class HistoryImpl {
  constructor() { this._entries = [{ state: null, url: 'about:blank' }]; this._index = 0; this.scrollRestoration = 'auto'; }
  get length() { return this._entries.length; }
  get state() { return this._entries[this._index].state; }
  _push(e, replace) { if (replace) { this._entries[this._index] = e; } else { this._entries = this._entries.slice(0, this._index + 1); this._entries.push(e); this._index++; } }
  pushState(state, title, url) { this._change(state, url, false); }
  replaceState(state, title, url) { this._change(state, url, true); }
  _change(state, url, replace) {
    let href = R.location.href;
    if (url != null) { const r = R.resolveURL(String(url), href); if (!r) throw new Error('SecurityError: invalid URL'); const a = new URLImpl(r), b = new URLImpl(href); if (a.origin !== b.origin) throw new Error('SecurityError: cross-origin pushState'); href = a.href; }
    let clone = state; try { clone = state === undefined ? null : JSON.parse(JSON.stringify(state)); } catch (e) { clone = state; }
    if (replace) this._entries[this._index] = { state: clone, url: href }; else this._push({ state: clone, url: href }, false);
    R.location._url = new URLImpl(href);
  }
  back() { this.go(-1); } forward() { this.go(1); }
  go(n) { n = n | 0; if (!n) { R.location.reload(); return; } const target = this._index + n; if (target >= 0 && target < this._entries.length) { this._index = target; const e = this._entries[target]; R.location._url = new URLImpl(e.url); R.queueTimer(() => R.fire(R.window, 'popstate', { cancelable: false, state: e.state }, R.eventClasses.PopStateEvent), 0); return; } if (!R.pendingNavigation) R.pendingNavigation = { history: n, reason: 'history' }; }
}
R.classes.Location = LocationImpl; R.classes.History = HistoryImpl;

// ---------------------------------------------------------------- Timers
R.timers = []; let timerSeq = 0, timerIdCounter = 0;
R.queueTimer = (fn, delay, args, interval) => { const id = ++timerIdCounter; R.timers.push({ id, fn, args: args || [], at: R.clock.now + Math.max(0, +delay || 0), interval: interval ? Math.max(4, +delay || 0) : null, seq: ++timerSeq, runs: 0 }); return id; };
R.clearTimer = id => { const i = R.timers.findIndex(t => t.id === id); if (i >= 0) R.timers.splice(i, 1); };
R.runTimerBatch = (maxRuns, maxAdvance) => {
  let runs = 0; const limit = R.clock.now + maxAdvance;
  while (runs < maxRuns && R.timers.length) {
    let best = null; for (const t of R.timers) if (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq)) best = t;
    if (best.at > limit) return { ran: runs, pending: true, next: best.at - R.clock.now };
    if (best.at > R.clock.now) R.clock.now = best.at;
    if (best.interval !== null) { best.runs++; best.at = R.clock.now + best.interval; best.seq = ++timerSeq; if (best.runs >= 30) R.clearTimer(best.id); }
    else R.clearTimer(best.id);
    runs++;
    try { if (typeof best.fn === 'function') best.fn.apply(R.window, best.args); else if (typeof best.fn === 'string') R.evalScript(best.fn, 'timer'); } catch (e) { R.reportError(e, 'timer'); }
    if (R.pendingNavigation) return { ran: runs, pending: false, navigate: true };
  }
  return { ran: runs, pending: R.timers.length > 0 };
};

// ---------------------------------------------------------- fetch / XHR
class HeadersImpl {
  constructor(init) { this._m = new Map(); if (init) { if (init instanceof HeadersImpl) init.forEach((v, k) => this.append(k, v)); else if (Array.isArray(init)) for (const [k, v] of init) this.append(k, v); else for (const k of Object.keys(init)) this.append(k, init[k]); } }
  append(k, v) { k = String(k).toLowerCase(); v = String(v).trim(); const o = this._m.get(k); this._m.set(k, o ? o + ', ' + v : v); }
  set(k, v) { this._m.set(String(k).toLowerCase(), String(v).trim()); }
  get(k) { const v = this._m.get(String(k).toLowerCase()); return v === undefined ? null : v; }
  has(k) { return this._m.has(String(k).toLowerCase()); }
  delete(k) { this._m.delete(String(k).toLowerCase()); }
  forEach(fn, t) { for (const [k, v] of [...this._m.entries()].sort()) fn.call(t, v, k, this); }
  keys() { return [...this._m.keys()].sort()[Symbol.iterator](); } values() { return [...this._m.entries()].sort().map(e => e[1])[Symbol.iterator](); } entries() { return [...this._m.entries()].sort()[Symbol.iterator](); }
  [Symbol.iterator]() { return this.entries(); }
  getSetCookie() { const v = this.get('set-cookie'); return v ? [v] : []; }
  _toObject() { const o = {}; for (const [k, v] of this._m) o[k] = v; return o; }
}
function bodyToString(body, headers) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) { if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8'); return body.toString(); }
  if (body instanceof FormDataImpl) { const boundary = '----UrbitBrowserBoundary' + Math.floor(random() * 1e9); if (!headers.has('content-type')) headers.set('content-type', 'multipart/form-data; boundary=' + boundary); let s = ''; for (const [k, v] of body.entries()) s += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"' + (typeof v === 'string' ? '' : '; filename="' + (v.name || 'blob') + '"\r\nContent-Type: ' + (v.type || 'application/octet-stream')) + '\r\n\r\n' + (typeof v === 'string' ? v : (v._text || '')) + '\r\n'; return s + '--' + boundary + '--\r\n'; }
  if (body instanceof BlobImpl) { if (body.type && !headers.has('content-type')) headers.set('content-type', body.type); return body._text; }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) { return utf8Decode(new Uint8Array(body.buffer || body, body.byteOffset || 0, body.byteLength)); }
  return String(body);
}
function hostFetch(url, method, headers, body, kind) {
  if (!host.fetch) throw new TypeError('Failed to fetch: no network access');
  const raw = host.fetch(url, method, JSON.stringify(headers instanceof HeadersImpl ? headers._toObject() : (headers || {})), body == null ? '' : String(body), kind || 'fetch');
  let r;
  const nl = raw.indexOf('\n');
  try { r = JSON.parse(nl < 0 ? raw : raw.slice(0, nl)); } catch (e) { throw new TypeError('Failed to fetch: bad host response'); }
  if (nl >= 0) r.body = raw.slice(nl + 1);
  if (r.error) throw new TypeError('Failed to fetch: ' + r.error);
  R.subrequests = (R.subrequests || 0) + 1;
  return r;
}
R.hostFetch = hostFetch;
class ResponseImpl {
  constructor(body, init) { init = init || {}; this._body = body == null ? '' : (typeof body === 'string' ? body : bodyToString(body, new HeadersImpl())); this.status = init.status === undefined ? 200 : init.status; this.statusText = init.statusText || ''; this.headers = new HeadersImpl(init.headers); this.url = init.url || ''; this.redirected = !!init.redirected; this.type = init.type || 'basic'; this.bodyUsed = false; }
  get ok() { return this.status >= 200 && this.status < 300; }
  get body() { return null; }
  text() { this.bodyUsed = true; return Promise.resolve(this._body); }
  json() { this.bodyUsed = true; try { return Promise.resolve(JSON.parse(this._body)); } catch (e) { return Promise.reject(new SyntaxError('Unexpected token in JSON: ' + e.message)); } }
  arrayBuffer() { this.bodyUsed = true; return Promise.resolve(utf8Encode(this._body).buffer); }
  blob() { this.bodyUsed = true; return Promise.resolve(new BlobImpl([this._body], { type: this.headers.get('content-type') || '' })); }
  formData() { this.bodyUsed = true; const fd = new FormDataImpl(); for (const [k, v] of new URLSearchParams(this._body)) fd.append(k, v); return Promise.resolve(fd); }
  clone() { const r = new ResponseImpl(this._body, { status: this.status, statusText: this.statusText, headers: this.headers, url: this.url }); return r; }
  static json(data, init) { const r = new ResponseImpl(JSON.stringify(data), init); if (!r.headers.has('content-type')) r.headers.set('content-type', 'application/json'); return r; }
  static error() { const r = new ResponseImpl('', { status: 0 }); r.type = 'error'; return r; }
  static redirect(url, status) { return new ResponseImpl('', { status: status || 302, headers: { location: url } }); }
}
class RequestImpl {
  constructor(input, init) { init = init || {}; const isReq = input instanceof RequestImpl; this.url = isReq ? input.url : (R.resolveURL(String(input), R.base()) || String(input)); this.method = (init.method || (isReq ? input.method : 'GET')).toUpperCase(); this.headers = new HeadersImpl(init.headers || (isReq ? input.headers : undefined)); this._body = init.body !== undefined ? init.body : (isReq ? input._body : null); this.credentials = init.credentials || 'same-origin'; this.mode = init.mode || 'cors'; this.cache = init.cache || 'default'; this.redirect = init.redirect || 'follow'; this.referrer = ''; this.signal = init.signal || null; this.bodyUsed = false; this.integrity = ''; this.keepalive = !!init.keepalive; }
  clone() { return new RequestImpl(this); }
  text() { return Promise.resolve(bodyToString(this._body, new HeadersImpl())); } json() { return this.text().then(JSON.parse); }
  arrayBuffer() { return this.text().then(t => utf8Encode(t).buffer); }
  formData() { return this.text().then(t => { const fd = new FormDataImpl(); for (const [k, v] of new URLSearchParams(t)) fd.append(k, v); return fd; }); }
}
function fetchImpl(input, init) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = new RequestImpl(input, init); } catch (e) { reject(e); return; }
    if (req.signal && req.signal.aborted) { reject(new DOMExceptionImpl('The operation was aborted.', 'AbortError')); return; }
    const headers = new HeadersImpl(req.headers);
    const body = req.method === 'GET' || req.method === 'HEAD' ? '' : bodyToString(req._body, headers);
    let r;
    try { r = hostFetch(req.url, req.method, headers, body, req.keepalive ? 'beacon' : 'fetch'); } catch (e) { reject(e); return; }
    resolve(new ResponseImpl(r.body || '', { status: r.status, statusText: r.statusText || '', headers: r.headers || {}, url: r.url || req.url, redirected: !!(r.url && r.url !== req.url) }));
  });
}
class XMLHttpRequestUploadImpl extends EventTargetImpl {}
class XMLHttpRequestImpl extends EventTargetImpl {
  constructor() { super(); this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.responseURL = ''; this.responseType = ''; this.timeout = 0; this.withCredentials = false; this.upload = new XMLHttpRequestUploadImpl(); this._headers = new HeadersImpl(); this._resHeaders = new HeadersImpl(); this._method = 'GET'; this._url = ''; this._async = true; this._aborted = false; this._mime = null; }
  open(method, url, async) { this._method = String(method).toUpperCase(); this._url = R.resolveURL(String(url), R.base()) || String(url); this._async = async === undefined ? true : !!async; this.readyState = 1; this._headers = new HeadersImpl(); R.fire(this, 'readystatechange', { bubbles: false, cancelable: false }); }
  setRequestHeader(k, v) { this._headers.append(k, v); }
  overrideMimeType(m) { this._mime = m; }
  getResponseHeader(k) { return this._resHeaders.get(k); }
  getAllResponseHeaders() { let s = ''; this._resHeaders.forEach((v, k) => { s += k + ': ' + v + '\r\n'; }); return s; }
  abort() { this._aborted = true; if (this.readyState > 0 && this.readyState < 4) { this.readyState = 4; this.status = 0; this._events(['readystatechange', 'abort', 'loadend']); } this.readyState = 0; }
  send(body) {
    if (this.readyState !== 1) throw new Error('InvalidStateError: XMLHttpRequest state must be OPENED');
    const b = this._method === 'GET' || this._method === 'HEAD' ? '' : bodyToString(body, this._headers);
    const finish = () => {
      if (this._aborted) return;
      let r;
      try { r = hostFetch(this._url, this._method, this._headers, b, 'xhr'); }
      catch (e) { this.readyState = 4; this.status = 0; this._events(['readystatechange', 'error', 'loadend']); return; }
      this.status = r.status; this.statusText = r.statusText || ''; this.responseText = r.body || ''; this.responseURL = r.url || this._url; this._resHeaders = new HeadersImpl(r.headers || {});
      this.readyState = 2; this._events(['readystatechange']); this.readyState = 3; this._events(['readystatechange', 'progress']); this.readyState = 4; this._events(['readystatechange', 'load', 'loadend']);
    };
    if (this._async) { R.fire(this, 'loadstart', { bubbles: false, cancelable: false }, R.eventClasses.ProgressEvent); R.queueTimer(finish, 0); } else finish();
  }
  _events(types) { for (const t of types) R.fire(this, t, { bubbles: false, cancelable: false }, t === 'readystatechange' ? EventImpl : R.eventClasses.ProgressEvent); }
  get response() {
    const t = this.responseType;
    if (t === '' || t === 'text') return this.responseText;
    if (t === 'json') { try { return JSON.parse(this.responseText); } catch (e) { return null; } }
    if (t === 'document') { const d = new DocumentImpl(); d._url = this.responseURL; new R.Parser(d).parse(this.responseText); return d; }
    if (t === 'arraybuffer') return utf8Encode(this.responseText).buffer;
    if (t === 'blob') return new BlobImpl([this.responseText], { type: this._resHeaders.get('content-type') || '' });
    return this.responseText;
  }
  get responseXML() { if (this.responseType && this.responseType !== 'document') return null; const d = new DocumentImpl(); d._url = this.responseURL; new R.Parser(d).parse(this.responseText); return d; }
}
for (const [k, v] of Object.entries({ UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4 })) { XMLHttpRequestImpl[k] = v; XMLHttpRequestImpl.prototype[k] = v; }

// --------------------------------------------------- Blob, encoding, misc
function utf8Encode(s) { const out = []; for (let i = 0; i < s.length; i++) { let c = s.charCodeAt(i); if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } } if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); } return new Uint8Array(out); }
function utf8Decode(b) { let s = ''; for (let i = 0; i < b.length;) { const c = b[i++]; if (c < 0x80) s += String.fromCharCode(c); else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63)); else if (c < 0xf0) { s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)); } else { const cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); s += String.fromCodePoint(cp); } } return s; }
class TextEncoderImpl { get encoding() { return 'utf-8'; } encode(s) { return utf8Encode(String(s == null ? '' : s)); } encodeInto(s, arr) { const b = utf8Encode(s); arr.set(b.subarray(0, arr.length)); return { read: s.length, written: Math.min(b.length, arr.length) }; } }
class TextDecoderImpl { constructor(label) { this.encoding = (label || 'utf-8').toLowerCase(); this.fatal = false; this.ignoreBOM = false; } decode(buf) { if (!buf) return ''; const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); return utf8Decode(b); } }
class BlobImpl {
  constructor(parts, opts) { this._text = (parts || []).map(p => typeof p === 'string' ? p : p instanceof BlobImpl ? p._text : (p instanceof ArrayBuffer || ArrayBuffer.isView(p)) ? utf8Decode(new Uint8Array(p.buffer || p, p.byteOffset || 0, p.byteLength)) : String(p)).join(''); this.type = (opts && opts.type) || ''; }
  get size() { return utf8Encode(this._text).length; }
  text() { return Promise.resolve(this._text); } arrayBuffer() { return Promise.resolve(utf8Encode(this._text).buffer); } stream() { return null; }
  slice(s, e, t) { return new BlobImpl([this._text.slice(s, e)], { type: t || this.type }); }
}
class FileImpl extends BlobImpl { constructor(parts, name, opts) { super(parts, opts); this.name = String(name); this.lastModified = (opts && opts.lastModified) || R.clock.base; this.webkitRelativePath = ''; } }
class FileReaderImpl extends EventTargetImpl {
  constructor() { super(); this.readyState = 0; this.result = null; this.error = null; }
  _finish(v) { R.queueTimer(() => { this.result = v; this.readyState = 2; R.fire(this, 'load', { bubbles: false, cancelable: false }, R.eventClasses.ProgressEvent); R.fire(this, 'loadend', { bubbles: false, cancelable: false }, R.eventClasses.ProgressEvent); }, 0); this.readyState = 1; }
  readAsText(b) { this._finish(b._text || ''); } readAsDataURL(b) { this._finish('data:' + (b.type || 'application/octet-stream') + ';base64,' + btoaImpl(b._text || '')); } readAsArrayBuffer(b) { this._finish(utf8Encode(b._text || '').buffer); } readAsBinaryString(b) { this._finish(b._text || ''); }
  abort() { this.readyState = 2; }
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function btoaImpl(s) { s = String(s); let out = ''; for (let i = 0; i < s.length; i += 3) { const a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2); if (a > 255 || b > 255 || c > 255) throw new DOMExceptionImpl('Invalid character', 'InvalidCharacterError'); const n = (a << 16) | ((b || 0) << 8) | (c || 0); out += B64[n >> 18] + B64[(n >> 12) & 63] + (isNaN(b) ? '=' : B64[(n >> 6) & 63]) + (isNaN(c) ? '=' : B64[n & 63]); } return out; }
function atobImpl(s) { s = String(s).replace(/[\s=]/g, ''); let out = '', bits = 0, acc = 0; for (const ch of s) { const v = B64.indexOf(ch); if (v < 0) throw new DOMExceptionImpl('Invalid character', 'InvalidCharacterError'); acc = (acc << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 255); } } return out; }
class DOMExceptionImpl extends Error { constructor(msg, name) { super(msg); this.name = name || 'Error'; const codes = { IndexSizeError: 1, HierarchyRequestError: 3, WrongDocumentError: 4, InvalidCharacterError: 5, NotFoundError: 8, NotSupportedError: 9, InvalidStateError: 11, SyntaxError: 12, InvalidModificationError: 13, NamespaceError: 14, InvalidAccessError: 15, SecurityError: 18, NetworkError: 19, AbortError: 20, QuotaExceededError: 22, TimeoutError: 23, DataCloneError: 25 }; this.code = codes[this.name] || 0; } }
class AbortSignalImpl extends EventTargetImpl { constructor() { super(); this.aborted = false; this.reason = undefined; } throwIfAborted() { if (this.aborted) throw this.reason; } static abort(r) { const s = new AbortSignalImpl(); s.aborted = true; s.reason = r; return s; } static timeout(ms) { const c = new AbortControllerImpl(); R.queueTimer(() => c.abort(new DOMExceptionImpl('timeout', 'TimeoutError')), ms); return c.signal; } static any(list) { const c = new AbortControllerImpl(); for (const s of list) { if (s.aborted) { c.abort(s.reason); break; } s.addEventListener('abort', () => c.abort(s.reason)); } return c.signal; } }
class AbortControllerImpl { constructor() { this.signal = new AbortSignalImpl(); } abort(r) { if (this.signal.aborted) return; this.signal.aborted = true; this.signal.reason = r === undefined ? new DOMExceptionImpl('The operation was aborted.', 'AbortError') : r; R.fire(this.signal, 'abort', { bubbles: false, cancelable: false }); } }
class StorageImpl {
  constructor(init, dirtyFlag) { this._d = Object.assign(Object.create(null), init || {}); this._dirty = dirtyFlag; }
  get length() { return Object.keys(this._d).length; }
  key(i) { const k = Object.keys(this._d)[i]; return k === undefined ? null : k; }
  getItem(k) { k = String(k); return k in this._d ? this._d[k] : null; }
  setItem(k, v) { this._d[String(k)] = String(v); R.storageDirty[this._dirty] = true; }
  removeItem(k) { delete this._d[String(k)]; R.storageDirty[this._dirty] = true; }
  clear() { this._d = Object.create(null); R.storageDirty[this._dirty] = true; }
  _wrap() { const s = this; return new Proxy(s, { get(t, k) { if (typeof k === 'symbol' || k in t) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } return t.getItem(k) === null ? undefined : t.getItem(k); }, set(t, k, v) { t.setItem(k, v); return true; }, deleteProperty(t, k) { t.removeItem(k); return true; }, has(t, k) { return k in t || (typeof k === 'string' && k in t._d); }, ownKeys(t) { return Object.keys(t._d); }, getOwnPropertyDescriptor(t, k) { if (typeof k === 'string' && k in t._d) return { enumerable: true, configurable: true, value: t._d[k] }; return undefined; } }); }
}
R.storageDirty = { local: false, session: false };
class MutationObserverImpl {
  constructor(cb) { this._cb = cb; this._targets = []; this._records = []; }
  observe(target, opts) { if (!target || !target.__isNode) throw new TypeError('MutationObserver.observe: invalid target'); this._targets = this._targets.filter(t => t.target !== target); this._targets.push({ target, opts: opts || {} }); if (!R.observers.includes(this)) R.observers.push(this); }
  disconnect() { this._targets = []; this._records = []; R.observers = R.observers.filter(o => o !== this); }
  takeRecords() { const r = this._records; this._records = []; return r; }
  _queue(rec) { if (this._records.length > 200) return; this._records.push(rec); R.observerPending = true; }
}
R.observers = []; R.observerPending = false;
function notifyObservers(type, node, extra) {
  if (!R.observers.length) return;
  for (const o of R.observers) for (const t of o._targets) {
    const { target, opts } = t;
    if (type === 'attributes' && !opts.attributes && !opts.attributeFilter) continue;
    if (type === 'childList' && !opts.childList) continue;
    if (type === 'characterData' && !opts.characterData) continue;
    const container = type === 'childList' ? node : node;
    if (!(container === target || (opts.subtree && target.contains(container)))) continue;
    if (type === 'attributes' && opts.attributeFilter && !opts.attributeFilter.includes(extra.attributeName)) continue;
    o._queue(Object.assign({ type, target: container, addedNodes: [], removedNodes: [], previousSibling: null, nextSibling: null, attributeName: null, attributeNamespace: null, oldValue: null }, extra));
  }
}
R.deliverObservers = () => { if (!R.observerPending) return; R.observerPending = false; for (const o of R.observers.slice()) { const recs = o.takeRecords(); if (recs.length) { try { o._cb(recs, o); } catch (e) { R.reportError(e, 'MutationObserver'); } } } };
R.onInsert = (c, p) => { if (c.nodeType === 1 && c._custom && c._custom.connectedCallback && c.isConnected) { try { c._custom.connectedCallback.call(c); } catch (e) { R.reportError(e, 'connectedCallback'); } } if (c.nodeType === 1) R.walk(c, n => { if (n.nodeType === 1 && n._custom && n._custom.connectedCallback) { try { n._custom.connectedCallback.call(n); } catch (e) { R.reportError(e, 'connectedCallback'); } } }); notifyObservers('childList', p, { addedNodes: [c] }); };
R.onRemove = (c, p) => { if (c.nodeType === 1 && c._custom && c._custom.disconnectedCallback) { try { c._custom.disconnectedCallback.call(c); } catch (e) { R.reportError(e, 'disconnectedCallback'); } } notifyObservers('childList', p, { removedNodes: [c] }); };
R.onAttr = (el, name, old, val) => { if (el._custom && el._custom.attributeChangedCallback && el._custom.observedAttributes && el._custom.observedAttributes.includes(name)) { try { el._custom.attributeChangedCallback.call(el, name, old === undefined ? null : old, val); } catch (e) { R.reportError(e, 'attributeChangedCallback'); } } notifyObservers('attributes', el, { attributeName: name, oldValue: old === undefined ? null : old }); };
class IntersectionObserverImpl { constructor(cb, opts) { this._cb = cb; this.root = (opts && opts.root) || null; this.rootMargin = '0px'; this.thresholds = [0]; this._els = []; } observe(el) { this._els.push(el); R.queueTimer(() => { try { this._cb([{ target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: el.getBoundingClientRect(), intersectionRect: el.getBoundingClientRect(), rootBounds: null, time: R.clock.now }], this); } catch (e) { R.reportError(e, 'IntersectionObserver'); } }, 0); } unobserve(el) { this._els = this._els.filter(e => e !== el); } disconnect() { this._els = []; } takeRecords() { return []; } }
class ResizeObserverImpl { constructor(cb) { this._cb = cb; } observe(el) { R.queueTimer(() => { try { this._cb([{ target: el, contentRect: el.getBoundingClientRect(), borderBoxSize: [{ inlineSize: 0, blockSize: 0 }], contentBoxSize: [{ inlineSize: 0, blockSize: 0 }] }], this); } catch (e) { R.reportError(e, 'ResizeObserver'); } }, 0); } unobserve() {} disconnect() {} }
class PerformanceObserverImpl { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } static get supportedEntryTypes() { return []; } }
class DOMRectImpl { constructor(x, y, w, h) { this.x = x || 0; this.y = y || 0; this.width = w || 0; this.height = h || 0; } get top() { return this.y; } get left() { return this.x; } get right() { return this.x + this.width; } get bottom() { return this.y + this.height; } toJSON() { return { x: this.x, y: this.y, width: this.width, height: this.height, top: this.top, left: this.left, right: this.right, bottom: this.bottom }; } static fromRect(r) { return new DOMRectImpl(r && r.x, r && r.y, r && r.width, r && r.height); } }
class CSSStyleSheetImpl { constructor() { this.cssRules = []; this.disabled = false; } insertRule(r, i) { this.cssRules.splice(i || 0, 0, { cssText: r }); return i || 0; } deleteRule(i) { this.cssRules.splice(i, 1); } replace(t) { return Promise.resolve(this); } replaceSync() {} get rules() { return this.cssRules; } addRule() { return -1; } removeRule() {} }
class MessageChannelImpl { constructor() { const p1 = new EventTargetImpl(), p2 = new EventTargetImpl(); const link = (a, b) => { a.postMessage = d => R.queueTimer(() => R.fire(b, 'message', { bubbles: false, cancelable: false, data: d }, R.eventClasses.MessageEvent), 0); a.start = () => {}; a.close = () => {}; }; link(p1, p2); link(p2, p1); this.port1 = p1; this.port2 = p2; } }
class WebSocketImpl extends EventTargetImpl { constructor(url) { super(); this.url = String(url); this.readyState = 0; this.protocol = ''; this.extensions = ''; this.bufferedAmount = 0; this.binaryType = 'blob'; R.queueTimer(() => { this.readyState = 3; R.fire(this, 'error', { bubbles: false, cancelable: false }); R.fire(this, 'close', { bubbles: false, cancelable: false }); }, 0); R.pushLog('warn', ['WebSocket is not supported: ' + this.url]); } send() { throw new DOMExceptionImpl('WebSocket is not open', 'InvalidStateError'); } close() { this.readyState = 3; } }
for (const [k, v] of Object.entries({ CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })) WebSocketImpl[k] = v;
class EventSourceImpl extends EventTargetImpl { constructor(url) { super(); this.url = String(url); this.readyState = 2; this.withCredentials = false; R.queueTimer(() => R.fire(this, 'error', { bubbles: false, cancelable: false }), 0); } close() {} }
class BroadcastChannelImpl extends EventTargetImpl { constructor(n) { super(); this.name = String(n); } postMessage() {} close() {} }
class CustomElementRegistryImpl {
  constructor() { this._defs = new Map(); this._waiters = new Map(); }
  define(name, ctor, opts) { name = String(name).toLowerCase(); if (this._defs.has(name)) throw new DOMExceptionImpl('the name "' + name + '" has already been used', 'NotSupportedError'); const def = { name, ctor, extends: opts && opts.extends, connectedCallback: ctor.prototype.connectedCallback, disconnectedCallback: ctor.prototype.disconnectedCallback, attributeChangedCallback: ctor.prototype.attributeChangedCallback, observedAttributes: ctor.observedAttributes || [] }; this._defs.set(name, def); if (R.document) for (const el of R.collect(R.document, e => e.localName === name || e._attrs.is === name)) R.upgradeCustom(el, def); const w = this._waiters.get(name); if (w) { w.forEach(r => r(ctor)); this._waiters.delete(name); } }
  get(name) { const d = this._defs.get(String(name).toLowerCase()); return d ? d.ctor : undefined; }
  getName(ctor) { for (const [n, d] of this._defs) if (d.ctor === ctor) return n; return null; }
  whenDefined(name) { name = String(name).toLowerCase(); const d = this._defs.get(name); if (d) return Promise.resolve(d.ctor); return new Promise(res => { const w = this._waiters.get(name) || []; w.push(res); this._waiters.set(name, w); }); }
  upgrade(root) { R.walk(root, n => { if (n.nodeType === 1 && !n._custom) { const d = this._defs.get(n.localName); if (d) R.upgradeCustom(n, d); } }); }
}
R.customElements = new CustomElementRegistryImpl();
R.upgradeCustom = (el, def) => {
  if (el._custom) return;
  el._custom = def;
  try { Object.setPrototypeOf(el, def.ctor.prototype); } catch (e) { /* ignore */ }
  // run the constructor body with `this` bound to the element (HTMLElement super() returns it)
  try { R._constructing = el; Reflect.construct(def.ctor, [], def.ctor); } catch (e) { R.reportError(e, 'custom element constructor <' + def.name + '>'); } finally { R._constructing = null; }
  for (const a of def.observedAttributes || []) if (a in el._attrs && def.attributeChangedCallback) { try { def.attributeChangedCallback.call(el, a, null, el._attrs[a]); } catch (e) { R.reportError(e, 'attributeChangedCallback'); } }
  if (el.isConnected && def.connectedCallback) { try { def.connectedCallback.call(el); } catch (e) { R.reportError(e, 'connectedCallback'); } }
};
R.classes.XMLHttpRequest = XMLHttpRequestImpl; R.classes.XMLHttpRequestUpload = XMLHttpRequestUploadImpl; R.classes.Headers = HeadersImpl; R.classes.Request = RequestImpl; R.classes.Response = ResponseImpl; R.classes.Blob = BlobImpl; R.classes.File = FileImpl; R.classes.FileReader = FileReaderImpl; R.classes.TextEncoder = TextEncoderImpl; R.classes.TextDecoder = TextDecoderImpl; R.classes.DOMException = DOMExceptionImpl; R.classes.AbortController = AbortControllerImpl; R.classes.AbortSignal = AbortSignalImpl; R.classes.Storage = StorageImpl; R.classes.MutationObserver = MutationObserverImpl; R.classes.IntersectionObserver = IntersectionObserverImpl; R.classes.ResizeObserver = ResizeObserverImpl; R.classes.PerformanceObserver = PerformanceObserverImpl; R.classes.DOMRect = DOMRectImpl; R.classes.DOMRectReadOnly = DOMRectImpl; R.classes.CSSStyleSheet = CSSStyleSheetImpl; R.classes.StyleSheet = CSSStyleSheetImpl; R.classes.MessageChannel = MessageChannelImpl; R.classes.WebSocket = WebSocketImpl; R.classes.EventSource = EventSourceImpl; R.classes.BroadcastChannel = BroadcastChannelImpl; R.classes.CustomElementRegistry = CustomElementRegistryImpl; R.classes.URL = URLImpl; R.classes.URLSearchParams = URLSearchParams; R.classes.FormData = FormDataImpl;
R.fetchImpl = fetchImpl; R.btoa = btoaImpl; R.atob = atobImpl; R.utf8Encode = utf8Encode; R.utf8Decode = utf8Decode;

// ------------------------------------------- Cookies (view of the ship's jar)
R.cookies = []; R.cookieSets = [];
R.cookieString = () => R.cookies.map(c => c.name + '=' + c.value).join('; ');
R.setCookie = raw => {
  R.cookieSets.push(raw);
  const first = raw.split(';')[0]; const eq = first.indexOf('=');
  const name = (eq < 0 ? '' : first.slice(0, eq)).trim(), value = (eq < 0 ? first : first.slice(eq + 1)).trim();
  if (!name && !value) return;
  const attrs = raw.split(';').slice(1).map(s => s.trim().toLowerCase());
  const expired = attrs.some(a => a === 'max-age=0' || a.startsWith('max-age=-') || (a.startsWith('expires=') && !isNaN(Date.parse(a.slice(8))) && Date.parse(a.slice(8)) < vnow()));
  R.cookies = R.cookies.filter(c => c.name !== name);
  if (!expired) R.cookies.push({ name, value });
};

// --------------------------------------------------------- on* handlers
const EVENT_NAMES = ['abort', 'animationend', 'animationiteration', 'animationstart', 'auxclick', 'beforeinput', 'beforeunload', 'blur', 'cancel', 'canplay', 'canplaythrough', 'change', 'click', 'close', 'contextmenu', 'copy', 'cuechange', 'cut', 'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop', 'durationchange', 'emptied', 'ended', 'error', 'focus', 'focusin', 'focusout', 'formdata', 'fullscreenchange', 'gotpointercapture', 'hashchange', 'input', 'invalid', 'keydown', 'keypress', 'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadend', 'loadstart', 'lostpointercapture', 'message', 'messageerror', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'mousewheel', 'offline', 'online', 'pagehide', 'pageshow', 'paste', 'pause', 'play', 'playing', 'pointercancel', 'pointerdown', 'pointerenter', 'pointerleave', 'pointermove', 'pointerout', 'pointerover', 'pointerup', 'popstate', 'progress', 'ratechange', 'readystatechange', 'rejectionhandled', 'reset', 'resize', 'scroll', 'scrollend', 'securitypolicyviolation', 'seeked', 'seeking', 'select', 'selectionchange', 'selectstart', 'slotchange', 'stalled', 'storage', 'submit', 'suspend', 'timeupdate', 'toggle', 'touchcancel', 'touchend', 'touchmove', 'touchstart', 'transitioncancel', 'transitionend', 'transitionrun', 'transitionstart', 'unhandledrejection', 'unload', 'volumechange', 'waiting', 'wheel', 'DOMContentLoaded', 'visibilitychange', 'orientationchange', 'languagechange', 'search', 'webkitTransitionEnd', 'webkitAnimationEnd'];
function installHandlerProps(target) {
  for (const n of EVENT_NAMES) {
    Object.defineProperty(target, 'on' + n.toLowerCase(), {
      get() { return (this._handlers && this._handlers[n]) || null; },
      set(fn) { if (!this._handlers) this._handlers = Object.create(null); if (typeof fn === 'function') this._handlers[n] = fn; else delete this._handlers[n]; },
      configurable: true, enumerable: false,
    });
  }
}
installHandlerProps(NodeImpl.prototype); installHandlerProps(XMLHttpRequestImpl.prototype); installHandlerProps(XMLHttpRequestUploadImpl.prototype); installHandlerProps(FileReaderImpl.prototype); installHandlerProps(WebSocketImpl.prototype); installHandlerProps(EventSourceImpl.prototype); installHandlerProps(AbortSignalImpl.prototype); installHandlerProps(BroadcastChannelImpl.prototype);
R.installHandlerProps = installHandlerProps;

// ==== 09-css.js
// ------------------------------------------------------------- CSS cascade
// A minimal cascade for the properties that decide whether content is shown
// (display, visibility) so that class-driven menus, modals and tabs are
// hidden or shown the way a real browser would. Author stylesheets come from
// <style> elements and <link rel=stylesheet> (fetched through the host).
R.cssRules = [];            // [{sel, spec:[a,b,c], order, prop, value, important}]
R.cssIndex = null;          // rightmost-compound key -> rules
R.cssGeneration = 0;        // bumps on DOM/stylesheet changes; invalidates caches
R.cssBytes = 0;
let cssOrder = 0;
function bumpCss() { R.cssGeneration++; R.cssIndex = null; }
function stripCssComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function specificity(parts) {
  let a = 0, b = 0, c = 0;
  for (const p of parts) {
    const cp = p.compound;
    if (cp.id !== null) a++;
    b += cp.classes.length + cp.attrs.length;
    for (const ps of cp.pseudos) { if (ps.name === 'not' || ps.name === 'is' || ps.name === 'has') { let best = [0, 0, 0]; for (const inner of ps.arg) { const s = specificity(inner); if (s[0] > best[0] || (s[0] === best[0] && (s[1] > best[1] || (s[1] === best[1] && s[2] > best[2])))) best = s; } a += best[0]; b += best[1]; c += best[2]; } else if (ps.name === 'where') { /* zero */ } else if (ps.name.startsWith('::')) c++; else b++; }
    if (cp.tag && cp.tag !== '*') c++;
  }
  return [a, b, c];
}
function ruleKey(parts) {
  const cp = parts[parts.length - 1].compound;
  if (cp.id !== null) return 'i:' + cp.id;
  if (cp.classes.length) return 'c:' + cp.classes[0];
  if (cp.tag && cp.tag !== '*') return 't:' + cp.tag;
  return '*';
}
function mediaMatches(q) {
  q = q.trim().toLowerCase();
  if (!q || q === 'all' || q === 'screen') return true;
  if (/^print\b/.test(q) || /^speech\b/.test(q)) return false;
  return q.split(',').some(part => {
    part = part.trim();
    let negate = false;
    if (part.startsWith('not ')) { negate = true; part = part.slice(4); }
    if (part.startsWith('only ')) part = part.slice(5);
    const clauses = part.split(/\s+and\s+/);
    let ok = true;
    for (let c of clauses) {
      c = c.trim();
      if (c === 'all' || c === 'screen') continue;
      if (c === 'print' || c === 'speech') { ok = false; break; }
      const m = /^\(\s*(min|max)-width\s*:\s*([\d.]+)(px|em|rem)\s*\)$/.exec(c);
      if (m) { const px = +m[2] * (m[3] === 'px' ? 1 : 16); ok = m[1] === 'min' ? R.device.width >= px : R.device.width <= px; if (!ok) break; continue; }
      const h = /^\(\s*(min|max)-height\s*:\s*([\d.]+)(px|em|rem)\s*\)$/.exec(c);
      if (h) { const px = +h[2] * (h[3] === 'px' ? 1 : 16); ok = h[1] === 'min' ? R.device.height >= px : R.device.height <= px; if (!ok) break; continue; }
      const r = /^\(\s*width\s*([<>]=?)\s*([\d.]+)(px|em|rem)\s*\)$/.exec(c) || /^\(\s*([\d.]+)(px|em|rem)\s*([<>]=?)\s*width\s*\)$/.exec(c);
      if (r) { continue; }
      if (/prefers-color-scheme\s*:\s*light/.test(c)) continue;
      if (/prefers-color-scheme\s*:\s*dark/.test(c)) { ok = false; break; }
      if (/prefers-reduced-motion\s*:\s*reduce/.test(c)) { ok = false; break; }
      if (/\(\s*hover\s*:\s*hover\s*\)|pointer\s*:\s*fine/.test(c)) { ok = !R.device.mobile; if (!ok) break; continue; }
      if (/\(\s*hover\s*:\s*none\s*\)|pointer\s*:\s*coarse/.test(c)) { ok = !!R.device.mobile; if (!ok) break; continue; }
      if (/orientation\s*:\s*portrait/.test(c)) { ok = R.device.height > R.device.width; if (!ok) break; continue; }
      if (/orientation\s*:\s*landscape/.test(c)) { ok = R.device.width >= R.device.height; if (!ok) break; continue; }
      // unknown feature: assume it does not match
      ok = false; break;
    }
    return negate ? !ok : ok;
  });
}
R.mediaMatches = mediaMatches;
// parse a stylesheet, keeping only display/visibility declarations
function addStylesheet(text, baseUrl, depth) {
  depth = depth || 0;
  if (!text) return;
  text = stripCssComments(String(text));
  let i = 0; const n = text.length;
  const skipBlock = () => { let d = 0; while (i < n) { const ch = text[i++]; if (ch === '{') d++; else if (ch === '}') { d--; if (d <= 0) return; } } };
  const readBlock = () => { i++; const start = i; let d = 1; while (i < n) { const ch = text[i++]; if (ch === '{') d++; else if (ch === '}') { d--; if (d === 0) return text.slice(start, i - 1); } } return text.slice(start); };
  while (i < n) {
    while (i < n && /[\s;]/.test(text[i])) i++;
    if (i >= n) break;
    if (text[i] === '@') {
      const m = /^@([\w-]+)\s*([^{;]*)/.exec(text.slice(i, i + 4096));
      if (!m) { i++; continue; }
      const name = m[1].toLowerCase(); const prelude = m[2].trim();
      i += m[0].length;
      if (text[i] === ';') { i++; if (name === 'import' && depth < 2) { const u = /^(?:url\()?['"]?([^'")]+)['"]?\)?\s*(.*)$/.exec(prelude); if (u && (!u[2] || mediaMatches(u[2]))) loadExternalCss(u[1], baseUrl, depth + 1); } continue; }
      if (text[i] !== '{') { i++; continue; }
      if (name === 'media' || name === 'supports' || name === 'layer' || name === 'container') {
        if (name === 'media' && !mediaMatches(prelude)) { skipBlock(); continue; }
        if (name === 'supports' && /not\s*\(/.test(prelude)) { skipBlock(); continue; }
        if (name === 'container') { skipBlock(); continue; }
        i++; // enter the block and parse rules inside; the closing brace is consumed as an empty statement
        const start = i; let d = 1; while (i < n && d) { if (text[i] === '{') d++; else if (text[i] === '}') d--; i++; }
        addStylesheet(text.slice(start, i - 1), baseUrl, depth);
        continue;
      }
      skipBlock(); continue;
    }
    const braceAt = text.indexOf('{', i);
    if (braceAt < 0) break;
    const selText = text.slice(i, braceAt).trim();
    i = braceAt;
    const body = readBlock();
    if (!selText || selText.indexOf('}') >= 0) continue;
    const decls = [];
    for (const part of body.split(';')) {
      const k = part.indexOf(':'); if (k < 0) continue;
      const prop = part.slice(0, k).trim().toLowerCase();
      if (prop !== 'display' && prop !== 'visibility' && prop !== 'content') continue;
      let value = part.slice(k + 1).trim(); let important = false;
      if (/!\s*important$/i.test(value)) { important = true; value = value.replace(/!\s*important$/i, '').trim(); }
      decls.push({ prop, value: value.toLowerCase(), important });
    }
    if (!decls.length) continue;
    let list;
    try { list = parseSelectorList(selText); } catch (e) { continue; }
    for (const parts of list) {
      const spec = specificity(parts); const key = ruleKey(parts);
      for (const d of decls) R.cssRules.push({ parts, spec, order: cssOrder++, key, prop: d.prop, value: d.value, important: d.important });
    }
  }
  bumpCss();
}
function loadExternalCss(href, baseUrl, depth) {
  const url = R.resolveURL(href, baseUrl || R.base()); if (!url) return;
  if (R.cssBytes >= R.opts.maxCssBytes) return;
  if (R.cssLoaded.has(url)) return; R.cssLoaded.add(url);
  let r; try { r = R.hostFetch(url, 'GET', { accept: 'text/css,*/*;q=0.1' }, '', 'stylesheet'); } catch (e) { return; }
  if (r.status >= 400 || !r.body) return;
  R.cssBytes += r.body.length;
  addStylesheet(r.body, url, depth || 0);
}
R.cssLoaded = new Set();
R.addStylesheet = addStylesheet; R.loadExternalCss = loadExternalCss;
R.loadStyleElement = el => {
  if (el.localName === 'style') { if (el._attrs.media && !mediaMatches(el._attrs.media)) return; addStylesheet(el.textContent, R.base(), 0); }
  else if (el.localName === 'link' && /\bstylesheet\b/i.test(el._attrs.rel || '') && el._attrs.href !== undefined && !('disabled' in el._attrs)) { if (el._attrs.media && !mediaMatches(el._attrs.media)) return; loadExternalCss(el._attrs.href, R.base(), 0); }
};
// cascade order: !important, then specificity, then source order
function beats(a, b) { if (a.important !== b.important) return a.important; if (a.spec[0] !== b.spec[0]) return a.spec[0] > b.spec[0]; if (a.spec[1] !== b.spec[1]) return a.spec[1] > b.spec[1]; if (a.spec[2] !== b.spec[2]) return a.spec[2] > b.spec[2]; return a.order > b.order; }
function buildIndex() {
  const idx = new Map();
  for (const r of R.cssRules) { let l = idx.get(r.key); if (!l) { l = []; idx.set(r.key, l); } l.push(r); }
  R.cssIndex = idx;
}
// author value of a property for an element (inline style wins unless !important)
function cssValue(el, prop) {
  if (!el._cssCache || el._cssGen !== R.cssGeneration) { el._cssCache = Object.create(null); el._cssGen = R.cssGeneration; }
  if (prop in el._cssCache) return el._cssCache[prop];
  let winner = null;
  if (R.cssRules.length) {
    if (!R.cssIndex) buildIndex();
    const keys = ['*']; if (el._attrs.id) keys.push('i:' + el._attrs.id); const cls = el._attrs.class; if (cls) for (const c of cls.split(/\s+/)) if (c) keys.push('c:' + c); keys.push('t:' + el.localName);
    for (const k of keys) { const rules = R.cssIndex.get(k); if (!rules) continue; for (const r of rules) { if (r.prop !== prop) continue; if (winner && !beats(r, winner)) continue; if (matchComplex(el, r.parts, null)) winner = r; } }
  }
  let value = winner ? winner.value : null;
  const inline = el._attrs.style;
  if (inline) { const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i'); const m = re.exec(inline); if (m) { const imp = /!\s*important/i.test(m[1]); const v = m[1].replace(/!\s*important/i, '').trim().toLowerCase(); if (imp || !winner || !winner.important) value = v; } }
  el._cssCache[prop] = value;
  return value;
}
R.cssValue = cssValue;
R.cssHidden = el => {
  const d = cssValue(el, 'display');
  if (d === 'none') return true;
  if (d === null && 'hidden' in el._attrs) return true;   // UA rule for [hidden]
  const v = cssValue(el, 'visibility');
  if (v === 'hidden' || v === 'collapse') return true;
  return false;
};

// ==== 10-modules.js
// ------------------------------------------------------------ ES modules
// A pragmatic module loader: static imports/exports are rewritten to a
// registry, dependencies are fetched synchronously through the host and
// evaluated depth-first, import maps resolve bare specifiers, and dynamic
// import() returns a promise. Bindings are copied (not live), which is what
// almost every bundle needs.
R.modules = new Map();      // url -> {status, exports, promise}
R.importMap = { imports: {}, scopes: {} };
let inlineModuleCount = 0;
function setImportMap(json) {
  try { const m = JSON.parse(json); if (m && typeof m === 'object') { Object.assign(R.importMap.imports, m.imports || {}); Object.assign(R.importMap.scopes, m.scopes || {}); } } catch (e) { R.pushLog('warn', ['invalid importmap: ' + e.message]); }
}
R.setImportMap = setImportMap;
function resolveSpecifier(spec, baseUrl) {
  if (/^(\.\.?\/|\/|https?:|data:|blob:)/.test(spec)) return R.resolveURL(spec, baseUrl);
  const im = R.importMap.imports;
  if (im[spec]) return R.resolveURL(im[spec], R.base());
  for (const prefix of Object.keys(im).filter(k => k.endsWith('/')).sort((a, b) => b.length - a.length)) if (spec.startsWith(prefix)) return R.resolveURL(im[prefix] + spec.slice(prefix.length), R.base());
  return null;
}
const IMPORT_RE = /\bimport\s*(?:(\*\s*as\s+[\w$]+|[\w$]+\s*,\s*\*\s*as\s+[\w$]+|[\w$]+\s*,\s*\{[^}]*\}|[\w$]+|\{[^}]*\})\s*from\s*)?(['"])([^'"\n]+)\2\s*;?/g;
const EXPORT_FROM_RE = /\bexport\s*(\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\2\s*;?/g;
const EXPORT_LIST_RE = /\bexport\s*\{([^}]*)\}\s*;?/g;
const EXPORT_DECL_RE = /\bexport\s+(default\s+)?(?:(async\s+function\s*\*?|function\s*\*?|class)\s*([\w$]*)|(const|let|var)\s+([\w$]+))/g;
function parseBindings(clause) {
  // returns [{local, imported}] ; imported 'default' or '*' or name
  const out = [];
  clause = clause.trim();
  if (!clause) return out;
  const star = /^\*\s*as\s+([\w$]+)$/.exec(clause);
  if (star) { out.push({ local: star[1], imported: '*' }); return out; }
  let rest = clause;
  const def = /^([\w$]+)\s*(?:,\s*)?/.exec(rest);
  if (def && !rest.startsWith('{')) { out.push({ local: def[1], imported: 'default' }); rest = rest.slice(def[0].length); }
  const star2 = /^\*\s*as\s+([\w$]+)/.exec(rest);
  if (star2) { out.push({ local: star2[1], imported: '*' }); return out; }
  const br = /^\{([^}]*)\}/.exec(rest);
  if (br) for (const part of br[1].split(',')) { const p = part.trim(); if (!p) continue; const m = /^([\w$]+|default|"[^"]*"|'[^']*')\s*(?:as\s+([\w$]+))?$/.exec(p); if (m) out.push({ local: m[2] || m[1], imported: m[1].replace(/^['"]|['"]$/g, '') }); }
  return out;
}
function transformModule(src) {
  const deps = []; // {spec, bindings:[{local, imported}], star:false}
  const tail = [];
  const dep = spec => { let i = deps.findIndex(d => d.spec === spec); if (i < 0) { deps.push({ spec, bindings: [] }); i = deps.length - 1; } return i; };
  let code = src;
  code = code.replace(EXPORT_FROM_RE, (m, clause, q, spec) => {
    const i = dep(spec); clause = clause.trim();
    if (clause === '*') return `Object.keys(__mod(${i})).forEach(function(k){ if (k !== 'default' && !(k in __exports)) Object.defineProperty(__exports, k, { get: function(){ return __mod(${i})[k]; }, enumerable: true, configurable: true }); });`;
    const sa = /^\*\s*as\s+([\w$]+)$/.exec(clause);
    if (sa) return `__exports[${JSON.stringify(sa[1])}] = __mod(${i});`;
    const parts = parseBindings(clause).map(b => `__exports[${JSON.stringify(b.local)}] = __mod(${i})[${JSON.stringify(b.imported)}];`);
    return parts.join(' ');
  });
  code = code.replace(IMPORT_RE, (m, clause, q, spec) => {
    const i = dep(spec);
    if (!clause) return `__mod(${i});`;
    const bs = parseBindings(clause);
    return bs.map(b => b.imported === '*' ? `const ${b.local} = __mod(${i});` : `const ${b.local} = __mod(${i})[${JSON.stringify(b.imported)}];`).join(' ');
  });
  code = code.replace(EXPORT_LIST_RE, (m, list) => {
    for (const part of list.split(',')) { const p = part.trim(); if (!p) continue; const mm = /^([\w$]+)\s*(?:as\s+([\w$]+|default|"[^"]*"|'[^']*'))?$/.exec(p); if (mm) tail.push(`__exports[${JSON.stringify((mm[2] || mm[1]).replace(/^['"]|['"]$/g, ''))}] = ${mm[1]};`); }
    return '';
  });
  let anon = 0;
  code = code.replace(EXPORT_DECL_RE, (m, isDefault, fkind, fname, vkind, vname) => {
    const kind = fkind || vkind; let name = fkind ? fname : vname;
    if (isDefault) { if (!name) name = '__default' + (anon++ || ''); tail.push(`__exports.default = ${name};`); return `${kind} ${name}`; }
    tail.push(`__exports[${JSON.stringify(name)}] = ${name};`);
    return `${kind} ${name}`;
  });
  code = code.replace(/\bexport\s+default\s+/g, '__exports.default = ');
  code = code.replace(/\bimport\.meta\b/g, '__meta');
  code = code.replace(/\bimport\s*\(/g, '__importDyn(');
  return { code: code + '\n' + tail.join('\n'), deps };
}
function loadModule(url, source, referrer) {
  let rec = R.modules.get(url);
  if (rec) return rec;
  rec = { status: 'loading', exports: Object.create(null), url };
  R.modules.set(url, rec);
  if (source === undefined) {
    let r; try { r = R.hostFetch(url, 'GET', { accept: '*/*' }, '', 'script'); } catch (e) { rec.status = 'failed'; rec.error = e; R.pushLog('warn', ['module fetch failed: ' + url + ' ' + e.message]); return rec; }
    if (r.status >= 400 || !r.body) { rec.status = 'failed'; rec.error = new Error('HTTP ' + r.status); R.pushLog('warn', ['module ' + url + ' -> HTTP ' + r.status]); return rec; }
    source = r.body; R.scriptBytes += source.length;
  }
  let t; try { t = transformModule(source); } catch (e) { rec.status = 'failed'; rec.error = e; return rec; }
  const depRecs = t.deps.map(d => { const u = resolveSpecifier(d.spec, url); if (!u) { R.pushLog('warn', ['cannot resolve module specifier ' + JSON.stringify(d.spec) + ' from ' + url]); return { status: 'failed', exports: {} }; } return loadModule(u, undefined, url); });
  const mod = i => depRecs[i] ? depRecs[i].exports : {};
  const meta = { url, resolve: s => resolveSpecifier(s, url) };
  const wrapped = '(function(__exports, __mod, __meta, __importDyn){"use strict";\n' + t.code + '\n})';
  let fn;
  try { fn = (0, eval)(wrapped); }
  catch (e) {
    // top-level await: retry as an async body
    try { fn = (0, eval)('(async function(__exports, __mod, __meta, __importDyn){"use strict";\n' + t.code + '\n})'); }
    catch (e2) { rec.status = 'failed'; rec.error = e; R.scriptsFailed++; R.reportError(e, 'module ' + url); return rec; }
  }
  try { const out = fn(rec.exports, mod, meta, R.importDynamic); if (out && typeof out.then === 'function') out.catch(e => R.reportError(e, 'module ' + url)); rec.status = 'ready'; }
  catch (e) { rec.status = 'failed'; rec.error = e; R.scriptsFailed++; R.reportError(e, 'module ' + url); }
  R.scriptsRun++;
  return rec;
}
R.loadModule = loadModule; R.transformModule = transformModule;
R.importDynamic = (spec, referrer) => new Promise((resolve, reject) => {
  const base = typeof referrer === 'string' ? referrer : R.base();
  const url = resolveSpecifier(String(spec), base);
  if (!url) { reject(new TypeError('Failed to resolve module specifier ' + JSON.stringify(spec))); return; }
  const rec = loadModule(url, undefined, base);
  if (rec.status === 'failed') reject(rec.error || new Error('module failed')); else resolve(rec.exports);
});
R.runModuleScript = el => {
  if (el._attrs.src !== undefined) {
    const url = R.resolveURL(el._attrs.src, R.base()); if (!url) return;
    if (R.scriptBytes >= R.opts.maxScriptBytes) { R.pushLog('warn', ['script byte budget exhausted; skipped ' + url]); return; }
    const rec = loadModule(url, undefined, R.base());
    R.fire(el, rec.status === 'failed' ? 'error' : 'load', { bubbles: false, cancelable: false });
    return;
  }
  const url = R.base().split('#')[0] + '#inline-module-' + (++inlineModuleCount);
  loadModule(url, el.textContent, R.base());
};

// ==== 12-api.js
// ----------------------------------------------------------- Snapshot
// Renders the live DOM as an accessibility-flavoured outline. Interactive
// elements get short refs (e1, e2, ...) that actions refer back to.
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr', 'big', 'nobr', 'strike', 'acronym', 'output', 'meter', 'progress']);
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head', 'meta', 'link', 'title', 'base', 'map', 'param', 'source', 'track', 'datalist', 'colgroup', 'col', 'object', 'embed', 'math']);
const LANDMARKS = { nav: 'nav', main: 'main', header: 'header', footer: 'footer', aside: 'aside', form: 'form', dialog: 'dialog', details: 'details', fieldset: 'fieldset', article: 'article', section: 'section', search: 'search' };
const ROLE_MAP = { button: 'button', link: 'link', checkbox: 'checkbox', radio: 'radio', textbox: 'textbox', searchbox: 'textbox', combobox: 'combobox', listbox: 'combobox', menuitem: 'button', menuitemcheckbox: 'checkbox', menuitemradio: 'radio', tab: 'button', switch: 'checkbox', option: 'option', slider: 'slider', spinbutton: 'textbox', heading: 'heading', img: 'img', navigation: 'nav', main: 'main', banner: 'header', contentinfo: 'footer', complementary: 'aside', form: 'form', dialog: 'dialog', alertdialog: 'dialog', search: 'search', region: 'section', list: 'list', listitem: 'listitem', table: 'table', grid: 'table', row: 'row', cell: 'cell', gridcell: 'cell', columnheader: 'cell', rowheader: 'cell', presentation: 'none', none: 'none', tree: 'list', treeitem: 'listitem', menu: 'list', menubar: 'list', tablist: 'list', separator: 'separator', alert: 'alert', status: 'status', progressbar: 'progress' };
const ALIGN = { maxText: 400, maxLines: 6000, maxOptions: 25, maxHref: 160, maxDepth: 14 };
function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function q(s) { return JSON.stringify(clip(collapse(s), ALIGN.maxText)); }
function accessibleName(el) {
  const a = el._attrs;
  if (a['aria-label'] && collapse(a['aria-label'])) return collapse(a['aria-label']);
  if (a['aria-labelledby']) { const parts = a['aria-labelledby'].split(/\s+/).map(id => { const e = el.ownerDocument.getElementById(id); return e ? collapse(e.textContent) : ''; }).filter(Boolean); if (parts.length) return parts.join(' '); }
  if (R.isLabelable(el)) { const labels = el.labels; if (labels && labels.length) { const t = labels.map(l => collapse(labelText(l, el))).filter(Boolean).join(' '); if (t) return t; } }
  if (el.localName === 'img' || el.localName === 'area') return collapse(a.alt || a.title || '');
  if (el.localName === 'input' && (el.type === 'submit' || el.type === 'reset' || el.type === 'button')) return collapse(a.value || (el.type === 'submit' ? 'Submit' : el.type === 'reset' ? 'Reset' : ''));
  if (el.localName === 'input' && el.type === 'image') return collapse(a.alt || a.value || 'Submit');
  if (el.localName === 'svg') { const t = el.children.find(c => c.localName === 'title'); if (t) return collapse(t.textContent); return collapse(a.title || ''); }
  if (el.localName === 'a' || el.localName === 'button' || el.localName === 'summary' || a.role) { const t = collapse(textWithAlts(el)); if (t) return t; }
  if (a.placeholder) return collapse(a.placeholder);
  if (a.title) return collapse(a.title);
  return '';
}
function labelText(label, control) { let s = ''; const rec = n => { for (const c of n.childNodes) { if (c === control) continue; if (c.nodeType === 3) s += c.data; else if (c.nodeType === 1 && !SKIP_TAGS.has(c.localName)) { if (c.localName === 'select' || c.localName === 'input' || c.localName === 'textarea') continue; rec(c); } } }; rec(label); return s; }
function textWithAlts(el) { let s = ''; const rec = n => { for (const c of n.childNodes) { if (c.nodeType === 3) s += c.data; else if (c.nodeType === 1) { if (SKIP_TAGS.has(c.localName) || !R.isVisible(c)) continue; if (c.localName === 'img' || c.localName === 'svg') { s += ' ' + accessibleName(c) + ' '; continue; } if (c._attrs['aria-label']) { s += ' ' + c._attrs['aria-label'] + ' '; continue; } if (c.localName === 'br') s += ' '; rec(c); if (BLOCK_TAGS.has(c.localName)) s += ' '; } } }; rec(el); return s; }
function roleOf(el) {
  const ln = el.localName; const a = el._attrs;
  if (a.role) { const r = ROLE_MAP[a.role.trim().split(/\s+/)[0].toLowerCase()]; if (r) return r; }
  if (ln === 'a' || ln === 'area') return 'href' in a ? 'link' : 'inline';
  if (ln === 'button' || ln === 'summary') return 'button';
  if (ln === 'input') { const t = el.type; if (t === 'hidden') return 'skip'; if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button'; if (t === 'checkbox') return 'checkbox'; if (t === 'radio') return 'radio'; if (t === 'file') return 'file'; if (t === 'range') return 'slider'; return 'textbox'; }
  if (ln === 'textarea') return 'textbox';
  if (ln === 'select') return 'combobox';
  if (ln === 'option') return 'option';
  if (ln === 'img' || ln === 'svg' || ln === 'picture' || ln === 'canvas') return 'img';
  if (/^h[1-6]$/.test(ln)) return 'heading';
  if (ln === 'ul' || ln === 'ol' || ln === 'menu' || ln === 'dl') return 'list';
  if (ln === 'li' || ln === 'dt' || ln === 'dd') return 'listitem';
  if (ln === 'table') return 'table';
  if (ln === 'tr') return 'row';
  if (ln === 'td' || ln === 'th') return 'cell';
  if (ln === 'iframe') return 'iframe';
  if (ln === 'video' || ln === 'audio') return 'media';
  if (ln === 'hr') return 'separator';
  if (ln === 'pre') return 'pre';
  if (ln === 'blockquote') return 'quote';
  if (LANDMARKS[ln]) return LANDMARKS[ln];
  if (el.isContentEditable && !el.parentElement.isContentEditable) return 'textbox';
  if (INLINE_TAGS.has(ln)) return 'inline';
  return 'block';
}
function isInteractiveRole(r) { return r === 'link' || r === 'button' || r === 'textbox' || r === 'checkbox' || r === 'radio' || r === 'combobox' || r === 'file' || r === 'slider' || r === 'option'; }

class Snapshot {
  constructor(opts) { this.opts = opts || {}; this.lines = []; this.refs = [null]; this.refMap = new Map(); this.truncated = false; this.interactive = 0; }
  ref(el) { let id = this.refMap.get(el); if (!id) { id = this.refs.length; this.refs.push(el); this.refMap.set(el, id); } return 'e' + id; }
  push(depth, text) { if (this.lines.length >= ALIGN.maxLines) { this.truncated = true; return; } this.lines.push('  '.repeat(Math.min(depth, ALIGN.maxDepth)) + text); }
  render(root) { const ctx = { depth: 0, buf: '' }; this.renderChildren(root, ctx); this.flush(ctx); if (this.truncated) this.lines.push('… snapshot truncated'); return this; }
  flush(ctx) { const t = collapse(ctx.buf); ctx.buf = ''; if (t) this.push(ctx.depth, (ctx.prefix ? ctx.prefix : 'text ') + q(t)); ctx.prefix = ''; }
  renderChildren(node, ctx) { const cn = node.childNodes; for (let i = 0; i < cn.length; i++) this.renderNode(cn[i], ctx); if (node.shadowRoot) this.renderChildren(node.shadowRoot, ctx); }
  renderNode(n, ctx) {
    if (n.nodeType === 3) { ctx.buf += n.data; return; }
    if (n.nodeType !== 1) return;
    const ln = n.localName;
    if (SKIP_TAGS.has(ln) || !R.isVisible(n) || n._attrs['aria-hidden'] === 'true') return;
    if (ln === 'br') { ctx.buf += ' '; return; }
    if (ln === 'slot') { this.renderChildren(n, ctx); return; }
    const role = roleOf(n);
    if (role === 'skip') return;
    if (role === 'inline' || role === 'none') { if (role === 'none' && BLOCK_TAGS.has(ln)) { this.flush(ctx); this.renderChildren(n, ctx); this.flush(ctx); } else this.renderChildren(n, ctx); return; }
    if (role === 'img') { const name = accessibleName(n); if (name) this.line(ctx, 'img ' + q(name)); return; }
    if (isInteractiveRole(role)) { this.interactive++; this.line(ctx, this.describe(n, role)); return; }
    if (role === 'heading') { this.flush(ctx); const lvl = n._attrs['aria-level'] || (ln[0] === 'h' ? ln[1] : '2'); this.renderInlineInteractive(n, { depth: ctx.depth, buf: '' }, 'heading[' + lvl + '] '); return; }
    if (role === 'listitem') { this.flush(ctx); const start = this.lines.length; const inner = { depth: ctx.depth + 1, buf: '' }; this.renderChildren(n, inner); this.flush(inner); if (this.lines.length === start) this.push(ctx.depth, '- ""'); else { this.lines[start] = '  '.repeat(Math.min(ctx.depth, ALIGN.maxDepth)) + '- ' + this.lines[start].replace(/^ */, ''); } return; }
    if (role === 'list') { this.flush(ctx); const items = n.children.filter(c => c.localName === 'li' || c.localName === 'dt' || c.localName === 'dd' || (c._attrs.role || '').match(/item/)).length; const name = accessibleName(n); this.push(ctx.depth, 'list' + (name ? ' ' + q(name) : '') + (items ? ' (' + items + ' items)' : '') + ':'); const inner = { depth: ctx.depth + 1, buf: '' }; this.renderChildren(n, inner); this.flush(inner); return; }
    if (role === 'table') { this.flush(ctx); this.renderTable(n, ctx); return; }
    if (role === 'row') { this.flush(ctx); this.renderRow(n, ctx); return; }
    if (role === 'cell') { this.flush(ctx); this.renderChildren(n, ctx); this.flush(ctx); return; }
    if (role === 'separator') { this.flush(ctx); this.push(ctx.depth, '---'); return; }
    if (role === 'pre') { this.flush(ctx); const t = n.textContent.replace(/\s+$/, ''); if (t.trim()) this.push(ctx.depth, 'code ' + JSON.stringify(clip(t, 1200))); return; }
    if (role === 'quote') { this.flush(ctx); const inner = { depth: ctx.depth + 1, buf: '' }; this.push(ctx.depth, 'quote:'); this.renderChildren(n, inner); this.flush(inner); return; }
    if (role === 'iframe') { this.flush(ctx); this.push(ctx.depth, 'iframe ' + q(n._attrs.title || n._attrs.name || '') + (n._attrs.src ? ' -> ' + clip(n._attrs.src, ALIGN.maxHref) : '')); return; }
    if (role === 'media') { this.flush(ctx); this.push(ctx.depth, ln + (n._attrs.src ? ' -> ' + clip(n._attrs.src, ALIGN.maxHref) : '')); return; }
    if (role === 'alert' || role === 'status') { this.flush(ctx); const t = collapse(textWithAlts(n)); if (t) this.push(ctx.depth, role + ' ' + q(t)); return; }
    if (LANDMARKS[role]) {
      // generic sections/articles without a name are flattened to keep depth low
      const name = accessibleName(n) || (role === 'details' ? collapse((n.children.find(c => c.localName === 'summary') || { textContent: '' }).textContent) : '') || (role === 'fieldset' ? collapse((n.children.find(c => c.localName === 'legend') || { textContent: '' }).textContent) : '') || (role === 'form' ? (n._attrs.name || n._attrs.id || '') : '');
      if ((role === 'section' || role === 'article') && !name) { this.flush(ctx); this.renderChildren(n, ctx); this.flush(ctx); return; }
      this.flush(ctx);
      let head = role + (name ? ' ' + q(name) : '');
      if (role === 'details') { head = 'details ' + this.ref(n.children.find(c => c.localName === 'summary') || n) + (name ? ' ' + q(name) : '') + (n.open ? ' (open)' : ' (closed)'); this.interactive++; }
      this.push(ctx.depth, head + ':');
      const inner = { depth: ctx.depth + 1, buf: '' };
      for (const c of n.childNodes) { if (role === 'details' && c.nodeType === 1 && c.localName === 'summary') continue; if (role === 'fieldset' && c.nodeType === 1 && c.localName === 'legend') continue; this.renderNode(c, inner); }
      if (n.shadowRoot) this.renderChildren(n.shadowRoot, inner);
      this.flush(inner); return;
    }
    // generic block
    this.flush(ctx); this.renderChildren(n, ctx); this.flush(ctx);
  }
  renderInlineInteractive(n, ctx, prefix) { ctx.prefix = prefix; this.renderChildren(n, ctx); this.flush(ctx); }
  line(ctx, text) { const t = collapse(ctx.buf); ctx.buf = ''; if (t) this.push(ctx.depth, (ctx.prefix || 'text ') + q(t)); ctx.prefix = ''; this.push(ctx.depth, text); }
  describe(el, role) {
    const a = el._attrs; const ref = this.ref(el); const name = accessibleName(el);
    let s = role + ' ' + ref;
    if (name) s += ' ' + q(name);
    if (role === 'link') { const h = el.href || a.href || ''; if (h && !/^javascript:/i.test(h)) s += ' -> ' + clip(h, ALIGN.maxHref); else if (/^javascript:/i.test(h)) s += ' (js)'; if (a.target === '_blank') s += ' (new tab)'; }
    if (role === 'textbox') { if (a.name) s += ' name=' + a.name; const t = el.localName === 'input' ? el.type : (el.localName === 'textarea' ? 'textarea' : 'editable'); if (t !== 'text' && t !== 'textarea') s += ' type=' + t; let v = el.localName === 'input' || el.localName === 'textarea' ? el.value : collapse(el.textContent); if (v && el.localName === 'input' && el.type === 'password') v = '••••••'; if (v) s += ' value=' + q(v); if ('required' in a) s += ' required'; if ('readonly' in a) s += ' readonly'; }
    if (role === 'checkbox' || role === 'radio') { const checked = el.localName === 'input' ? el.checked : a['aria-checked'] === 'true'; s += checked ? ' [x]' : ' [ ]'; if (a.name) s += ' name=' + a.name; if (el.localName === 'input' && a.value !== undefined && role === 'radio') s += ' value=' + q(a.value); }
    if (role === 'combobox' && el.localName === 'select') { if (a.name) s += ' name=' + a.name; if (el.multiple) s += ' multiple'; const opts = el.options; const sel = opts.filter(o => o.selected).map(o => o.value); s += ' value=' + q(sel.join(',')); const list = opts.slice(0, ALIGN.maxOptions).map(o => { const v = o.value, t = o.text; return v === t ? q(t) : q(v) + '=' + q(t); }); s += ' options[' + list.join(', ') + (opts.length > ALIGN.maxOptions ? ', +' + (opts.length - ALIGN.maxOptions) + ' more' : '') + ']'; }
    if (role === 'combobox' && el.localName !== 'select') { const v = el.value || collapse(el.textContent); if (v) s += ' value=' + q(v); if (a['aria-expanded']) s += ' expanded=' + a['aria-expanded']; }
    if (role === 'option') { if (el.selected || a['aria-selected'] === 'true') s += ' (selected)'; }
    if (role === 'file') { if (a.name) s += ' name=' + a.name; if (a.accept) s += ' accept=' + q(a.accept); }
    if (role === 'slider') { s += ' value=' + q(el.value || a['aria-valuenow'] || ''); }
    if (role === 'button') { const t = el.localName === 'input' || el.localName === 'button' ? el.type : ''; if (t === 'submit') s += ' (submit)'; if (a['aria-expanded']) s += ' expanded=' + a['aria-expanded']; if (a['aria-pressed']) s += ' pressed=' + a['aria-pressed']; if (a['aria-haspopup']) s += ' haspopup'; }
    if (R.isDisabled(el) || a['aria-disabled'] === 'true') s += ' (disabled)';
    if (el.ownerDocument.activeElement === el) s += ' (focused)';
    return s;
  }
  renderTable(t, ctx) {
    const cap = t.children.find(c => c.localName === 'caption'); const name = accessibleName(t) || (cap ? collapse(cap.textContent) : '');
    const rows = R.tableRows(t);
    this.push(ctx.depth, 'table' + (name ? ' ' + q(name) : '') + ' (' + rows.length + ' rows):');
    const inner = { depth: ctx.depth + 1, buf: '' };
    for (const r of rows) this.renderRow(r, inner);
    for (const c of t.childNodes) if (c.nodeType === 1 && c.localName !== 'tr' && c.localName !== 'thead' && c.localName !== 'tbody' && c.localName !== 'tfoot' && c.localName !== 'caption' && c.localName !== 'colgroup') this.renderNode(c, inner);
    this.flush(inner);
  }
  renderRow(r, ctx) {
    const cells = r.children.filter(c => c.localName === 'td' || c.localName === 'th' || (c._attrs.role || '').match(/cell|header/));
    const parts = []; const extra = [];
    for (const c of cells) {
      const sub = new Snapshot(this.opts); sub.refs = this.refs; sub.refMap = this.refMap;
      const cctx = { depth: 0, buf: '' }; sub.renderChildren(c, cctx); sub.flush(cctx);
      this.interactive += sub.interactive;
      const ls = sub.lines.map(l => l.trim());
      let cell = ls.map(l => l.startsWith('text ') ? JSON.parse(l.slice(5)) : '[' + l + ']').join(' ');
      if (c.localName === 'th') cell = cell ? '*' + cell + '*' : '';
      parts.push(clip(cell, 200));
    }
    this.push(ctx.depth, '| ' + parts.join(' | ') + ' |');
  }
}

// ------------------------------------------------------- Readable text
function readableText(root, opts) {
  opts = opts || {};
  const parts = []; let listDepth = 0;
  const endsNl = () => { let k = 0; for (let i = parts.length - 1; i >= 0 && k < 2; i--) { const p = parts[i]; for (let j = p.length - 1; j >= 0 && k < 2; j--) { if (p[j] === '\n') k++; else return k; } } return k; };
  const nl = n => { if (parts.length && endsNl() === 0) parts.push('\n'); if (n > 1 && endsNl() < 2) parts.push('\n'); };
  const push = s => { if (s) parts.push(s); };
  const rec = (node) => {
    const cn = node.childNodes;
    for (let i = 0; i < cn.length; i++) {
      const c = cn[i];
      if (c.nodeType === 3) { push(node.localName === 'pre' ? c.data : c.data.replace(/[\s ]+/g, ' ')); continue; }
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (SKIP_TAGS.has(ln) || ln === 'svg' || !R.isVisible(c) || c._attrs['aria-hidden'] === 'true') continue;
      if (ln === 'br') { push('\n'); continue; }
      if (ln === 'img') { const alt = collapse(c._attrs.alt || ''); if (alt) push('![' + alt + ']'); continue; }
      if (/^h[1-6]$/.test(ln)) { nl(2); push('#'.repeat(+ln[1]) + ' '); rec(c); nl(2); continue; }
      if (ln === 'p' || ln === 'div' || ln === 'section' || ln === 'article' || ln === 'main' || ln === 'header' || ln === 'footer' || ln === 'nav' || ln === 'aside' || ln === 'form' || ln === 'fieldset' || ln === 'figure' || ln === 'figcaption' || ln === 'address' || ln === 'details' || ln === 'summary' || ln === 'dialog' || ln === 'dl' || ln === 'dt' || ln === 'dd' || ln === 'blockquote') {
        nl(ln === 'p' || ln === 'blockquote' ? 2 : 1);
        if (ln === 'blockquote') { const save = parts.length; rec(c); const inner = parts.splice(save).join('').trim(); push(inner.split('\n').map(l => '> ' + l).join('\n')); }
        else rec(c);
        nl(ln === 'p' ? 2 : 1); continue;
      }
      if (ln === 'ul' || ln === 'ol' || ln === 'menu') { nl(1); listDepth++; let k = ln === 'ol' ? (parseInt(c._attrs.start, 10) || 1) : 0; for (const li of c.children) { if (li.localName !== 'li') { rec({ childNodes: [li] }); continue; } nl(1); push('  '.repeat(listDepth - 1) + (ln === 'ol' ? (k++) + '. ' : '- ')); rec(li); } listDepth--; nl(1); continue; }
      if (ln === 'li') { nl(1); push('- '); rec(c); continue; }
      if (ln === 'pre') { nl(2); push('```\n' + c.textContent.replace(/\s+$/, '') + '\n```'); nl(2); continue; }
      if (ln === 'code' && node.localName !== 'pre') { push('`'); rec(c); push('`'); continue; }
      if (ln === 'table') { nl(2); const rows = R.tableRows(c); rows.forEach((r, ri) => { const cells = r.children.filter(x => x.localName === 'td' || x.localName === 'th'); push('| ' + cells.map(x => collapse(readableText(x, opts)).replace(/\|/g, '\\|')).join(' | ') + ' |\n'); if (ri === 0 && cells.length) push('|' + cells.map(() => ' --- ').join('|') + '|\n'); }); nl(2); continue; }
      if (ln === 'hr') { nl(2); push('---'); nl(2); continue; }
      if (ln === 'a' && 'href' in c._attrs && opts.links !== false) { const h = c.href; const save = parts.length; rec(c); const t = collapse(parts.splice(save).join('')); if (t) push('[' + t + '](' + clip(h, ALIGN.maxHref) + ')'); continue; }
      if (ln === 'strong' || ln === 'b') { push('**'); rec(c); push('**'); continue; }
      if (ln === 'em' || ln === 'i') { push('_'); rec(c); push('_'); continue; }
      if (ln === 'input') { const t = c.type; if (t === 'hidden') continue; if (t === 'submit' || t === 'button') { push('[' + (c.value || 'Submit') + ']'); continue; } if (t === 'checkbox' || t === 'radio') { push(c.checked ? '[x] ' : '[ ] '); continue; } push('[' + (c.value || c.placeholder || c.name || 'input') + ']'); continue; }
      if (ln === 'button') { push('['); rec(c); push(']'); continue; }
      if (ln === 'select') { push('[' + (c.selectedOptions.map(o => o.text).join(', ') || c.name || 'select') + ']'); continue; }
      if (ln === 'textarea') { push('[' + collapse(c.value || c.placeholder || '') + ']'); continue; }
      if (ln === 'tr' || ln === 'td' || ln === 'th' || ln === 'thead' || ln === 'tbody' || ln === 'tfoot') { rec(c); if (ln === 'tr') nl(1); else push(' '); continue; }
      const block = BLOCK_TAGS.has(ln);
      if (block) nl(1);
      rec(c);
      if (block) nl(1);
    }
  };
  rec(root);
  const out = parts.join('');
  return out.replace(/[ \t]+\n/g, '\n').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
}

// -------------------------------------------------------------- Actions
function userClick(el, opts) {
  opts = opts || {};
  if (R.isDisabled(el)) return false;
  if (R.isFocusable(el)) R.setFocus(el); else { const f = el.closest('[tabindex],a[href],button,input,select,textarea,summary'); if (f && R.isFocusable(f)) R.setFocus(f); }
  const init = { button: 0, buttons: 1, detail: 1, clientX: 1, clientY: 1, ctrlKey: !!opts.ctrl, shiftKey: !!opts.shift, metaKey: !!opts.meta, altKey: !!opts.alt };
  R.fire(el, 'pointerover', init, R.eventClasses.PointerEvent); R.fire(el, 'mouseover', init, R.eventClasses.MouseEvent); R.fire(el, 'mouseenter', Object.assign({ bubbles: false }, init), R.eventClasses.MouseEvent);
  R.fire(el, 'pointerdown', init, R.eventClasses.PointerEvent); R.fire(el, 'mousedown', init, R.eventClasses.MouseEvent);
  R.fire(el, 'pointerup', init, R.eventClasses.PointerEvent); R.fire(el, 'mouseup', init, R.eventClasses.MouseEvent);
  // pre-activation
  let undo = null;
  if (el.localName === 'input' && el.type === 'checkbox') { const was = el.checked; el.checked = !was; undo = () => { el.checked = was; }; }
  else if (el.localName === 'input' && el.type === 'radio') { const was = el.checked; if (!was) { el.checked = true; undo = () => { el.checked = was; }; } }
  const ok = R.fire(el, 'click', Object.assign({ composed: true }, init), R.eventClasses.PointerEvent);
  if (!ok) { if (undo) undo(); return false; }
  if (undo) { R.fire(el, 'input', { cancelable: false }, R.eventClasses.InputEvent); R.fire(el, 'change', { cancelable: false }); }
  defaultClick(el, opts);
  return true;
}
function defaultClick(el, opts) {
  let n = el;
  while (n && n.nodeType === 1) {
    const ln = n.localName;
    if ((ln === 'a' || ln === 'area') && 'href' in n._attrs) {
      const href = n.href;
      if (/^javascript:/i.test(href)) { R.evalScript(decodeURIComponent(href.slice(11)), 'javascript: href'); return; }
      if ('download' in n._attrs) { R.dialogs.push({ type: 'download', url: href }); return; }
      const cur = R.location.href.split('#')[0];
      if (href.split('#')[0] === cur && href.includes('#')) { R.setHash(href.slice(href.indexOf('#'))); return; }
      if (!R.pendingNavigation) R.pendingNavigation = { url: href, method: 'GET', reason: 'link', target: n._attrs.target || '' };
      return;
    }
    if (ln === 'button' || (ln === 'input' && (n.type === 'submit' || n.type === 'image' || n.type === 'reset'))) {
      const type = n.type; const form = n.form;
      if (form && !R.isDisabled(n)) { if (type === 'submit' || type === 'image') R.submitForm(form, n, true); else if (type === 'reset') form.reset(); }
      return;
    }
    if (ln === 'label' && n !== el) { return; }
    if (ln === 'label') { const c = n.control; if (c && c !== el && !c.contains(el)) userClick(c, opts); return; }
    if (ln === 'summary') { const d = n.parentNode; if (d && d.localName === 'details') d.open = !d.open; return; }
    if (ln === 'option') { const s = n.closest('select'); if (s) { n.selected = true; R.fire(s, 'input', { cancelable: false }, R.eventClasses.InputEvent); R.fire(s, 'change', { cancelable: false }); } return; }
    n = n.parentNode;
  }
}
R.userClick = userClick;
function keyEvents(target, key, opts) {
  const init = Object.assign({ key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key }, opts || {});
  const down = R.fire(target, 'keydown', init, R.eventClasses.KeyboardEvent);
  let press = true;
  if (key.length === 1 || key === 'Enter') press = R.fire(target, 'keypress', init, R.eventClasses.KeyboardEvent);
  R.fire(target, 'keyup', init, R.eventClasses.KeyboardEvent);
  return down && press;
}
function typeInto(el, text, opts) {
  opts = opts || {};
  if (!R.isEditable(el)) { if (el.localName === 'select') return selectValue(el, text); throw new Error('Element is not editable: ' + describeShort(el)); }
  R.setFocus(el);
  const isField = el.localName === 'input' || el.localName === 'textarea';
  if (opts.clear !== false) { if (isField) el.value = ''; else el.textContent = ''; }
  for (const ch of Array.from(text).slice(0, 2000)) {
    const key = ch === '\n' ? 'Enter' : ch;
    if (!keyEvents(el, key)) continue;
    if (ch === '\n' && el.localName !== 'textarea' && !el.isContentEditable) continue;
    if (!R.fire(el, 'beforeinput', { data: ch, inputType: 'insertText' }, R.eventClasses.InputEvent)) continue;
    if (isField) { el.value = el.value + ch; el._dirtyValue = true; } else el.appendChild(el.ownerDocument.createTextNode(ch));
    R.fire(el, 'input', { cancelable: false, data: ch, inputType: 'insertText' }, R.eventClasses.InputEvent);
  }
  if (opts.submit) { if (keyEvents(el, 'Enter')) implicitSubmit(el); }
  else if (opts.blur !== false) { el._dirtyValue = false; R.fire(el, 'change', { cancelable: false }); }
  return true;
}
function implicitSubmit(el) {
  const form = el.form || el.closest('form'); if (!form) return;
  const btn = form.elements.find(e => (e.localName === 'button' && e.type === 'submit') || (e.localName === 'input' && (e.type === 'submit' || e.type === 'image')));
  if (btn) { if (!R.isDisabled(btn)) userClick(btn); return; }
  R.submitForm(form, null, true);
}
function selectValue(el, value) {
  if (el.localName !== 'select') throw new Error('Element is not a select: ' + describeShort(el));
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  const opts = el.options; let hit = 0;
  const pick = o => { o._selected = true; hit++; };
  if (el.multiple) for (const o of opts) o._selected = false;
  for (const v of values) {
    let o = opts.find(o => o.value === v) || opts.find(o => o.text === v) || opts.find(o => o.text.toLowerCase() === v.toLowerCase()) || opts.find(o => o.value.toLowerCase() === v.toLowerCase()) || (/^\d+$/.test(v) ? opts[+v] : null);
    if (!o) throw new Error('No option matching ' + JSON.stringify(v) + '; options: ' + opts.slice(0, 20).map(o => JSON.stringify(o.value)).join(', '));
    if (!el.multiple) { for (const x of opts) x._selected = false; }
    pick(o); if (!el.multiple) break;
  }
  R.setFocus(el);
  R.fire(el, 'input', { cancelable: false }, R.eventClasses.InputEvent); R.fire(el, 'change', { cancelable: false });
  return hit > 0;
}
function describeShort(el) { return '<' + el.localName + (el._attrs.id ? '#' + el._attrs.id : '') + '>'; }

// -------------------------------------------------------- Page lifecycle
R.opts = { js: true, css: true, maxScriptBytes: 512 * 1024, maxCssBytes: 512 * 1024, maxScripts: 60, maxVirtualMs: 8000, maxTimerRuns: 400 };
R.device = { width: 1280, height: 900, mobile: false, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) UrbitBrowser/0.1 Safari/537.36', platform: 'Linux x86_64', language: 'en-US', languages: ['en-US', 'en'], timezone: 'UTC' };
R.scriptBytes = 0; R.scriptsRun = 0; R.scriptsFailed = 0; R.subrequests = 0;
R.evalScript = (code, name) => { R.scriptsRun++; try { (0, eval)(code); } catch (e) { R.scriptsFailed++; R.reportError(e, name || 'script'); } };
R.scriptRunner = (el) => {
  if (!R.opts.js) return;
  const type = (el._attrs.type || '').trim().toLowerCase();
  if (type === 'importmap') { if (!el._ran) { el._ran = true; R.setImportMap(el.textContent); } return; }
  if (type && !/^(text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript|module|text\/jscript|text\/livescript|text\/x-javascript|text\/javascript1\.\d)$/.test(type)) return;
  if ('nomodule' in el._attrs || el._ran) return;
  el._ran = true;
  if (type === 'module') { if (R.scriptsRun >= R.opts.maxScripts) return; R.runModuleScript(el); return; }
  if (R.scriptsRun >= R.opts.maxScripts) { if (R.scriptsRun === R.opts.maxScripts) R.pushLog('warn', ['script limit reached; later scripts skipped']); R.scriptsRun++; return; }
  let code, name = 'inline script';
  if (el._attrs.src !== undefined) {
    const url = R.resolveURL(el._attrs.src, R.base()); if (!url) return;
    name = url;
    if (R.scriptBytes >= R.opts.maxScriptBytes) { R.pushLog('warn', ['script byte budget exhausted; skipped ' + url]); return; }
    let r; try { r = hostFetch(url, 'GET', { accept: '*/*' }, '', 'script'); } catch (e) { R.pushLog('warn', ['script fetch failed: ' + url + ' ' + e.message]); R.fire(el, 'error', { bubbles: false, cancelable: false }); return; }
    if (r.status >= 400 || !r.body) { R.pushLog('warn', ['script ' + url + ' -> HTTP ' + r.status]); R.fire(el, 'error', { bubbles: false, cancelable: false }); return; }
    code = r.body; R.scriptBytes += code.length;
  } else code = el.textContent;
  const prev = R.document.currentScript; R.document.currentScript = el;
  R.evalScript(code, name);
  R.document.currentScript = prev;
  if (el._attrs.src !== undefined) R.fire(el, 'load', { bubbles: false, cancelable: false });
};
function resetPageState() {
  R.timers = []; R.observers = []; R.observerPending = false; R.pendingNavigation = null; R.console = []; R.dialogs = []; R.errors = 0;
  R.scriptBytes = 0; R.scriptsRun = 0; R.scriptsFailed = 0; R.subrequests = 0; R.cookieSets = []; R.storageDirty = { local: false, session: false };
  R.snapshot = null; R.clock.now = 0; R.timerRunsTotal = 0;
  R.cssRules = []; R.cssLoaded = new Set(); R.cssBytes = 0; R.cssIndex = null; R.cssGeneration++;
  R.modules = new Map(); R.importMap = { imports: {}, scopes: {} }; R.baseHref = null;
  R.window[listenersKey] = null; R.window._handlers = Object.create(null);
}
R.applyDevice = d => {
  if (!d) return;
  Object.assign(R.device, d);
  if (d.userAgent === undefined && d.mobile) R.device.userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 UrbitBrowser/0.1';
  if (d.language && !d.languages) R.device.languages = [d.language, d.language.split('-')[0]].filter((x, i, a) => a.indexOf(x) === i);
  const g = R.window;
  g.innerWidth = R.device.width; g.innerHeight = R.device.height; g.outerWidth = R.device.width; g.outerHeight = R.device.height + 100;
  Object.assign(g.screen, { width: R.device.width, height: R.device.height, availWidth: R.device.width, availHeight: R.device.height });
  Object.assign(g.visualViewport, { width: R.device.width, height: R.device.height });
  Object.assign(g.navigator, { userAgent: R.device.userAgent, platform: R.device.platform, language: R.device.language, languages: R.device.languages.slice(), maxTouchPoints: R.device.mobile ? 5 : 0 });
  if (R.device.mobile) g.ontouchstart = null; else { try { delete g.ontouchstart; } catch (e) {} }
};
function loadPage(html, url, opts) {
  opts = opts || {};
  resetPageState();
  Object.assign(R.opts, opts.options || {});
  R.applyDevice(opts.device);
  if (opts.seed !== undefined) seedRandom(opts.seed);
  R.clock.base = opts.now || 1735689600000; R.clock.now = 0;
  R.cookies = (opts.cookies || []).map(c => ({ name: c.name, value: c.value }));
  R.location._set(url);
  R.history = new HistoryImpl(); R.history._entries = [{ state: null, url }];
  R.localStorage = new StorageImpl(opts.localStorage, 'local'); R.sessionStorage = new StorageImpl(opts.sessionStorage, 'session');
  R.localStorageProxy = R.localStorage._wrap(); R.sessionStorageProxy = R.sessionStorage._wrap();
  const doc = new DocumentImpl(); doc._isMain = true; doc._referrer = opts.referrer || ''; R.document = doc;
  const parser = new R.Parser(doc, { scriptRunner: R.opts.js ? R.scriptRunner : null, onStyle: R.opts.css ? R.loadStyleElement : null });
  doc._parser = parser;
  try { parser.parse(String(html)); } catch (e) { R.reportError(e, 'html parser'); parser.finish && parser.finish(); }
  doc._parser = null;
  doc.readyState = 'interactive';
  if (R.opts.js) { for (const s of parser.deferred) { if (R.pendingNavigation) break; R.scriptRunner(s); } }
  R.fire(doc, 'DOMContentLoaded', { cancelable: false });
  if (!R.pendingNavigation) { const m = R.collect(doc, e => e.localName === 'meta' && /^refresh$/i.test(e._attrs['http-equiv'] || '')); for (const el of m) { const c = /^\s*(\d+)\s*[;,]\s*(?:url\s*=\s*)?['"]?([^'"]+)/i.exec(el._attrs.content || ''); if (c && +c[1] <= 10) { const u = R.resolveURL(c[2].trim(), R.base()); if (u && u.split('#')[0] !== R.location.href.split('#')[0]) { R.pendingNavigation = { url: u, method: 'GET', reason: 'meta-refresh' }; break; } } } }
  R.queueTimer(() => { doc.readyState = 'complete'; R.fire(R.window, 'load', { bubbles: false, cancelable: false }); R.fire(doc, 'readystatechange', { bubbles: false, cancelable: false }); }, 0);
  R.queueTimer(() => R.fire(R.window, 'pageshow', { bubbles: false, cancelable: false }), 0);
  return { ok: true };
}
function tick(maxRuns) {
  R.deliverObservers();
  const r = R.runTimerBatch(maxRuns || 25, R.opts.maxVirtualMs - R.clock.now);
  R.deliverObservers();
  const budgetLeft = R.clock.now < R.opts.maxVirtualMs && R.timerRunsTotal < R.opts.maxTimerRuns;
  R.timerRunsTotal = (R.timerRunsTotal || 0) + r.ran;
  return !!(r.pending && r.ran > 0 && budgetLeft && !R.pendingNavigation) && R.timers.some(t => t.at <= R.opts.maxVirtualMs);
}
function buildResult(extra) {
  const doc = R.document;
  const out = Object.assign({ ok: true, url: R.location.href, title: doc.title, readyState: doc.readyState }, extra || {});
  try { const d = doc.querySelector('meta[name="description"], meta[property="og:description"]'); if (d) out.description = clip(collapse(d.getAttribute('content') || ''), 300); } catch (e) { /* ignore */ }
  if (R.pendingNavigation) out.navigate = R.pendingNavigation;
  if (R.cookieSets.length) out.cookies = R.cookieSets;
  if (R.storageDirty.local) out.localStorage = R.localStorage._d;
  if (R.storageDirty.session) out.sessionStorage = R.sessionStorage._d;
  if (R.console.length) out.console = R.console.slice(-12);
  if (R.dialogs.length) out.dialogs = R.dialogs.slice(-8);
  out.stats = { scripts: R.scriptsRun, failed: R.scriptsFailed, errors: R.errors, subrequests: R.subrequests, vtime: R.clock.now, timers: R.timers.length };
  return out;
}
function takeSnapshot(opts) {
  opts = opts || {};
  const doc = R.document; const root = opts.selector ? doc.querySelector(opts.selector) : (doc.body || doc.documentElement || doc);
  if (!root) throw new Error('No element matches ' + opts.selector);
  const snap = new Snapshot(opts).render(root);
  R.snapshot = snap;
  return { lines: snap.lines, interactive: snap.interactive, refs: snap.refs.length - 1 };
}
function getRef(ref) {
  if (typeof ref !== 'string') ref = String(ref);
  const m = /^e?(\d+)$/.exec(ref.trim());
  if (m && R.snapshot) { const el = R.snapshot.refs[+m[1]]; if (!el) throw new Error('Unknown ref ' + ref + '; take a new snapshot'); if (!el.isConnected) throw new Error('Element ' + ref + ' is no longer in the page; take a new snapshot'); return el; }
  if (!R.snapshot) { if (m) throw new Error('No snapshot yet; take a snapshot first'); }
  const el = R.document.querySelector(ref); if (!el) throw new Error('No element matches selector ' + JSON.stringify(ref)); return el;
}
function performAction(a) {
  const t = a.type;
  if (t === 'click') { const el = getRef(a.ref); if (a.count === 2) { userClick(el, a); R.fire(el, 'dblclick', { button: 0, detail: 2 }, R.eventClasses.MouseEvent); } else userClick(el, a); return { acted: describeShort(el) }; }
  if (t === 'type' || t === 'fill') { const el = getRef(a.ref); typeInto(el, String(a.text == null ? '' : a.text), { clear: a.clear !== false, submit: !!a.submit }); return { acted: describeShort(el) }; }
  if (t === 'select') { const el = getRef(a.ref); selectValue(el, a.value); return { acted: describeShort(el) }; }
  if (t === 'check' || t === 'uncheck') { const el = getRef(a.ref); const want = t === 'check'; if (el.localName === 'input' && (el.type === 'checkbox' || el.type === 'radio')) { if (el.checked !== want) userClick(el); } else userClick(el); return { acted: describeShort(el) }; }
  if (t === 'submit') { let el = a.ref ? getRef(a.ref) : (R.document.activeElement && R.document.activeElement.form) || R.document.querySelector('form'); if (!el) throw new Error('No form found'); const form = el.localName === 'form' ? el : (el.form || el.closest('form')); if (!form) throw new Error('Element is not in a form'); form.requestSubmit(); return { acted: describeShort(form) }; }
  if (t === 'press') { const el = a.ref ? getRef(a.ref) : (R.document.activeElement || R.document.body); const key = String(a.key || 'Enter'); if (R.isFocusable(el)) R.setFocus(el); const ok = keyEvents(el, key, { ctrlKey: !!a.ctrl, shiftKey: !!a.shift, altKey: !!a.alt, metaKey: !!a.meta }); if (ok && key === 'Tab') { const all = R.collect(R.document.body || R.document, e => R.isFocusable(e) && R.isVisible(e) && e.tabIndex >= 0); const i = all.indexOf(R.document.activeElement); const next = a.shift ? (i <= 0 ? all[all.length - 1] : all[i - 1]) : (i < 0 || i + 1 >= all.length ? all[0] : all[i + 1]); if (next) R.setFocus(next); return { acted: next ? describeShort(next) : 'none' }; } if (ok && key === 'Enter' && (el.localName === 'input')) implicitSubmit(el); if (ok && key === ' ' && (el.localName === 'button' || (el.localName === 'input' && (el.type === 'checkbox' || el.type === 'radio')))) userClick(el); return { acted: describeShort(el) }; }
  if (t === 'hover') { const el = getRef(a.ref); const init = { clientX: 1, clientY: 1 }; R.fire(el, 'pointerover', init, R.eventClasses.PointerEvent); R.fire(el, 'mouseover', init, R.eventClasses.MouseEvent); R.fire(el, 'mouseenter', Object.assign({ bubbles: false }, init), R.eventClasses.MouseEvent); R.fire(el, 'mousemove', init, R.eventClasses.MouseEvent); return { acted: describeShort(el) }; }
  if (t === 'focus') { const el = getRef(a.ref); R.setFocus(el); return { acted: describeShort(el) }; }
  if (t === 'scroll') { const el = a.ref ? getRef(a.ref) : null; if (el) { el.scrollTop = a.y || 0; R.fire(el, 'scroll', { bubbles: false, cancelable: false }); } else { R.fire(R.document, 'scroll', { cancelable: false }); R.fire(R.window, 'scroll', { bubbles: false, cancelable: false }); } return { acted: 'scroll' }; }
  if (t === 'wait') {
    const ms = Math.min(+a.ms || 0, 30000); const target = R.clock.now + ms;
    R.opts.maxVirtualMs = Math.max(R.opts.maxVirtualMs, target);
    const satisfied = () => { if (a.selector) { const e = R.document.querySelector(a.selector); return !!e && R.isVisible(e); } if (a.text) return (R.document.body ? R.innerText(R.document.body) : '').toLowerCase().includes(String(a.text).toLowerCase()); return false; };
    let ran = 0, found = !(a.selector || a.text) ? null : satisfied();
    while (!found) { const r = R.runTimerBatch(50, Math.max(0, target - R.clock.now)); ran += r.ran; if (r.ran > 0 && (a.selector || a.text)) found = satisfied(); if (found || !r.pending || r.navigate || R.clock.now >= target) break; if (r.ran === 0) { R.clock.now = Math.min(target, R.clock.now + Math.min(r.next || ms, target - R.clock.now)); if (R.clock.now >= target) break; } }
    if (found === null && R.clock.now < target) R.clock.now = target;
    return { acted: 'wait', ran, found: found === null ? undefined : !!found };
  }
  if (t === 'login') {
    const doc = R.document;
    const visible = e => R.isVisible(e) && !R.isDisabled(e);
    let pw = a.ref ? getRef(a.ref) : null;
    if (!pw) { pw = R.collect(doc.body || doc, e => e.localName === 'input' && e.type === 'password' && visible(e))[0]; }
    if (!pw) throw new Error('No password field on this page');
    const form = pw.form || pw.closest('form') || doc.body;
    const candidates = R.collect(form, e => e.localName === 'input' && visible(e) && (e.type === 'email' || e.type === 'text' || e.type === 'tel' || e.type === '') && e !== pw);
    let user = candidates.find(e => /user|login|email|account|name|id/i.test((e._attrs.name || '') + ' ' + (e._attrs.id || '') + ' ' + (e._attrs.autocomplete || '') + ' ' + (e._attrs.placeholder || ''))) || candidates.filter(e => e.compareDocumentPosition(pw) & 4).pop() || candidates[0] || null;
    if (a.username != null && a.username !== '') { if (!user) throw new Error('No username field found near the password field'); typeInto(user, String(a.username), { blur: true }); }
    typeInto(pw, String(a.password == null ? '' : a.password), { submit: a.submit !== false });
    return { acted: 'login into ' + describeShort(form) + (user ? ' (' + describeShort(user) + ')' : '') };
  }
  if (t === 'upload') {
    const el = getRef(a.ref);
    if (!(el.localName === 'input' && el.type === 'file')) throw new Error('Element is not a file input: ' + describeShort(el));
    const files = (a.files || []).map(f => { const file = new FileImpl([String(f.content == null ? '' : f.content)], String(f.name || 'upload.txt'), { type: f.type || 'text/plain' }); return file; });
    if (!files.length) throw new Error('No files given');
    if (!el.multiple && files.length > 1) throw new Error('This input accepts a single file');
    el.files = files;
    R.fire(el, 'input', { cancelable: false }, R.eventClasses.InputEvent); R.fire(el, 'change', { cancelable: false });
    return { acted: describeShort(el), files: files.map(f => f.name) };
  }
  if (t === 'eval') { let v; try { v = (0, eval)(String(a.code)); } catch (e) { return { error: (e && e.message) || String(e) }; } return { value: serializeValue(v) }; }
  if (t === 'setvalue') { const el = getRef(a.ref); el.value = String(a.value); R.fire(el, 'input', { cancelable: false }, R.eventClasses.InputEvent); R.fire(el, 'change', { cancelable: false }); return { acted: describeShort(el) }; }
  throw new Error('Unknown action ' + t);
}
function serializeValue(v, depth) {
  depth = depth || 0;
  if (v === undefined) return null;
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'function') return '[function ' + (v.name || 'anonymous') + ']';
  if (typeof v === 'symbol' || typeof v === 'bigint') return String(v);
  if (v && v.__isNode) { if (v.nodeType === 1) return { node: v.localName, id: v._attrs.id || undefined, text: clip(collapse(v.textContent), 200), html: clip(v.outerHTML, 500) }; if (v.nodeType === 3) return { node: '#text', text: clip(v.data, 200) }; return { node: v.nodeName }; }
  if (v instanceof Error) return { error: v.name + ': ' + v.message };
  if (v instanceof Promise) return '[Promise]';
  if (depth > 4) return '[...]';
  if (Array.isArray(v)) return v.slice(0, 100).map(x => serializeValue(x, depth + 1));
  if (typeof v === 'object') { const o = {}; let n = 0; for (const k of Object.keys(v)) { if (n++ > 60) { o['…'] = '…'; break; } try { o[k] = serializeValue(v[k], depth + 1); } catch (e) { o[k] = '[unreadable]'; } } return o; }
  return String(v);
}
function pageMetadata() {
  const doc = R.document; const out = { url: R.location.href, title: doc.title, status: undefined };
  const meta = (sel, attr) => { const e = doc.querySelector(sel); return e ? collapse(e.getAttribute(attr || 'content') || '') : ''; };
  out.description = meta('meta[name="description"]') || meta('meta[property="og:description"]');
  out.lang = (doc.documentElement && doc.documentElement.getAttribute('lang')) || meta('meta[http-equiv="content-language"]') || '';
  out.canonical = (() => { const e = doc.querySelector('link[rel="canonical"]'); return e ? (R.resolveURL(e.getAttribute('href') || '', R.base()) || '') : ''; })();
  out.favicon = (() => { const e = doc.querySelector('link[rel~="icon"]'); return e ? (R.resolveURL(e.getAttribute('href') || '', R.base()) || '') : R.resolveURL('/favicon.ico', R.location.href); })();
  out.author = meta('meta[name="author"]') || meta('meta[property="article:author"]');
  out.keywords = meta('meta[name="keywords"]');
  out.robots = meta('meta[name="robots"]');
  out.generator = meta('meta[name="generator"]');
  out.published = meta('meta[property="article:published_time"]') || meta('meta[name="date"]') || (() => { const t = doc.querySelector('article time[datetime], time[pubdate], time[datetime]'); return t ? (t.getAttribute('datetime') || '') : ''; })();
  out.modified = meta('meta[property="article:modified_time"]');
  const og = {}, tw = {};
  for (const m of doc.querySelectorAll('meta[property^="og:"], meta[name^="og:"]')) { const k = (m.getAttribute('property') || m.getAttribute('name')).slice(3); if (!(k in og)) og[k] = collapse(m.getAttribute('content') || ''); }
  for (const m of doc.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]')) { const k = (m.getAttribute('name') || m.getAttribute('property')).slice(8); if (!(k in tw)) tw[k] = collapse(m.getAttribute('content') || ''); }
  if (Object.keys(og).length) out.og = og; if (Object.keys(tw).length) out.twitter = tw;
  const ld = []; let ldBytes = 0;
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) { if (ld.length >= 5) break; try { const t = s.textContent; if (ldBytes + t.length > 12000) break; ldBytes += t.length; ld.push(JSON.parse(t)); } catch (e) { /* ignore */ } }
  if (ld.length) out.jsonld = ld;
  out.wordCount = doc.body ? (doc.body.textContent.match(/\S+/g) || []).length : 0;
  out.headings = doc.querySelectorAll('h1,h2,h3').filter(h => R.isVisible(h)).slice(0, 30).map(h => h.localName + ': ' + clip(collapse(h.textContent), 120));
  out.links = doc.links.length; out.forms = doc.forms.length; out.images = doc.images.length; out.scripts = doc.scripts.length;
  out.feeds = doc.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"]').map(l => R.resolveURL(l.getAttribute('href') || '', R.base())).filter(Boolean);
  return out;
}
const CLEAN_DROP = new Set(['svg', 'canvas', 'iframe', 'video', 'audio']);
const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'title', 'name', 'value', 'type', 'placeholder', 'action', 'method', 'for', 'aria-label', 'role', 'colspan', 'rowspan', 'datetime', 'checked', 'selected', 'disabled', 'label', 'lang', 'cite', 'start']);
function cleanHtml(root) {
  const clone = root.cloneNode(true);
  const strip = n => {
    for (const c of n.childNodes.slice()) {
      if (c.nodeType === 8) { n.removeChild(c); continue; }
      if (c.nodeType === 3) { if (n.localName !== 'pre' && n.localName !== 'textarea') { c.data = c.data.replace(/[\s\u00a0]+/g, ' '); if (!c.data.trim() && (!c.previousSibling || !c.nextSibling)) { n.removeChild(c); continue; } } continue; }
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (SKIP_TAGS.has(ln) || CLEAN_DROP.has(ln) || (ln === 'input' && c.type === 'hidden')) { n.removeChild(c); continue; }
      for (const an of c.getAttributeNames()) { if (!KEEP_ATTRS.has(an) && !an.startsWith('data-') || an.startsWith('on')) c.removeAttribute(an); }
      if (c._attrs.href !== undefined) c.setAttribute('href', R.resolveURL(c._attrs.href, R.base()) || c._attrs.href);
      if (c._attrs.src !== undefined) { if (/^data:/i.test(c._attrs.src) && c._attrs.src.length > 200) c.setAttribute('src', 'data:...'); else c.setAttribute('src', R.resolveURL(c._attrs.src, R.base()) || c._attrs.src); }
      strip(c);
      if ((ln === 'span' || ln === 'div' || ln === 'font' || ln === 'section') && !c.getAttributeNames().length) {
        if (!c.childNodes.length) { n.removeChild(c); continue; }
        if (ln === 'span' || ln === 'font') { while (c.firstChild) n.insertBefore(c.firstChild, c); n.removeChild(c); continue; }
        if (c.childNodes.length === 1 && c.firstChild.nodeType === 1 && (c.firstChild.localName === 'div' || c.firstChild.localName === 'section')) { n.replaceChild(c.firstChild, c); continue; }
      }
    }
  };
  // hidden elements are removed based on the live tree, so mark them first
  const hidden = new Set(); R.walk(root, e => { if (e.nodeType === 1 && !R.isVisible(e)) hidden.add(e); });
  const a = [], b = []; R.walk(root, e => { if (e.nodeType === 1) a.push(e); }); R.walk(clone, e => { if (e.nodeType === 1) b.push(e); });
  for (let i = 0; i < a.length && i < b.length; i++) if (hidden.has(a[i]) && b[i].parentNode) b[i].parentNode.removeChild(b[i]);
  strip(clone);
  const out = clone.outerHTML;
  return out.includes('<pre') ? out : out.replace(/\s{2,}/g, ' ');
}
function findText(query, opts) {
  opts = opts || {};
  if (!R.snapshot) takeSnapshot();
  const needle = String(query).toLowerCase(); const out = [];
  R.snapshot.lines.forEach((l, i) => { if (l.toLowerCase().includes(needle)) out.push({ line: i + 1, text: l.trim() }); });
  return { matches: out.slice(0, opts.limit || 40), total: out.length };
}
function listLinks(opts) {
  opts = opts || {};
  if (!R.snapshot) takeSnapshot();
  const out = [];
  for (const el of R.collect(R.document.body || R.document, e => (e.localName === 'a' || e.localName === 'area') && 'href' in e._attrs && R.isVisible(e))) {
    const href = el.href; if (!href || /^javascript:/i.test(href)) continue;
    if (opts.filter && !href.toLowerCase().includes(String(opts.filter).toLowerCase()) && !collapse(el.textContent).toLowerCase().includes(String(opts.filter).toLowerCase())) continue;
    out.push({ ref: R.snapshot.ref(el), text: clip(collapse(textWithAlts(el)), 120), href: clip(href, ALIGN.maxHref) });
  }
  return { links: out.slice(0, opts.limit || 200), total: out.length };
}

{
  const baseInsert = R.onInsert, baseRemove = R.onRemove, baseAttr = R.onAttr;
  const styleArrived = n => { if (n.localName === 'style') { if (n.textContent.trim()) R.loadStyleElement(n); } else if (n.localName === 'link' && !R.document._parser) R.loadStyleElement(n); };
  R.onInsert = (c, p) => {
    baseInsert(c, p); R.cssGeneration++;
    if (!R.opts.css || !R.document || !R.document._isMain) return;
    if (c.nodeType === 3) { if (p.nodeType === 1 && p.localName === 'style' && !R.document._parser && p.isConnected) R.loadStyleElement(p); return; }
    if (c.nodeType !== 1) return;
    const isStyle = c.localName === 'style' || c.localName === 'link';
    if (!isStyle && !c.childNodes.length) return;
    if (!c.isConnected) return;
    if (isStyle) styleArrived(c);
    else R.walk(c, n => { if (n.nodeType === 1 && (n.localName === 'style' || n.localName === 'link')) styleArrived(n); });
  };
  R.onRemove = (c, p) => { baseRemove(c, p); R.cssGeneration++; };
  R.onAttr = (el, name, old, val) => { baseAttr(el, name, old, val); if (name === 'class' || name === 'id' || name === 'style' || name === 'hidden' || name === 'open' || name === 'type') R.cssGeneration++; if (el.localName === 'style' && !R.document._parser) R.cssGeneration++; };
}
// ---------------------------------------------------------- Globals
function installGlobals() {
  const g = globalThis;
  R.window = g;
  try { Object.setPrototypeOf(g, EventTargetImpl.prototype); } catch (e) { /* global proxy may refuse */ }
  g[listenersKey] = null; g._handlers = Object.create(null);
  for (const m of ['addEventListener', 'removeEventListener', 'dispatchEvent']) Object.defineProperty(g, m, { value: EventTargetImpl.prototype[m], writable: true, configurable: true, enumerable: false });
  R.location = new LocationImpl(); R.history = new HistoryImpl();
  const def = (k, v) => Object.defineProperty(g, k, { value: v, writable: true, configurable: true, enumerable: false });
  const acc = (k, get, set) => Object.defineProperty(g, k, { get, set, configurable: true, enumerable: false });
  def('window', g); def('self', g); def('top', g); def('parent', g); def('frames', g); def('globalThis', g);
  acc('document', () => R.document);
  acc('location', () => R.location, v => { R.location.href = v; });
  acc('history', () => R.history);
  acc('localStorage', () => R.localStorageProxy); acc('sessionStorage', () => R.sessionStorageProxy);
  acc('customElements', () => R.customElements);
  acc('origin', () => R.location.origin); acc('isSecureContext', () => R.location.protocol === 'https:');
  def('name', ''); def('status', ''); def('closed', false); def('opener', null); def('frameElement', null); def('length', 0); def('crossOriginIsolated', false);
  def('innerWidth', 1280); def('innerHeight', 900); def('outerWidth', 1280); def('outerHeight', 1000); def('devicePixelRatio', 1);
  def('scrollX', 0); def('scrollY', 0); def('pageXOffset', 0); def('pageYOffset', 0); def('screenX', 0); def('screenY', 0); def('screenLeft', 0); def('screenTop', 0);
  def('screen', { width: 1280, height: 900, availWidth: 1280, availHeight: 900, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary', angle: 0, addEventListener() {}, removeEventListener() {} } });
  def('visualViewport', { width: 1280, height: 900, scale: 1, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, addEventListener() {}, removeEventListener() {}, onresize: null, onscroll: null });
  def('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) UrbitBrowser/0.1 Safari/537.36', appName: 'Netscape', appVersion: '5.0 (X11)', appCodeName: 'Mozilla', product: 'Gecko', productSub: '20030107', vendor: '', vendorSub: '', language: 'en-US', languages: ['en-US', 'en'], platform: 'Linux x86_64', onLine: true, cookieEnabled: true, doNotTrack: null, hardwareConcurrency: 1, maxTouchPoints: 0, deviceMemory: 1, pdfViewerEnabled: false, webdriver: false, plugins: [], mimeTypes: [], javaEnabled() { return false; }, sendBeacon() { return true; }, vibrate() { return false; }, share() { return Promise.reject(new DOMExceptionImpl('Not supported', 'NotAllowedError')); }, canShare() { return false; }, requestMediaKeySystemAccess() { return Promise.reject(new Error('unsupported')); }, getBattery() { return Promise.resolve({ charging: true, level: 1, chargingTime: 0, dischargingTime: Infinity, addEventListener() {} }); }, clipboard: { writeText() { return Promise.resolve(); }, readText() { return Promise.resolve(''); }, write() { return Promise.resolve(); }, read() { return Promise.resolve([]); } }, permissions: { query() { return Promise.resolve({ state: 'denied', onchange: null, addEventListener() {} }); } }, geolocation: { getCurrentPosition(s, e) { if (e) R.queueTimer(() => e({ code: 1, message: 'User denied Geolocation' }), 0); }, watchPosition() { return 0; }, clearWatch() {} }, storage: { estimate() { return Promise.resolve({ quota: 0, usage: 0 }); }, persist() { return Promise.resolve(false); } }, connection: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false, addEventListener() {}, removeEventListener() {} }, userActivation: { isActive: true, hasBeenActive: true }, locks: { request() { return Promise.resolve(); } }, mediaDevices: undefined, serviceWorker: undefined, credentials: undefined, wakeLock: { request() { return Promise.reject(new Error('unsupported')); } } });
  def('performance', { now() { return R.clock.now; }, get timeOrigin() { return R.clock.base; }, mark() { return { name: '', startTime: R.clock.now }; }, measure() { return { name: '', duration: 0 }; }, clearMarks() {}, clearMeasures() {}, clearResourceTimings() {}, getEntries() { return []; }, getEntriesByType() { return []; }, getEntriesByName() { return []; }, setResourceTimingBufferSize() {}, toJSON() { return {}; }, addEventListener() {}, removeEventListener() {}, navigation: { type: 0, redirectCount: 0, TYPE_NAVIGATE: 0 }, get timing() { const b = R.clock.base; return { navigationStart: b, fetchStart: b, domainLookupStart: b, domainLookupEnd: b, connectStart: b, connectEnd: b, requestStart: b, responseStart: b, responseEnd: b, domLoading: b, domInteractive: b, domContentLoadedEventStart: b, domContentLoadedEventEnd: b, domComplete: b, loadEventStart: b, loadEventEnd: b, unloadEventStart: 0, unloadEventEnd: 0, redirectStart: 0, redirectEnd: 0, secureConnectionStart: 0 }; }, memory: { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 }, eventCounts: new Map() });
  def('crypto', { getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(random() * 256 ** Math.min(arr.BYTES_PER_ELEMENT || 1, 4)) >>> 0; return arr; }, randomUUID() { const h = () => Math.floor(random() * 65536).toString(16).padStart(4, '0'); return h() + h() + '-' + h() + '-4' + h().slice(1) + '-' + (8 + Math.floor(random() * 4)).toString(16) + h().slice(1) + '-' + h() + h() + h(); }, subtle: { digest() { return Promise.reject(new DOMExceptionImpl('crypto.subtle is not available', 'NotSupportedError')); }, importKey() { return Promise.reject(new DOMExceptionImpl('crypto.subtle is not available', 'NotSupportedError')); }, sign() { return Promise.reject(new Error('unsupported')); }, encrypt() { return Promise.reject(new Error('unsupported')); }, decrypt() { return Promise.reject(new Error('unsupported')); }, generateKey() { return Promise.reject(new Error('unsupported')); } } });
  def('CSS', { supports() { return false; }, escape(s) { return String(s).replace(/([^\w-])/g, '\\$1'); }, px: v => v + 'px', number: v => v });
  def('console', { log(...a) { pushLog('log', a); }, info(...a) { pushLog('info', a); }, debug() {}, warn(...a) { pushLog('warn', a); }, error(...a) { pushLog('error', a); }, trace(...a) { pushLog('log', a); }, dir(...a) { pushLog('log', a); }, table(...a) { pushLog('log', a); }, group() {}, groupCollapsed() {}, groupEnd() {}, time() {}, timeEnd() {}, timeLog() {}, count() {}, countReset() {}, assert(c, ...a) { if (!c) pushLog('error', ['Assertion failed', ...a]); }, clear() {}, profile() {}, profileEnd() {}, timeStamp() {} });
  def('setTimeout', (fn, d, ...args) => R.queueTimer(fn, d, args, false)); def('setInterval', (fn, d, ...args) => R.queueTimer(fn, d, args, true));
  def('clearTimeout', id => R.clearTimer(id)); def('clearInterval', id => R.clearTimer(id));
  def('requestAnimationFrame', fn => R.queueTimer(() => fn(R.clock.now), 16)); def('cancelAnimationFrame', id => R.clearTimer(id));
  def('requestIdleCallback', (fn, o) => R.queueTimer(() => fn({ didTimeout: false, timeRemaining: () => 50 }), (o && o.timeout) || 1)); def('cancelIdleCallback', id => R.clearTimer(id));
  def('queueMicrotask', fn => { Promise.resolve().then(fn).catch(e => R.reportError(e, 'microtask')); });
  def('structuredClone', v => JSON.parse(JSON.stringify(v)));
  def('alert', m => { R.dialogs.push({ type: 'alert', message: String(m) }); });
  def('confirm', m => { R.dialogs.push({ type: 'confirm', message: String(m), result: true }); return true; });
  def('prompt', (m, d) => { R.dialogs.push({ type: 'prompt', message: String(m), result: null }); return null; });
  def('print', () => {}); def('open', (u) => { R.dialogs.push({ type: 'open', url: u ? (R.resolveURL(String(u), R.base()) || String(u)) : '' }); return null; }); def('close', () => {}); def('stop', () => {}); def('focus', () => {}); def('blur', () => {});
  def('scrollTo', () => {}); def('scrollBy', () => {}); def('scroll', () => {}); def('moveTo', () => {}); def('resizeTo', () => {});
  def('postMessage', (data, origin) => { R.queueTimer(() => R.fire(g, 'message', { bubbles: false, cancelable: false, data, origin: R.location.origin, source: g }, R.eventClasses.MessageEvent), 0); });
  def('getSelection', () => ({ rangeCount: 0, type: 'None', anchorNode: null, focusNode: null, anchorOffset: 0, focusOffset: 0, isCollapsed: true, toString() { return ''; }, removeAllRanges() {}, addRange() {}, getRangeAt() { return new RangeImpl(R.document); }, collapse() {}, selectAllChildren() {}, empty() {}, containsNode() { return false; } }));
  def('find', () => false);
  def('getComputedStyle', el => {
    const inline = el && el.nodeType === 1 ? el.style : null;
    const cssDisplay = el && el.nodeType === 1 ? R.cssValue(el, 'display') : null; const cssVis = el && el.nodeType === 1 ? R.cssValue(el, 'visibility') : null;
    const defaults = { display: cssDisplay || (el && el.nodeType === 1 ? (('hidden' in el._attrs) ? 'none' : BLOCK_TAGS.has(el.localName) ? 'block' : el.localName === 'table' ? 'table' : el.localName === 'li' ? 'list-item' : 'inline') : 'block'), visibility: cssVis || 'visible', opacity: '1', position: 'static', overflow: 'visible', width: 'auto', height: 'auto', color: 'rgb(0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)', fontSize: '16px', fontFamily: 'sans-serif', fontWeight: '400', lineHeight: 'normal', zIndex: 'auto', pointerEvents: 'auto', transform: 'none', transition: 'all 0s ease 0s', animation: 'none', cursor: 'auto', textAlign: 'start', direction: 'ltr', boxSizing: 'content-box', margin: '0px', padding: '0px', border: '0px none rgb(0, 0, 0)', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', flexDirection: 'row', justifyContent: 'normal', alignItems: 'normal', gap: 'normal', gridTemplateColumns: 'none', float: 'none', clear: 'none', whiteSpace: 'normal', textDecoration: 'none solid rgb(0, 0, 0)', letterSpacing: 'normal', maxWidth: 'none', minWidth: '0px', maxHeight: 'none', minHeight: '0px', content: 'none', filter: 'none', userSelect: 'auto', touchAction: 'auto', scrollBehavior: 'auto', transformOrigin: '0px 0px', backgroundImage: 'none' };
    const decl = { getPropertyValue(k) { k = String(k); const v = inline ? inline.getPropertyValue(k) : ''; if (v) return v; const c = camel(k); return defaults[c] !== undefined ? defaults[c] : ''; }, getPropertyPriority() { return ''; }, setProperty() {}, removeProperty() { return ''; }, item(i) { return Object.keys(defaults).map(kebab)[i] || ''; }, get length() { return Object.keys(defaults).length; }, get cssText() { return ''; } };
    return new Proxy(decl, { get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; if (/^\d+$/.test(k)) return t.item(+k); return t.getPropertyValue(k.startsWith('--') ? k : kebab(k)); }, has(t, k) { return k in t || typeof k === 'string'; } });
  });
  def('matchMedia', q => { q = String(q); const m = R.mediaMatches(q); return { matches: m, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }; });
  def('fetch', fetchImpl); def('XMLHttpRequest', XMLHttpRequestImpl); def('XMLHttpRequestUpload', XMLHttpRequestUploadImpl);
  def('Headers', HeadersImpl); def('Request', RequestImpl); def('Response', ResponseImpl); def('FormData', FormDataImpl); def('URL', URLImpl); def('URLSearchParams', URLSearchParams);
  def('Blob', BlobImpl); def('File', FileImpl); def('FileReader', FileReaderImpl); def('TextEncoder', TextEncoderImpl); def('TextDecoder', TextDecoderImpl); def('DOMException', DOMExceptionImpl); def('AbortController', AbortControllerImpl); def('AbortSignal', AbortSignalImpl); def('Storage', StorageImpl);
  def('atob', atobImpl); def('btoa', btoaImpl);
  def('MutationObserver', MutationObserverImpl); def('WebKitMutationObserver', MutationObserverImpl); def('IntersectionObserver', IntersectionObserverImpl); def('ResizeObserver', ResizeObserverImpl); def('PerformanceObserver', PerformanceObserverImpl); def('ReportingObserver', PerformanceObserverImpl);
  def('DOMRect', DOMRectImpl); def('DOMRectReadOnly', DOMRectImpl); def('CSSStyleSheet', CSSStyleSheetImpl); def('StyleSheet', CSSStyleSheetImpl); def('MessageChannel', MessageChannelImpl); def('WebSocket', WebSocketImpl); def('EventSource', EventSourceImpl); def('BroadcastChannel', BroadcastChannelImpl); def('CustomElementRegistry', CustomElementRegistryImpl);
  def('Worker', class Worker { constructor() { throw new DOMExceptionImpl('Workers are not supported', 'NotSupportedError'); } }); def('SharedWorker', g.Worker);
  def('Notification', { permission: 'denied', requestPermission() { return Promise.resolve('denied'); } });
  def('DOMParser', class DOMParser { parseFromString(s, type) { const d = new DocumentImpl(); d._url = R.location.href; new R.Parser(d).parse(String(s)); return d; } });
  def('XMLSerializer', class XMLSerializer { serializeToString(n) { return n.outerHTML; } });
  def('Image', function Image(w, h) { const el = R.document.createElement('img'); if (w !== undefined) el.setAttribute('width', w); if (h !== undefined) el.setAttribute('height', h); return el; });
  def('Audio', function Audio(src) { const el = R.document.createElement('audio'); if (src !== undefined) el.setAttribute('src', src); return el; });
  def('Option', function Option(text, value, defSel, sel) { const el = R.document.createElement('option'); if (text !== undefined) el.textContent = text; if (value !== undefined) el.setAttribute('value', value); if (defSel) el.setAttribute('selected', ''); if (sel) el._selected = true; return el; });
  def('NodeList', Array); def('HTMLCollection', Array); def('NamedNodeMap', Array); def('DOMTokenList', Object); def('CSSStyleDeclaration', Object); def('MediaQueryList', Object); def('DOMStringMap', Object); def('DataTransfer', class DataTransfer { constructor() { this.items = []; this.files = []; this.types = []; this.dropEffect = 'none'; this.effectAllowed = 'all'; this._d = {}; } setData(k, v) { this._d[k] = v; } getData(k) { return this._d[k] || ''; } clearData() { this._d = {}; } setDragImage() {} });
  def('NodeFilter', { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ALL: 0xffffffff, SHOW_ELEMENT: 1, SHOW_ATTRIBUTE: 2, SHOW_TEXT: 4, SHOW_COMMENT: 128, SHOW_DOCUMENT: 256, SHOW_DOCUMENT_FRAGMENT: 1024 });
  def('Attr', class Attr {}); def('Window', function Window() {}); def('Navigator', function Navigator() {}); def('Screen', function Screen() {}); def('Selection', function Selection() {}); def('MutationRecord', function MutationRecord() {}); def('ImageData', class ImageData { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } }); def('Path2D', class Path2D { addPath() {} moveTo() {} lineTo() {} closePath() {} arc() {} rect() {} }); def('OffscreenCanvas', class OffscreenCanvas { constructor(w, h) { this.width = w; this.height = h; } getContext() { return null; } convertToBlob() { return Promise.resolve(new BlobImpl([])); } }); def('DOMMatrix', class DOMMatrix { constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; this.is2D = true; this.isIdentity = true; } multiply() { return this; } translate() { return this; } scale() { return this; } inverse() { return this; } transformPoint(p) { return p; } toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; } }); def('DOMMatrixReadOnly', g.DOMMatrix); def('DOMPoint', class DOMPoint { constructor(x, y) { this.x = x || 0; this.y = y || 0; this.z = 0; this.w = 1; } }); def('TextTrack', function TextTrack() {}); def('MediaSource', undefined); def('AudioContext', undefined); def('webkitAudioContext', undefined); def('RTCPeerConnection', undefined); def('SpeechSynthesisUtterance', undefined); def('speechSynthesis', undefined); def('indexedDB', undefined); def('caches', undefined); def('applicationCache', undefined); def('external', { AddSearchProvider() {} }); def('chrome', undefined);
  def('Intl', g.Intl || { DateTimeFormat: class DateTimeFormat { constructor(l, o) { this.o = o || {}; } format(d) { return new Date(d === undefined ? vnow() : d).toISOString().slice(0, this.o.timeStyle || this.o.hour ? 19 : 10); } formatToParts(d) { return [{ type: 'literal', value: this.format(d) }]; } resolvedOptions() { return { locale: 'en-US', timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn' }; } static supportedLocalesOf() { return ['en-US']; } }, NumberFormat: class NumberFormat { constructor(l, o) { this.o = o || {}; } format(n) { return this.o.style === 'currency' ? (this.o.currency || '$') + ' ' + Number(n).toFixed(2) : String(n); } formatToParts(n) { return [{ type: 'integer', value: this.format(n) }]; } resolvedOptions() { return { locale: 'en-US' }; } static supportedLocalesOf() { return ['en-US']; } }, Collator: class Collator { compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; } resolvedOptions() { return { locale: 'en-US' }; } }, PluralRules: class PluralRules { select(n) { return n === 1 ? 'one' : 'other'; } resolvedOptions() { return { locale: 'en-US' }; } }, RelativeTimeFormat: class RelativeTimeFormat { format(v, u) { return v + ' ' + u; } resolvedOptions() { return { locale: 'en-US' }; } }, ListFormat: class ListFormat { format(l) { return Array.from(l).join(', '); } }, Segmenter: class Segmenter { segment(s) { return Array.from(s).map((c, i) => ({ segment: c, index: i })); } }, DisplayNames: class DisplayNames { of(c) { return c; } }, Locale: class Locale { constructor(t) { this.baseName = t; this.language = String(t).split('-')[0]; } toString() { return this.baseName; } }, getCanonicalLocales(l) { return [].concat(l || []); }, supportedValuesOf() { return []; } });
  // Node & element classes
  for (const [k, v] of Object.entries(R.classes)) def(k, v);
  for (const [k, v] of Object.entries(R.eventClasses)) def(k, v);
  def('HTMLElement', new Proxy(HTMLElementImpl, { construct(target, args, newTarget) { if (R._constructing) { const el = R._constructing; R._constructing = null; try { Object.setPrototypeOf(el, newTarget.prototype); } catch (e) {} return el; } const name = R.customElements.getName(newTarget); const el = R.document._createElementRaw(name || 'div'); try { Object.setPrototypeOf(el, newTarget.prototype); } catch (e) {} return el; } }));
  // Date & Math.random are deterministic
  const NativeDate = Date;
  const DateProxy = new Proxy(NativeDate, { construct(t, args, nt) { if (args.length === 0) return new NativeDate(vnow()); return Reflect.construct(t, args, nt); }, apply() { return new NativeDate(vnow()).toString(); }, get(t, k) { if (k === 'now') return () => vnow(); return Reflect.get(t, k); } });
  def('Date', DateProxy);
  Math.random = random;
  Object.defineProperty(g, 'event', { get() { return undefined; }, configurable: true });
  R.installHandlerProps(g);
  def('Event', EventImpl); def('EventTarget', EventTargetImpl);
  def('name', '');
}
installGlobals();

// ------------------------------------------------------------ __browser
const parseOpts = j => (j ? JSON.parse(j) : {});
// every entry point returns a JSON string; failures become {ok:false, error}
const guard = (fn, withStack) => (...args) => { try { return JSON.stringify(fn(...args)); } catch (e) { return JSON.stringify({ ok: false, error: (withStack && e && e.stack) || (e && e.message) || String(e) }); } };
const rootOf = o => { const r = o.ref ? getRef(o.ref) : (o.selector ? R.document.querySelector(o.selector) : null); if ((o.ref || o.selector) && !r) throw new Error('No element matches'); return r; };
const api = {
  version: '0.2.0',
  load: guard((html, url, optsJSON) => { const r = loadPage(html, url, parseOpts(optsJSON)); return Object.assign(buildResult(), r); }, true),
  // 1 while timers still have work within the virtual-time budget, else 0
  tick(n) { try { return tick(n) ? 1 : 0; } catch (e) { return 0; } },
  result: guard(snapJSON => { const o = snapJSON ? JSON.parse(snapJSON) : null; const extra = {}; if (o !== null && o !== false) Object.assign(extra, takeSnapshot(o || {})); return buildResult(extra); }, true),
  act: guard(actionJSON => { R.pendingNavigation = null; R.cookieSets = []; R.console = []; R.dialogs = []; const r = performAction(JSON.parse(actionJSON)); return Object.assign({ ok: !r.error }, r, { navigate: R.pendingNavigation || undefined }); }),
  snapshot: guard(o => takeSnapshot(parseOpts(o))),
  text: guard(optsJSON => { const o = parseOpts(optsJSON); const root = rootOf(o) || R.document.body || R.document; return { text: readableText(root, o), title: R.document.title, url: R.location.href }; }),
  html: guard(optsJSON => { const o = parseOpts(optsJSON); const root = rootOf(o) || (o.clean ? (R.document.body || R.document.documentElement) : R.document.documentElement); return { html: o.clean ? cleanHtml(root) : root.outerHTML }; }),
  find: guard((query, optsJSON) => findText(query, parseOpts(optsJSON))),
  links: guard(o => listLinks(parseOpts(o))),
  metadata: guard(() => pageMetadata()),
  // UTF-8 byte length of a string: lets the host read a result with one memread
  bytes(s) { s = String(s); let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { n += 4; i++; } else n += 3; } return n; },
};
Object.defineProperty(globalThis, '__browser', { value: api, writable: false, configurable: false, enumerable: false });
})();

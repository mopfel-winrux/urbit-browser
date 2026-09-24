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

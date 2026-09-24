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
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i >= 0 && i + 1 < p.childNodes.length ? p.childNodes[i + 1] : null; }
  get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; }
  get isConnected() { let n = this; while (n) { if (n.nodeType === 9) return true; n = n._host || n.parentNode; } return false; }
  get baseURI() { return R.location ? R.location.href : ''; }
  get nodeValue() { return null; } set nodeValue(v) {}
  get textContent() { let s = ''; for (const c of this.childNodes) { if (c.nodeType === 1 || c.nodeType === 11) s += c.textContent; else if (c.nodeType === 3) s += c.data; } return s; }
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
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
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
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  get previousElementSibling() { let n = this.previousSibling; while (n && n.nodeType !== 1) n = n.previousSibling; return n; }
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
class DocumentFragmentImpl extends NodeImpl {
  constructor(doc) { super(doc); this.nodeType = 11; this.nodeName = '#document-fragment'; }
  _cloneShallow() { return new DocumentFragmentImpl(this.ownerDocument); }
  get children() { return this.childNodes.filter(c => c.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  querySelector(s) { return R.querySelector(this, s); } querySelectorAll(s) { return R.querySelectorAll(this, s); }
  getElementById(id) { return findFirst(this, e => e._attrs.id === id); }
  get outerHTML() { return this.innerHTML; }
  get innerHTML() { return this.childNodes.map(c => c.outerHTML).join(''); }
  set innerHTML(v) { this._clearChildren(); R.parseFragmentInto(String(v), this, null); }
}
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
    if (n === 'id' || n === 'name') this.ownerDocument && this.ownerDocument._invalidateIds && this.ownerDocument._invalidateIds();
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
  get part() { return makeClassList({ _attrs: { class: this._attrs.part || '' }, setAttribute: (k, v) => this.setAttribute('part', v) }); }
  get prefix() { return null; }
  // tree accessors
  get children() { return this.childNodes.filter(c => c.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  get previousElementSibling() { let n = this.previousSibling; while (n && n.nodeType !== 1) n = n.previousSibling; return n; }
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
  // queries
  querySelector(s) { return R.querySelector(this, s); }
  querySelectorAll(s) { return R.querySelectorAll(this, s); }
  matches(s) { return R.matches(this, s); }
  webkitMatchesSelector(s) { return this.matches(s); }
  closest(s) { let n = this; while (n && n.nodeType === 1) { if (R.matches(n, s)) return n; n = n.parentNode; } return null; }
  getElementsByTagName(t) { t = String(t); const lower = t.toLowerCase(); return collect(this, e => t === '*' || e.localName === lower); }
  getElementsByTagNameNS(ns, t) { return this.getElementsByTagName(t); }
  getElementsByClassName(c) { const cs = String(c).split(/\s+/).filter(Boolean); return collect(this, e => { const l = (e._attrs.class || '').split(/\s+/); return cs.every(x => l.includes(x)); }); }
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
function walk(root, fn) { for (const c of root.childNodes) { if (fn(c) === false) return false; if (c.childNodes.length && walk(c, fn) === false) return false; } return true; }
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
R.walk = walk; R.collect = collect;

// -------------------------------------------------- HTML element classes
class HTMLElementImpl extends ElementImpl {}
class HTMLUnknownElementImpl extends HTMLElementImpl {}
class HTMLAnchorElementImpl extends HTMLElementImpl {
  get href() { const h = this._attrs.href; if (h === undefined) return ''; return R.resolveURL(h, R.base()) || h; } set href(v) { this.setAttribute('href', v); }
  get target() { return this._attrs.target || ''; } set target(v) { this.setAttribute('target', v); }
  get rel() { return this._attrs.rel || ''; } set rel(v) { this.setAttribute('rel', v); }
  get download() { return this._attrs.download || ''; }
  get text() { return this.textContent; } set text(v) { this.textContent = v; }
  get relList() { return makeClassList({ _attrs: { class: this._attrs.rel || '' }, setAttribute: (k, v) => this.setAttribute('rel', v) }); }
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
  get relList() { return makeClassList({ _attrs: { class: this._attrs.rel || '' }, setAttribute: (k, v) => this.setAttribute('rel', v) }); }
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
  get name() { return this._attrs.name || ''; } get sandbox() { return makeClassList({ _attrs: { class: this._attrs.sandbox || '' }, setAttribute: () => {} }); }
}
class HTMLTableElementImpl extends HTMLElementImpl {
  get rows() { return collect(this, e => e.localName === 'tr' && (e.parentNode === this || e.parentNode.parentNode === this)); }
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

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

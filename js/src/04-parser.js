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

class Parser {
  constructor(doc, opts) {
    this.doc = doc; this.opts = opts || {};
    this.fragment = !!this.opts.fragment;
    this.root = this.opts.root || doc;
    this.stack = [this.root];
    this.html = null; this.head = null; this.body = null;
    this.input = ''; this.pos = 0;
    this.scriptRunner = this.opts.scriptRunner || null;   // (scriptEl) => void, may call document.write
    this.deferred = []; this.scriptsSeen = 0;
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
    const inp = () => this.input;
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
        const m = /^<\/([a-zA-Z][^\s/>]*)\s*[^>]*>/.exec(s.slice(lt, lt + 200)) || /^<\/([a-zA-Z][^\s/>]*)/.exec(s.slice(lt, lt + 200));
        if (!m) { let end = s.indexOf('>', lt); if (end < 0) end = s.length; this.pos = end + 1; continue; }
        let end = s.indexOf('>', lt); if (end < 0) end = s.length;
        this.pos = end + 1; this.endTag(m[1].toLowerCase()); continue;
      }
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) { this.appendText('<'); this.pos = lt + 1; continue; }
      // start tag
      const tag = this.readStartTag(lt);
      if (!tag) { this.appendText('<'); this.pos = lt + 1; continue; }
      this.startTag(tag.name, tag.attrs, tag.selfClosing);
      // raw text / rcdata content
      const name = tag.name;
      if (this.current && this.current.localName === name && (RAW_TEXT_TAGS.has(name) || RCDATA_TAGS.has(name)) && this.current.namespaceURI !== SVG_NS) {
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
    this.scriptsSeen++;
    if (el._attrs.defer !== undefined || el._attrs.async !== undefined || el._attrs.type === 'module') { this.deferred.push(el); return; }
    if (el._attrs.src !== undefined) { this.deferred.length && this.deferred.some(d => d._attrs.async === undefined); }
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

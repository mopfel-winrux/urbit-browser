// ----------------------------------------------------------- Snapshot
// Renders the live DOM as an accessibility-flavoured outline. Interactive
// elements get short refs (e1, e2, ...) that actions refer back to.
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr', 'big', 'nobr', 'strike', 'acronym', 'output', 'meter', 'progress']);
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head', 'meta', 'link', 'title', 'base', 'map', 'param', 'source', 'track', 'datalist', 'colgroup', 'col', 'object', 'embed', 'math']);
const LANDMARKS = { nav: 'nav', main: 'main', header: 'header', footer: 'footer', aside: 'aside', form: 'form', dialog: 'dialog', details: 'details', fieldset: 'fieldset', article: 'article', section: 'section', search: 'search' };
const ROLE_MAP = { button: 'button', link: 'link', checkbox: 'checkbox', radio: 'radio', textbox: 'textbox', searchbox: 'textbox', combobox: 'combobox', listbox: 'combobox', menuitem: 'button', menuitemcheckbox: 'checkbox', menuitemradio: 'radio', tab: 'button', switch: 'checkbox', option: 'option', slider: 'slider', spinbutton: 'textbox', heading: 'heading', img: 'img', navigation: 'nav', main: 'main', banner: 'header', contentinfo: 'footer', complementary: 'aside', form: 'form', dialog: 'dialog', alertdialog: 'dialog', search: 'search', region: 'section', list: 'list', listitem: 'listitem', table: 'table', grid: 'table', row: 'row', cell: 'cell', gridcell: 'cell', columnheader: 'cell', rowheader: 'cell', presentation: 'none', none: 'none', tree: 'list', treeitem: 'listitem', menu: 'list', menubar: 'list', tablist: 'list', separator: 'separator', alert: 'alert', status: 'status', progressbar: 'progress' };
const ALIGN = { maxText: 400, maxLines: 6000, maxOptions: 25, maxHref: 160, maxDepth: 14 };
function collapse(s) { return s.replace(/[\s ]+/g, ' ').trim(); }
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
  renderChildren(node, ctx) { for (const c of node.childNodes.slice()) this.renderNode(c, ctx); if (node.shadowRoot) this.renderChildren(node.shadowRoot, ctx); }
  renderNode(n, ctx) {
    if (n.nodeType === 3) { ctx.buf += n.data; return; }
    if (n.nodeType !== 1) return;
    const ln = n.localName;
    if (ln === 'noscript' && !R.opts.js) { this.renderChildren(n, ctx); return; }
    if (SKIP_TAGS.has(ln) || !R.isVisible(n) || n._attrs['aria-hidden'] === 'true') return;
    if (ln === 'br') { ctx.buf += ' '; return; }
    if (ln === 'slot') { this.renderChildren(n, ctx); return; }
    if (ln === 'noscript') { if (!R.opts.js) this.renderChildren(n, ctx); return; }
    const role = roleOf(n);
    if (role === 'skip') return;
    if (role === 'inline' || role === 'none') { if (role === 'none' && BLOCK_TAGS.has(ln)) { this.flush(ctx); this.renderChildren(n, ctx); this.flush(ctx); } else this.renderChildren(n, ctx); return; }
    if (role === 'img') { const name = accessibleName(n); if (name) this.line(ctx, 'img ' + q(name)); else if (ctx.opts && ctx.opts.allImages) this.line(ctx, 'img'); return; }
    if (isInteractiveRole(role)) { this.interactive++; this.line(ctx, this.describe(n, role)); return; }
    if (role === 'heading') { this.flush(ctx); const lvl = n._attrs['aria-level'] || (ln[0] === 'h' ? ln[1] : '2'); const t = collapse(textWithAlts(n)); const inner = { depth: ctx.depth, buf: '', prefix: 'heading[' + lvl + '] ' }; this.renderInlineInteractive(n, inner, 'heading[' + lvl + '] '); return; }
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
    if (LANDMARKS[role] || role === 'nav' || role === 'main' || role === 'header' || role === 'footer' || role === 'aside' || role === 'form' || role === 'dialog' || role === 'details' || role === 'fieldset' || role === 'section' || role === 'article' || role === 'search') {
      // generic sections/articles without a name are flattened to keep depth low
      const name = accessibleName(n) || (role === 'details' ? collapse((n.children.find(c => c.localName === 'summary') || { textContent: '' }).textContent) : '') || (role === 'fieldset' ? collapse((n.children.find(c => c.localName === 'legend') || { textContent: '' }).textContent) : '') || (role === 'form' ? (n._attrs.name || n._attrs.id || '') : '');
      if ((role === 'section' || role === 'article') && !name) { this.flush(ctx); this.renderChildren(n, ctx); this.flush(ctx); return; }
      this.flush(ctx);
      let head = role + (name ? ' ' + q(name) : '');
      if (role === 'details') { head = 'details ' + this.ref(n.children.find(c => c.localName === 'summary') || n) + (name ? ' ' + q(name) : '') + (n.open ? ' (open)' : ' (closed)'); this.interactive++; }
      this.push(ctx.depth, head + ':');
      const inner = { depth: ctx.depth + 1, buf: '' };
      for (const c of n.childNodes.slice()) { if (role === 'details' && c.nodeType === 1 && c.localName === 'summary') continue; if (role === 'fieldset' && c.nodeType === 1 && c.localName === 'legend') continue; this.renderNode(c, inner); }
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
    const rows = R.collect(t, e => e.localName === 'tr' && e.closest('table') === t);
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
  let out = ''; let listDepth = 0;
  const nl = n => { if (out && !out.endsWith('\n')) out += '\n'; for (let i = 0; i < n - 1; i++) if (!out.endsWith('\n\n')) out += '\n'; };
  const rec = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { if (node.localName === 'pre') out += c.data; else out += c.data.replace(/[\s ]+/g, ' '); continue; }
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (ln === 'noscript' && !R.opts.js) { rec(c); continue; }
      if (SKIP_TAGS.has(ln) || ln === 'svg' || !R.isVisible(c) || c._attrs['aria-hidden'] === 'true') continue;
      if (ln === 'br') { out += '\n'; continue; }
      if (ln === 'img') { const alt = collapse(c._attrs.alt || ''); if (alt) out += '![' + alt + ']'; continue; }
      if (/^h[1-6]$/.test(ln)) { nl(2); out += '#'.repeat(+ln[1]) + ' '; rec(c); nl(2); continue; }
      if (ln === 'p' || ln === 'div' || ln === 'section' || ln === 'article' || ln === 'main' || ln === 'header' || ln === 'footer' || ln === 'nav' || ln === 'aside' || ln === 'form' || ln === 'fieldset' || ln === 'figure' || ln === 'figcaption' || ln === 'address' || ln === 'details' || ln === 'summary' || ln === 'dialog' || ln === 'dl' || ln === 'dt' || ln === 'dd' || ln === 'blockquote') { nl(ln === 'p' || ln === 'blockquote' ? 2 : 1); if (ln === 'blockquote') { const save = out.length; rec(c); out = out.slice(0, save) + out.slice(save).trim().split('\n').map(l => '> ' + l).join('\n'); } else rec(c); nl(ln === 'p' ? 2 : 1); continue; }
      if (ln === 'ul' || ln === 'ol' || ln === 'menu') { nl(1); listDepth++; let i = ln === 'ol' ? (parseInt(c._attrs.start, 10) || 1) : 0; for (const li of c.children) { if (li.localName !== 'li') { rec({ childNodes: [li] }); continue; } nl(1); out += '  '.repeat(listDepth - 1) + (ln === 'ol' ? (i++) + '. ' : '- '); rec(li); } listDepth--; nl(1); continue; }
      if (ln === 'li') { nl(1); out += '- '; rec(c); continue; }
      if (ln === 'pre') { nl(2); out += '```\n' + c.textContent.replace(/\s+$/, '') + '\n```'; nl(2); continue; }
      if (ln === 'code' && node.localName !== 'pre') { out += '`'; rec(c); out += '`'; continue; }
      if (ln === 'table') { nl(2); const rows = R.collect(c, e => e.localName === 'tr' && e.closest('table') === c); rows.forEach((r, ri) => { const cells = r.children.filter(x => x.localName === 'td' || x.localName === 'th'); out += '| ' + cells.map(x => collapse(readableText(x, opts)).replace(/\|/g, '\\|')).join(' | ') + ' |\n'; if (ri === 0 && cells.length) out += '|' + cells.map(() => ' --- ').join('|') + '|\n'; }); nl(2); continue; }
      if (ln === 'hr') { nl(2); out += '---'; nl(2); continue; }
      if (ln === 'a' && 'href' in c._attrs && opts.links !== false) { const h = c.href; const save = out.length; rec(c); const t = collapse(out.slice(save)); out = out.slice(0, save) + (t ? '[' + t + '](' + clip(h, ALIGN.maxHref) + ')' : ''); continue; }
      if (ln === 'strong' || ln === 'b') { out += '**'; rec(c); out += '**'; continue; }
      if (ln === 'em' || ln === 'i') { out += '_'; rec(c); out += '_'; continue; }
      if (ln === 'input') { const t = c.type; if (t === 'hidden') continue; if (t === 'submit' || t === 'button') { out += '[' + (c.value || 'Submit') + ']'; continue; } if (t === 'checkbox' || t === 'radio') { out += c.checked ? '[x] ' : '[ ] '; continue; } out += '[' + (c.value || c.placeholder || c.name || 'input') + ']'; continue; }
      if (ln === 'button') { out += '['; rec(c); out += ']'; continue; }
      if (ln === 'select') { out += '[' + (c.selectedOptions.map(o => o.text).join(', ') || c.name || 'select') + ']'; continue; }
      if (ln === 'textarea') { out += '[' + collapse(c.value || c.placeholder || '') + ']'; continue; }
      if (ln === 'tr' || ln === 'td' || ln === 'th' || ln === 'thead' || ln === 'tbody' || ln === 'tfoot') { rec(c); if (ln === 'tr') nl(1); else out += ' '; continue; }
      const block = BLOCK_TAGS.has(ln);
      if (block) nl(1);
      rec(c);
      if (block) nl(1);
    }
  };
  rec(root);
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
  const fields = form.elements.filter(e => e.localName === 'input' && R.isTextInput(e));
  if (fields.length <= 1 || true) R.submitForm(form, null, true);
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
  return { more: !!(r.pending && r.ran > 0 && budgetLeft && !R.pendingNavigation) && R.timers.some(t => t.at <= R.opts.maxVirtualMs), ran: r.ran, timers: R.timers.length, navigate: !!R.pendingNavigation, vtime: R.clock.now };
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
    while (!found) { const r = R.runTimerBatch(50, Math.max(0, target - R.clock.now)); ran += r.ran; if (a.selector || a.text) found = satisfied(); if (found || !r.pending || r.navigate || R.clock.now >= target || (r.ran === 0 && !r.pending)) break; if (r.ran === 0) { R.clock.now = Math.min(target, R.clock.now + Math.min(r.next || ms, target - R.clock.now)); if (R.clock.now >= target) break; } }
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
  const text = doc.body ? doc.body.textContent : '';
  out.wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  out.headings = doc.querySelectorAll('h1,h2,h3').filter(h => R.isVisible(h)).slice(0, 30).map(h => h.localName + ': ' + clip(collapse(h.textContent), 120));
  out.links = doc.links.length; out.forms = doc.forms.length; out.images = doc.images.length; out.scripts = doc.scripts.length;
  out.feeds = doc.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"]').map(l => R.resolveURL(l.getAttribute('href') || '', R.base())).filter(Boolean);
  return out;
}
const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'title', 'name', 'value', 'type', 'placeholder', 'action', 'method', 'for', 'aria-label', 'role', 'colspan', 'rowspan', 'datetime', 'checked', 'selected', 'disabled', 'label', 'lang', 'cite', 'start']);
function cleanHtml(root) {
  const clone = root.cloneNode(true);
  const strip = n => {
    for (const c of n.childNodes.slice()) {
      if (c.nodeType === 8) { n.removeChild(c); continue; }
      if (c.nodeType === 3) { if (n.localName !== 'pre' && n.localName !== 'textarea') { c.data = c.data.replace(/[\s\u00a0]+/g, ' '); if (!c.data.trim() && (!c.previousSibling || !c.nextSibling)) { n.removeChild(c); continue; } } continue; }
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (SKIP_TAGS.has(ln) || ln === 'svg' || ln === 'canvas' || ln === 'iframe' || ln === 'video' || ln === 'audio' || ln === 'input' && c.type === 'hidden') { n.removeChild(c); continue; }
      const orig = c._cleanSource;
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
  const pairs = []; const a = [], b = []; R.walk(root, e => { if (e.nodeType === 1) a.push(e); }); R.walk(clone, e => { if (e.nodeType === 1) b.push(e); });
  for (let i = 0; i < a.length && i < b.length; i++) if (hidden.has(a[i])) pairs.push(b[i]);
  for (const e of pairs) if (e.parentNode) e.parentNode.removeChild(e);
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
    if (!R.opts.css || !R.document || !R.document._isMain || !c.isConnected) return;
    if (c.nodeType === 3 && p.nodeType === 1 && p.localName === 'style' && !R.document._parser) { R.loadStyleElement(p); return; }
    if (c.nodeType !== 1) return;
    if (c.localName === 'style' || c.localName === 'link') styleArrived(c);
    else if (c.childNodes.length) R.walk(c, n => { if (n.nodeType === 1 && (n.localName === 'style' || n.localName === 'link')) styleArrived(n); });
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
const api = {
  version: '0.1.0',
  load(html, url, optsJSON) { try { const opts = optsJSON ? JSON.parse(optsJSON) : {}; const r = loadPage(html, url, opts); return JSON.stringify(Object.assign(buildResult(), r)); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.stack) || String(e) }); } },
  tick(n) { try { return JSON.stringify(tick(n)); } catch (e) { return JSON.stringify({ more: false, error: (e && e.message) || String(e) }); } },
  result(snapJSON) { try { const o = snapJSON ? JSON.parse(snapJSON) : null; const extra = {}; if (o !== null && o !== false) Object.assign(extra, takeSnapshot(o || {})); return JSON.stringify(buildResult(extra)); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.stack) || String(e) }); } },
  act(actionJSON) { try { R.pendingNavigation = null; R.cookieSets = []; R.console = []; R.dialogs = []; const a = JSON.parse(actionJSON); const r = performAction(a); return JSON.stringify(Object.assign({ ok: !r.error }, r, { navigate: R.pendingNavigation || undefined })); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  snapshot(optsJSON) { try { return JSON.stringify(takeSnapshot(optsJSON ? JSON.parse(optsJSON) : {})); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  text(optsJSON) { try { const o = optsJSON ? JSON.parse(optsJSON) : {}; const root = o.ref ? getRef(o.ref) : (o.selector ? R.document.querySelector(o.selector) : (R.document.body || R.document)); if (!root) throw new Error('No element matches'); return JSON.stringify({ text: readableText(root, o), title: R.document.title, url: R.location.href }); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  html(optsJSON) { try { const o = optsJSON ? JSON.parse(optsJSON) : {}; const root = o.ref ? getRef(o.ref) : (o.selector ? R.document.querySelector(o.selector) : (o.clean ? (R.document.body || R.document.documentElement) : R.document.documentElement)); if (!root) throw new Error('No element matches'); return JSON.stringify({ html: o.clean ? cleanHtml(root) : root.outerHTML }); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  find(query, optsJSON) { try { return JSON.stringify(findText(query, optsJSON ? JSON.parse(optsJSON) : {})); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  links(optsJSON) { try { return JSON.stringify(listLinks(optsJSON ? JSON.parse(optsJSON) : {})); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  status() { return JSON.stringify(buildResult({ timers: R.timers.length })); },
  metadata() { try { return JSON.stringify(pageMetadata()); } catch (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e) }); } },
  // UTF-8 byte length of a string: lets the host read a result with one memread
  bytes(s) { s = String(s); let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { n += 4; i++; } else n += 3; } return n; },
};
Object.defineProperty(api, '_R', { value: R, enumerable: false });
Object.defineProperty(globalThis, '__browser', { value: api, writable: false, configurable: false, enumerable: false });
})();

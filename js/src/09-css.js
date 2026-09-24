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
    for (const ps of cp.pseudos) { if (ps.name === 'not' || ps.name === 'is' || ps.name === 'has') { let best = [0, 0, 0]; for (const inner of ps.arg || []) { const s = specificity(inner); if (s[0] > best[0] || (s[0] === best[0] && (s[1] > best[1] || (s[1] === best[1] && s[2] > best[2])))) best = s; } a += best[0]; b += best[1]; c += best[2]; } else if (ps.name === 'where') { /* zero */ } else if (ps.name.startsWith('::')) c++; else b++; }
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
function buildIndex() {
  const idx = new Map();
  for (const r of R.cssRules) { let l = idx.get(r.key); if (!l) { l = []; idx.set(r.key, l); } l.push(r); }
  for (const l of idx.values()) l.sort((x, y) => x.important !== y.important ? (x.important ? 1 : -1) : x.spec[0] - y.spec[0] || x.spec[1] - y.spec[1] || x.spec[2] - y.spec[2] || x.order - y.order);
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
    for (const k of keys) { const rules = R.cssIndex.get(k); if (!rules) continue; for (const r of rules) { if (r.prop !== prop) continue; if (winner && (winner.important && !r.important)) continue; if (winner && !r.important && !winner.important && (winner.spec[0] > r.spec[0] || (winner.spec[0] === r.spec[0] && (winner.spec[1] > r.spec[1] || (winner.spec[1] === r.spec[1] && (winner.spec[2] > r.spec[2] || (winner.spec[2] === r.spec[2] && winner.order > r.order))))))) continue; if (winner && winner.important && r.important && (winner.spec[0] > r.spec[0] || (winner.spec[0] === r.spec[0] && (winner.spec[1] > r.spec[1] || (winner.spec[1] === r.spec[1] && (winner.spec[2] > r.spec[2] || (winner.spec[2] === r.spec[2] && winner.order > r.order))))))) continue; let hit = false; try { hit = matchComplex(el, r.parts, null); } catch (e) { hit = false; } if (hit) winner = r; } }
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

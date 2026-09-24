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

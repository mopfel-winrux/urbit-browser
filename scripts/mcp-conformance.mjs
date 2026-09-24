// End-to-end check against a running ship with %browser installed.
//
//   SHIP_URL=http://localhost:8093 SHIP_CODE=lidlut-tabwed-pillex-ridrup node scripts/mcp-conformance.mjs
//
// Serves scripts/fixtures on a loopback port, allows private hosts through a
// policy poke, then exercises the MCP endpoint the way the harness does:
// stateless POSTs with x-api-key, JSON responses.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.env.SHIP_URL || 'http://localhost:8093'
const code = process.env.SHIP_CODE
assert.ok(code, 'set SHIP_CODE to the ship\'s +code')
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const verbose = !!process.env.VERBOSE

// --- fixture server ------------------------------------------------------
const hits = []
const server = createServer((req, res) => {
  hits.push({ method: req.method, url: req.url, cookie: req.headers.cookie || '' })
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/redirect') { res.writeHead(302, { location: '/basic.html', 'set-cookie': 'hop=1; Path=/' }); res.end(); return }
  if (u.pathname === '/search') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><head><title>Results</title></head><body><h1>Results for ${u.searchParams.get('q')}</h1><p>cookie: ${req.headers.cookie || 'none'}</p><a href="/basic.html">back</a></body></html>`); return }
  if (u.pathname === '/login' && req.method === 'POST') {
    let body = ''; req.on('data', d => { body += d }); req.on('end', () => { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'session=xyz; Path=/; HttpOnly' }); res.end(`<html><head><title>Welcome</title></head><body><h1>Logged in</h1><pre id="body">${body}</pre></body></html>`) }); return
  }
  if (u.pathname === '/whoami') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('cookie=' + (req.headers.cookie || 'none') + ' ua=' + (req.headers['user-agent'] || '') + ' lang=' + (req.headers['accept-language'] || '')); return }
  if (u.pathname === '/upload' && req.method === 'POST') { let body = ''; req.on('data', d => { body += d }); req.on('end', () => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><head><title>Uploaded</title></head><body><pre id="ct">${req.headers['content-type']}</pre><pre id="body">${body.replace(/</g, '&lt;')}</pre></body></html>`) }); return }
  if (u.pathname === '/report.csv') { res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="report.csv"' }); res.end('a,b\n1,2\n'); return }
  if (u.pathname === '/blob.bin') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(Buffer.from([0, 1, 2, 3, 255])); return }
  if (u.pathname === '/secret') { if (req.headers.authorization === 'Basic ' + Buffer.from('agent:pw123').toString('base64')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><head><title>Secret</title></head><body><h1>authorized</h1></body></html>') } else { res.writeHead(401, { 'www-authenticate': 'Basic realm="x"', 'content-type': 'text/plain' }); res.end('auth required') } return }
  if (u.pathname === '/latin1') { res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' }); res.end(Buffer.from('<html><head><title>Latin</title></head><body><p>caf\xe9 na\xefve</p></body></html>', 'latin1')); return }
  if (u.pathname === '/data.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(readFileSync(join(fixtures, 'data.json'))); return }
  const file = join(fixtures, u.pathname.replace(/^\//, ''))
  if (!existsSync(file)) { res.writeHead(404); res.end('nope'); return }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

// --- ship session --------------------------------------------------------
const login = await fetch(`${base}/~/login`, { method: 'POST', body: `password=${code}`, redirect: 'manual' })
const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
assert.ok(cookie.startsWith('urbauth'), 'login failed')
const ship = (await (await fetch(`${base}/~/name`, { headers: { cookie } })).text()).trim().replace(/^"|"$/g, '').slice(1)
const key = await (await fetch(`${base}/~/scry/browser/key.json`, { headers: { cookie } })).json()
assert.ok(typeof key === 'string' && key.startsWith('0v'), 'no api key: ' + JSON.stringify(key))

async function poke(json) {
  const channel = `${base}/~/channel/${Date.now()}-conformance`
  const r = await fetch(channel, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify([{ id: 1, action: 'poke', ship, app: 'browser', mark: 'browser-action', json }]) })
  assert.ok(r.ok, 'poke failed ' + r.status)
  await fetch(channel, { method: 'DELETE', headers: { cookie } }).catch(() => {})
}
const policy = {
  'set-policy': {
    allow: [], deny: [], 'block-private': false, 'block-hosts': ['blocked.invalid'], 'block-kinds': ['beacon'],
    'max-body': 1048576, 'max-redirects': 10, js: true, css: true, 'js-gap': 20,
    'max-script-bytes': 524288, 'max-css-bytes': 524288, 'max-subrequests': 40,
    'cache-scripts': true, 'cache-ttl': 3600, 'max-cache': 8388608, 'max-files': 8388608, 'max-record': 200,
    'page-bytes': 5000, 'max-contexts': 16, 'max-live': 4,
    'idle-expiry': 21600, timeout: 120, 'user-agent': 'UrbitBrowser/0.2 conformance', 'accept-language': 'en',
  },
}
await poke(policy)

// --- MCP client (harness-shaped) -----------------------------------------
let rpcId = 0
async function rpc(method, params) {
  const t0 = Date.now()
  const r = await fetch(`${base}/browser/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-api-key': key }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) })
  const text = await r.text()
  let j; try { j = JSON.parse(text) } catch (e) { throw new Error(`non-JSON response (${r.status}): ${text.slice(0, 300)}`) }
  if (verbose) console.log(`-- ${method} ${JSON.stringify(params || {})} (${Date.now() - t0} ms)\n${(j.result && j.result.content && j.result.content[0].text) || JSON.stringify(j)}`)
  return { status: r.status, json: j, ms: Date.now() - t0 }
}
async function call(name, args) {
  const { json } = await rpc('tools/call', { name, arguments: args })
  assert.ok(json.result, 'rpc error: ' + JSON.stringify(json))
  const text = json.result.content[0].text
  return { text, isError: json.result.isError, ref: (label) => { const m = new RegExp('(e\\d+) [^\\n]*' + label).exec(text); assert.ok(m, `no ref for ${label} in:\n${text}`); return m[1] } }
}

try {
  // start from clean contexts (state persists on the ship between runs)
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']) await rpc('tools/call', { name: 'browser_contexts', arguments: { action: 'close', context: c } })
  // auth
  const unauth = await fetch(`${base}/browser/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(unauth.status, 401)
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'conformance', version: '0' } })
  assert.equal(init.json.result.serverInfo.name, `~${ship} browser`)
  const list = await rpc('tools/list', {})
  const names = list.json.result.tools.map(t => t.name)
  assert.ok(names.includes('browser_navigate') && names.includes('browser_click'), names.join(','))
  console.log(`PASS auth, initialize, tools/list (${names.length} tools)`)

  // static page + redirect + cookies
  const nav = await call('browser_navigate', { url: `${origin}/redirect`, context: 'c1' })
  assert.ok(!nav.isError, nav.text)
  assert.match(nav.text, /Page: Basic fixture/)
  assert.match(nav.text, /1 redirects/)
  assert.match(nav.text, /heading\[1\] "Welcome to the fixture"/)
  assert.match(nav.text, /textbox e\d+ "Search" name=q/)
  console.log(`PASS navigate: redirect followed, outline rendered (${nav.text.length} bytes)`)

  // type + submit -> GET navigation carrying the redirect's cookie
  const q = nav.ref('"Search"')
  const search = await call('browser_type', { ref: q, text: 'urbit', submit: true, context: 'c1' })
  assert.ok(!search.isError, search.text)
  assert.match(search.text, /Page: Results/)
  assert.match(search.text, /heading\[1\] "Results for urbit"/)
  assert.match(search.text, /cookie: hop=1/)
  console.log('PASS type+submit: form GET navigation with cookie jar')

  // click a link back
  const back = await call('browser_click', { ref: search.ref('"back"'), context: 'c1' })
  assert.match(back.text, /Page: Basic fixture/)
  const hist = await call('browser_back', { context: 'c1' })
  assert.match(hist.text, /Page: Results/)
  console.log('PASS click link, browser_back')

  // text extraction, find, links
  const text = await call('browser_text', { context: 'c1', page: 1 })
  assert.match(text.text, /# Results for urbit/)
  const found = await call('browser_find', { query: 'back', context: 'c1' })
  assert.match(found.text, /1 matching lines/)
  const links = await call('browser_links', { context: 'c1' })
  assert.match(links.text, /basic\.html/)
  console.log('PASS text, find, links')

  // JS page: scripts, fetch through the ship, timers, DOM events, storage
  const spa = await call('browser_navigate', { url: `${origin}/spa.html`, context: 'c2' })
  assert.ok(!spa.isError, spa.text)
  assert.match(spa.text, /heading\[2\] "Rendered by script"/)
  assert.match(spa.text, /text "fetched: 2 rows"/)
  assert.match(spa.text, /text "timer fired"/)
  assert.ok(hits.some(h => h.url === '/app.js') && hits.some(h => h.url === '/data.json'), 'subresources fetched via Iris')
  const inc = await call('browser_click', { ref: spa.ref('"Increment"'), context: 'c2' })
  assert.match(inc.text, /text "count: 1"/)
  const ev = await call('browser_eval', { code: 'document.title + "|" + localStorage.getItem("visits")', context: 'c2' })
  assert.equal(ev.text, JSON.stringify('SPA fixture|1'))
  const who = await call('browser_navigate', { url: `${origin}/whoami`, context: 'c2' })
  assert.match(who.text, /cookie=visited=1/)
  console.log('PASS JavaScript page: external script, fetch, timers, click handler, eval, document.cookie persisted')

  // POST form
  const form = await call('browser_navigate', { url: `${origin}/form.html`, context: 'c3' })
  await call('browser_type', { ref: form.ref('"Email"'), text: 'a@b.c', context: 'c3' })
  await call('browser_click', { ref: form.ref('"Admin"'), context: 'c3' })
  const login2 = await call('browser_type', { ref: form.ref('"Password"'), text: 'pw', submit: true, context: 'c3' })
  assert.match(login2.text, /Page: Welcome/)
  assert.match(login2.text, /email=a%40b.c&password=pw&role=admin&remember=on&csrf=&go=Sign\+in/)
  const who2 = await call('browser_navigate', { url: `${origin}/whoami`, context: 'c3' })
  assert.match(who2.text, /session=xyz/)
  console.log('PASS POST form with HttpOnly Set-Cookie')

  // context isolation + management
  const who3 = await call('browser_navigate', { url: `${origin}/whoami`, context: 'c4' })
  assert.match(who3.text, /cookie=none/)
  const ctxs = await call('browser_contexts', {})
  assert.ok(JSON.parse(ctxs.text).some(c => c.id === 'c3'))
  await call('browser_contexts', { action: 'close', context: 'c4' })
  const errs = await call('browser_snapshot', { context: 'c4' })
  assert.ok(errs.isError)
  console.log('PASS contexts isolate cookies; close works')
  // metadata, clean html, wait-for, css cascade on ship
  const cssPage = await call('browser_navigate', { url: `${origin}/css.html`, context: 'c5' })
  assert.ok(!cssPage.isError, cssPage.text)
  assert.ok(!cssPage.text.includes('Hidden menu link') && cssPage.text.includes('Open menu link'), 'cascade applied on ship: ' + cssPage.text)
  assert.match(cssPage.text, /Description: A page for cascade tests/)
  const meta = await call('browser_metadata', { context: 'c5' })
  const mj = JSON.parse(meta.text); assert.equal(mj.og.title, 'CSS OG title'); assert.equal(mj.jsonld[0].headline, 'LD headline')
  const clean = await call('browser_html', { context: 'c5', clean: true })
  assert.ok(clean.text.includes('<a href=') && !clean.text.includes('<script') && !clean.text.includes('class='), clean.text)
  const up0 = await call('browser_navigate', { url: `${origin}/upload.html`, context: 'c5' })
  assert.ok(!up0.text.includes('appeared'))
  const waited = await call('browser_wait', { context: 'c5', ms: 15000, selector: '#late-p' })
  assert.match(waited.text, /condition met/); assert.match(waited.text, /text "appeared"/)
  console.log('PASS metadata, cleaned html, cascade, wait-for on ship')

  // upload -> multipart POST
  const upRef = up0.ref('"File"')
  const upl = await call('browser_upload', { context: 'c5', ref: upRef, name: 'notes.txt', content: 'hello file', type: 'text/plain' })
  assert.ok(!upl.isError, upl.text)
  const sent = await call('browser_submit', { context: 'c5' })
  assert.match(sent.text, /Page: Uploaded/)
  assert.match(sent.text, /multipart\/form-data; boundary=/)
  assert.match(sent.text, /filename=\\"notes.txt\\"|filename="notes.txt"/)
  assert.match(sent.text, /hello file/)
  console.log('PASS upload + multipart submit through Iris')

  // downloads: attachment and binary, files tool, file route
  const dl = await call('browser_navigate', { url: `${origin}/report.csv`, context: 'c6' })
  assert.match(dl.text, /Downloaded report\.csv \(text\/csv, 8 bytes\)/, dl.text)
  const bin = await call('browser_navigate', { url: `${origin}/blob.bin`, context: 'c6' })
  assert.match(bin.text, /Downloaded blob\.bin \(application\/octet-stream, 5 bytes\)/, bin.text)
  const flist = await call('browser_files', { context: 'c6' })
  assert.ok(flist.text.includes('report.csv') && flist.text.includes('blob.bin'), flist.text)
  const fread = await call('browser_files', { context: 'c6', action: 'read', name: 'report.csv' })
  assert.match(fread.text, /a,b\n1,2/)
  const raw = await fetch(`${base}/browser/files/c6/blob.bin`, { headers: { 'x-api-key': key } })
  assert.equal(raw.status, 200); assert.deepEqual([...new Uint8Array(await raw.arrayBuffer())], [0, 1, 2, 3, 255])
  const fdel = await call('browser_files', { context: 'c6', action: 'delete', name: 'blob.bin' })
  assert.match(fdel.text, /deleted blob\.bin/)
  console.log('PASS downloads: attachment, binary, files list/read/delete, file route')

  // stored credential: basic auth retry and form login; secrets never pass through MCP
  await poke({ 'set-credential': { origin: origin, username: 'agent', password: 'pw123' } })
  const secret = await call('browser_navigate', { url: `${origin}/secret`, context: 'c7' })
  assert.match(secret.text, /heading\[1\] "authorized"/, secret.text)
  await poke({ 'set-credential': { origin: origin, username: 'bob@x.y', password: 'hunter2' } })
  await call('browser_navigate', { url: `${origin}/form.html`, context: 'c7' })
  const loggedIn = await call('browser_login', { context: 'c7' })
  assert.match(loggedIn.text, /Page: Welcome/, loggedIn.text)
  assert.match(loggedIn.text, /email=bob%40x.y&password=hunter2/)
  const noCred = await call('browser_login', { context: 'c7', origin: 'https://nowhere.invalid' })
  assert.ok(noCred.isError && /no stored credential/.test(noCred.text))
  console.log('PASS credentials: basic auth challenge, form login, no secrets in tool args')

  // recording, export/import, device configuration, script cache, latin-1
  const log = await call('browser_log', { context: 'c7' })
  assert.ok(/response  200/.test(log.text) && /login/.test(log.text) && /navigate/.test(log.text), log.text)
  const exported = await call('browser_contexts', { action: 'export', context: 'c7' })
  const st = JSON.parse(exported.text); assert.ok(st.cookies.some(c => c.name === 'session'), exported.text)
  await call('browser_contexts', { action: 'import', context: 'c8', state: exported.text })
  const who8 = await call('browser_navigate', { url: `${origin}/whoami`, context: 'c8' })
  assert.match(who8.text, /session=xyz/, 'imported cookies are sent: ' + who8.text)
  const conf = await call('browser_contexts', { action: 'configure', context: 'c9', width: 400, height: 800, mobile: true, locale: 'fr-FR' })
  assert.match(conf.text, /configured c9/)
  const who9 = await call('browser_navigate', { url: `${origin}/whoami`, context: 'c9' })
  assert.match(who9.text, /ua=Mozilla\/5\.0 \(Linux; Android/); assert.match(who9.text, /lang=fr-FR,fr;q=0\.8/)
  const css9 = await call('browser_navigate', { url: `${origin}/css.html`, context: 'c9' })
  assert.ok(css9.text.includes('mobile text') && !css9.text.includes('desktop text'), 'mobile media queries on ship: ' + css9.text)
  const first = await call('browser_navigate', { url: `${origin}/spa.html`, context: 'c10' })
  const second = await call('browser_navigate', { url: `${origin}/spa.html`, context: 'c10' })
  assert.match(second.text, /text "fetched: 2 rows"/)
  const log10 = await call('browser_log', { context: 'c10' })
  assert.ok(/cached  script/.test(log10.text), 'second load served app.js from cache: ' + log10.text)
  const latin = await call('browser_navigate', { url: `${origin}/latin1`, context: 'c10' })
  assert.match(latin.text, /café naïve/)
  const view = await fetch(`${base}/browser/view/c7`, { headers: { cookie } })
  assert.equal(view.status, 200); assert.ok((await view.text()).includes('<pre>'))
  console.log('PASS log, export/import, device profile, script cache, latin-1 transcoding, viewer page')
  console.log('ALL PASS')
} finally {
  server.close()
}

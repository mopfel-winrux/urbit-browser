// Exercise desk/js/browser-runtime.js under Node with stubbed host functions.
// Usage: node scripts/runtime-check.mjs [fixture.html ...]
// With no arguments it runs the built-in assertions over scripts/fixtures.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = readFileSync(join(root, 'desk', 'js', 'browser-runtime.js'), 'utf8')
const fixtures = join(root, 'scripts', 'fixtures')

export function makePage({ fetch } = {}) {
  const requests = []
  const sandbox = {
    __host_fetch(url, method, headersJSON, body, kind) {
      requests.push({ url, method, headers: JSON.parse(headersJSON), body, kind })
      if (fetch) { const r = fetch(url, method, body); const body2 = r.body; delete r.body; return JSON.stringify(r) + '\n' + (body2 || '') }
      const u = new URL(url)
      const file = join(fixtures, u.pathname.replace(/^\//, ''))
      if (!existsSync(file)) return JSON.stringify({ status: 404, headers: {}, url }) + '\nnot found'
      return JSON.stringify({ status: 200, headers: { 'content-type': file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'text/plain' }, url }) + '\n' + readFileSync(file, 'utf8')
    },
    __host_log(level, text) { if (process.env.VERBOSE) console.error(`[page ${level}] ${text}`) },
  }
  const ctx = vm.createContext(sandbox)
  vm.runInContext(bundle, ctx, { filename: 'browser-runtime.js' })
  const api = ctx.__browser
  const call = (name, ...args) => JSON.parse(api[name](...args))
  return {
    requests,
    // Between ticks we yield to the event loop so promise jobs run, which is
    // what the ship does with QTS_ExecutePendingJob between engine steps.
    async settle() { let guard = 0; while (guard++ < 60) { await new Promise(r => setImmediate(r)); const more = api.tick(25); await new Promise(r => setImmediate(r)); if (!more) break } },
    async load(html, url, opts) {
      const r = call('load', html, url, JSON.stringify(opts || {}))
      if (!r.ok) throw new Error(r.error)
      await this.settle()
      return call('result', JSON.stringify({}))
    },
    async act(action) { const r = call('act', JSON.stringify(action)); await this.settle(); return { action: r, result: call('result', JSON.stringify({})) } },
    snapshot(o) { return call('snapshot', JSON.stringify(o || {})) },
    text(o) { return call('text', JSON.stringify(o || {})) },
    find(q) { return call('find', q, '{}') },
    links(o) { return call('links', JSON.stringify(o || {})) },
    eval(code) { return call('act', JSON.stringify({ type: 'eval', code })) },
    metadata() { return call('metadata') },
    html(o) { return call('html', JSON.stringify(o || {})) },
  }
}

const argv = process.argv.slice(2)
if (argv.length) {
  for (const f of argv) {
    const page = makePage()
    const r = await page.load(readFileSync(resolve(f), 'utf8'), 'http://fixtures.test/' + f.split('/').pop(), {})
    console.log(`== ${f}: ${r.title} (${r.interactive} interactive, ${r.lines.length} lines)`)
    console.log(r.lines.join('\n'))
    if (r.console) console.log('console:', r.console)
    console.log('stats:', r.stats)
  }
} else {
  const html = f => readFileSync(join(fixtures, f), 'utf8')
  // basic static page
  {
    const page = makePage()
    const r = await page.load(html('basic.html'), 'http://fixtures.test/basic.html')
    assert.equal(r.title, 'Basic fixture')
    const text = r.lines.join('\n')
    assert.match(text, /heading\[1\] "Welcome to the fixture"/)
    assert.match(text, /link e\d+ "Docs" -> http:\/\/fixtures\.test\/docs\/intro\.html/)
    assert.match(text, /textbox e\d+ "Search" name=q/)
    assert.match(text, /combobox e\d+ "Language" name=lang value="en" options\["en"="English", "fr"="Français"\]/)
    assert.match(text, /checkbox e\d+ "Remember me" \[ \]/)
    assert.match(text, /table "People" \(3 rows\):/)
    assert.match(text, /\| \*Name\* \| \*Age\* \|/)
    assert.match(text, /list \(3 items\):/)
    assert.ok(!text.includes('hidden text'), 'hidden content is skipped')
    assert.ok(!text.includes('ENTITY_TEST'), 'entities decoded: ' + text)
    assert.match(text, /text "Tom & Jerry ©"/)
    const t = page.text()
    assert.match(t.text, /\n# Welcome to the fixture\n/)
    assert.match(t.text, /\[Docs\]\(http:\/\/fixtures\.test\/docs\/intro\.html\)/)
    // form interaction: type + submit -> GET navigation with query
    const tb = r.lines.find(l => l.includes('textbox') && l.includes('name=q')).match(/e\d+/)[0]
    const a = await page.act({ type: 'type', ref: tb, text: 'hello world', submit: true })
    assert.equal(a.action.ok, true, JSON.stringify(a.action))
    assert.ok(a.action.navigate, 'submit navigates: ' + JSON.stringify(a.action))
    assert.equal(a.action.navigate.url, 'http://fixtures.test/search?q=hello+world&lang=en')
    // link click
    const link = r.lines.find(l => l.includes('"Docs"')).match(/e\d+/)[0]
    const c = await page.act({ type: 'click', ref: link })
    assert.equal(c.action.navigate.url, 'http://fixtures.test/docs/intro.html')
    // checkbox
    const cb = r.lines.find(l => l.includes('checkbox')).match(/e\d+/)[0]
    const k = await page.act({ type: 'check', ref: cb })
    assert.match(k.result.lines.join('\n'), /checkbox e\d+ "Remember me" \[x\]/)
    // select
    const sel = r.lines.find(l => l.includes('combobox')).match(/e\d+/)[0]
    const s = await page.act({ type: 'select', ref: sel, value: 'Français' })
    assert.match(s.result.lines.join('\n'), /value="fr"/)
    assert.deepEqual(page.find('Jerry').matches.length, 1)
    console.log('PASS basic.html: snapshot, text, type+submit, link click, checkbox, select, find')
  }
  // JS-driven page: inline scripts, external script, fetch, timers, DOM building, events, cookies, storage
  {
    const page = makePage()
    const r = await page.load(html('spa.html'), 'http://fixtures.test/spa.html', { cookies: [{ name: 'session', value: 'abc' }], localStorage: { theme: 'dark' } })
    assert.equal(r.stats.errors, 0, 'no script errors: ' + JSON.stringify(r.console))
    const text = r.lines.join('\n')
    assert.match(text, /heading\[2\] "Rendered by script"/)
    assert.match(text, /list \(3 items\):/)
    assert.match(text, /- text "apple"/)
    assert.match(text, /text "fetched: 2 rows"/, text)
    assert.match(text, /text "timer fired"/)
    assert.match(text, /text "cookie=abc theme=dark"/)
    assert.ok(page.requests.some(q => q.url === 'http://fixtures.test/data.json'), 'fetch went through host')
    assert.ok(page.requests.some(q => q.url === 'http://fixtures.test/app.js'), 'external script fetched')
    assert.deepEqual(r.cookies, ['visited=1; path=/'])
    assert.equal(r.localStorage.visits, '1')
    const btn = r.lines.find(l => l.includes('button') && l.includes('Increment')).match(/e\d+/)[0]
    const c = await page.act({ type: 'click', ref: btn })
    assert.match(c.result.lines.join('\n'), /text "count: 1"/)
    const c2 = await page.act({ type: 'click', ref: btn })
    assert.match(c2.result.lines.join('\n'), /text "count: 2"/)
    const ev = page.eval('document.querySelector("#count").textContent')
    assert.equal(ev.value, 'count: 2')
    const nav = await page.act({ type: 'click', ref: c2.result.lines.find(l => l.includes('"Go elsewhere"')).match(/e\d+/)[0] })
    assert.equal(nav.action.navigate.url, 'http://fixtures.test/elsewhere?x=1')
    console.log('PASS spa.html: scripts, fetch, timers, events, cookies, storage, eval, pushState-free navigation')
  }
  // POST form with implicit submission and multiple fields
  {
    const page = makePage()
    const r = await page.load(html('form.html'), 'http://fixtures.test/form.html')
    const text = r.lines.join('\n')
    assert.match(text, /form "login":/)
    assert.match(text, /textbox e\d+ "Email" name=email type=email/)
    assert.match(text, /textbox e\d+ "Password" name=password type=password/)
    assert.match(text, /radio e\d+ "Admin" \[ \] name=role value="admin"/)
    const email = text.match(/textbox (e\d+) "Email"/)[1]
    const pw = text.match(/textbox (e\d+) "Password"/)[1]
    await page.act({ type: 'type', ref: email, text: 'a@b.c' })
    const radio = text.match(/radio (e\d+) "Admin"/)[1]
    await page.act({ type: 'click', ref: radio })
    const a = await page.act({ type: 'type', ref: pw, text: 'secret', submit: true })
    assert.equal(a.action.navigate.method, 'POST')
    assert.equal(a.action.navigate.url, 'http://fixtures.test/login')
    assert.equal(a.action.navigate.body, 'email=a%40b.c&password=secret&role=admin&remember=on&csrf=&go=Sign+in')
    assert.equal(a.action.navigate.contentType, 'application/x-www-form-urlencoded')
    console.log('PASS form.html: POST body, radio, implicit submit')
  }
  // CSS cascade, base href, external + imported stylesheets, noscript, metadata, cleaned HTML
  {
    const page = makePage()
    const r = await page.load(html('css.html'), 'http://fixtures.test/css.html', { device: { width: 1280, height: 900 } })
    const text = r.lines.join('\n')
    assert.ok(!text.includes('Hidden menu link'), 'class-hidden nav is skipped: ' + text)
    assert.match(text, /link e\d+ "Open menu link" -> http:\/\/fixtures\.test\/sub\/dir\/open\.html/, 'base href applies: ' + text)
    assert.ok(!text.includes('invisible paragraph'), 'visibility:hidden by id')
    assert.match(text, /text "desktop text"/)
    assert.ok(!text.includes('mobile text'), 'media query at 1280px hides mobile-only')
    assert.ok(!text.includes('forced hidden'), '!important beats inline style')
    assert.ok(!text.includes('external stylesheet text'), 'linked stylesheet applied: ' + text)
    assert.ok(!text.includes('Relative link'), '@import stylesheet applied')
    assert.ok(!text.includes('noscript content'), 'noscript hidden when scripts run')
    assert.ok(page.requests.some(q => q.url === 'http://fixtures.test/site.css' && q.kind === 'stylesheet'), 'stylesheet fetched with kind')
    const ev = await page.eval('getComputedStyle(document.querySelector(".menu")).display + "," + getComputedStyle(document.querySelector("#late")).display')
    assert.equal(ev.value, 'none,none', 'computed style follows the cascade incl. dynamically inserted <style>')
    const t = await page.act({ type: 'click', ref: r.lines.find(l => l.includes('"Toggle"')).match(/e\d+/)[0] })
    assert.match(t.result.lines.join('\n'), /"Hidden menu link"/, 'class change re-evaluates visibility')
    const m = page.metadata()
    assert.equal(m.description, 'A page for cascade tests'); assert.equal(m.og.title, 'CSS OG title'); assert.equal(m.canonical, 'https://fixtures.test/canonical'); assert.equal(m.jsonld[0].headline, 'LD headline'); assert.equal(m.lang, 'en')
    const clean = page.html({ clean: true }).html
    assert.ok(!clean.includes('<script') && !clean.includes('style=') && !clean.includes('class=') && !clean.includes('invisible paragraph') && !clean.includes('mobile text'), clean)
    assert.match(clean, /<a href="http:\/\/fixtures\.test\/sub\/dir\/open\.html">Open menu link<\/a>/)
    const page2 = makePage()
    const r2 = await page2.load(html('css.html'), 'http://fixtures.test/css.html', { device: { width: 400, height: 800, mobile: true } })
    const text2 = r2.lines.join('\n')
    assert.match(text2, /text "mobile text"/); assert.ok(!text2.includes('desktop text'))
    const ua = await page2.eval('navigator.userAgent.includes("Mobile") + "," + navigator.maxTouchPoints + "," + innerWidth')
    assert.equal(ua.value, 'true,5,400')
    const page3 = makePage()
    const r3 = await page3.load(html('css.html'), 'http://fixtures.test/css.html', { options: { js: false } })
    assert.match(r3.lines.join('\n'), /text "noscript content"/)
    console.log('PASS css.html: cascade (class/id/media/!important/external/@import/dynamic), base href, noscript, device, metadata, cleaned html')
  }
  // ES modules
  {
    const page = makePage()
    const r = await page.load(html('module.html'), 'http://fixtures.test/module.html')
    assert.equal(r.stats.errors, 0, JSON.stringify(r.console))
    const ev = await page.eval('document.getElementById("out").textContent')
    assert.equal(ev.value, 'hello world|1|42|vendor|1.2|true')
    const text = r.lines.join('\n')
    assert.match(text, /text "dynamic:4"/, text)
    assert.match(text, /text "entry:hello Thing"/, text)
    console.log('PASS module.html: import/export forms, importmap, dynamic import, import.meta, module src')
  }
  // meta refresh, login, upload, wait-for, Tab, password masking
  {
    const page = makePage()
    const r = await page.load(html('refresh.html'), 'http://fixtures.test/refresh.html')
    assert.equal(r.navigate && r.navigate.url, 'http://fixtures.test/basic.html')
    await page.load(html('form.html'), 'http://fixtures.test/form.html')
    const login = await page.act({ type: 'login', username: 'bob@x.y', password: 'hunter2' })
    assert.ok(login.action.ok, JSON.stringify(login.action))
    assert.equal(login.action.navigate.body, 'email=bob%40x.y&password=hunter2&role=user&remember=on&csrf=&go=Sign+in')
    const f2 = await page.load(html('form.html'), 'http://fixtures.test/form.html')
    const pw = f2.lines.find(l => l.includes('textbox') && l.includes('"Password"')).match(/e\d+/)[0]
    const typed = await page.act({ type: 'type', ref: pw, text: 'secret' })
    assert.match(typed.result.lines.join('\n'), /textbox e\d+ "Password" name=password type=password value="••••••"/)
    const tab = await page.act({ type: 'press', key: 'Tab', ref: f2.lines.find(l => l.includes('textbox') && l.includes('"Email"')).match(/e\d+/)[0] })
    assert.match(tab.result.lines.join('\n'), /textbox e\d+ "Password" [^\n]*\(focused\)/)
    const u = await page.load(html('upload.html'), 'http://fixtures.test/upload.html')
    const fileRef = u.lines.find(l => l.trim().startsWith('file ')).match(/e\d+/)[0]
    const up = await page.act({ type: 'upload', ref: fileRef, files: [{ name: 'notes.txt', type: 'text/plain', content: 'hello file' }] })
    assert.ok(up.action.ok, JSON.stringify(up.action))
    const sub = await page.act({ type: 'submit' })
    assert.match(sub.action.navigate.contentType, /^multipart\/form-data; boundary=/)
    assert.match(sub.action.navigate.body, /filename="notes.txt"\r\nContent-Type: text\/plain\r\n\r\nhello file\r\n/)
    const u2 = await page.load(html('upload.html'), 'http://fixtures.test/upload.html', { options: { maxVirtualMs: 100 } })
    assert.ok(!u2.lines.join('\n').includes('appeared'))
    const w = await page.act({ type: 'wait', ms: 15000, selector: '#late-p' })
    assert.equal(w.action.found, true, JSON.stringify(w.action))
    assert.match(w.result.lines.join('\n'), /text "appeared"/)
    console.log('PASS refresh/login/upload/wait/Tab/password masking')
  }
  console.log('ALL PASS')
}

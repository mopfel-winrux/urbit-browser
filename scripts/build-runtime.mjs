// Concatenate js/src/*.js into desk/js/browser-runtime.js (a single classic
// script that QuickJS evaluates once per page).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'js', 'src')
const parts = readdirSync(srcDir).filter(f => f.endsWith('.js')).sort()
const out = parts.map(f => `// ==== ${f}\n` + readFileSync(join(srcDir, f), 'utf8')).join('\n')
mkdirSync(join(root, 'desk', 'js'), { recursive: true })
writeFileSync(join(root, 'desk', 'js', 'browser-runtime.js'), out)
console.log(`built desk/js/browser-runtime.js from ${parts.length} parts, ${out.length} bytes`)

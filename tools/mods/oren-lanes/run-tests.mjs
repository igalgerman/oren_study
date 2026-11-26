// Runs the panel tests (hooks/*.test.tsx) with plain Node 22, no install (#151, #152).
// 'claude-code/testing' only exists inside the mod harness, so it is stubbed here with a tiny test/expect.
// Type-only TypeScript is stripped with Node's built-in stripTypeScriptTypes. Run: node tools/mods/oren-lanes/run-tests.mjs
import { register } from 'node:module'
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual, inspect } from 'node:util'
import path from 'node:path'

const tests = []
globalThis.__orenTesting = {
  test: (name, fn) => tests.push([name, fn]),
  expect: actual => {
    const fail = msg => { throw new Error(msg) }
    const m = (not) => ({
      toBe: e => (Object.is(actual, e) !== not) || fail(`expected ${inspect(actual)} ${not ? 'not ' : ''}to be ${inspect(e)}`),
      toEqual: e => (isDeepStrictEqual(actual, e) !== not) || fail(`expected ${inspect(actual, { depth: 9 })} ${not ? 'not ' : ''}to equal ${inspect(e, { depth: 9 })}`),
      toMatch: e => ((typeof e === 'string' ? String(actual).includes(e) : e.test(String(actual))) !== not) || fail(`expected ${inspect(actual)} ${not ? 'not ' : ''}to match ${e}`),
    })
    return { ...m(false), not: m(true) }
  },
}

const hooks = `
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
export async function resolve(spec, ctx, next) {
  if (spec === 'claude-code/testing') return { url: 'data:text/javascript,const t=globalThis.__orenTesting;export const test=t.test,expect=t.expect', shortCircuit: true }
  if (spec.startsWith('.') && !/\\.[cm]?[jt]sx?$/.test(spec)) {
    for (const ext of ['.ts', '.tsx']) { try { return await next(spec + ext, ctx) } catch {} }
  }
  return next(spec, ctx)
}
export async function load(url, ctx, next) {
  if (/\\.tsx?$/.test(url)) return { format: 'module', source: stripTypeScriptTypes(await readFile(new URL(url), 'utf8')), shortCircuit: true }
  return next(url, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(hooks))

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'hooks')
for (const f of readdirSync(dir).filter(f => /\.test\.tsx?$/.test(f))) await import(pathToFileURL(path.join(dir, f)).href)

let failed = 0
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok', name) } catch (e) { failed++; console.log('FAIL', name, '\n ', e.message) }
}
console.log(`${tests.length - failed}/${tests.length} panel tests passed`)
if (failed || !tests.length) process.exit(1)

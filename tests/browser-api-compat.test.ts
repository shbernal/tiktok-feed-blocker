import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Gecko exposes `chrome.*` as callback-only and puts the promise-returning
// variants on `browser.*`. Awaiting a `chrome.*` call there yields `undefined`
// instead of a result, so the extension breaks silently on Firefox. Every call
// site has to stay callback-based.
const SOURCE_ROOT = resolve(process.cwd(), 'src')
const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const AWAITED_CHROME_CALL = /await\s+chrome\./

const collectSourceFiles = (directory: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath)
    }

    return SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))
      ? [entryPath]
      : []
  })
}

describe('browser api compatibility', () => {
  it('keeps every chrome.* call site callback-based', () => {
    const sourceFiles = collectSourceFiles(SOURCE_ROOT)
    const offenders = sourceFiles
      .filter(file => AWAITED_CHROME_CALL.test(readFileSync(file, 'utf8')))
      .map(file => relative(SOURCE_ROOT, file))

    expect(sourceFiles.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})

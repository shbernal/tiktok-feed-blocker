import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBlockingStyleFile } from '../src/content/blockingStyles'

// The manifest injects `src/content/blocking.css` at `document_start`, so the
// selector list exists in two places: the TypeScript table that builds the
// runtime sheet, and a static file the build cannot derive. This guard keeps
// them identical, so adding or removing a selector in `selectors.ts` cannot
// silently leave the document_start sheet blocking the old set.
const CSS_PATH = resolve(process.cwd(), 'src/content/blocking.css')

describe('document_start blocking stylesheet', () => {
  it('matches the stylesheet built from the selector table', () => {
    const expected = buildBlockingStyleFile()

    if (process.env.UPDATE_BLOCKING_CSS) {
      writeFileSync(CSS_PATH, expected)
    }

    expect(readFileSync(CSS_PATH, 'utf8')).toBe(expected)
  })
})

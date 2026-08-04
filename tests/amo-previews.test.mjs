import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BYTES,
  checkImageBytes,
  describePreviewDrift,
  imageContentType,
  parsePreviewManifest,
  planPreviewSync,
} from '../scripts/amo-previews.mjs'
import manifest from '../amo/previews.json' with { type: 'json' }

// This file is `.mjs` because the module under test is: the publish scripts are
// plain ESM run by node, not part of a TypeScript project reference. Vitest
// picks it up from the same default glob as the `.ts` suites.

const preview = (file, caption) => ({ file, caption: { 'en-US': caption } })

const valid = [
  preview('store/screenshots/a.png', 'first'),
  preview('store/screenshots/b.png', 'second'),
]

describe('imageContentType', () => {
  it('maps the formats AMO accepts', () => {
    expect(imageContentType('a.png')).toBe('image/png')
    expect(imageContentType('a.jpg')).toBe('image/jpeg')
    expect(imageContentType('a.JPEG')).toBe('image/jpeg')
  })

  it('rejects anything else', () => {
    expect(() => imageContentType('a.gif')).toThrow(/PNG or JPEG/)
    expect(() => imageContentType('a')).toThrow(/PNG or JPEG/)
  })
})

describe('checkImageBytes', () => {
  it('accepts a file at the limit', () => {
    expect(() => checkImageBytes('a.png', MAX_IMAGE_BYTES)).not.toThrow()
  })

  it('rejects a file over the limit', () => {
    expect(() => checkImageBytes('a.png', MAX_IMAGE_BYTES + 1)).toThrow(
      /over 4MB/,
    )
  })
})

describe('parsePreviewManifest', () => {
  it('keeps the file order it was given', () => {
    expect(parsePreviewManifest(valid).map(entry => entry.file)).toEqual([
      'store/screenshots/a.png',
      'store/screenshots/b.png',
    ])
  })

  it('rejects a manifest that is not an array', () => {
    expect(() => parsePreviewManifest({})).toThrow(/must be an array/)
  })

  it('rejects an empty manifest rather than emptying the listing', () => {
    expect(() => parsePreviewManifest([])).toThrow(/no previews/)
  })

  it('rejects an entry with no file', () => {
    expect(() => parsePreviewManifest([{ caption: { 'en-US': 'x' } }])).toThrow(
      /entry 0 has no "file"/,
    )
  })

  it('rejects a file AMO would not accept', () => {
    expect(() => parsePreviewManifest([preview('a.gif', 'x')])).toThrow(
      /PNG or JPEG/,
    )
  })

  it('rejects the same file listed twice', () => {
    expect(() => parsePreviewManifest([valid[0], valid[0]])).toThrow(
      /entry 1 repeats/,
    )
  })

  it('rejects an entry with no en-US caption', () => {
    expect(() =>
      parsePreviewManifest([{ file: 'a.png', caption: { de: 'x' } }]),
    ).toThrow(/no "en-US" caption/)

    expect(() => parsePreviewManifest([preview('a.png', '  ')])).toThrow(
      /no "en-US" caption/,
    )
  })

  it('names the source file in its errors', () => {
    expect(() => parsePreviewManifest({}, 'amo/previews.json')).toThrow(
      /^amo\/previews\.json: /,
    )
  })
})

describe('planPreviewSync', () => {
  it('uploads the whole manifest when AMO has nothing', () => {
    const { uploads, deletes } = planPreviewSync([], valid)

    expect(deletes).toEqual([])
    expect(uploads).toEqual([
      { ...valid[0], position: 0 },
      { ...valid[1], position: 1 },
    ])
  })

  // A matching count is not a reason to skip: AMO re-encodes on ingest, so the
  // published images cannot be compared against the files on disk and a swapped
  // screenshot at the same count is indistinguishable from no change at all.
  it('still replaces when the counts already match', () => {
    const remote = [{ id: 11 }, { id: 12 }]
    const { uploads, deletes } = planPreviewSync(remote, valid)

    expect(uploads).toHaveLength(2)
    expect(deletes).toEqual([11, 12])
  })

  it('drops previews the manifest no longer lists', () => {
    const remote = [{ id: 11 }, { id: 12 }, { id: 13 }]

    expect(planPreviewSync(remote, [valid[0]]).deletes).toEqual([11, 12, 13])
  })

  it('derives position from manifest order, so reordering reorders', () => {
    const reversed = [valid[1], valid[0]]
    const { uploads } = planPreviewSync([{ id: 11 }, { id: 12 }], reversed)

    expect(uploads.map(entry => [entry.file, entry.position])).toEqual([
      ['store/screenshots/b.png', 0],
      ['store/screenshots/a.png', 1],
    ])
  })
})

describe('describePreviewDrift', () => {
  it('calls out a count mismatch', () => {
    const line = describePreviewDrift([], valid)

    expect(line).toContain('2 in the manifest, 0 on AMO')
    expect(line).toContain('out of sync')
    expect(line).toContain('--sync-previews')
  })

  it('does not claim a match it cannot verify', () => {
    const line = describePreviewDrift([{ id: 11 }, { id: 12 }], valid)

    expect(line).toContain('same count')
    expect(line).toContain('cannot be compared')
  })
})

// The manifest points at files the publish script uploads by path, so a moved
// or deleted screenshot has to fail here rather than partway through a release.
describe('the checked-in previews manifest', () => {
  const entries = parsePreviewManifest(manifest)

  it.each(entries.map(entry => entry.file))('%s is present and valid', file => {
    const { size } = statSync(resolve(process.cwd(), file))

    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThanOrEqual(MAX_IMAGE_BYTES)
  })
})

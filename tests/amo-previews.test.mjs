import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import pngjs from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_THROTTLE_WAIT_MS,
  MAX_IMAGE_BYTES,
  MAX_THROTTLE_TOTAL_MS,
  MAX_THROTTLE_WAIT_MS,
  checkDistinctPixels,
  checkImageBytes,
  countPreviewWrites,
  describeWait,
  imageContentType,
  parsePreviewManifest,
  pixelKey,
  planPreviewReconcile,
  planThrottleRetry,
  throttleWaitMs,
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

// A 2×2 opaque image, written with the given pngjs options so the same pixels
// can come out as different bytes, the way AMO's re-encode does.
const png = (options = {}, pixel = [200, 30, 90]) => {
  const image = new pngjs.PNG({ width: 2, height: 2 })

  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([...pixel, 255], offset)
  }

  return pngjs.PNG.sync.write(image, options)
}

describe('imageContentType', () => {
  it('accepts PNG in any case', () => {
    expect(imageContentType('a.png')).toBe('image/png')
    expect(imageContentType('a.PNG')).toBe('image/png')
  })

  // AMO accepts JPEG, but a lossy re-encode could never match again.
  it('rejects JPEG and anything else', () => {
    for (const file of ['a.jpg', 'a.jpeg', 'a.gif', 'a']) {
      expect(() => imageContentType(file)).toThrow(/not a PNG/)
    }
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

describe('pixelKey', () => {
  it('matches the same pixels in a different encoding', () => {
    const rgba = png({ colorType: 6, deflateLevel: 9 })
    const rgb = png({ colorType: 2, deflateLevel: 1 })

    expect(rgba.equals(rgb)).toBe(false)
    expect(pixelKey(rgba)).toBe(pixelKey(rgb))
  })

  it('tells different pixels apart', () => {
    expect(pixelKey(png({}, [200, 30, 90]))).not.toBe(
      pixelKey(png({}, [200, 30, 91])),
    )
  })

  it('rejects bytes that are not a PNG', () => {
    expect(() => pixelKey(Buffer.from('not an image'))).toThrow(
      /not a readable PNG/,
    )
  })
})

describe('throttleWaitMs', () => {
  it('waits out the header AMO sends, plus a margin', () => {
    expect(throttleWaitMs('56')).toBe(57_000)
  })

  it('falls back when the header is missing or unusable', () => {
    for (const header of [null, '', 'soon', '0', '-1', 'Infinity']) {
      expect(throttleWaitMs(header)).toBe(FALLBACK_THROTTLE_WAIT_MS)
    }
  })
})

describe('describeWait', () => {
  it('picks a unit that reads at the length it is given', () => {
    expect(describeWait(57_000)).toBe('57s')
    expect(describeWait(3_455_000)).toBe('58m')
    expect(describeWait(2 * 60 * 60_000)).toBe('2h')
    expect(describeWait(52_278_000)).toBe('14h31m')
  })
})

describe('planThrottleRetry', () => {
  const at = (retryAfter, extra = {}) =>
    planThrottleRetry(retryAfter, { attempt: 1, attempts: 5, ...extra })

  it('waits out the per-minute limit', () => {
    expect(at('56')).toEqual({ retry: true, wait: 57_000 })
  })

  // The wait an hourly-boundary crossing actually produced, which then
  // completed correctly. Refusing it would break preview uploads.
  it('waits out an hourly-boundary crossing', () => {
    expect(at('3454')).toEqual({ retry: true, wait: 3_455_000 })
  })

  // The one that cancelled release 1.4.1 after six hours on a runner.
  it('refuses a wait that is really a different day', () => {
    const { retry, wait, reason } = at('52277')

    expect(retry).toBe(false)
    expect(wait).toBe(52_278_000)
    expect(reason).toContain('14h31m')
  })

  it('refuses a wait one second past the ceiling', () => {
    expect(at(String(MAX_THROTTLE_WAIT_MS / 1000)).retry).toBe(false)
    expect(at(String(MAX_THROTTLE_WAIT_MS / 1000 - 1)).retry).toBe(true)
  })

  // Each wait below clears the per-wait ceiling on its own; what they cannot
  // clear is the run they are being spent from.
  it('refuses waits that only add up to too long', () => {
    const waited = MAX_THROTTLE_TOTAL_MS - 60_000
    const { retry, reason } = at('3454', { waited })

    expect(retry).toBe(false)
    expect(reason).toContain('2h')
  })

  it('stops once the attempts are spent', () => {
    expect(at('56', { attempt: 5 }).retry).toBe(false)
    expect(at('56', { attempt: 5 }).reason).toContain('5 throttled attempts')
  })

  // A missing header falls back to a minute, which must stay retryable: the
  // fallback exists for a throttle that would have cleared quickly.
  it('waits out a throttle that sent no header', () => {
    expect(at(null)).toEqual({ retry: true, wait: FALLBACK_THROTTLE_WAIT_MS })
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

  it('rejects a file that is not a PNG', () => {
    expect(() => parsePreviewManifest([preview('a.jpg', 'x')])).toThrow(
      /not a PNG/,
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

describe('checkDistinctPixels', () => {
  it('rejects two files with the same pixels', () => {
    expect(() =>
      checkDistinctPixels([
        { file: 'a.png', key: 'k' },
        { file: 'b.png', key: 'k' },
      ]),
    ).toThrow('b.png has the same pixels as a.png')
  })

  it('accepts distinct pixels', () => {
    expect(() =>
      checkDistinctPixels([
        { file: 'a.png', key: 'k1' },
        { file: 'b.png', key: 'k2' },
      ]),
    ).not.toThrow()
  })
})

describe('planPreviewReconcile', () => {
  const wanted = [
    { ...valid[0], key: 'ka' },
    { ...valid[1], key: 'kb' },
  ]

  const published = (id, key, position, caption) => ({
    id,
    key,
    position,
    caption: { 'en-US': caption },
  })

  const inSync = [
    published(11, 'ka', 0, 'first'),
    published(12, 'kb', 1, 'second'),
  ]

  it('uploads the whole manifest when AMO has nothing', () => {
    const plan = planPreviewReconcile([], wanted)

    expect(plan).toEqual({
      uploads: [
        { ...wanted[0], position: 0 },
        { ...wanted[1], position: 1 },
      ],
      updates: [],
      deletes: [],
    })
    expect(countPreviewWrites(plan)).toBe(4)
  })

  it('writes nothing when every preview already matches', () => {
    const plan = planPreviewReconcile(inSync, wanted)

    expect(plan).toEqual({ uploads: [], updates: [], deletes: [] })
    expect(countPreviewWrites(plan)).toBe(0)
  })

  it('reorders by moving, not by uploading again', () => {
    const plan = planPreviewReconcile(inSync, [wanted[1], wanted[0]])

    expect(plan).toEqual({
      uploads: [],
      updates: [
        { id: 12, position: 0 },
        { id: 11, position: 1 },
      ],
      deletes: [],
    })
  })

  it('patches only a caption that changed', () => {
    const remote = [inSync[0], published(12, 'kb', 1, 'old words')]

    expect(planPreviewReconcile(remote, wanted).updates).toEqual([
      { id: 12, caption: { 'en-US': 'second' } },
    ])
  })

  // What an upload that was throttled before its caption PATCH leaves behind.
  it('finishes a preview whose caption never landed', () => {
    const remote = [
      inSync[0],
      { id: 13, key: 'kb', position: 1, caption: null },
    ]

    expect(planPreviewReconcile(remote, wanted)).toEqual({
      uploads: [],
      updates: [{ id: 13, caption: { 'en-US': 'second' } }],
      deletes: [],
    })
  })

  it('ignores locales the manifest does not set', () => {
    const remote = inSync.map(item => ({
      ...item,
      caption: { ...item.caption, de: 'anders' },
    }))

    expect(planPreviewReconcile(remote, wanted).updates).toEqual([])
  })

  // A same-count swap is the case a count comparison could never see.
  it('replaces a swapped image even when the count matches', () => {
    const remote = [inSync[0], published(12, 'kold', 1, 'second')]

    expect(planPreviewReconcile(remote, wanted)).toEqual({
      uploads: [{ ...wanted[1], position: 1 }],
      updates: [],
      deletes: [12],
    })
  })

  it('keeps the duplicate already in place and drops the other', () => {
    const remote = [
      published(14, 'ka', 3, 'first'),
      published(11, 'ka', 0, 'first'),
      inSync[1],
    ]

    expect(planPreviewReconcile(remote, wanted)).toEqual({
      uploads: [],
      updates: [],
      deletes: [14],
    })
  })

  it('deletes what the manifest no longer lists', () => {
    const plan = planPreviewReconcile(inSync, [wanted[0]])

    expect(plan).toEqual({ uploads: [], updates: [], deletes: [12] })
    expect(countPreviewWrites(plan)).toBe(1)
  })
})

// The manifest points at files the publish script uploads by path, so a moved,
// deleted, or undecodable screenshot has to fail here rather than partway
// through a release.
describe('the checked-in previews manifest', () => {
  const entries = parsePreviewManifest(manifest)

  it.each(entries.map(entry => entry.file))('%s is present and valid', file => {
    const path = resolve(process.cwd(), file)
    const { size } = statSync(path)

    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThanOrEqual(MAX_IMAGE_BYTES)
    expect(pixelKey(readFileSync(path))).toMatch(/^[0-9a-f]{64}$/)
  })

  it('has no two screenshots with the same pixels', () => {
    const keyed = entries.map(entry => ({
      ...entry,
      key: pixelKey(readFileSync(resolve(process.cwd(), entry.file))),
    }))

    expect(() => checkDistinctPixels(keyed)).not.toThrow()
  })

  it('points at a listing icon that decodes', () => {
    const icon = readFileSync(
      resolve(process.cwd(), 'public/icons/icon128.png'),
    )

    expect(pixelKey(icon)).toMatch(/^[0-9a-f]{64}$/)
  })
})

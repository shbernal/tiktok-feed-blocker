// Decision logic for the AMO listing-asset reconcile, kept out of
// `publish-amo.mjs` so it can be unit-tested without an HTTP layer or a
// credential. Everything here is pure: it takes the manifest and whatever AMO
// reports, and returns the work to do.
import crypto from 'node:crypto'
import path from 'node:path'
import pngjs from 'pngjs'

// `ImageField` in addons-server rejects anything that is not a non-animated
// PNG or JPEG under `MAX_IMAGE_UPLOAD_SIZE`, which is 4MB. Checking locally
// turns a mid-release API rejection into a failure before anything is uploaded.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

// AMO would take a JPEG too, but it re-encodes every image on ingest, and only
// a PNG comes back with the same pixels. A JPEG could never be recognized as
// already published, so every run would upload it again.
export const imageContentType = file => {
  if (path.extname(file).toLowerCase() !== '.png') {
    throw new Error(
      `${file} is not a PNG; only a PNG keeps its pixels through AMO's ` +
        're-encode, which is how the listing is compared',
    )
  }

  return 'image/png'
}

export const checkImageBytes = (file, bytes) => {
  if (bytes > MAX_IMAGE_BYTES) {
    const megabytes = (bytes / 1024 / 1024).toFixed(1)
    throw new Error(`${file} is ${megabytes}MB; AMO rejects images over 4MB`)
  }
}

// Identity for a listing image. AMO re-encodes on ingest, so a local file and
// its published copy never share a byte hash, but a PNG it has not resized
// decodes to the same RGBA. pngjs normalizes every color type and bit depth to
// 8-bit RGBA, so the key survives a change of encoding and nothing else.
export const pixelKey = buffer => {
  let image

  try {
    image = pngjs.PNG.sync.read(buffer)
  } catch (error) {
    throw new Error(`not a readable PNG: ${error.message}`)
  }

  return crypto
    .createHash('sha256')
    .update(`${image.width}x${image.height}\n`)
    .update(image.data)
    .digest('hex')
}

// Display order is the order of the file. `position` is derived from the index
// rather than written out, so there is only one place to change an ordering and
// no way for the two to disagree.
export const parsePreviewManifest = (raw, source = 'amo/previews.json') => {
  const fail = message => {
    throw new Error(`${source}: ${message}`)
  }

  if (!Array.isArray(raw)) {
    fail('must be an array of previews')
  }

  if (raw.length === 0) {
    fail('has no previews; AMO would be left with an empty listing')
  }

  const seen = new Set()

  return raw.map((entry, index) => {
    const at = `entry ${index}`

    if (typeof entry?.file !== 'string' || entry.file === '') {
      fail(`${at} has no "file"`)
    }

    imageContentType(entry.file)

    if (seen.has(entry.file)) {
      fail(`${at} repeats ${entry.file}`)
    }

    seen.add(entry.file)

    const caption = entry.caption?.['en-US']

    if (typeof caption !== 'string' || caption.trim() === '') {
      fail(`${at} has no "en-US" caption`)
    }

    return { file: entry.file, caption: entry.caption }
  })
}

// Two files with the same pixels would both match one published preview, and
// the listing could never settle on showing it twice.
export const checkDistinctPixels = entries => {
  const byKey = new Map()

  for (const entry of entries) {
    const other = byKey.get(entry.key)

    if (other !== undefined) {
      throw new Error(`${entry.file} has the same pixels as ${other}`)
    }

    byKey.set(entry.key, entry.file)
  }
}

// Creating a preview goes through AMO's add-on submission throttles, and three
// screenshots is already enough to trip them: the first upload succeeds and the
// next comes back 429 with a Retry-After of about a minute. DRF sets that header
// on every throttled response, so the wait is read rather than guessed; the
// fallback only matters if it ever goes missing. The extra second keeps a
// rounded-down header from retrying a moment early and burning an attempt.
export const FALLBACK_THROTTLE_WAIT_MS = 60_000

export const throttleWaitMs = retryAfter => {
  const seconds = Number(retryAfter)

  return seconds > 0 && Number.isFinite(seconds)
    ? seconds * 1000 + 1000
    : FALLBACK_THROTTLE_WAIT_MS
}

// Waits here span seconds to most of a day, so one unit reads badly at one end
// or the other.
export const describeWait = ms => {
  const seconds = Math.round(ms / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const remainder = minutes % 60

  return remainder === 0
    ? `${minutes / 60}h`
    : `${Math.floor(minutes / 60)}h${remainder}m`
}

// Which bucket a 429 came from changes `Retry-After` by four orders of
// magnitude, and only some of them are worth waiting out in-process. The
// per-minute limit answers in about a minute; crossing the hourly boundary has
// answered with 3454 seconds and then completed correctly. Longer locks (4h,
// 8h, and 14.5h have all been seen) outlast what one run should sit through, so
// past the cap the run defers: it stops and says when the bucket refills, and
// the release workflow starts a later run that picks up where this one stopped.
//
// The ceiling has to clear the hourly boundary, which is the longest wait that
// is still a real wait, with margin for one that lands somewhat worse.
export const MAX_THROTTLE_WAIT_MS = 70 * 60_000

// Per-wait is not enough by itself: several waits each under the ceiling still
// add up past the job serving them. This bounds the run rather than the call.
export const MAX_THROTTLE_TOTAL_MS = 2 * 60 * 60_000

export const planThrottleRetry = (
  retryAfter,
  { attempt, attempts, waited = 0 },
) => {
  const wait = throttleWaitMs(retryAfter)
  const stop = reason => ({ retry: false, wait, reason })

  if (attempt >= attempts) {
    return stop(`${attempts} throttled attempts is the limit`)
  }

  if (wait > MAX_THROTTLE_WAIT_MS) {
    return stop(
      `AMO asked for ${describeWait(wait)}, past the ` +
        `${describeWait(MAX_THROTTLE_WAIT_MS)} a single wait may take`,
    )
  }

  if (waited + wait > MAX_THROTTLE_TOTAL_MS) {
    return stop(
      `another ${describeWait(wait)} would put this run past the ` +
        `${describeWait(MAX_THROTTLE_TOTAL_MS)} it may spend throttled`,
    )
  }

  return { retry: true, wait }
}

// Every locale the manifest sets has to read back the same. Locales AMO holds
// that the manifest does not mention are left alone, as the PATCH would leave
// them.
const sameCaption = (remote, wanted) =>
  Object.entries(wanted).every(([locale, text]) => remote?.[locale] === text)

// Both sides carry a pixel `key`. Each manifest entry claims one published
// preview with its key, preferring one already at the right position, so a
// duplicate left by an interrupted run is the one deleted rather than the one
// in place. Whatever nobody claims is gone from the manifest.
//
// A run that dies partway converges on the next one: an uploaded preview whose
// caption never landed matches by key and only gets the caption, and one that
// never uploaded is still missing. Uploads come before deletes so a run that
// dies halfway leaves the listing with too many images rather than none.
export const planPreviewReconcile = (remote, manifest) => {
  const unclaimed = [...remote]

  const claim = (key, position) => {
    const inPlace = unclaimed.findIndex(
      preview => preview.key === key && preview.position === position,
    )
    const index =
      inPlace === -1
        ? unclaimed.findIndex(preview => preview.key === key)
        : inPlace

    return index === -1 ? undefined : unclaimed.splice(index, 1)[0]
  }

  const uploads = []
  const updates = []

  manifest.forEach((entry, position) => {
    const match = claim(entry.key, position)

    if (match === undefined) {
      uploads.push({ ...entry, position })
      return
    }

    const change = {}

    if (match.position !== position) {
      change.position = position
    }

    if (!sameCaption(match.caption, entry.caption)) {
      change.caption = entry.caption
    }

    if (Object.keys(change).length > 0) {
      updates.push({ id: match.id, ...change })
    }
  })

  return {
    uploads,
    updates,
    deletes: unclaimed.map(preview => preview.id),
  }
}

// Each upload is a POST and a caption PATCH; each update and delete is one call.
export const countPreviewWrites = ({ uploads, updates, deletes }) =>
  uploads.length * 2 + updates.length + deletes.length

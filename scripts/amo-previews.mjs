// Decision logic for the AMO listing-asset sync, kept out of `publish-amo.mjs`
// so it can be unit-tested without an HTTP layer or a credential. Everything
// here is pure: it takes the manifest and whatever AMO reports, and returns the
// work to do.
import path from 'node:path'

// `ImageField` in addons-server rejects anything that is not a non-animated
// PNG or JPEG under `MAX_IMAGE_UPLOAD_SIZE`, which is 4MB. Checking locally
// turns a mid-release API rejection into a failure before anything is uploaded.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

export const imageContentType = file => {
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()]

  if (type === undefined) {
    throw new Error(`${file} is not a PNG or JPEG; AMO accepts only those`)
  }

  return type
}

export const checkImageBytes = (file, bytes) => {
  if (bytes > MAX_IMAGE_BYTES) {
    const megabytes = (bytes / 1024 / 1024).toFixed(1)
    throw new Error(`${file} is ${megabytes}MB; AMO rejects images over 4MB`)
  }
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

// Identity is the part of this the reconcile cannot solve. AMO re-encodes every
// image on ingest, so a local file and its published copy never share a hash,
// and nothing on a preview says which manifest entry produced it. Reusing a
// remote preview would therefore mean assuming its bytes are still the ones on
// disk — and a swapped screenshot that silently never uploads is exactly the
// failure this is meant to prevent. So a sync replaces rather than reconciles:
// it uploads the whole manifest and drops whatever was there before.
//
// Uploads are ordered before deletes so a run that dies halfway leaves the
// listing with too many images rather than none.
export const planPreviewSync = (remote, manifest) => ({
  uploads: manifest.map((entry, index) => ({ ...entry, position: index })),
  deletes: remote.map(preview => preview.id),
})

// Printed on every release that does not pass `--sync-previews`, so a
// screenshot change nobody synced stays visible instead of going quiet. Equal
// counts are not proof the images match: there is nothing to compare bytes
// against, so a same-count swap looks identical from here.
export const describePreviewDrift = (remote, manifest) => {
  const state =
    remote.length === manifest.length
      ? 'same count, though the images themselves cannot be compared'
      : 'out of sync'

  return (
    `previews: ${manifest.length} in the manifest, ${remote.length} on AMO ` +
    `— ${state}. Pass --sync-previews to reapply them.`
  )
}

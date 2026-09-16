// Submits a built Firefox package to addons.mozilla.org against the raw API v5.
// `web-ext sign` wraps these same endpoints, but it is opaque about
// listed-channel review state and is known to exit non-zero on submissions that
// actually succeeded, which is not something a release job can be built on.
//
// Every run reconciles: it reads what AMO already has and makes only the writes
// still missing, so a run that AMO throttled partway is finished by running it
// again rather than by starting over.
//
// Run `pnpm publish:amo --help` for the flags and the environment it reads.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import { printHelpAndExit } from './help.mjs'
import {
  checkDistinctPixels,
  checkImageBytes,
  countPreviewWrites,
  describeWait,
  imageContentType,
  parsePreviewManifest,
  pixelKey,
  planPreviewReconcile,
  planThrottleRetry,
} from './amo-previews.mjs'

const API = 'https://addons.mozilla.org/api/v5'
const GUID = 'tiktok-feed-blocker@shbernal.github.io'
const CHANNEL = 'listed'
const LICENSE = 'MIT'

// The listing icon and the previews are add-on metadata, not version metadata:
// they are edited on the add-on record and survive every release untouched
// unless something here rewrites them.
const ICON = 'public/icons/icon128.png'
const ICON_SIZE = '128'
const PREVIEW_MANIFEST = 'amo/previews.json'

// Firefox only. The manifest declares no Android support, and
// `data_collection_permissions` needs Firefox for Android 142 while the desktop
// floor is 140, so claiming Android here would misreport compatibility.
const COMPATIBILITY = ['firefox']

// Validation is queued server-side and is not instant on a busy day.
const POLL_INTERVAL_MS = 10_000
const POLL_ATTEMPTS = 60

// AMO resizes listing images in a background task, so a fresh upload can take a
// moment to be served.
const PIXEL_POLL_INTERVAL_MS = 10_000
const PIXEL_POLL_ATTEMPTS = 12

// EX_TEMPFAIL. The release workflow reads this as "throttled, resume later"
// and every other non-zero code as a real failure.
const EXIT_DEFERRED = 75

const root = process.cwd()
const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')
const planOnly = process.argv.includes('--plan')
const validateOnly = process.argv.includes('--validate-only')
const assetsOnly = process.argv.includes('--assets-only')

const read = file => fs.readFileSync(path.resolve(root, file), 'utf8')
const readJson = file => JSON.parse(read(file))

const { version } = readJson('package.json')

printHelpAndExit(`
Usage: pnpm publish:amo [--dry-run | --check | --validate-only]
                       [--assets-only] [--plan] [--help]

Brings addons.mozilla.org in line with this checkout against API v5. It reads
what AMO already has and writes only what is missing, in this order:

  1. the version: upload the package, wait for validation, and create it with
     the listing metadata, unless AMO already has version ${version}
  2. the source archive, unless that version already has one
  3. the listing icon, unless AMO serves the same pixels
  4. the previews in ${PREVIEW_MANIFEST}: upload what is missing, fix position
     and caption, delete what the manifest no longer lists

Images are compared by decoded pixels, so all of them must be PNG. A listed
submission is queued for human review, so a successful run ends with the
version awaiting review, not public.

When AMO throttles for longer than this run may wait, the run stops, prints
when the limit clears, writes resume_at to $GITHUB_OUTPUT when that is set,
and exits ${EXIT_DEFERRED}. Running it again after that time continues the work.

Flags
  --dry-run        resolve the listing, approval notes, previews, and file
                   paths and print them, then check the tags and categories
                   against AMO's vocabularies; makes no authenticated call
  --check          verify the API credentials and exit
  --plan           read AMO and print the writes a real run would make;
                   writes nothing
  --validate-only  upload through AMO's real validator without creating a
                   version; nothing is submitted and the add-on id is not
                   claimed
  --assets-only    reconcile only the icon and the previews; needs no package
                   and submits no version
  --help, -h       show this text

Environment
  MOZILLA_ADDON_JWT_ISSUER  AMO API key (required, except for --dry-run)
  MOZILLA_ADDON_JWT_SECRET  AMO API secret (required, except for --dry-run)
  AMO_PACKAGE               package to submit
                            (default: release/tiktok-feed-blocker-firefox-${version}.zip)
  AMO_SOURCE                source archive to attach
                            (default: release/tiktok-feed-blocker-source-${version}.zip)
  GITHUB_OUTPUT             file that receives resume_at on a deferral

Both defaults are produced by pnpm package:firefox and pnpm package:source.

See docs/ci-release-flow.md and docs/amo-listing.md.
`)

const packagePath = path.resolve(
  root,
  process.env.AMO_PACKAGE ??
    `release/tiktok-feed-blocker-firefox-${version}.zip`,
)
const sourcePath = path.resolve(
  root,
  process.env.AMO_SOURCE ?? `release/tiktok-feed-blocker-source-${version}.zip`,
)

const issuer = process.env.MOZILLA_ADDON_JWT_ISSUER
const secret = process.env.MOZILLA_ADDON_JWT_SECRET

// The reviewer notes are the same text as the documented build instructions, so
// they are lifted from the doc rather than restated here. Drift between what a
// reviewer is told and what the repository documents is the failure this avoids.
const REVIEWER_SECTION = '## Reviewer Build Instructions'

const approvalNotes = () => {
  const doc = read('amo/source-submission.md')
  const start = doc.indexOf(REVIEWER_SECTION)

  if (start === -1) {
    throw new Error(
      `amo/source-submission.md has no "${REVIEWER_SECTION}" section`,
    )
  }

  const section = doc.slice(start + REVIEWER_SECTION.length).split('\n## ')[0]
  const quoted = section
    .split('\n')
    .filter(line => line.startsWith('>'))
    .map(line => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim()

  if (quoted === '') {
    throw new Error(
      `amo/source-submission.md "${REVIEWER_SECTION}" has no quoted block`,
    )
  }

  return quoted
}

// The long description is the one listing field both stores publish verbatim,
// so it lives in `store/` rather than `amo/` and the Chrome dashboard paste
// comes from the same file. Everything else here is AMO-shaped and stays in
// `amo/listing.json`.
const listing = () => ({
  ...readJson('amo/listing.json'),
  description: { 'en-US': read('store/description.txt').trim() },
})

const imagePart = file => {
  const absolute = path.resolve(root, file)
  checkImageBytes(file, fs.statSync(absolute).size)

  return filePart(absolute, imageContentType(file))
}

const localPixelKey = file =>
  pixelKey(fs.readFileSync(path.resolve(root, file)))

// Size, format, decodability, and distinctness all fail here, before any
// write, rather than partway through a reconcile.
const previewManifest = () => {
  const entries = parsePreviewManifest(
    readJson(PREVIEW_MANIFEST),
    PREVIEW_MANIFEST,
  ).map(entry => {
    imagePart(entry.file)
    return { ...entry, key: localPixelKey(entry.file) }
  })

  checkDistinctPixels(entries)
  return entries
}

const base64url = value => Buffer.from(value).toString('base64url')

// AMO caps a token's life at five minutes past `iat`, so every request mints its
// own instead of reusing one across a poll loop that can outlive it.
const mintToken = () => {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: issuer,
      jti: crypto.randomUUID(),
      iat: issuedAt,
      exp: issuedAt + 240,
    }),
  )
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')

  return `${header}.${payload}.${signature}`
}

const parse = text => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// What this run has written, for the deferral message: a throttled run is only
// useful to read if it says how far it got.
const completed = []
let writes = 0

const record = step => {
  completed.push(step)
  console.log(step)
}

class Deferred extends Error {
  constructor(message, resumeAt) {
    super(message)
    this.resumeAt = resumeAt
  }
}

// A 429 is the one status worth retrying: it says the same request will work
// later, where every other failure says the request is wrong. The token is
// minted inside the loop because a throttle wait is long enough to matter
// against its five-minute life.
//
// `planThrottleRetry` decides whether "later" fits inside this run. When it
// does not, the run defers instead of failing: nothing already written is lost,
// and the next run starts from what AMO then reports.
const THROTTLE_ATTEMPTS = 5

const request = async (method, endpoint, { json, form, missingOk } = {}) => {
  let waited = 0

  for (let attempt = 1; ; attempt += 1) {
    const headers = { Authorization: `JWT ${mintToken()}` }

    if (json !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(`${API}${endpoint}`, {
      method,
      headers,
      // The GET call sites pass neither `json` nor `form`, so this is
      // `undefined` for them, which fetch accepts. oxlint cannot see that
      // through the `method` parameter and reads it as a GET with a body.
      // oxlint-disable-next-line unicorn/no-invalid-fetch-options
      body: json !== undefined ? JSON.stringify(json) : form,
    })

    const body = parse(await response.text())

    if (response.status === 429) {
      const { retry, wait, reason } = planThrottleRetry(
        response.headers.get('retry-after'),
        { attempt, attempts: THROTTLE_ATTEMPTS, waited },
      )

      if (retry) {
        console.log(`throttled; retrying in ${describeWait(wait)}`)
        waited += wait
        await sleep(wait)
        continue
      }

      throw new Deferred(
        `${method} ${endpoint} → 429 throttled by AMO; ${reason}.`,
        new Date(Date.now() + wait),
      )
    }

    if (response.status === 404 && missingOk) {
      return null
    }

    if (!response.ok) {
      const detail =
        typeof body === 'string' ? body : JSON.stringify(body, null, 2)
      throw new Error(`${method} ${endpoint} → ${response.status}\n${detail}`)
    }

    if (method !== 'GET') {
      writes += 1
    }

    return body
  }
}

// Tags and categories are closed vocabularies. AMO rejects anything outside
// them on the PUT that creates the version, which is after the package has been
// uploaded and validated and after the release that triggered it is already
// published — so the whole release fails on a metadata typo. Both lists are
// public and unauthenticated, so checking up front costs nothing and turns that
// into a failed dry run.
const publicList = async endpoint => {
  const response = await fetch(`${API}${endpoint}`)

  if (!response.ok) {
    throw new Error(`GET ${endpoint} → ${response.status}`)
  }

  return response.json()
}

const verifyListing = async () => {
  const { tags = [], categories = [] } = listing()
  const [validTags, allCategories] = await Promise.all([
    publicList('/addons/tags/'),
    publicList('/addons/categories/'),
  ])

  const validCategories = allCategories
    .filter(category => category.type === 'extension')
    .map(category => category.slug)

  const problems = [
    ['tags', tags, validTags],
    ['categories', categories, validCategories],
  ]
    .map(([field, values, valid]) => [
      field,
      values.filter(value => !valid.includes(value)),
      valid,
    ])
    .filter(([, unknown]) => unknown.length > 0)
    .map(
      ([field, unknown, valid]) =>
        `amo/listing.json ${field} AMO does not define: ${unknown.join(', ')}\n` +
        `  valid ${field}: ${valid.join(', ')}`,
    )

  if (problems.length > 0) {
    throw new Error(problems.join('\n\n'))
  }

  console.log(
    `listing metadata valid (${tags.length} tags, ${categories.length} categories)`,
  )
}

const filePart = (file, type) =>
  new File([fs.readFileSync(file)], path.basename(file), { type })

const zipPart = file => filePart(file, 'application/zip')

// Listing images live on AMO's media host, which is public and outside the API
// throttle, so comparing them costs no write budget.
const remotePixelKey = async url => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status}`)
  }

  return pixelKey(Buffer.from(await response.arrayBuffer()))
}

const messagesOf = validation =>
  (validation?.messages ?? [])
    .filter(message => message.type === 'error')
    .map(message => `  ${message.message} (${message.file ?? 'package'})`)
    .join('\n')

// Fails the run on a bad or expired credential before anything is uploaded,
// rather than after a package is already sitting in AMO's validation queue.
const verifyCredentials = async () => {
  const profile = await request('GET', '/accounts/profile/')
  console.log(`authenticated as ${profile.display_name ?? profile.username}`)
}

const addonEndpoint = `/addons/addon/${GUID}/`
const previewsEndpoint = `${addonEndpoint}previews/`

// A first-ever submission has no add-on yet, which is also a 404.
const getAddon = () => request('GET', addonEndpoint, { missingOk: true })

// AMO resolves a `v`-prefixed id as a version number.
const getVersion = () =>
  request('GET', `${addonEndpoint}versions/v${version}/`, { missingOk: true })

const uploadPackage = async () => {
  const form = new FormData()
  form.set('upload', zipPart(packagePath))
  form.set('channel', CHANNEL)

  const upload = await request('POST', '/addons/upload/', { form })
  console.log(`uploaded ${path.basename(packagePath)} as ${upload.uuid}`)

  return upload
}

const awaitValidation = async uuid => {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const upload = await request('GET', `/addons/upload/${uuid}/`)

    if (upload.processed) {
      if (!upload.valid) {
        throw new Error(
          `upload ${uuid} failed validation\n${messagesOf(upload.validation)}`,
        )
      }

      console.log(`validated version ${upload.version}`)
      return upload
    }

    console.log(`waiting for validation (${attempt}/${POLL_ATTEMPTS})`)
    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error(`timed out waiting for AMO to validate upload ${uuid}`)
}

// PUT on the guid creates the add-on when AMO has never seen it and creates a
// new version when it has, so first submission and every later release take the
// same path. It also applies the listing metadata, which keeps the public page
// in step with `amo/listing.json` at every release.
const submitVersion = async uuid => {
  const addon = await request('PUT', addonEndpoint, {
    json: {
      ...listing(),
      version: {
        upload: uuid,
        license: LICENSE,
        compatibility: COMPATIBILITY,
        approval_notes: approvalNotes(),
      },
    },
  })

  record(`created version ${addon.version.version} (${addon.version.id})`)
  return addon.version
}

// Source cannot travel as JSON, and it cannot be nested inside the version
// object of a form-data request either, so it is always a second call.
const attachSource = async versionId => {
  const form = new FormData()
  form.set('source', zipPart(sourcePath))

  const updated = await request(
    'PATCH',
    `${addonEndpoint}versions/${versionId}/`,
    { form },
  )

  record(`attached ${path.basename(sourcePath)} to version ${versionId}`)
  return updated
}

// Waits until AMO serves `key` at whatever URL `currentUrl` reports, re-reading
// the URL each time because it changes once the resize task has run. A
// mismatch that outlasts the poll means AMO altered the image, which a re-run
// cannot fix, so it is a hard failure rather than a deferral.
const awaitPixels = async (currentUrl, key, label) => {
  for (let attempt = 1; attempt <= PIXEL_POLL_ATTEMPTS; attempt += 1) {
    const url = await currentUrl()

    if (url && (await remotePixelKey(url).catch(() => null)) === key) {
      return
    }

    await sleep(PIXEL_POLL_INTERVAL_MS)
  }

  throw new Error(
    `AMO is not serving the pixels of ${label}. If it resized or altered the ` +
      'image, every run would upload it again; supply an image AMO keeps as is.',
  )
}

const iconUrl = addon => addon?.icons?.[ICON_SIZE]

const iconMatches = async addon => {
  const url = iconUrl(addon)
  return (
    url !== undefined && (await remotePixelKey(url)) === localPixelKey(ICON)
  )
}

// The listing icon is separate metadata from the icons in the package. The
// manifest `icons` key drives about:addons, not the AMO page, and the JSON PUT
// that carries the rest of the listing cannot carry a file at all — AMO
// documents `icon` as multipart-only and unsettable at creation.
const uploadIcon = async () => {
  const form = new FormData()
  form.set('icon', imagePart(ICON))

  await request('PATCH', addonEndpoint, { form })
  await awaitPixels(
    async () => iconUrl(await getAddon()),
    localPixelKey(ICON),
    ICON,
  )
  record(`applied listing icon from ${ICON}`)
}

const remotePreviews = addon =>
  Promise.all(
    (addon?.previews ?? []).map(async preview => ({
      id: preview.id,
      position: preview.position,
      caption: preview.caption,
      key: await remotePixelKey(preview.image_url),
    })),
  )

const describeUpdate = ({ id, position, caption }) =>
  [
    `preview ${id}:`,
    position === undefined ? null : `position ${position}`,
    caption === undefined ? null : 'caption',
  ]
    .filter(Boolean)
    .join(' ')

// Previews are edited on the add-on rather than on a version, so AMO accepts
// them while a version sits in review — the same path that already lets the
// release PUT rewrite the description.
const applyPreviews = async plan => {
  for (const upload of plan.uploads) {
    const form = new FormData()
    form.set('image', imagePart(upload.file))
    form.set('position', String(upload.position))

    const preview = await request('POST', previewsEndpoint, { form })
    record(`uploaded ${upload.file} as preview ${preview.id}`)

    await awaitPixels(
      async () =>
        (await getAddon())?.previews?.find(item => item.id === preview.id)
          ?.image_url,
      upload.key,
      `${upload.file} (preview ${preview.id})`,
    )

    // `caption` is writable on create, but a localized value would have to
    // survive multipart as a bare string and land in whatever AMO treats as the
    // default locale. Sending it as JSON afterwards keeps the `{"en-US": ...}`
    // shape the rest of the listing is written in. If the run stops between the
    // two calls, the next one matches this preview by pixels and patches only
    // the caption.
    await request('PATCH', `${previewsEndpoint}${preview.id}/`, {
      json: { caption: upload.caption },
    })

    record(`captioned preview ${preview.id}`)
  }

  for (const { id, ...change } of plan.updates) {
    await request('PATCH', `${previewsEndpoint}${id}/`, { json: change })
    record(`updated ${describeUpdate({ id, ...change })}`)
  }

  for (const id of plan.deletes) {
    await request('DELETE', `${previewsEndpoint}${id}/`)
    record(`removed preview ${id}`)
  }
}

const printPreviewPlan = plan => {
  const count = countPreviewWrites(plan)

  if (count === 0) {
    console.log('previews: match the manifest')
    return
  }

  console.log(`previews: ${count} writes`)

  for (const upload of plan.uploads) {
    console.log(`  upload ${upload.file} at position ${upload.position}`)
  }

  for (const update of plan.updates) {
    console.log(`  update ${describeUpdate(update)}`)
  }

  for (const id of plan.deletes) {
    console.log(`  delete preview ${id}`)
  }
}

// Reads what AMO has, then writes the difference. `--plan` stops after the
// reads. The version comes first because on a first submission the add-on the
// assets belong to does not exist until the version PUT creates it.
const reconcile = async () => {
  if (!assetsOnly) {
    let current = await getVersion()

    if (current === null) {
      console.log(`version ${version}: missing`)

      if (planOnly) {
        console.log('  upload, validate, create version, attach source')
      } else {
        requireFiles(packagePath, sourcePath)
        const upload = await awaitValidation((await uploadPackage()).uuid)
        current = await submitVersion(upload.uuid)
      }
    } else {
      console.log(
        `version ${version}: exists (${current.id}, ${current.file?.status})`,
      )
    }

    if (current !== null && !current.source) {
      console.log(`version ${version}: no source`)

      if (planOnly) {
        console.log('  attach source')
      } else {
        requireFiles(sourcePath)
        current = await attachSource(current.id)
      }
    }
  }

  const manifest = previewManifest()
  const addon = await getAddon()

  if (addon === null) {
    console.log('add-on: not on AMO yet; the version PUT creates it')
    return
  }

  if (await iconMatches(addon)) {
    console.log('icon: matches')
  } else if (planOnly) {
    console.log(`icon: differs\n  apply ${ICON}`)
  } else {
    await uploadIcon()
  }

  const plan = planPreviewReconcile(await remotePreviews(addon), manifest)
  printPreviewPlan(plan)

  if (!planOnly) {
    await applyPreviews(plan)
  }

  const final = assetsOnly || planOnly ? null : await getVersion()

  console.log(
    [
      '',
      `add-on   ${addon.slug} (${addon.status})`,
      final ? `version  ${final.version} (${final.file?.status})` : null,
      `listing  https://addons.mozilla.org/addon/${addon.slug}/`,
      '',
      planOnly
        ? 'Plan only; nothing was written.'
        : `Done with ${writes} writes.`,
      final?.file?.status === 'unreviewed'
        ? 'Listed versions wait for Mozilla review before going live.'
        : null,
    ]
      .filter(line => line !== null)
      .join('\n'),
  )
}

const requireEnv = () => {
  const missing = [
    ['MOZILLA_ADDON_JWT_ISSUER', issuer],
    ['MOZILLA_ADDON_JWT_SECRET', secret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(`missing credentials: ${missing.join(', ')}`)
  }
}

const requireFiles = (...files) => {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `${path.relative(root, file)} is missing — run pnpm package:firefox ` +
          'and pnpm package:source first',
      )
    }
  }
}

const main = async () => {
  if (checkOnly) {
    requireEnv()
    await verifyCredentials()
    return
  }

  if (dryRun) {
    requireFiles(packagePath, sourcePath)
    console.log(JSON.stringify(listing(), null, 2))
    console.log(`\n--- approval notes ---\n${approvalNotes()}`)
    console.log(`\npackage ${path.relative(root, packagePath)}`)
    console.log(`source  ${path.relative(root, sourcePath)}`)
    console.log(`icon    ${ICON}`)
    localPixelKey(ICON)

    // Every image is resolved, size-checked, and decoded here, so a bad path,
    // an oversized screenshot, or a non-PNG fails now rather than partway
    // through a release. What AMO already has needs authenticated reads; that
    // is `--plan`.
    console.log('\n--- previews ---')

    for (const preview of previewManifest()) {
      console.log(`${preview.file}\n  ${preview.caption['en-US']}`)
    }

    console.log()
    await verifyListing()
    return
  }

  requireEnv()
  await verifyCredentials()
  await verifyListing()

  // An upload on its own creates nothing on AMO and does not claim the add-on
  // id — only creating a version does that — so this is a safe way to put a
  // candidate package through the real validator before cutting a release tag.
  if (validateOnly) {
    requireFiles(packagePath)
    await awaitValidation((await uploadPackage()).uuid)
    console.log('\nPackage passes AMO validation. Nothing was submitted.')
    return
  }

  await reconcile()
}

const defer = error => {
  const resumeAt = error.resumeAt.toISOString()

  console.error(
    [
      error.message,
      `Written before the throttle: ${completed.length ? completed.join('; ') : 'nothing'}.`,
      `The limit clears around ${resumeAt}. Run this again after that; it ` +
        'continues from what AMO then reports.',
    ].join('\n'),
  )

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `resume_at=${resumeAt}\n`)
  }

  process.exit(EXIT_DEFERRED)
}

main().catch(error => {
  if (error instanceof Deferred) {
    defer(error)
  }

  console.error(error.message)
  process.exit(1)
})

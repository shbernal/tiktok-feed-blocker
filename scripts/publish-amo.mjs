// Submits a built Firefox package to addons.mozilla.org against the raw API v5.
// `web-ext sign` wraps these same endpoints, but it is opaque about
// listed-channel review state and is known to exit non-zero on submissions that
// actually succeeded, which is not something a release job can be built on.
//
//
// Run `pnpm publish:amo --help` for the flags and the environment it reads.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import { printHelpAndExit } from './help.mjs'

const API = 'https://addons.mozilla.org/api/v5'
const GUID = 'tiktok-feed-blocker@shbernal.github.io'
const CHANNEL = 'listed'
const LICENSE = 'MIT'

// Firefox only. The manifest declares no Android support, and
// `data_collection_permissions` needs Firefox for Android 142 while the desktop
// floor is 140, so claiming Android here would misreport compatibility.
const COMPATIBILITY = ['firefox']

// Validation is queued server-side and is not instant on a busy day.
const POLL_INTERVAL_MS = 10_000
const POLL_ATTEMPTS = 60

const root = process.cwd()
const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')
const validateOnly = process.argv.includes('--validate-only')

const read = file => fs.readFileSync(path.resolve(root, file), 'utf8')
const readJson = file => JSON.parse(read(file))

const { version } = readJson('package.json')

printHelpAndExit(`
Usage: pnpm publish:amo [--dry-run | --check | --validate-only] [--help]

Submits the built Firefox package to addons.mozilla.org against API v5: uploads
the package, waits for server-side validation, creates the version, then
attaches the source archive. A listed submission is queued for human review, so
a successful run ends with the add-on nominated, not public.

Flags
  --dry-run        resolve the listing, approval notes, and file paths and
                   print them; calls nothing
  --check          verify the API credentials and exit
  --validate-only  upload through AMO's real validator without creating a
                   version; nothing is submitted and the add-on id is not
                   claimed
  --help, -h       show this text

Environment
  MOZILLA_ADDON_JWT_ISSUER  AMO API key (required, except for --dry-run)
  MOZILLA_ADDON_JWT_SECRET  AMO API secret (required, except for --dry-run)
  AMO_PACKAGE               package to submit
                            (default: release/tiktok-feed-blocker-firefox-${version}.zip)
  AMO_SOURCE                source archive to attach
                            (default: release/tiktok-feed-blocker-source-${version}.zip)

Both defaults are produced by pnpm package:firefox and pnpm package:source.

See docs/ci-release-flow.md and docs/firefox-amo.md.
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

const request = async (method, endpoint, { json, form } = {}) => {
  const headers = { Authorization: `JWT ${mintToken()}` }

  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : form,
  })

  const body = parse(await response.text())

  if (!response.ok) {
    const detail =
      typeof body === 'string' ? body : JSON.stringify(body, null, 2)
    throw new Error(`${method} ${endpoint} → ${response.status}\n${detail}`)
  }

  return body
}

const zipPart = file =>
  new File([fs.readFileSync(file)], path.basename(file), {
    type: 'application/zip',
  })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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
// same path. It also re-applies the listing metadata each release, which keeps
// the public page in step with `amo/listing.json`.
const submitVersion = async uuid => {
  const addon = await request('PUT', `/addons/addon/${GUID}/`, {
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

  console.log(`created version ${addon.version.version} (${addon.version.id})`)
  return addon
}

// Source cannot travel as JSON, and it cannot be nested inside the version
// object of a form-data request either, so it is always a second call.
const attachSource = async versionId => {
  const form = new FormData()
  form.set('source', zipPart(sourcePath))

  const version = await request(
    'PATCH',
    `/addons/addon/${GUID}/versions/${versionId}/`,
    { form },
  )

  console.log(`attached ${path.basename(sourcePath)}`)
  return version
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
    return
  }

  requireEnv()
  await verifyCredentials()

  // An upload on its own creates nothing on AMO and does not claim the add-on
  // id — only creating a version does that — so this is a safe way to put a
  // candidate package through the real validator before cutting a release tag.
  if (validateOnly) {
    requireFiles(packagePath)
    await awaitValidation((await uploadPackage()).uuid)
    console.log('\nPackage passes AMO validation. Nothing was submitted.')
    return
  }

  requireFiles(packagePath, sourcePath)

  const upload = await awaitValidation((await uploadPackage()).uuid)
  const addon = await submitVersion(upload.uuid)
  const version = await attachSource(addon.version.id)

  // A listed submission is queued for human review; it does not go live the way
  // a Chrome Web Store publish does. A file status of `unreviewed` and an
  // add-on status of `nominated` until the first approval are the expected
  // successful outcomes, so the job must not wait for `public` or it will fail
  // every release.
  console.log(
    [
      '',
      `add-on   ${addon.slug} (${addon.status})`,
      `version  ${version.version} (${version.file.status})`,
      `listing  https://addons.mozilla.org/addon/${addon.slug}/`,
      '',
      'Submitted. Listed versions wait for Mozilla review before going live.',
    ].join('\n'),
  )
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})

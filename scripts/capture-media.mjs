// Records the README demo and the stills the store screenshots are built from,
// against logged-out real TikTok with the built extension loaded. Run it
// through scripts/capture-media.sh, which puts node and every Chromium process
// in a capped systemd unit: an uncapped run once pushed the machine into a
// global OOM and froze the desktop. The guards in this file are a second
// layer, not the only one.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { printHelpAndExit } from './help.mjs'

const defaultOutDir = 'media-capture'

printHelpAndExit(`
Usage: pnpm media:capture [--help]

Opens logged-out TikTok in headless Chromium with dist/ loaded, walks through
blocking Home, Explore, and LIVE, and writes screencast frames plus stills of
each state. Creators' videos are blurred and never play. Run pnpm media:encode
afterwards to turn the frames into the GIF, the MP4, and the composites.

Environment
  MEDIA_CAPTURE_DIR               output directory, relative to the repo root
                                  (default: ${defaultOutDir})
  MEDIA_CAPTURE_WATCHDOG_MS       give up after this long (default: 180000)
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium binary; when unset the first of
                                  /usr/bin/chromium, /usr/bin/chromium-browser,
                                  /usr/bin/google-chrome,
                                  /usr/bin/google-chrome-stable that exists

See docs/media-capture.md.
`)

const WATCHDOG_MS = Number(process.env.MEDIA_CAPTURE_WATCHDOG_MS ?? 180_000)
const MEMORY_ABORT_BYTES = 2.2 * 1024 ** 3
const MIN_AVAILABLE_BYTES = 4 * 1024 ** 3
const MAX_FRAMES = 700

const extensionPath = path.resolve(process.cwd(), 'dist')
const outDir = path.resolve(
  process.cwd(),
  process.env.MEDIA_CAPTURE_DIR ?? defaultOutDir,
)
const log = (...args) =>
  console.log(new Date().toISOString().slice(11, 19), ...args)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const resolveChromiumExecutable = () => {
  const explicitExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  if (explicitExecutable) {
    return explicitExecutable
  }

  return [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].find(candidate => fs.existsSync(candidate))
}

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build first.`,
  )
}

// Refuse to start on a machine that is already short on memory.
const meminfo = fs.readFileSync('/proc/meminfo', 'utf8')
const available = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)[1]) * 1024
if (available < MIN_AVAILABLE_BYTES) {
  log(`only ${(available / 1024 ** 3).toFixed(1)}G available, not starting`)
  process.exit(4)
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ttfb-media-'))

let context
let exiting = false
const shutdown = async (code, reason) => {
  if (exiting) {
    return
  }
  exiting = true
  log(`shutdown (${reason}), exit ${code}`)
  await Promise.race([context?.close().catch(() => {}), sleep(5000)])
  fs.rmSync(profile, { recursive: true, force: true })
  process.exit(code)
}
setTimeout(() => shutdown(3, 'watchdog'), WATCHDOG_MS)
process.on('SIGTERM', () => shutdown(143, 'SIGTERM'))
process.on('SIGINT', () => shutdown(130, 'SIGINT'))
// A failed top-level await surfaces as an uncaught exception, not a rejection.
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, error => {
    log('error:', error?.message?.split('\n')[0])
    shutdown(1, 'error')
  })
}

// Inside the systemd unit this cgroup holds node and every Chromium process.
// Outside one it is the login session's cgroup, which is not a useful budget,
// so the check only runs when the wrapper says it is capped.
if (process.env.MEDIA_CAPTURE_CAPPED === '1') {
  const cgroupPath = fs
    .readFileSync('/proc/self/cgroup', 'utf8')
    .split(':')[2]
    .trim()
  const memoryFile = `/sys/fs/cgroup${cgroupPath}/memory.current`
  let peak = 0
  setInterval(() => {
    const current = Number(fs.readFileSync(memoryFile, 'utf8'))
    peak = Math.max(peak, current)
    if (current > MEMORY_ABORT_BYTES) {
      shutdown(5, `memory ${(current / 1024 ** 3).toFixed(2)}G over budget`)
    }
  }, 1000)
  setInterval(() => log(`memory peak ${(peak / 1024 ** 2).toFixed(0)}M`), 15000)
}

// Runs in the page before TikTok does. Media never plays, which removes video
// decode and a full blur repaint per frame; creators' content is blurred; a
// fake cursor and a caption pill make the recording readable, since headless
// Chromium draws no pointer. Nothing here ships.
const demoInit = () => {
  HTMLMediaElement.prototype.play = function () {
    return Promise.resolve()
  }

  const install = () => {
    if (document.getElementById('demo-style')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'demo-style'
    style.textContent = `
      #column-list-container, #main-content-explore_page,
      #tiktok-live-main-container-id { filter: blur(24px) !important; }
      #demo-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0;
        width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(255,255,255,.9); border: 2px solid #111;
        box-shadow: 0 2px 10px rgba(0,0,0,.5); pointer-events: none; }
      #demo-cursor.down { transform: scale(.7); background: #ff4081; }
      #demo-caption { position: fixed; z-index: 2147483647; left: 50%;
        bottom: 36px; transform: translateX(-50%); padding: 12px 22px;
        border-radius: 999px; background: rgba(255,255,255,.95); color: #111;
        pointer-events: none; white-space: nowrap;
        font: 600 20px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI',
          Roboto, sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.45); }
      #demo-caption:empty { display: none; }
      #demo-caption kbd { font: 700 16px ui-monospace, monospace;
        padding: 2px 8px; border-radius: 6px; background: #eee;
        border: 1px solid #ccc; }
    `
    document.documentElement.appendChild(style)

    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.left = '1000px'
    cursor.style.top = '500px'
    const caption = document.createElement('div')
    caption.id = 'demo-caption'
    document.documentElement.append(cursor, caption)

    addEventListener(
      'mousemove',
      event => {
        cursor.style.left = `${event.clientX}px`
        cursor.style.top = `${event.clientY}px`
      },
      true,
    )
    addEventListener('mousedown', () => cursor.classList.add('down'), true)
    addEventListener('mouseup', () => cursor.classList.remove('down'), true)
  }

  if (document.documentElement) {
    install()
  }
  document.addEventListener('DOMContentLoaded', install)
}

log('launching chromium')
context = await chromium.launchPersistentContext(profile, {
  executablePath: resolveChromiumExecutable(),
  headless: true,
  colorScheme: 'dark',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  timeout: 30_000,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    '--mute-audio',
    '--renderer-process-limit=4',
    '--js-flags=--max-old-space-size=768',
    '--disable-background-networking',
  ],
})
context.setDefaultTimeout(15_000)
context.setDefaultNavigationTimeout(30_000)
await context.addInitScript(demoInit)
await (context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker'))

const page = await context.newPage()

const caption = html =>
  page.evaluate(markup => {
    const element = document.getElementById('demo-caption')
    if (element) {
      element.innerHTML = markup
    }
  }, html)

const setDemoChrome = visible =>
  page.evaluate(show => {
    for (const id of ['demo-cursor', 'demo-caption']) {
      const element = document.getElementById(id)
      if (element) {
        element.style.visibility = show ? 'visible' : 'hidden'
      }
    }
  }, visible)

// Logged-out TikTok interrupts at random and not on every run: a cookie
// banner, an onboarding hint ("Scroll, use the arrow keys ... Got it"), and a
// "Log in to TikTok" modal that swallows clicks.
const interruptions = [
  page.getByRole('button', { name: 'Decline optional cookies' }),
  page.getByRole('button', { name: 'Got it' }),
  page.getByText('Skip', { exact: true }),
]
const clearInterruptions = async () => {
  let closed = false
  for (const locator of interruptions) {
    if (await locator.first().isVisible()) {
      await locator
        .first()
        .click({ timeout: 3000 })
        .catch(() => {})
      log('closed', String(locator))
      closed = true
    }
  }
  if (closed) {
    await page.waitForTimeout(900)
  }
  return closed
}

const still = async name => {
  await clearInterruptions()
  await setDemoChrome(false)
  await page.screenshot({ path: path.join(outDir, `${name}.png`) })
  await setDemoChrome(true)
  log('still', name)
}

const failureShot = name =>
  page
    .screenshot({ path: path.join(outDir, `fail-${name}.png`) })
    .catch(() => {})

const moveTo = async (locator, name) => {
  await clearInterruptions()
  try {
    await locator.waitFor({ state: 'visible' })
  } catch (error) {
    await failureShot(name)
    log(`${name} not visible at`, page.url())
    throw error
  }
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 24,
  })
  await page.waitForTimeout(250)
}

const click = async () => {
  await page.mouse.down()
  await page.waitForTimeout(140)
  await page.mouse.up()
}

const waitForSection = async label => {
  try {
    await page
      .locator('#ttfb-active-toggle-label')
      .filter({ hasText: label })
      .waitFor({ timeout: 25_000 })
  } catch (error) {
    await failureShot(label)
    log(`no ${label} overlay at`, page.url())
    throw error
  }
}

log('opening TikTok')
await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#ttfb-feed-overlay', { timeout: 30_000 })
await page.mouse.move(1000, 500)

// The first-visit UI arrives late and in sequence, ending with a "Saved!"
// toast after the cookie choice. Wait until nothing has shown for 4 seconds.
const toast = page.getByText('Saved!', { exact: true })
let quiet = 0
for (let attempt = 0; attempt < 40 && quiet < 4; attempt++) {
  const closed = await clearInterruptions()
  const toastVisible = await toast.first().isVisible()
  quiet = closed || toastVisible ? 0 : quiet + 1
  await page.waitForTimeout(1000)
}
log('first-visit UI', quiet >= 4 ? 'cleared' : 'still present after 40s')

await still('home-blocked')

// Frames go straight to disk: holding them in memory is part of what made the
// uncapped run expensive.
const cdp = await context.newCDPSession(page)
const frames = []
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  if (frames.length >= MAX_FRAMES) {
    return
  }
  const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`
  fs.writeFileSync(path.join(outDir, file), Buffer.from(data, 'base64'))
  frames.push({ file, timestamp: metadata.timestamp })
  if (frames.length === MAX_FRAMES) {
    log('frame cap reached')
  }
})
await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 88,
  maxWidth: 1280,
  maxHeight: 800,
})
log('recording')

await caption('The For You feed, blocked')
await page.waitForTimeout(2400)

await caption('Switch it off right on the page')
await moveTo(page.locator('#ttfb-feed-overlay .ttfb-switch'), 'switch')
await click()
await page.locator('#ttfb-feed-overlay-block-button').waitFor()
await page.waitForTimeout(2200)
await still('home-unblocked')

await caption('Block it again in one click')
await moveTo(page.locator('#ttfb-feed-overlay-block-button'), 'block-button')
await click()
await page.waitForTimeout(1800)

await caption('Or press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>8</kbd>')
await page.waitForTimeout(900)
await page.keyboard.press('Control+Shift+8')
await page.waitForTimeout(1500)
await page.keyboard.press('Control+Shift+8')
await page.waitForTimeout(1500)

await caption('Explore, blocked')
await moveTo(
  page.getByRole('link', { name: 'Explore', exact: true }).first(),
  'explore-link',
)
await click()
await waitForSection('Explore')
await page.waitForTimeout(2400)
await still('explore-blocked')

await caption('LIVE, blocked and muted')
await moveTo(
  page.getByRole('link', { name: 'LIVE', exact: true }).first(),
  'live-link',
)
await click()
await waitForSection('Live')
await page.waitForTimeout(800)
// LIVE is a full page load, so the caption element is new.
await caption('LIVE, blocked and muted')
await page.waitForTimeout(2600)

await cdp.send('Page.stopScreencast')
const end = Date.now() / 1000
await still('live-blocked')

fs.writeFileSync(
  path.join(outDir, 'frames.json'),
  JSON.stringify(
    frames.map((frame, index) => ({
      file: frame.file,
      duration: Math.max(
        (frames[index + 1]?.timestamp ?? end) - frame.timestamp,
        0.01,
      ),
    })),
    null,
    2,
  ),
)
log('frames', frames.length)

await shutdown(0, 'done')

// Builds the store listing screenshots from the stills pnpm media:capture
// writes. Each screenshot is an HTML page rendered by headless Chromium at
// exactly 1280x800, the size the Chrome Web Store requires. Run it through
// scripts/capture-media.sh like the other stages.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { printHelpAndExit } from './help.mjs'

const defaultOutDir = 'media-capture'

printHelpAndExit(`
Usage: pnpm media:store [--help]

Composes the Chrome Web Store and AMO screenshots from the stills written by
pnpm media:capture, and writes them as store/tiktok-feedblocker-<n>.png inside
the capture directory. Copy the ones that changed into store/screenshots/ and
check amo/previews.json.

Environment
  MEDIA_CAPTURE_DIR               capture directory, relative to the repo root
                                  (default: ${defaultOutDir})
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium binary; when unset the first of
                                  /usr/bin/chromium, /usr/bin/chromium-browser,
                                  /usr/bin/google-chrome,
                                  /usr/bin/google-chrome-stable that exists

See docs/media-capture.md.
`)

const WIDTH = 1280
const HEIGHT = 800
const PANEL_WIDTH = 584
const CROP_HEIGHT = 300

const dir = path.resolve(
  process.cwd(),
  process.env.MEDIA_CAPTURE_DIR ?? defaultOutDir,
)
const storeDir = path.join(dir, 'store')

const stills = [
  'home-blocked.png',
  'home-unblocked.png',
  'explore-blocked.png',
  'live-blocked.png',
  'popup.png',
]
for (const still of stills) {
  if (!fs.existsSync(path.join(dir, still))) {
    throw new Error(`Missing ${still} in ${dir}. Run pnpm media:capture first.`)
  }
}

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

// Same look as the listing's open-source frame: black ground, heavy white
// headline, the extension's pink as the only accent.
const css = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; background: #000; color: #fff;
    font-family: 'Noto Sans', 'Liberation Sans', sans-serif;
  }
  h1 { margin: 0; font-size: 58px; font-weight: 800; letter-spacing: -0.02em; }
  .subtitle { margin: 14px 0 0; font-size: 24px; color: #a1a1aa; }
  .row { display: flex; gap: 32px; margin-top: 44px; align-items: center; }
  figure { margin: 0; width: ${PANEL_WIDTH}px; }
  .shot {
    width: 100%; overflow: hidden; border-radius: 14px;
    border: 1px solid #2c2c30; background-color: #000;
    background-repeat: no-repeat;
  }
  .shot img { display: block; width: 100%; }
  figcaption {
    margin-top: 16px; text-align: center; font-size: 22px; font-weight: 700;
    color: #d4d4d8;
  }
  b { color: #ff2a6d; }
  .popup { width: 420px; flex: none; }
  .keys { width: 520px; }
  .keycaps { display: flex; align-items: center; gap: 12px; }
  kbd {
    padding: 10px 20px; border-radius: 12px; background: #1c1c1e;
    border: 1px solid #3a3a3e; box-shadow: 0 4px 0 #2a2a2e;
    font: 700 36px ui-monospace, 'Noto Sans Mono', monospace;
  }
  .plus { font-size: 32px; color: #71717a; }
  .keys p { margin: 18px 0 0; font-size: 28px; font-weight: 700; }
  .keys .muted { margin-top: 8px; font-size: 20px; font-weight: 400; color: #a1a1aa; }
  .keys .note { margin-top: 48px; font-size: 22px; font-weight: 400; color: #d4d4d8; line-height: 1.5; }
`

const full = file => `<div class="shot"><img src="../${file}" alt=""></div>`

// Shows the width x (width * CROP_HEIGHT / PANEL_WIDTH) region at (x, y) of a
// 1280x800 still, scaled to fill the panel.
const crop = (file, x, y, width) => {
  const scale = PANEL_WIDTH / width
  return `<div class="shot" style="
    height: ${CROP_HEIGHT}px;
    background-image: url('../${file}');
    background-size: ${WIDTH * scale}px ${HEIGHT * scale}px;
    background-position: ${-x * scale}px ${-y * scale}px;
  "></div>`
}

const figure = (shot, caption) =>
  `<figure>${shot}<figcaption>${caption}</figcaption></figure>`

const page = ({ title, subtitle, body }) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><style>${css}</style></head>
  <body>
    <h1>${title}</h1>
    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    ${body}
  </body>
</html>`

const screenshots = [
  page({
    title: 'Hide the For You feed',
    subtitle: 'Search, messages, and profiles stay reachable.',
    body: `<div class="row">
      ${figure(full('home-unblocked.png'), 'Without')}
      ${figure(full('home-blocked.png'), 'With <b>TikTok Feed Blocker</b>')}
    </div>`,
  }),
  page({
    title: 'Switch it back from the page',
    subtitle: 'No need to open the popup.',
    body: `<div class="row">
      ${figure(crop('home-blocked.png', 430, 292, 420), 'Blocked: flip the switch')}
      ${figure(crop('home-unblocked.png', 880, 0, 420), 'Unblocked: one click blocks it again')}
    </div>`,
  }),
  page({
    title: 'Explore and LIVE, blocked and muted',
    subtitle: 'Nothing plays behind the card.',
    body: `<div class="row">
      ${figure(full('explore-blocked.png'), 'Explore')}
      ${figure(full('live-blocked.png'), 'LIVE')}
    </div>`,
  }),
  page({
    title: 'Every page has its own switch',
    body: `<div class="row">
      <div class="shot popup"><img src="../popup.png" alt=""></div>
      <div class="keys">
        <div class="keycaps">
          <kbd>Ctrl</kbd><span class="plus">+</span>
          <kbd>Shift</kbd><span class="plus">+</span><kbd>8</kbd>
        </div>
        <p>toggles the page you are on</p>
        <p class="muted">⌘ + Shift + 8 on macOS</p>
        <p class="note">Settings stay in your browser.<br>
          Nothing is collected or sent.</p>
      </div>
    </div>`,
  }),
]

fs.rmSync(storeDir, { recursive: true, force: true })
fs.mkdirSync(storeDir, { recursive: true })

const watchdog = setTimeout(() => {
  console.error('watchdog: rendering took over 60s')
  process.exit(3)
}, 60_000)

const browser = await chromium.launch({
  executablePath: resolveChromiumExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
})
try {
  const tab = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })
  for (const [index, html] of screenshots.entries()) {
    const name = `tiktok-feedblocker-${index + 1}`
    const htmlFile = path.join(storeDir, `${name}.html`)
    fs.writeFileSync(htmlFile, html)
    await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
    await tab.evaluate(() => document.fonts.ready)
    await tab.screenshot({ path: path.join(storeDir, `${name}.png`) })
    console.log(`${name}.png`)
  }
} finally {
  await browser.close()
  clearTimeout(watchdog)
}

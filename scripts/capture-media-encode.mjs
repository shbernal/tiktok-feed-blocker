// Turns the frames and stills from scripts/capture-media.mjs into the README
// GIF, a 1280x800 MP4, and the before/after composite. Run it through
// scripts/capture-media.sh, which caps memory and CPU for ffmpeg, gifski, and
// ImageMagick as well.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { printHelpAndExit } from './help.mjs'

const defaultOutDir = 'media-capture'

printHelpAndExit(`
Usage: pnpm media:encode [--help]

Reads frames.json and the stills written by pnpm media:capture and writes, in
the same directory:
  demo.gif          960px wide, 12fps, for the README
  demo.mp4          1280x800 H.264, for a Chrome Web Store YouTube video
  before-after.png  unblocked and blocked For You feed side by side

Frames that are almost entirely white are dropped first: TikTok paints LIVE
white for a moment before its dark theme applies.

Requires ffmpeg (with libx264), gifski, ImageMagick 7, and fontconfig.

Environment
  MEDIA_CAPTURE_DIR  capture directory, relative to the repo root
                     (default: ${defaultOutDir})

See docs/media-capture.md.
`)

const WHITE_FRAME_MEAN = 0.9

const dir = path.resolve(
  process.cwd(),
  process.env.MEDIA_CAPTURE_DIR ?? defaultOutDir,
)
const run = (command, args) =>
  execFileSync(command, args, { cwd: dir, stdio: 'inherit' })
const read = (command, args) =>
  execFileSync(command, args, { cwd: dir, encoding: 'utf8' }).trim()
const magick = args =>
  run('magick', [
    '-limit',
    'memory',
    '512MiB',
    '-limit',
    'thread',
    '2',
    ...args,
  ])

const framesFile = path.join(dir, 'frames.json')
if (!fs.existsSync(framesFile)) {
  throw new Error(`Missing ${framesFile}. Run pnpm media:capture first.`)
}

// A dropped frame's time goes to the frame before it, so the recording keeps
// its length and just holds the previous state through the flash.
const kept = []
let dropped = 0
for (const frame of JSON.parse(fs.readFileSync(framesFile, 'utf8'))) {
  const mean = Number(
    read('magick', [
      frame.file,
      '-scale',
      '32x20',
      '-format',
      '%[fx:mean]',
      'info:',
    ]),
  )
  if (mean > WHITE_FRAME_MEAN && kept.length > 0) {
    kept.at(-1).duration += frame.duration
    dropped++
  } else {
    kept.push({ ...frame })
  }
}
console.log(`dropped ${dropped} white frames, kept ${kept.length}`)

const concat = kept.flatMap(frame => [
  `file '${frame.file}'`,
  `duration ${frame.duration.toFixed(3)}`,
])
// The concat demuxer ignores the last duration unless the file repeats.
concat.push(`file '${kept.at(-1).file}'`)
fs.writeFileSync(path.join(dir, 'frames.txt'), `${concat.join('\n')}\n`)

const concatInput = ['-f', 'concat', '-safe', '0', '-i', 'frames.txt']
const ffmpeg = args =>
  run('ffmpeg', ['-loglevel', 'error', '-y', '-threads', '2', ...args])

fs.rmSync(path.join(dir, 'gif'), { recursive: true, force: true })
fs.mkdirSync(path.join(dir, 'gif'))
ffmpeg([
  ...concatInput,
  '-vf',
  'fps=12,scale=960:-1:flags=lanczos',
  'gif/%05d.png',
])
const gifFrames = fs
  .readdirSync(path.join(dir, 'gif'))
  .sort()
  .map(file => `gif/${file}`)
run('gifski', [
  '--quiet',
  '--fps',
  '12',
  '--width',
  '960',
  '--quality',
  '80',
  '-o',
  'demo.gif',
  ...gifFrames,
])

ffmpeg([
  ...concatInput,
  '-vf',
  'fps=30,format=yuv420p',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '18',
  '-movflags',
  '+faststart',
  'demo.mp4',
])

// Falls back to fontconfig's closest bold sans where Noto is not installed.
const font = read('fc-match', ['-f', '%{file}', 'Noto Sans:bold'])
for (const state of ['unblocked', 'blocked']) {
  magick([
    `home-${state}.png`,
    '-resize',
    '1200x750',
    '-gravity',
    'north',
    '-background',
    '#0b0b0d',
    '-extent',
    '1200x750',
    `before-after-${state}.png`,
  ])
}
magick([
  '-size',
  '2448x900',
  'xc:#0b0b0d',
  'before-after-unblocked.png',
  '-geometry',
  '+16+120',
  '-composite',
  'before-after-blocked.png',
  '-geometry',
  '+1232+120',
  '-composite',
  '-font',
  font,
  '-pointsize',
  '44',
  '-gravity',
  'northwest',
  '-fill',
  '#9a9aa0',
  '-annotate',
  '+40+40',
  'TikTok as it ships',
  '-fill',
  '#ff2a6d',
  '-annotate',
  '+1256+40',
  'With TikTok Feed Blocker',
  '-resize',
  '1600x',
  'before-after.png',
])

for (const file of ['demo.gif', 'demo.mp4', 'before-after.png']) {
  const { size } = fs.statSync(path.join(dir, file))
  console.log(`${file} ${(size / 1024).toFixed(0)}K`)
}

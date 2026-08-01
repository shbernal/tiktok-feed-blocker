// AMO requires the source of any bundled or minified add-on, and reviewers
// rebuild it and diff the result against the submitted package. `git archive`
// is the right producer: it emits exactly the tracked tree at a ref, so
// node_modules, build output, and untracked scratch files are excluded by
// construction rather than by a maintained exclude list.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { printHelpAndExit } from './help.mjs'

// A ref never starts with a dash — git would read one as an option — so the
// first non-flag argument is the ref. Taking argv[2] positionally instead sent
// `--help` and the `--` separator straight into `git archive` as a revision.
const ref =
  process.argv.slice(2).find(argument => !argument.startsWith('-')) ??
  process.env.SOURCE_REF ??
  'HEAD'
const releaseDir = path.resolve(process.cwd(), 'release')

const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim()

const version = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
).version

const output = path.join(
  releaseDir,
  `tiktok-feed-blocker-source-${version}.zip`,
)

printHelpAndExit(`
Usage: pnpm package:source [<ref>] [--help]

Writes the source archive AMO requires for a bundled add-on, using git archive
so it holds exactly the tracked tree at <ref> — node_modules, build output, and
untracked files are excluded by construction. Reviewers rebuild this archive
and diff the result against the submitted package.

Arguments
  <ref>       git ref to archive (default: HEAD); warns when it is HEAD and
              the working tree is dirty, because the archive then holds
              committed state only

Environment
  SOURCE_REF  git ref to archive; the positional argument wins

Writes release/tiktok-feed-blocker-source-${version}.zip, which is the default
pnpm publish:amo attaches as AMO_SOURCE.

See docs/ci-release-flow.md.
`)

// The archive is what reviewers build. Archiving a stale HEAD while the fix is
// still in the working tree is the failure this warning exists to catch.
if (ref === 'HEAD' && git(['status', '--porcelain']) !== '') {
  console.warn(
    'warning: working tree is dirty; the archive holds committed state only',
  )
}

fs.mkdirSync(releaseDir, { recursive: true })
git(['archive', '--format=zip', `--output=${output}`, ref])

const files = git(['ls-tree', '-r', '--name-only', ref]).split('\n').length
const size = fs.statSync(output).size

console.log(`${path.relative(process.cwd(), output)}`)
console.log(
  `ref ${git(['rev-parse', '--short', ref])} — ${files} files, ${size} bytes`,
)

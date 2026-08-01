// Shared `--help` handling for the scripts under `scripts/`. These scripts are
// reached through `pnpm run`, and pnpm forwards trailing flags to the last
// command in the script, so `pnpm e2e:real:open --help` arrives here intact.
// People also type the npm-style `pnpm e2e:real:open -- --help`, which leaves a
// bare `--` in argv; both spellings have to mean the same thing.
import process from 'node:process'

export const helpRequested = process.argv
  .slice(2)
  .filter(argument => argument !== '--')
  .some(argument => argument === '--help' || argument === '-h')

// Called before the script does any work, so help never launches a browser,
// writes a profile, or touches the network.
export const printHelpAndExit = text => {
  if (!helpRequested) {
    return
  }

  console.log(text.trim())
  process.exit(0)
}

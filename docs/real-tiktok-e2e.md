# Real TikTok E2E

The real TikTok checks are an opt-in smoke run that catches selector drift. They
add to the deterministic fixture E2E suite and do not replace it.

They depend on TikTok uptime, account state, regional UI, CAPTCHA and risk
prompts, the current DOM, and a local authenticated browser profile. Keep all
profile data local and out of git.

## Profiles

The default profile path is `.e2e/tiktok-real-profile`. Override it with
`TIKTOK_REAL_PROFILE_DIR=/path/to/profile`.

`.e2e/` is gitignored because a persistent profile holds credentials, cookies,
storage, and browsing history. Never commit a profile, cookie database, token,
or cookie value, and never paste TikTok cookies or tokens into chat.

## Standard login flow

Try this first. It works when TikTok allows login from headed Playwright
Chromium:

1. Create or pick a dummy TikTok account for testing.
2. Run `pnpm e2e:real:setup`.
3. Sign in by hand in the Chromium window.
4. Complete any CAPTCHA, 2FA, cookie, or region prompts.
5. Visit `https://www.tiktok.com/` once and confirm the account is signed in.
6. Close the Chromium tab or window.

`pnpm e2e:real:setup` opens the persistent profile without this extension.
`pnpm e2e:real` later reopens the same profile with the built extension loaded.

Check the profile by hand without running tests:

```bash
pnpm e2e:real:open
```

Run the full real smoke suite:

```bash
pnpm e2e:real
```

Run only some sections when one is unavailable:

```bash
TIKTOK_REAL_SECTIONS=home,explore pnpm e2e:real
```

## Cookie-imported profile fallback

On the maintainer's machine, TikTok's risk layer blocked manual login in headed
Playwright Chromium with this error:

```text
Maximum number of attempts reached. Try again later.
```

The same message appeared in a fresh headed Playwright profile with no extension
and mock email and password input. So it is a TikTok login block, and the
extension is not involved.

The fallback that works is a separate repo-local profile built from a desktop
Chromium profile that is already signed in:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real:open
```

Local validation currently uses `.e2e/tiktok-injected-profile`. Git ignores it.
Treat it as a live login session.

Copying Chromium's `Cookies` SQLite database directly does not work. Chromium
encrypts cookie values with a key bound to the local keyring and profile. A
straight copy can leave session-looking rows on disk while Chromium loads only
the non-session cookies. The procedure that works:

1. Start from a normal Chromium profile already signed in to TikTok, for example
   `~/.config/chromium/Profile 1`.
2. Read only the TikTok-domain cookie rows from that profile.
3. Decrypt those values locally with Chromium's keyring secret.
4. Launch a new, gitignored persistent Playwright Chromium profile under
   `.e2e/`.
5. Add the decrypted TikTok cookies through Playwright's cookie API, so Chromium
   writes them into the new profile's own encrypted store.
6. Close the browser and check the profile with `pnpm e2e:real:open`.

Keep the import helper or one-off command local. It must never print cookie
values or write them to tracked files.

Validate the imported profile:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real:open
```

The command should report a logged-in signal and show logged-in UI such as
Messages, Activity, Upload, and Profile instead of Log in buttons.

Run the real smoke suite with the imported profile:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real
```

## Selector coverage checks

`e2e/real/real-tiktok.spec.ts` has two describe blocks. The smoke block drives
blocking end to end. The coverage block is narrower: it asserts that every
selector a page's blocking depends on still matches at least one element on the
live site.

The fixture suite cannot see selector drift. When TikTok renames an element, a
fixture written to match the old selector keeps passing, and blocking quietly
does nothing while the suite stays green. The coverage block is the one place a
rename fails, and the failure message names the selector.

`loadBearingSelectors` in that file is the list. Add an entry whenever a section
starts depending on a new selector. Two selectors are left out on purpose:

- `progressIndicator` matches nothing on real Home. `SELECTORS` keeps it as a
  conservative fallback, so requiring a match would fail every run.
- `homeCommentSidebar` exists only while the comment sidebar is open, and the
  real run never opens it.

Neither exclusion is an oversight. Removing either one turns the suite red with
nothing actually broken.

`loadBearingSelectors` also drives the smoke block's blocked and restored
assertions. Hiding is a stylesheet gated on a root attribute, so the smoke test
checks `<html>` for `data-ttfb-<section>-blocked` and the computed `display` of
those selectors. It used to count per-element `data-ttfb-*-hidden` attributes.
This check confirms that the extension's `!important` rules beat TikTok's own
styles. The fixture suite cannot confirm that, because the fixtures do not load
TikTok's stylesheets.

## Overlay screenshot proof

The real TikTok overlay checks attach proof for every overlay state they expect
to be visible. For each state, the test writes a full viewport screenshot, a
cropped overlay screenshot, and a JSON file with the overlay text, class name,
computed CSS, viewport size, and bounding box.

The artifacts go to Playwright's gitignored `test-results/` directory and into
the HTML report. They can show real TikTok account UI and page content, so keep
them local and never commit or paste sensitive screenshots.

Overlay feature work on the real site is not done until each relevant visible
overlay state has screenshot proof. When you add a visible overlay state, make
the real smoke test call the overlay proof helper for it.

## Manual inspection commands

`pnpm e2e:real:open --help` lists these options with their defaults. Use it
instead of `pnpm e2e:real:open:extension --help`, which runs a full build before
it prints anything.

Open the default profile without the extension:

```bash
pnpm e2e:real:open
```

Open a specific profile:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real:open
```

Open a specific TikTok page:

```bash
TIKTOK_REAL_OPEN_URL=https://www.tiktok.com/live pnpm e2e:real:open
```

Open with the built extension loaded:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real:open:extension
```

Open a manual Playwright session with no timeout and the built extension loaded:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm manual:tiktok
```

Set `TIKTOK_MANUAL_URL=https://www.tiktok.com/explore` to start on another
TikTok route. The default start URL is `https://www.tiktok.com/`.

## Expected verification

Before trusting a real profile for selector checks, run:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real
```

Use the default profile path instead of `.e2e/tiktok-injected-profile` when the
standard login flow works.

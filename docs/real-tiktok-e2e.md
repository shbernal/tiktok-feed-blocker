# Real TikTok E2E

Real TikTok checks are an opt-in smoke layer for selector drift. They complement
the deterministic fixture E2E suite; they do not replace it.

These checks depend on TikTok uptime, account state, regional UI, CAPTCHA and
risk prompts, current DOM structure, and a local authenticated browser profile.
Keep all profile data local and ignored by git.

## Profiles

The default real profile path is `.e2e/tiktok-real-profile`. Override it with
`TIKTOK_REAL_PROFILE_DIR=/path/to/profile`.

`.e2e/` is gitignored because persistent profiles contain credentials, cookies,
storage, and browsing state. Never commit a profile, cookie database, token, or
cookie value. Do not paste TikTok cookies or tokens into chat.

## Standard Login Flow

Use this flow first when TikTok allows login from headed Playwright Chromium:

1. Create or choose a dummy TikTok account for testing.
2. Run `pnpm e2e:real:setup`.
3. Sign in manually in the Chromium window.
4. Complete any CAPTCHA, 2FA, cookie prompts, or region prompts.
5. Visit `https://www.tiktok.com/` once and confirm the account is signed in.
6. Close the Chromium tab or window.

`pnpm e2e:real:setup` opens the persistent profile without loading this
extension. `pnpm e2e:real` later reopens the same profile with the built
extension loaded.

Check the profile manually without running tests:

```bash
pnpm e2e:real:open
```

Run the full real smoke suite:

```bash
pnpm e2e:real
```

Run only selected sections when a TikTok section is unavailable:

```bash
TIKTOK_REAL_SECTIONS=home,explore pnpm e2e:real
```

## Cookie-Imported Profile Fallback

On this machine, manual login in headed Playwright Chromium was blocked by
TikTok's risk layer. The visible error was:

```text
Maximum number of attempts reached. Try again later.
```

That message reproduced in a fresh no-extension headed Playwright profile using
mock email/password input, so it was treated as a TikTok login/risk block rather
than an extension failure.

The working fallback is to create a separate repo-local profile from an already
signed-in desktop Chromium profile:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real:open
```

The imported profile currently used for local validation is
`.e2e/tiktok-injected-profile`. It is ignored by git and should be treated as an
active login session.

Do not copy Chromium's `Cookies` SQLite database directly and expect it to work.
Chromium stores encrypted cookie values bound to the local keyring/profile
context. A direct copy may leave session-looking rows on disk while Chromium only
loads non-session cookies. The reliable local procedure is:

1. Start from a normal Chromium profile that is already signed in to TikTok, for
   example `~/.config/chromium/Profile 1`.
2. Read only TikTok-domain cookie rows from that profile.
3. Decrypt those cookie values locally using Chromium's keyring secret.
4. Launch a new ignored persistent Playwright/Chromium profile under `.e2e/`.
5. Add the decrypted TikTok cookies through Playwright's cookie API so Chromium
   writes them back in the new profile's own encrypted store.
6. Close the browser and verify the profile with `pnpm e2e:real:open`.

Keep the import helper or one-off command local. It must not print cookie values
or write them to tracked files.

Validate the imported profile:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real:open
```

The command should report a logged-in signal and open TikTok with logged-in UI
such as Messages, Activity, Upload, and Profile rather than Log in buttons.

Run the real smoke suite with the imported profile:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real
```

## Manual Inspection Commands

Open the default profile without loading the extension:

```bash
pnpm e2e:real:open
```

Open a specific real profile:

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

Open a no-timeout manual Playwright session with the built extension loaded:

```bash
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm manual:tiktok
```

Set `TIKTOK_MANUAL_URL=https://www.tiktok.com/explore` to start on another
TikTok route. The default start URL is `https://www.tiktok.com/`.

## Expected Verification

Before relying on a real profile for selector checks, run:

```bash
pnpm format
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real
```

Use the default profile path instead of `.e2e/tiktok-injected-profile` when the
standard login flow is working.

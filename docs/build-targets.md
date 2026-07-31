# Build Targets

The same source tree builds two extension packages. The target is selected by
the `EXT_TARGET` environment variable, which `vite.config.ts` and
`manifest.config.ts` both read.

| Target  | Command              | `EXT_TARGET` | Output          |
| ------- | -------------------- | ------------ | --------------- |
| Chrome  | `pnpm build`         | unset        | `dist/`         |
| Firefox | `pnpm build:firefox` | `firefox`    | `dist-firefox/` |

Any value other than `firefox`, including none, builds the Chrome package. The
Chrome output is the default so the existing store workflow never has to opt in.

`pnpm package:firefox` builds the Firefox target and zips it to
`release/tiktok-feed-blocker-firefox-<version>.zip` with `web-ext build`. The
version comes from the built manifest, so it always matches `package.json`.
There is no matching `package:chrome`; the Chrome Web Store workflow zips
`dist/` inline.

`pnpm package:source` writes `release/tiktok-feed-blocker-source-<version>.zip`
from `git archive`, which AMO requires alongside every Firefox upload because
the package is bundled by Vite. It archives `HEAD` by default and takes a ref
argument for releases: `pnpm package:source v1.2.1`. See
[AMO Listing](./amo-listing.md).

## Target Differences

Only the manifest differs. The JavaScript, CSS, HTML, and icons are the same
bytes in both packages.

- **Background entry.** Chrome gets `background.service_worker`; Gecko has no
  extension service workers and gets `background.scripts` instead. crxjs reads
  this entry straight off `manifest.config.ts` and does not rewrite it per
  target, so the conditional has to live in the manifest config. crxjs does add
  `"type": "module"` to the Firefox entry itself.
- **`browser_specific_settings.gecko`.** Firefox only. It carries the add-on id
  `tiktok-feed-blocker@shbernal.github.io`, which AMO binds the listing to and
  which must never change, plus `strict_min_version` and
  `data_collection_permissions`.
- **Dev server CORS.** `pnpm dev` allows `chrome-extension://` origins by
  default and `moz-extension://` origins when `EXT_TARGET=firefox`.

`strict_min_version` is `140.0`. The floor is set by
`data_collection_permissions`, which Firefox only understands from 140 onward;
below that the key is silently ignored and the declaration never reaches the
user. Nothing else in the manifest needs a version that high.

## Validating the Firefox Package

`pnpm lint:firefox` is the fastest check that the package is valid for Gecko. It
catches unsupported manifest keys, bad add-on ids, and reserved keyboard
shortcuts.

Zero errors is the bar. Some warnings are expected and are not defects:

- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` for
  `data_collection_permissions`, which Firefox for Android only supports from
  version 142. The listing targets desktop, so the desktop floor stays at 140
  rather than excluding Firefox ESR users for an Android-only warning.
- `UNSAFE_VAR_ASSIGNMENT` for the overlay markup in `src/content/main.ts` and
  for React's bundle. The overlay templates interpolate only module constants,
  never page or user data.

## Firefox Runtime Validation

`pnpm validate:firefox` builds the Firefox package and exercises it in a real
Firefox against real TikTok pages, then writes screenshots and a
`validation.json` result file to `test-results/firefox/<binary>/`.

Playwright cannot load an MV3 extension in Firefox, so the runner in
`scripts/validate-firefox.mjs` talks to Firefox directly. Firefox exposes
WebDriver BiDi on `--remote-debugging-port`, and BiDi's `webExtension.install`
takes an unpacked directory, so the built package can be installed and driven
without geckodriver, a signed build, or an extra dependency. The profile pins
`extensions.webextensions.uuids` so the popup's `moz-extension://` URL is known
before the extension is installed.

The run covers the manual-validation list: the blocked overlay and hidden
content on Home, Explore, and Live; media muted while blocked; popup toggles
persisting to `storage.local` and surviving a reload; sections toggling
independently; hidden elements and media state restored when a section is
disabled; and `Ctrl+Shift+8` re-blocking the current page.

The checks run against logged-out TikTok, which reaches all three sections, so
no authenticated profile is needed.

Useful environment variables:

- `FIREFOX_BINARY` points the run at another Gecko browser.
- `FIREFOX_VALIDATE_HEADED=1` shows the browser instead of running headless.
- `FIREFOX_VALIDATE_PORT` moves the remote-agent port off `9333`.

### Zen

`FIREFOX_BINARY=/usr/bin/zen-browser pnpm exec node scripts/validate-firefox.mjs`
runs the same checks in Zen. Zen refuses to navigate any browsing context to a
`moz-extension://` URL, so the popup and `storage.local` checks are skipped
there and reported as `SKIP`; the in-page overlay switch drives the unblock step
instead. Everything the content script owns still runs. Zen is a sanity check,
not a release gate — Firefox is the gate.

## Chrome Regression Check

The Chrome package must not change when the Firefox target does. Build it and
compare `dist/manifest.json` against the previous build; asset filenames are
content-hashed, so an unchanged manifest means unchanged assets. Both targets
rebuild byte-identically from a clean output directory.

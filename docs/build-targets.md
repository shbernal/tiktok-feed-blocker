# Build targets

One source tree builds two extension packages. The `EXT_TARGET` environment
variable picks the target, and both `vite.config.ts` and `manifest.config.ts`
read it.

| Target  | Command              | `EXT_TARGET` | Output          |
| ------- | -------------------- | ------------ | --------------- |
| Chrome  | `pnpm build`         | unset        | `dist/`         |
| Firefox | `pnpm build:firefox` | `firefox`    | `dist-firefox/` |

Any value other than `firefox`, including none, builds the Chrome package.
Chrome is the default so the existing store workflow never has to opt in.

`pnpm package:firefox` builds the Firefox target and zips it to
`release/tiktok-feed-blocker-firefox-<version>.zip` with `web-ext build`. The
version comes from the built manifest, so it always matches `package.json`.
There is no `package:chrome`. The Chrome Web Store workflow zips `dist/` inline.

`pnpm package:source` writes `release/tiktok-feed-blocker-source-<version>.zip`
from `git archive`. AMO requires that archive with every Firefox upload because
Vite bundles the package. It archives `HEAD` by default and takes a ref for
releases: `pnpm package:source v1.2.1`. See [AMO listing](./amo-listing.md).

## Target differences

Only the manifest differs. The JavaScript, CSS, HTML, and icons are the same
bytes in both packages.

- **Background entry.** Chrome gets `background.service_worker`. Gecko has no
  extension service workers, so Firefox gets `background.scripts`. crxjs reads
  this entry straight from `manifest.config.ts` and does not rewrite it per
  target, so the conditional has to live in the manifest config. crxjs does add
  `"type": "module"` to the Firefox entry itself.
- **`browser_specific_settings.gecko`.** Firefox only. It carries the add-on id
  `tiktok-feed-blocker@shbernal.github.io`, which AMO ties the listing to and
  which must never change, plus `strict_min_version` and
  `data_collection_permissions`.
- **Dev server CORS.** `pnpm dev` allows `chrome-extension://` origins by
  default and `moz-extension://` origins when `EXT_TARGET=firefox`.

`strict_min_version` is `140.0` because of `data_collection_permissions`, which
Firefox only understands from 140. Below that, Firefox ignores the key without a
warning and the declaration never reaches the user. Nothing else in the manifest
needs a version that high.

## Validating the Firefox package

`pnpm lint:firefox` is the fastest check that the package is valid for Gecko. It
catches unsupported manifest keys, bad add-on ids, and reserved keyboard
shortcuts.

The bar is zero errors. These warnings are expected:

- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` for
  `data_collection_permissions`, which Firefox for Android supports only from
  version 142. The listing targets desktop, so the floor stays at 140 instead of
  dropping Firefox ESR users over an Android-only warning.
- `UNSAFE_VAR_ASSIGNMENT` for the overlay markup in `src/content/main.ts` and
  for React's bundle. The overlay templates interpolate module constants only,
  never page or user data.

## Firefox runtime validation

`pnpm validate:firefox` builds the Firefox package, runs it in a real Firefox
against real TikTok pages, and writes screenshots and a `validation.json` result
file to `test-results/firefox/<binary>/`.

Playwright cannot load an MV3 extension in Firefox, so
`scripts/validate-firefox.mjs` talks to Firefox directly. Firefox exposes
WebDriver BiDi on `--remote-debugging-port`, and BiDi's `webExtension.install`
accepts an unpacked directory. That installs and drives the built package with
no geckodriver, no signed build, and no extra dependency. The profile pins
`extensions.webextensions.uuids`, so the popup's `moz-extension://` URL is known
before the extension installs.

The run covers the manual validation list:

- the blocked overlay and hidden content on Home, Explore, and Live;
- media muted while blocked;
- popup toggles persisting to `storage.local` and surviving a reload;
- sections toggling independently;
- hidden elements and media state restored when a section is disabled;
- `Ctrl+Shift+8` re-blocking the current page.

It runs against logged-out TikTok, which reaches all three sections, so it needs
no authenticated profile.

Hiding is a stylesheet gated on a root attribute, so there is no per-element
bookkeeping to count. The run proves a section is hidden by reading `<html>` for
`data-ttfb-<section>-blocked` and the _computed_ display of every selector that
section hides. It also requires `data-ttfb-ready`. Without that attribute the
pre-settings rule hides everything, and a blank page would pass as a blocked
one. Finally it requires at least one selector to match, so the check fails when
TikTok renames the page's elements.

The script parses those selectors out of the built `src/content/blocking.css`
instead of repeating them. `buildBlockingStyleSheet` generates that file and
`tests/blocking-css.test.ts` guards it, so the validator always checks what
blocking actually hides. A selector added to a section comes under validation
with no change to the script.

Environment variables:

- `FIREFOX_BINARY` points the run at another Gecko browser.
- `FIREFOX_VALIDATE_HEADED=1` shows the browser instead of running headless.
- `FIREFOX_VALIDATE_PORT` moves the remote-agent port off `9333`.

`node scripts/validate-firefox.mjs --help` prints the same list with defaults.
`pnpm validate:firefox --help` also works, but builds the Firefox target first.

### Zen

`FIREFOX_BINARY=/usr/bin/zen-browser pnpm exec node scripts/validate-firefox.mjs`
runs the same checks in Zen. Zen refuses to navigate any browsing context to a
`moz-extension://` URL, so the run skips the popup and `storage.local` checks and
reports them as `SKIP`. The in-page overlay switch drives the unblock step
instead. Everything the content script owns still runs. Zen is a sanity check.
Firefox is the release gate.

## Chrome regression check

A Firefox-target change must leave the Chrome package unchanged. Build it and
compare `dist/manifest.json` with the previous build. Asset filenames carry a
content hash, so an unchanged manifest means unchanged assets. Both targets
rebuild byte-identically from a clean output directory.

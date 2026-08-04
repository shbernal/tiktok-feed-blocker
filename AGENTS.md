# Repository Instructions

## Hard Rule

Do not modify `README.md` unless told explicitly to do so.

## Project Shape

This is a Manifest V3 browser extension built with Vite, React, TypeScript, and
`@crxjs/vite-plugin`. It ships to the Chrome Web Store and to
addons.mozilla.org, and the same source tree builds both packages.

- `manifest.config.ts` defines the extension manifest, reads the version from
  `package.json`, and selects the build target from `EXT_TARGET`. Chrome is the
  default and builds to `dist/`; `EXT_TARGET=firefox` builds to `dist-firefox/`.
  Only manifest keys differ between the two.
- `src/background/worker.ts` handles the browser command that toggles blocking
  for the active TikTok tab. The basename has to stay distinct from every other
  script entry in `manifest.config.ts`; see the note there.
- `src/content/main.ts` runs on TikTok pages, hides page sections, mutes media,
  renders the in-page overlay, and listens for storage/runtime changes.
- `src/popup/App.tsx` is the extension popup UI for global and per-section
  toggles.
- `src/shared/settings.ts` owns storage keys, defaults, normalization, and legacy
  settings migration.
- `src/test/` contains shared Vitest test helpers, including the Chrome API
  mock.
- `docs/` contains contributor-facing documentation for tests and extension
  internals.
- `public/icons/` contains extension icons copied into builds.
- `store/` contains the listing assets both stores publish verbatim: the long
  description and the screenshots.
- `chrome-web-store/` contains the Chrome-specific privacy justifications.
- `amo/` contains the AMO-specific listing metadata, the previews manifest that
  captions and orders `store/screenshots/`, the data-collection answer, and
  reviewer build instructions.
- `scripts/` contains the packaging and publishing scripts run by CI.
- `tests/` contains source-convention guards that run in the same Vitest command
  as the unit tests.
- `dist/`, `dist-firefox/`, and `release/` are generated/packaged outputs and are
  ignored by git.

## Commands

Use `pnpm`.

- `pnpm build` - run TypeScript project build and create the Chrome extension
  build in `dist/`.
- `pnpm build:firefox` - build the Firefox target in `dist-firefox/`.
- `pnpm lint:firefox` - build the Firefox target and check it with
  `web-ext lint`. Zero errors is the bar; a few warnings are expected.
- `pnpm validate:firefox` - drive the built Firefox package in a real Firefox
  against real TikTok pages.
- `pnpm typecheck` - run TypeScript checks only.
- `pnpm test` - run the Vitest suite once.
- `pnpm test:watch` - run Vitest in watch mode.
- `pnpm test:coverage` - run tests with V8 coverage output.
- `pnpm format` - check Prettier formatting.
- `pnpm dev` - start the Vite dev server for extension development.
- `pnpm preview` - preview the Vite build.

For code changes, run at least `pnpm typecheck` and `pnpm test`; run
`pnpm build` when touching manifest, content script, background script, popup,
shared settings, icons, or packaging behavior. Also run `pnpm lint:firefox` when
touching the manifest or packaging — Gecko rejects manifest keys Chrome accepts,
so the Firefox target can break on a change that leaves the Chrome build
healthy.

## Coding Guidelines

- Keep changes narrow and follow the existing TypeScript style: strict types,
  no semicolons, single quotes, 2-space indentation, and 80-column Prettier
  wrapping.
- Prefer shared helpers in `src/shared/settings.ts` for storage shape changes.
  Preserve migration support for `LEGACY_ACTIVE_STORAGE_KEY` unless the user
  explicitly asks to remove it.
- Treat `ExtensionSettings` and `PageSection` as the contract between popup,
  content script, and storage. Update all three surfaces together when adding or
  removing a page section.
- Keep content-script DOM changes idempotent. Use stable constants for element
  IDs, data attributes, and selectors, and make sure clear/restore paths undo
  any managed hiding or media mutation.
- TikTok DOM selectors are brittle. When changing selectors in
  `src/content/main.ts`, keep fallback behavior conservative and avoid matching
  broad elements that could hide unrelated TikTok UI.
- Preserve user media state when muting. If adding new media-blocking behavior,
  store previous muted/volume/paused state before mutating and restore it when
  blocking is disabled.
- Never `await` a `chrome.*` call in `src/`. This is a Firefox requirement, not
  a preference: Gecko exposes `chrome.*` as callback-only and puts the
  promise-returning variants on `browser.*`, so an awaited call resolves to
  `undefined` there while every Chrome test still passes.
  `tests/browser-api-compat.test.ts` enforces this.
- Keep popup UI compact. The popup is fixed around a 320px width; avoid adding
  verbose explanatory text inside the extension UI.

## Documentation Guidelines

- Prefer documenting contributor-facing test, architecture, and maintenance
  notes in `docs/`; keep `README.md` unchanged unless explicitly requested.
- After implementation or validation runs, consider whether the work changed the
  test workflow, settings contract, content-script DOM behavior, Chrome API
  assumptions, or packaging behavior. If it did, update the relevant docs in the
  same change.
- Keep docs concise and tied to the current code. Avoid speculative roadmap
  notes unless the user asks for planning documentation.

## Generated And Release Files

- Do not hand-edit `dist/` or `dist-firefox/`; update source/config and rebuild
  instead.
- Do not create or replace files in `release/` unless doing explicit release
  packaging.
- Do not change `chrome-web-store/`, `amo/`, or `store/` assets unless the task
  is about listing screenshots or store metadata. `store/` holds what both
  stores publish verbatim — the long description and the screenshots. Edit those
  once and never reintroduce a per-store copy. Everything still under
  `chrome-web-store/` and `amo/` answers a store-specific policy or metadata
  question and is meant to differ.
- Editing `store/description.txt` is a live change to the AMO listing:
  `scripts/publish-amo.mjs` reapplies it on every release. The Chrome Web Store
  has no such automation, so the same edit reaches Chrome only when someone
  pastes it into the Developer Dashboard.
- Replacing anything in `store/screenshots/` also needs `amo/previews.json`
  checked, since it captions and orders those files by path. Screenshots reach
  AMO only through an explicit `pnpm publish:amo --assets-only --sync-previews`;
  a release prints the drift but never syncs them. Chrome needs the same manual
  dashboard upload as the description.
- Do not change `browser_specific_settings.gecko.id`. AMO binds the listing and
  every installed user's update path to it, so a new id is a new add-on.
- Do not bump `package.json` version unless explicitly requested.

## Manual Validation Notes

After a build, load `dist/` as an unpacked extension in Chrome or a Chromium
browser when behavior needs runtime validation. `pnpm validate:firefox` covers
the same list automatically on the Firefox side. Check at least:

- popup toggles persist via `chrome.storage.local`;
- Home, Explore, and Live settings can be toggled independently;
- the command in `manifest.config.ts` toggles the currently detected TikTok page;
- disabled sections restore hidden elements and media state.

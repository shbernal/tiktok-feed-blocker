# Documentation index

Contributor notes on how the extension works and how it ships. User-facing
marketing or install copy belongs elsewhere unless a task asks for it here.

- [Testing](./testing.md) covers the Vitest setup, the Chrome API mock, and where
  to add coverage.
- [Real TikTok E2E](./real-tiktok-e2e.md) covers the opt-in smoke run against
  the real site, persistent profiles, manual inspection commands, and the
  cookie-imported profile fallback.
- [Code overview](./code-overview.md) walks through the popup, background, and
  content script, and the contracts between them.
- [Build targets](./build-targets.md) covers the Chrome and Firefox build
  commands, how their manifests differ, and how to lint and run the Firefox
  package.
- [Firefox and AMO](./firefox-amo.md) covers the callback-only `chrome.*` rule
  and why the polyfill lost, the permanent add-on id, the data-collection
  declaration, and what listing on addons.mozilla.org commits the repository to.
- [CI and release flow](./ci-release-flow.md) covers GitHub Actions validation
  and publishing to the Chrome Web Store and addons.mozilla.org.
- [Chrome Web Store listing](./chrome-web-store.md) covers the listing copy, the
  privacy form justifications, and the assets the store listing uses.
- [AMO listing](./amo-listing.md) covers the addons.mozilla.org listing copy,
  metadata, data-collection answer, and the source-submission requirement.
- [Media capture](./media-capture.md) covers how the README demo and the store
  screenshot stills are recorded on real TikTok, and why that runs in a capped
  systemd unit.

When a change touches behavior, the settings shape, Chrome API usage, or the
test harness, check these docs in the same change.

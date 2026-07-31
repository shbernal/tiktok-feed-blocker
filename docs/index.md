# Documentation Index

This directory contains contributor-facing notes for the extension internals.
Keep user-facing marketing or installation copy out of this directory unless the
task explicitly calls for it.

- [Testing](./testing.md) explains the Vitest setup, Chrome API mock, and where
  to add coverage.
- [Real TikTok E2E](./real-tiktok-e2e.md) documents the opt-in real-site smoke
  workflow, persistent profiles, manual inspection commands, and the local
  cookie-imported profile fallback.
- [Code Overview](./code-overview.md) summarizes the extension runtime surfaces
  and the contracts between them.
- [Build Targets](./build-targets.md) documents the Chrome and Firefox build
  commands, how the two manifests differ, and how to lint and runtime-validate
  the Firefox package.
- [Firefox and AMO](./firefox-amo.md) documents the callback-only `chrome.*`
  rule and why the polyfill was rejected, the permanent add-on id, the
  data-collection declaration, and what distributing on addons.mozilla.org
  obliges the repository to do.
- [CI and Release Flow](./ci-release-flow.md) documents GitHub Actions
  validation and publishing to both the Chrome Web Store and
  addons.mozilla.org.
- [Chrome Web Store Listing](./chrome-web-store.md) documents the repository
  copy, privacy form justifications, and assets used for the public store
  listing.
- [AMO Listing](./amo-listing.md) documents the addons.mozilla.org listing copy,
  metadata, data-collection answer, and the source-submission requirement.

When behavior, settings shape, Chrome API usage, or the test harness changes,
check whether these docs should be updated in the same change.

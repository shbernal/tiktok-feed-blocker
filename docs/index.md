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
- [CI and Release Flow](./ci-release-flow.md) documents GitHub Actions
  validation and Chrome Web Store publishing.
- [Chrome Web Store Listing](./chrome-web-store.md) documents the repository
  copy and assets used for the public store listing.

When behavior, settings shape, Chrome API usage, or the test harness changes,
check whether these docs should be updated in the same change.

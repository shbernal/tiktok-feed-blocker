# Documentation Index

This directory contains contributor-facing notes for the extension internals.
Keep user-facing marketing or installation copy out of this directory unless the
task explicitly calls for it.

- [Testing](./testing.md) explains the Vitest setup, Chrome API mock, and where
  to add coverage.
- [Code Overview](./code-overview.md) summarizes the extension runtime surfaces
  and the contracts between them.
- [CI and Release Flow](./ci-release-flow.md) documents GitHub Actions
  validation and Chrome Web Store publishing.

When behavior, settings shape, Chrome API usage, or the test harness changes,
check whether these docs should be updated in the same change.

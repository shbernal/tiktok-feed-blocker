# CI and Release Flow

This project uses GitHub Actions for pull-request validation and Chrome Web
Store publishing.

## Workflows

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.

The CI job:

1. Checks out the repository.
2. Installs pnpm `11.3.0`.
3. Sets up Node `24` with pnpm caching.
4. Installs dependencies with `pnpm install --frozen-lockfile`.
5. Runs `pnpm format`.
6. Runs `pnpm typecheck`.
7. Runs `pnpm test`.
8. Runs `pnpm build`.

`.github/workflows/publish-cws.yml` runs when a GitHub Release is published.
It validates the release, builds the extension, uploads the packaged `dist/`
directory to Chrome Web Store, submits the item for review, and attaches the zip
to the GitHub Release.

## Release Publishing

The publish workflow uses the GitHub environment `chrome-web-store`.

The release job:

1. Checks out the release tag.
2. Runs the same install, format, typecheck, test, and build gates as CI.
3. Verifies the configured GitHub repository variables are present.
4. Verifies the release tag matches `package.json`.
5. Zips the generated `dist/` directory.
6. Authenticates to Google Cloud through GitHub OIDC.
7. Uploads the zip with Chrome Web Store API v2.
8. Polls Chrome Web Store upload processing status.
9. Submits the item for publishing.
10. Uploads the zip as a GitHub Release asset.

Release tags should use a leading `v`, for example `v1.2.0`. The workflow strips
the leading `v` and requires the remaining value to match `package.json`
exactly. For `v1.2.0`, `package.json` must contain `"version": "1.2.0"`.

## GitHub Configuration

The publish workflow expects these repository variables:

- `CWS_EXTENSION_ID`
- `CWS_PUBLISHER_ID`
- `GCP_PROJECT_ID`
- `GCP_SERVICE_ACCOUNT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`

These values are identifiers and configuration, not credentials. Do not store a
Google service-account JSON key in GitHub for this flow.

The workflow also uses these permissions:

- `contents: write`, so it can attach the packaged zip to the GitHub Release.
- `id-token: write`, so GitHub Actions can request an OIDC token for Google
  Cloud authentication.

## Google Cloud Configuration

Chrome Web Store publishing is authenticated through Google Cloud Workload
Identity Federation.

The Google Cloud setup has three parts:

1. A service account that is authorized in the Chrome Web Store Developer
   Dashboard.
2. A Workload Identity Pool provider that trusts GitHub Actions OIDC tokens.
3. An IAM binding that lets this repository's GitHub Actions identity
   impersonate the Chrome Web Store service account.

The provider should remain restricted to this repository and release tag refs:

```text
assertion.repository == 'shbernal/tiktok-feed-blocker' &&
  assertion.ref.startsWith('refs/tags/')
```

That restriction means pull requests, branch pushes, and workflows from other
repositories cannot use the Chrome Web Store service account through this trust
path.

## Normal Release Procedure

1. Update `package.json` to the next Chrome extension version.
2. Run local validation:

   ```sh
   pnpm format
   pnpm typecheck
   pnpm test
   pnpm build
   ```

3. Commit the version bump.
4. Push `main`.
5. Publish a GitHub Release with a matching tag, for example `v1.2.0`.
6. Watch the `Publish Chrome Web Store` GitHub Actions run.
7. Confirm Chrome Web Store shows the new version as submitted or published.

Chrome Web Store rejects reused extension versions, so every release must bump
`package.json` before publishing.

## Useful Checks

List recent runs:

```sh
gh run list --repo shbernal/tiktok-feed-blocker --limit 10
```

Watch a run:

```sh
gh run watch <run-id> --repo shbernal/tiktok-feed-blocker --exit-status
```

Inspect the release asset:

```sh
gh release view v1.2.0 \
  --repo shbernal/tiktok-feed-blocker \
  --json tagName,name,isDraft,isPrerelease,assets,url
```

List configured repository variables:

```sh
gh variable list --repo shbernal/tiktok-feed-blocker
```

## Security Notes

GitHub repository variables are not secrets. They are suitable here because the
workflow stores only IDs and configuration names in variables.

The sensitive part of the release flow is the short-lived Google access token.
It is minted inside the release job through OIDC and is not stored in GitHub.

Do not print access tokens in workflow logs. If a future change introduces a
sensitive value that is not managed as a GitHub secret, mask it explicitly before
use.

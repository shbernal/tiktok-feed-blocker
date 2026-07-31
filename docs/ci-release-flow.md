# CI and Release Flow

This project uses GitHub Actions for pull-request validation and for publishing
to the Chrome Web Store and addons.mozilla.org.

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
9. Runs `pnpm lint:firefox`, which builds the Firefox target and validates it
   with `web-ext lint`.

`.github/workflows/publish-cws.yml` runs when a GitHub Release is published.
It validates the release, builds the extension, uploads the packaged `dist/`
directory to Chrome Web Store, submits the item for review, and attaches the zip
to the GitHub Release.

`.github/workflows/publish-amo.yml` runs on the same trigger and submits the
Firefox package to addons.mozilla.org. Both publish workflows run on every
published release; neither depends on the other.

## Chrome Web Store Publishing

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
`publish-amo.yml` applies the same check.

## AMO Publishing

The AMO workflow uses the GitHub environment `addons-mozilla-org`.

The release job:

1. Checks out the release tag.
2. Runs the same install, format, typecheck, and test gates as CI.
3. Verifies the release tag matches `package.json`.
4. Runs `pnpm package:source`, which archives the checked-out tag.
5. Runs `pnpm package:firefox` and validates the result with `web-ext lint`.
6. Runs `pnpm publish:amo`.
7. Uploads both zips as GitHub Release assets.

`scripts/publish-amo.mjs` drives the AMO API v5 directly rather than going
through `web-ext sign`, which wraps the same endpoints but reports listed-channel
review state poorly and has exited non-zero on submissions that succeeded. The
script:

1. Verifies the credentials with an authenticated no-op call, before uploading
   anything.
2. Uploads the package to the `listed` channel and polls until AMO reports the
   upload processed and valid, dumping validation errors on failure.
3. Sends `PUT /api/v5/addons/addon/<guid>/`, which creates the add-on on a first
   submission and a new version afterwards. This carries the listing metadata
   from `amo/listing.json` and the reviewer notes lifted from
   `amo/source-submission.md`.
4. Attaches the source archive in a second call, because AMO cannot accept
   source as JSON or nested in a form-data version object.

Every request mints its own JWT. AMO caps a token's lifetime at five minutes
past issue, which is shorter than validation polling can run.

A listed AMO version is queued for human review and does not go live on
submission. The successful outcome is an add-on status of `nominated` on a first
submission, or a file status of `awaiting review` on later versions. The workflow
treats those as success; waiting for `public` would fail every release.

## GitHub Configuration

The publish workflow expects these repository variables:

- `CWS_EXTENSION_ID`
- `CWS_PUBLISHER_ID`
- `GCP_PROJECT_ID`
- `GCP_SERVICE_ACCOUNT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`

These values are identifiers and configuration, not credentials. Do not store a
Google service-account JSON key in GitHub for this flow.

The AMO workflow expects these secrets on the `addons-mozilla-org` environment:

- `MOZILLA_ADDON_JWT_ISSUER`
- `MOZILLA_ADDON_JWT_SECRET`

These are real credentials, not identifiers, so they are environment secrets
rather than repository variables. The environment is restricted to `v*` tags, so
a workflow on a branch cannot read them.

`publish-cws.yml` uses these permissions:

- `contents: write`, so it can attach the packaged zip to the GitHub Release.
- `id-token: write`, so GitHub Actions can request an OIDC token for Google
  Cloud authentication.

`publish-amo.yml` uses only `contents: write`. AMO has no OIDC path, so there is
no token to request.

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
   pnpm e2e
   pnpm build
   ```

3. For content-script, selector, or in-page UI changes, run the real-site smoke
   suite with the local authenticated profile and confirm the generated overlay
   proof artifacts when overlays are part of the change:

   ```sh
   TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real
   ```

4. Check whether `chrome-web-store/description.txt`, `amo/description.txt`, or
   listing screenshots need updates for the user-facing change.
5. Commit the release candidate and version bump.
6. Push `main`.
7. Publish a GitHub Release with a matching tag, for example `v1.2.0`.
8. Watch the `Publish Chrome Web Store` and `Publish addons.mozilla.org` runs.
9. Confirm Chrome Web Store shows the new version as submitted or published, and
   that AMO shows it as awaiting review.

Both stores reject reused extension versions, so every release must bump
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

List the AMO environment secrets, by name only:

```sh
gh secret list --env addons-mozilla-org --repo shbernal/tiktok-feed-blocker
```

Check the AMO credentials, or preview what a submission would send, without
uploading anything:

```sh
pnpm publish:amo --check
pnpm publish:amo --dry-run
```

Put a candidate package through AMO's real validator before cutting a release
tag. An upload on its own creates no listing and does not claim the add-on id,
so this submits nothing:

```sh
pnpm package:firefox
pnpm publish:amo --validate-only
```

Check the public AMO state of the add-on. This needs no authentication:

```sh
curl -s \
  "https://addons.mozilla.org/api/v5/addons/addon/tiktok-feed-blocker@shbernal.github.io/" |
  jq '{status, version: .current_version.version}'
```

## Security Notes

GitHub repository variables are not secrets. They are suitable for the Chrome
Web Store flow because it stores only IDs and configuration names in variables.

Chrome Web Store publishing stores no credential at all: the sensitive value is a
short-lived Google access token, minted inside the release job through OIDC.

AMO publishing does store a credential. Mozilla issues a long-lived JWT issuer
and secret and offers no OIDC equivalent, so `MOZILLA_ADDON_JWT_SECRET` is a
GitHub environment secret. It is scoped to the `addons-mozilla-org` environment
and to `v*` tags, and `scripts/publish-amo.mjs` never logs the secret or a token
minted from it. Rotate it at
`addons.mozilla.org/developers/addon/api/key/` if it is ever exposed; revoking
there invalidates it immediately.

Do not print access tokens in workflow logs. If a future change introduces a
sensitive value that is not managed as a GitHub secret, mask it explicitly before
use.

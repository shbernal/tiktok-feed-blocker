# CI and release flow

GitHub Actions validates pull requests and publishes releases to the Chrome Web
Store and addons.mozilla.org.

## Workflows

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`.

The `validate` job:

1. Checks out the repository.
2. Installs pnpm `11.3.0`.
3. Sets up Node `24` with pnpm caching.
4. Installs dependencies with `pnpm install --frozen-lockfile`.
5. Runs `pnpm format`.
6. Runs `pnpm lint`, which is oxlint over the source tree.
7. Runs `pnpm typecheck`.
8. Runs `pnpm test:coverage`, which enforces the coverage thresholds in
   `vitest.config.ts`.
9. Runs `pnpm build`.
10. Runs `pnpm lint:firefox`, which builds the Firefox target and checks it with
    `web-ext lint`.

`pnpm format` runs oxfmt and `pnpm lint` runs oxlint. Both replaced Prettier and
keep their settings in `.oxfmtrc.json` and `.oxlintrc.json`. Those files allow
comments, and the comments in `.oxlintrc.json` explain its two rule exemptions.

The `e2e` job runs the mock-backed Playwright suite (`e2e/specs/`) on its own,
so a browser flake fails only the end-to-end check and the unit-test result
stays readable. It installs Playwright's Chromium and uploads the Playwright
report as an artifact. `e2e/real/` and `e2e/manual/` stay out of CI because they
drive real TikTok and need credentials.

The coverage thresholds sit a couple of points below the measured numbers, so
an unrelated change cannot quietly lower coverage. Raise them when coverage
rises; never lower them to make a change pass. The text reporter leaves out
fully covered files. That is `skipFull`, not a gap in the report.

`.github/dependabot.yml` opens weekly `npm` and `github-actions` update pull
requests, with development dependencies grouped into one. Store reviewers flag
stale bundled dependencies, so keep these merged.

`.github/workflows/publish-cws.yml` runs when a GitHub Release is published. It
validates the release, builds the extension, uploads the packaged `dist/`
directory to the Chrome Web Store, submits the item for review, and attaches the
zip to the GitHub Release.

`.github/workflows/publish-amo.yml` runs on the same trigger and submits the
Firefox package to addons.mozilla.org. Every published release runs both publish
workflows, and neither depends on the other.

## Chrome Web Store publishing

The publish workflow uses the `chrome-web-store` GitHub environment.

The release job:

1. Checks out the release tag.
2. Runs the same install, format, lint, typecheck, test, and build gates as CI.
3. Checks that the required GitHub repository variables are set.
4. Checks that the release tag matches `package.json`.
5. Zips the generated `dist/` directory.
6. Authenticates to Google Cloud through GitHub OIDC.
7. Checks for a pending submission: it calls `:fetchStatus`, prints the
   published and submitted revision states and versions, and fails before
   uploading if the submitted revision is `PENDING_REVIEW` or `STAGED`.
8. Uploads the zip with Chrome Web Store API v2.
9. Polls the Chrome Web Store until upload processing finishes.
10. Submits the item for publishing.
11. Uploads the zip as a GitHub Release asset.

The two steps that write a response to a file take the HTTP status from curl's
`-w '%{http_code}'` instead of using `--fail-with-body`. With `--fail-with-body`
curl writes the body to the file and exits non-zero, and the default `bash -e`
then ends the step before anything prints the body. That is how release 1.4.1
failed on a 400 whose message never appeared. The steps now print whatever
Chrome returns before checking the status.

Release tags use a leading `v`, for example `v1.2.0`. The workflow strips the
`v` and requires the rest to match `package.json` exactly. For `v1.2.0`,
`package.json` must say `"version": "1.2.0"`. `publish-amo.yml` runs the same
check.

## AMO publishing

The AMO workflow uses the `addons-mozilla-org` GitHub environment.

The release job:

1. Checks out the release tag.
2. Runs the same install, format, lint, typecheck, and test gates as CI.
3. Checks that the release tag matches `package.json`.
4. Runs `pnpm package:source`, which archives the checked-out tag.
5. Runs `pnpm package:firefox` and checks the result with `web-ext lint`.
6. Runs `pnpm publish:amo`.
7. Uploads both zips as GitHub Release assets.

`scripts/publish-amo.mjs` calls the AMO API v5 directly instead of using
`web-ext sign`. `web-ext sign` wraps the same endpoints, but it reports
listed-channel review state poorly and has exited non-zero on submissions that
succeeded. The script:

1. Checks the credentials with an authenticated no-op call before uploading
   anything.
2. Uploads the package to the `listed` channel and polls until AMO reports it
   processed and valid, printing validation errors on failure.
3. Sends `PUT /api/v5/addons/addon/<guid>/`, which creates the add-on on a first
   submission and a new version after that. The request carries the listing
   metadata from `amo/listing.json` and the reviewer notes from
   `amo/source-submission.md`.
4. Attaches the source archive in a second call, because AMO cannot take source
   as JSON or nested in a form-data version object.
5. Reapplies the listing icon from `public/icons/icon128.png` and prints how far
   the published screenshots have drifted from `amo/previews.json`.

The release job does not pass `--sync-previews`, so a release never replaces
screenshots. The drift line makes a needed sync visible. Run one by hand with
`pnpm publish:amo --assets-only --sync-previews`, which uploads no package and
creates no version. [AMO listing](amo-listing.md) explains why previews are
opt-in and the icon is not.

Every request mints its own JWT. AMO caps a token's lifetime at five minutes
from issue, and validation polling can run longer than that.

The script retries a 429 only when this run can serve the wait: at most 70
minutes for one wait and two hours for the whole run. A longer wait means a
throttle bucket that refills slower than a GitHub job lives, so the run fails
and prints when to re-run. See
[Preview writes are throttled hard](amo-listing.md#preview-writes-are-throttled-hard).

AMO queues a listed version for human review, so it does not go live on
submission. Success is a file status of `unreviewed`, which the developer
dashboard shows as "Awaiting Review", plus an add-on status of `nominated` until
AMO approves the first version. The workflow treats those as success. Waiting
for `public` would fail every release.

## GitHub configuration

The Chrome publish workflow reads these repository variables:

- `CWS_EXTENSION_ID`
- `CWS_PUBLISHER_ID`
- `GCP_PROJECT_ID`
- `GCP_SERVICE_ACCOUNT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`

They are identifiers and configuration, not credentials. Do not store a Google
service-account JSON key in GitHub for this flow.

The AMO workflow reads these secrets from the `addons-mozilla-org` environment:

- `MOZILLA_ADDON_JWT_ISSUER`
- `MOZILLA_ADDON_JWT_SECRET`

These are real credentials, so they are environment secrets and not repository
variables. The environment only allows `v*` tags, so a workflow on a branch
cannot read them.

`publish-cws.yml` has these permissions:

- `contents: write`, to attach the packaged zip to the GitHub Release.
- `id-token: write`, to request an OIDC token for Google Cloud authentication.

`publish-amo.yml` has only `contents: write`. AMO has no OIDC option, so there is
no token to request.

## Google Cloud configuration

Chrome Web Store publishing authenticates through Google Cloud Workload Identity
Federation. The setup has three parts:

1. A service account authorized in the Chrome Web Store Developer Dashboard.
2. A Workload Identity Pool provider that trusts GitHub Actions OIDC tokens.
3. An IAM binding that lets this repository's GitHub Actions identity
   impersonate the Chrome Web Store service account.

Keep the provider restricted to this repository and to release tag refs:

```text
assertion.repository == 'shbernal/tiktok-feed-blocker' &&
  assertion.ref.startsWith('refs/tags/')
```

With that condition, pull requests, branch pushes, and workflows in other
repositories cannot use the Chrome Web Store service account through this trust.

## Normal release procedure

1. Bump `package.json` to the next extension version.
2. Run local validation:

   ```sh
   pnpm format
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm e2e
   pnpm build
   ```

3. For content-script, selector, or in-page UI changes, run the real-site smoke
   suite with the local authenticated profile. When overlays are part of the
   change, check the overlay screenshot proof it writes:

   ```sh
   TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile pnpm e2e:real
   ```

4. Check whether `store/description.txt` or `store/screenshots/` need updating
   for the user-facing change. The release job reapplies the description to
   AMO. Chrome needs a manual Developer Dashboard paste, so note it if the
   description changed.
5. Commit the release candidate and the version bump.
6. Push `main`.
7. Check that the Chrome Web Store has no submission still in review. Releasing
   while one is pending fails the Chrome job (see
   [When a publish job fails](#when-a-publish-job-fails)).
8. Publish a GitHub Release with a matching tag, for example `v1.2.0`.
9. Watch the `Publish Chrome Web Store` and `Publish addons.mozilla.org` runs.
10. Confirm the Chrome Web Store shows the new version as submitted or
    published, and that AMO shows it as awaiting review.
11. If the release job printed a previews drift line, run
    `pnpm publish:amo --assets-only --sync-previews` to reapply the screenshots.
    The job never does this itself.

Both stores reject a reused extension version, so every release must bump
`package.json` before publishing.

## When a publish job fails

The two publish jobs are independent, and a store that rejected a submission
usually has not recorded the version at all. Re-run the failed job instead of
cutting a new tag:

```sh
gh run rerun <run-id> --repo shbernal/tiktok-feed-blocker
```

A re-run replays the original commit, so it does not pick up a fix pushed to
`main` afterwards. That fix only reaches the next release. A re-run is for a
store-side condition that has since cleared.

GitHub only allows re-running a run within 30 days of the original run. After
that, a re-run is impossible, and the version has to ship as a new release or
as a manual upload.

Two store-side conditions are known:

- **AMO throttled the submission.** The failure prints when the bucket refills,
  so re-run after that. AMO's daily add-on-submission budget is per user and a
  release spends about four calls, so a release cut within a day of the previous
  one can hit it.
- **Chrome has a submission in review.** The Chrome Web Store API v2 answers an
  upload against an item with a pending submission with HTTP 400 ("Item is in
  review"). This is what stopped 1.4.1: on 2026-08-04, v1.4.0 was submitted at
  09:40 UTC and v1.4.1 at 19:09 UTC, while 1.4.0 was still in review. The run
  was past the 30-day re-run window by the time anyone looked, and on 2026-09-14
  the store still served 1.4.0 with no pending submission. So 1.4.1 never
  reached Chrome, even though AMO has it public. The "Check for a pending
  submission" step now fails the job before uploading and names the pending
  version. Either wait for that review to finish, or withdraw it before
  uploading again, with "Cancel review" in the Developer Dashboard or with:

  ```sh
  curl -X POST -H "Authorization: Bearer $TOKEN" \
    "https://chromewebstore.googleapis.com/v2/publishers/<publisher>/items/<item>:cancelSubmission"
  ```

  To check which version Chrome is actually serving:

  ```sh
  curl -sI "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=200&acceptformat=crx3&x=id%3D<extension-id>%26uc" | grep -i location
  ```

Neither case uses up the version number. Neither store created anything, so the
same tag can be re-run until it lands, within the 30-day window.

## Useful checks

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

List the configured repository variables:

```sh
gh variable list --repo shbernal/tiktok-feed-blocker
```

List the AMO environment secrets, by name only:

```sh
gh secret list --env addons-mozilla-org --repo shbernal/tiktok-feed-blocker
```

`pnpm publish:amo --help` lists every flag and the environment variables it
reads.

Check the AMO credentials, or preview what a submission would send, without
uploading anything:

```sh
pnpm publish:amo --check
pnpm publish:amo --dry-run
```

Run a candidate package through AMO's real validator before cutting a release
tag. An upload alone creates no listing and does not claim the add-on id, so
this submits nothing:

```sh
pnpm package:firefox
pnpm publish:amo --validate-only
```

Check the public AMO state of the add-on:

```sh
curl -s \
  "https://addons.mozilla.org/api/v5/addons/addon/tiktok-feed-blocker@shbernal.github.io/" |
  jq '{status, version: .current_version.version}'
```

This endpoint only serves public add-ons. Once AMO approves the add-on it needs
no authentication, but before that it returns `401`. A `401` while the first
version is in review means "not public yet", not "credentials missing". Use
`pnpm publish:amo --check` to test credentials.

## Security notes

GitHub repository variables are not secrets. The Chrome Web Store flow can use
them because it keeps only ids and configuration names there.

Chrome Web Store publishing stores no credential. The only sensitive value is a
short-lived Google access token that the release job mints through OIDC.

AMO publishing does store a credential. Mozilla issues a long-lived JWT issuer
and secret and has no OIDC equivalent, so `MOZILLA_ADDON_JWT_SECRET` is a GitHub
environment secret. It is scoped to the `addons-mozilla-org` environment and to
`v*` tags, and `scripts/publish-amo.mjs` never logs the secret or any token
minted from it. If it is ever exposed, rotate it at
`addons.mozilla.org/developers/addon/api/key/`. Revoking it there takes effect
immediately.

Never print access tokens in workflow logs. If a change introduces a sensitive
value that is not a GitHub secret, mask it explicitly before using it.

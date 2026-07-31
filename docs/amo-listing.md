# AMO Listing

addons.mozilla.org listing assets live in `amo/`, mirroring how
`chrome-web-store/` holds the Chrome Web Store listing.

- `amo/description.txt` contains the long description for the listing.
- `amo/listing.json` contains the rest of the listing metadata — slug, summary,
  categories, tags, and support links — in the shape the AMO API accepts.
- `amo/data-collection.md` contains the `data_collection_permissions` answer,
  the evidence it rests on, and paste-ready permission justifications for
  reviewer notes.
- `amo/source-submission.md` contains the reviewer build instructions and how to
  produce the source archive.

Screenshots are shared with the Chrome listing: `chrome-web-store/screenshots/`
holds the three images used on both stores. AMO has no promo-tile requirement,
so it needs nothing the Chrome listing does not already have. Do not copy those
files into `amo/` and do not regenerate them for AMO.

When the public listing copy changes, update `amo/description.txt` and
`chrome-web-store/description.txt` in the same change so both stores and the
repository stay aligned.

## Listing Metadata Is Applied Through The API

The listing is set from this repository, not from the AMO developer dashboard,
so it stays reviewable in version control. `scripts/publish-amo.mjs` sends
`amo/listing.json` with `description` filled in from `amo/description.txt` on
every release, so a dashboard edit is overwritten by the next one. `name` comes
from the manifest.

The add-on record does not exist until the first version upload, which is why
the metadata travels with the submission rather than being applied ahead of it.

Field constraints worth knowing before editing:

- `summary` is capped at 250 characters and `name` at 50.
- `categories` takes category slugs from
  `GET /api/v5/addons/categories/`. This listing uses `social-communication`.
- `tags` comes from a fixed AMO vocabulary, capped at 10. The write endpoint
  rejects a tag outside it, but the search endpoint does not: probing with
  `GET /api/v5/addons/search/?tag=<tag>` returns HTTP 200 and `count: 0` for a
  name that is not a tag at all, so read a zero count as "not a tag" rather
  than "an unused tag". This listing uses `content blocker` and
  `social media`.
- `categories` is a flat array in v5. The published API reference still shows
  it keyed by application; that shape is accepted only for backwards
  compatibility, and the Android categories behind it no longer exist.
- Localized fields are written as `{"en-US": "..."}`. They read back in a
  richer shape than they are written in, so do not round-trip a `GET` response
  into a `PATCH` body.

## Source Submission Is Mandatory

AMO requires the source of any add-on built by a bundler. Every version upload
must carry a source archive built with `pnpm package:source`, and a reviewer
must be able to rebuild the submitted package from it byte for byte. See
[Source Code Submission](../amo/source-submission.md) for the archive contents,
the reviewer instructions, and the reproducibility check.

## Before Submitting A Version

1. Compare `manifest.config.ts` against `amo/data-collection.md`; every
   permission needs a current justification and no stale ones.
2. Confirm the `data_collection_permissions` answer still matches what the code
   does.
3. Re-read `amo/description.txt` against user-visible behavior changes in the
   release.
4. Rebuild from a fresh extraction of the source archive and confirm the output
   matches the submitted package.

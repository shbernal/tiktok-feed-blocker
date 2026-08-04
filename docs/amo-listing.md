# AMO Listing

AMO-specific listing assets live in `amo/`, mirroring how `chrome-web-store/`
holds the Chrome-specific ones. Copy that both stores publish verbatim lives in
`store/` instead of being duplicated into each.

- `store/description.txt` contains the long description. It is shared with the
  Chrome listing rather than living in `amo/`; see [Store Listing
  Copy](#store-listing-copy-is-shared) below.
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

## Store Listing Copy Is Shared

The long description is the only listing field both stores publish verbatim, so
there is one copy at `store/description.txt` and no per-store duplicate. It is
plain text with `-` bullets, which is the format both stores render acceptably:
AMO accepts a limited set of HTML tags in this field and the Chrome Web Store
does not, so the shared file stays at that lowest common denominator. Wanting
markup on the AMO side is the one thing that would justify splitting the file
again.

The two stores consume it at different speeds. AMO is automatic — the release
job reapplies it below. Chrome is a manual dashboard paste, so a copy edit is
live on AMO at the next release while Chrome still shows the old text until
someone pastes it. Edits to this file are effectively queued AMO changes; do not
park draft copy there.

## Listing Metadata Is Applied Through The API

The listing is set from this repository, not from the AMO developer dashboard,
so it stays reviewable in version control. `scripts/publish-amo.mjs` sends
`amo/listing.json` with `description` filled in from `store/description.txt` on
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
3. Re-read `store/description.txt` against user-visible behavior changes in the
   release, remembering the same text is the Chrome listing copy.
4. Rebuild from a fresh extraction of the source archive and confirm the output
   matches the submitted package.

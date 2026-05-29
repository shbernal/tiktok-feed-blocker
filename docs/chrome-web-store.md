# Chrome Web Store Listing

Chrome Web Store listing assets live in `chrome-web-store/`.

- `chrome-web-store/description.txt` contains the long description to paste into
  the Chrome Web Store Developer Dashboard.
- `chrome-web-store/privacy-justifications.md` contains paste-ready privacy,
  single-purpose, permission, and host-permission justifications for the
  Developer Dashboard privacy form.
- `chrome-web-store/screenshots/` contains the screenshot assets for the store
  listing.

When the public listing copy changes, update `description.txt` in the same
change so the repository stays aligned with the submitted Chrome Web Store
listing.

Before a release, review the listing copy against user-visible behavior changes.
For content controls shown inside TikTok pages, keep the listing focused on the
control outcome rather than implementation details.

## Privacy Form Process

Before filling the Developer Dashboard privacy form:

1. Compare `manifest.config.ts` against
   `chrome-web-store/privacy-justifications.md`.
2. Check that every manifest `permissions`, `host_permissions`, and
   `content_scripts.matches` entry has a matching justification.
3. Remove justification text for permissions that are no longer in the
   manifest, and remove manifest permissions that no longer support the single
   purpose.
4. Re-read the popup, background, content script, and shared settings behavior
   before submitting claims about local storage, host access, or data handling.
5. Keep every dashboard answer under the field limit shown in the Developer
   Dashboard.

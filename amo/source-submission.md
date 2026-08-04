# Source Code Submission

AMO requires source code for any add-on whose submitted package is produced by a
bundler or minifier. This extension is built with Vite, so every version upload
must be accompanied by a source archive, and a reviewer must be able to rebuild
the submitted package from it with no differences.

## Producing The Archive

```sh
pnpm package:source            # archives HEAD
pnpm package:source v1.2.1     # archives a release tag
```

`scripts/package-source.mjs` wraps `git archive`, writing
`release/tiktok-feed-blocker-source-<version>.zip`. Release builds must archive
the tag, not `HEAD`; the script warns when it archives `HEAD` with a dirty
working tree.

`git archive` emits exactly the tracked tree at that ref, so `node_modules/`,
`dist/`, `dist-firefox/`, `release/`, and untracked scratch files are excluded
by construction rather than by an exclude list that has to be maintained. The
archive includes `pnpm-lock.yaml`, which the reviewer build depends on.

`tests/` and `e2e/` are in the archive but are not needed to build.

## Reviewer Build Instructions

The quoted block below is the "Notes to Reviewer" field on the version, so the
instructions are available without opening the archive.
`scripts/publish-amo.mjs` sends it verbatim; paste it by hand only for a
submission made outside that script.

That field is a plain-text input, so the block stays free of Markdown — no
backticks, emphasis, or fenced code. Commands are indented instead of fenced,
which renders as code here and reaches the reviewer as indentation. Prose
outside the block is documentation and keeps its markup.

> Build environment: Ubuntu 24.04, Node.js 24.14.0.
>
> This project uses pnpm, not npm. Do not run npm install — there is no
> package-lock.json, and the dependency tree is pinned by pnpm-lock.yaml. The
> required pnpm version is declared in package.json as "packageManager":
> "pnpm@11.3.0", and Corepack (bundled with Node 24) installs and pins that
> exact version for you.
>
> From the root of the extracted source archive:
>
>     corepack enable
>     pnpm install --frozen-lockfile
>     EXT_TARGET=firefox pnpm build
>
> The Firefox package is written to dist-firefox/. Its contents are what was
> submitted as the add-on package.
>
> EXT_TARGET selects the build target. EXT_TARGET=firefox produces the Firefox
> package in dist-firefox/; any other value, including unset, produces the
> Chrome Web Store package in dist/. The two differ only in the manifest: the
> Firefox build uses background.scripts rather than background.service_worker,
> and adds browser_specific_settings.gecko.

## Reproducibility

The build is deterministic. Verified for this release by extracting the source
archive into a fresh directory and running the instructions above:

- Node 24.18.1 with Corepack-provisioned pnpm 11.3.0, in a `node:24-bookworm`
  container, the reviewer default
- Node 26.4.0 with pnpm 11.3.0, on the Arch host, the local development
  environment

Both produced a `dist-firefox/` identical to the submitted package: same 14
files, same SHA-256 for every one. The output is not sensitive to the directory
the build runs in, nor to the host.

Re-run this check before any release that changes dependencies, the Vite config,
or the manifest config.

## Note On The pnpm Version

`package.json` pins `pnpm@11.3.0` via `packageManager`. A newer pnpm may be
installed globally on a given machine; both Corepack and pnpm's own version
management honor the pin and switch to 11.3.0 inside this repository, so the
lockfile is never resolved by a different version than it was written with. Do
not write build instructions that name a pnpm version other than the one in
`packageManager`.

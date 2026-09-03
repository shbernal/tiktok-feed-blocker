import { basename } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// crxjs emits every script entry as a rollup chunk named `basename(file)`, and
// then resolves the background entry back to a filename when it writes
// `service-worker-loader.js`. Two entries sharing a basename resolve to the
// same chunk: with `src/background/main.ts` and `src/content/main.ts` both
// emitted as `main.ts`, the loader imported the content-script chunk, the
// background chunk was emitted but referenced by nothing, and
// `chrome.commands.onCommand` never registered in a shipped build. The build
// stays green either way, so the only cheap guard is on the entry names
// themselves.
type ScriptManifest = {
  background?:
    | { service_worker: string }
    | { scripts: string[] }
    | Record<string, unknown>
  content_scripts?: { js?: string[] }[]
}

const loadManifest = async (target: 'chrome' | 'firefox') => {
  vi.resetModules()
  vi.stubEnv('EXT_TARGET', target === 'firefox' ? 'firefox' : '')

  const module = await import('../manifest.config')
  return module.default as unknown as ScriptManifest
}

const collectScriptEntries = (manifest: ScriptManifest) => {
  const background = manifest.background
  const backgroundEntries =
    background && 'service_worker' in background
      ? [background.service_worker as string]
      : background && 'scripts' in background
        ? (background.scripts as string[])
        : []

  const contentEntries = (manifest.content_scripts ?? []).flatMap(
    script => script.js ?? [],
  )

  return [...backgroundEntries, ...contentEntries]
}

describe('manifest script entries', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each(['chrome', 'firefox'] as const)(
    'gives every %s entry a distinct basename',
    async target => {
      const entries = collectScriptEntries(await loadManifest(target))

      expect(entries.length).toBeGreaterThan(1)

      const duplicates = entries
        .map(entry => basename(entry))
        .filter((name, index, names) => names.indexOf(name) !== index)

      expect(duplicates).toEqual([])
    },
  )
})

import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin, PluginOption, UserConfig } from 'vite'
import manifest from './manifest.config'

function fixCrxVite8Warning(pluginOption: PluginOption): PluginOption {
  if (Array.isArray(pluginOption)) {
    return pluginOption.map(fixCrxVite8Warning)
  }

  if (
    !pluginOption ||
    typeof pluginOption !== 'object' ||
    !('name' in pluginOption)
  ) {
    return pluginOption
  }

  const plugin = pluginOption as Plugin

  if (plugin.name !== 'crx:content-scripts' || plugin.apply !== 'build') {
    return plugin
  }

  const originalConfig = plugin.config

  if (typeof originalConfig !== 'function') {
    return plugin
  }

  return {
    ...plugin,
    async config(config, env) {
      const result = await originalConfig.call(this, config, env)

      if (
        result?.build &&
        'rollupOptions' in result.build &&
        'rolldownOptions' in result.build
      ) {
        const { rolldownOptions: _rolldownOptions, ...build } = result.build
        return { ...result, build } satisfies Omit<UserConfig, 'plugins'>
      }

      return result
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`,
    },
  },
  plugins: [react(), fixCrxVite8Warning(crx({ manifest }))],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
})

import { useEffect, useState } from 'react'
import './App.css'
import {
  DEFAULT_SETTINGS,
  deriveSettingsFromStorage,
  LEGACY_ACTIVE_STORAGE_KEY,
  type ExtensionSettings,
  SETTINGS_STORAGE_KEY,
} from '../shared/settings'

type UpdateSettingsMessage = {
  action: 'updateSettings'
  settings: ExtensionSettings
}

function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY, LEGACY_ACTIVE_STORAGE_KEY], (result) => {
      const initialSettings = deriveSettingsFromStorage(
        result[SETTINGS_STORAGE_KEY],
        result[LEGACY_ACTIVE_STORAGE_KEY],
      )
      setSettings(initialSettings)
      chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: initialSettings })
    })
  }, [])

  const persistAndNotify = async (nextSettings: ExtensionSettings) => {
    setSettings(nextSettings)
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: nextSettings })

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id !== undefined) {
        const message: UpdateSettingsMessage = {
          action: 'updateSettings',
          settings: nextSettings,
        }
        chrome.tabs.sendMessage(tab.id, message, () => {
          // Ignore expected errors (e.g., active tab has no injected content script).
          void chrome.runtime.lastError
        })
      }
    } catch (error) {
      console.debug('Could not send message to content script:', error)
    }
  }

  const toggleActive = () => {
    void persistAndNotify({
      ...settings,
      active: !settings.active,
    })
  }

  const toggleSection = (section: 'home' | 'explore' | 'live') => {
    void persistAndNotify({
      ...settings,
      [section]: !settings[section],
    })
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h2>TikTok Feed Blocker</h2>
      </div>

      <div className="popup-content">
        <div className="switch-list">
          <div className="switch-row">
            <span className="switch-label switch-label-master">
              <span className="switch-label-master-all">All</span> pages
            </span>
            <label className="switch">
              <input type="checkbox" checked={settings.active} onChange={toggleActive} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="switch-row switch-row-child">
            <span className={`switch-label${settings.active ? '' : ' switch-label-disabled'}`}>Home</span>
            <label className="switch switch-small">
              <input
                type="checkbox"
                checked={settings.home}
                onChange={() => toggleSection('home')}
                disabled={!settings.active}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="switch-row switch-row-child">
            <span className={`switch-label${settings.active ? '' : ' switch-label-disabled'}`}>
              Explore
            </span>
            <label className="switch switch-small">
              <input
                type="checkbox"
                checked={settings.explore}
                onChange={() => toggleSection('explore')}
                disabled={!settings.active}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="switch-row switch-row-child">
            <span className={`switch-label${settings.active ? '' : ' switch-label-disabled'}`}>Live</span>
            <label className="switch switch-small">
              <input
                type="checkbox"
                checked={settings.live}
                onChange={() => toggleSection('live')}
                disabled={!settings.active}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

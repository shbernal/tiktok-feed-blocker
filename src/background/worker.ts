import { isTikTokUrl } from '../shared/tiktok'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../shared/shortcut'

const TOGGLE_CURRENT_PAGE_COMMAND = 'toggle-current-page-block'

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

// Content scripts cannot read `chrome.commands`, so the resolved binding is
// mirrored into storage for the in-page keydown fallback to match against.
// Runs on every background start, which covers install, browser startup and
// service-worker wake-ups without needing a listener for each.
const syncToggleShortcut = () => {
  chrome.commands.getAll(commands => {
    const command = commands.find(
      entry => entry.name === TOGGLE_CURRENT_PAGE_COMMAND,
    )

    chrome.storage.local.set({
      [TOGGLE_SHORTCUT_STORAGE_KEY]: command?.shortcut ?? '',
    })
  })
}

syncToggleShortcut()

chrome.commands.onCommand.addListener(command => {
  if (command !== TOGGLE_CURRENT_PAGE_COMMAND) {
    return
  }

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id === undefined || !isTikTokUrl(tab.url)) {
      return
    }

    const message: ToggleCurrentPageBlockMessage = {
      action: 'toggleCurrentPageBlock',
    }

    chrome.tabs.sendMessage(tab.id, message, () => {
      void chrome.runtime.lastError
    })
  })
})

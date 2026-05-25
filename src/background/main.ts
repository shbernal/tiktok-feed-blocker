import { isTikTokUrl } from '../shared/tiktok'

const TOGGLE_CURRENT_PAGE_COMMAND = 'toggle-current-page-block'

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

chrome.commands.onCommand.addListener(async command => {
  if (command !== TOGGLE_CURRENT_PAGE_COMMAND) {
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
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

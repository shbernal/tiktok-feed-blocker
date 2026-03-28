const TOGGLE_CURRENT_PAGE_COMMAND = 'toggle-current-page-block'
const TIKTOK_HOST_SUFFIX = '.tiktok.com'

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

const isTikTokUrl = (value: string | undefined) => {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return (
      url.hostname === 'tiktok.com' || url.hostname.endsWith(TIKTOK_HOST_SUFFIX)
    )
  } catch {
    return false
  }
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

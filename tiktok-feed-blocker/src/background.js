// background.js
chrome.runtime.onStartup.addListener(reloadAllTabs);
chrome.runtime.onInstalled.addListener(reloadAllTabs);

function reloadAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      // Skip chrome:// and extension pages
      if (tab.url && 
          !tab.url.startsWith('chrome://') && 
          !tab.url.startsWith('chrome-extension://') &&
          !tab.url.startsWith('edge://') &&
          !tab.url.startsWith('about:')) {
        chrome.tabs.reload(tab.id);
      }
    });
  });
}
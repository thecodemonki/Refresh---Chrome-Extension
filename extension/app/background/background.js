// Background script - coordinates communication between popup and content scripts

let timerActive = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIMER_STATUS_CHANGED') {
    timerActive = message.isActive;
    
    // Broadcast to all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        // Skip chrome:// and extension pages
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TIMER_STATUS_UPDATE',
            isActive: timerActive
          }).catch(() => {
            // Ignore errors for tabs where content script isn't loaded
          });
        }
      });
    });
    
    sendResponse({ success: true });
  } else if (message.type === 'GET_TIMER_STATUS') {
    sendResponse({ isActive: timerActive });
  }
  
  return true; // Keep message channel open for async response
});

// When a new tab is created or updated, send current timer status
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
    // Small delay to ensure content script is loaded
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        type: 'TIMER_STATUS_UPDATE',
        isActive: timerActive
      }).catch(() => {
        // Ignore errors
      });
    }, 100);
  }
});

// Initialize timer status from storage on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      timerActive = result.timerState.isRunning && !result.timerState.isPaused;
    }
  });
});

// Also check on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      timerActive = result.timerState.isRunning && !result.timerState.isPaused;
    }
  });
});
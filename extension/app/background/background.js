// Background script - coordinates communication and tracks activity

let timerActive = false;
let currentTabId = null;
let tabStartTime = null;
let tabActivity = {}; // Track time spent on each domain

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIMER_STATUS_CHANGED') {
    timerActive = message.isActive;
    
    // Start/stop tracking tab activity
    if (timerActive) {
      startTabTracking();
    } else {
      stopTabTracking();
    }
    
    // Broadcast to all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TIMER_STATUS_UPDATE',
            isActive: timerActive
          }).catch(() => {});
        }
      });
    });
    
    sendResponse({ success: true });
  } else if (message.type === 'GET_TIMER_STATUS') {
    sendResponse({ isActive: timerActive });
  } else if (message.type === 'WATCHLIST_UPDATED') {
    // Notify all tabs that watchlist has changed
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'WATCHLIST_UPDATED'
          }).catch(() => {});
        }
      });
    });
    sendResponse({ success: true });
  }
  
  return true;
});

// Track tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (timerActive) {
    // Save time for previous tab
    if (currentTabId !== null) {
      recordTabTime(currentTabId);
    }
    
    // Start tracking new tab
    currentTabId = activeInfo.tabId;
    tabStartTime = Date.now();
    
    // Send timer status to newly activated tab
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        setTimeout(() => {
          chrome.tabs.sendMessage(activeInfo.tabId, {
            type: 'TIMER_STATUS_UPDATE',
            isActive: timerActive
          }).catch(() => {});
        }, 100);
      }
    });
  }
});

// Track tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    if (timerActive && tabId === currentTabId) {
      // URL changed on current tab, record time for old URL
      recordTabTime(tabId);
      tabStartTime = Date.now();
    }
    
    // Send timer status to updated tab
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          type: 'TIMER_STATUS_UPDATE',
          isActive: timerActive
        }).catch(() => {});
      }, 100);
    }
  }
});

// Track window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus
    if (timerActive && currentTabId !== null) {
      recordTabTime(currentTabId);
      currentTabId = null;
      tabStartTime = null;
    }
  } else {
    // Browser gained focus
    if (timerActive) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          currentTabId = tabs[0].id;
          tabStartTime = Date.now();
        }
      });
    }
  }
});

// Record time spent on a tab
function recordTabTime(tabId) {
  if (!tabStartTime) return;
  
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url) return;
    
    const domain = extractDomain(tab.url);
    if (!domain) return;
    
    const timeSpent = Date.now() - tabStartTime;
    
    // Check if this domain is a distraction
    chrome.storage.local.get(['watchlist', 'whitelist', 'timerState', 'lockInEnabled', 'listMode'], (result) => {
      const watchlist = result.watchlist || [];
      const whitelist = result.whitelist || [];
      const lockInEnabled = result.lockInEnabled !== false;
      const listMode = result.listMode || 'blacklist';
      const timerState = result.timerState || {};
      
      if (lockInEnabled && isDistractingSite(domain, watchlist, whitelist, listMode)) {
        // Add to distraction time
        const distractionTime = (timerState.distractionTime || 0) + timeSpent;
        timerState.distractionTime = distractionTime;
        
        chrome.storage.local.set({ timerState });
      }
    });
    
    // Track overall activity
    if (!tabActivity[domain]) {
      tabActivity[domain] = 0;
    }
    tabActivity[domain] += timeSpent;
  });
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

// Check if domain should count as distraction
function isDistractingSite(domain, watchlist, whitelist, listMode) {
  if (listMode === 'whitelist') {
    // In whitelist mode, anything NOT in whitelist is a distraction
    if (whitelist.length === 0) return false;
    
    const isAllowed = whitelist.some(site => {
      const cleanSite = site.toLowerCase().replace(/^www\./, '');
      return domain.includes(cleanSite) || cleanSite.includes(domain);
    });
    
    return !isAllowed; // If not allowed, it's a distraction
  } else {
    // In blacklist mode, only blacklist sites are distractions
    return watchlist.some(site => {
      const cleanSite = site.toLowerCase().replace(/^www\./, '');
      return domain.includes(cleanSite) || cleanSite.includes(domain);
    });
  }
}

// Start tracking tab activity
function startTabTracking() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      tabStartTime = Date.now();
    }
  });
}

// Stop tracking tab activity
function stopTabTracking() {
  if (currentTabId !== null) {
    recordTabTime(currentTabId);
  }
  currentTabId = null;
  tabStartTime = null;
}

// Initialize timer status from storage on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      timerActive = result.timerState.isRunning && !result.timerState.isPaused;
      if (timerActive) {
        startTabTracking();
      }
    }
  });
});

// Also check on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      timerActive = result.timerState.isRunning && !result.timerState.isPaused;
      if (timerActive) {
        startTabTracking();
      }
    }
  });
  
  // Set default watchlist
  chrome.storage.local.get(['watchlist'], (result) => {
    if (!result.watchlist) {
      chrome.storage.local.set({
        watchlist: [
          'youtube.com',
          'twitter.com',
          'facebook.com',
          'instagram.com',
          'reddit.com',
          'tiktok.com'
        ]
      });
    }
  });
});
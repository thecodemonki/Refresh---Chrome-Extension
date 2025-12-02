// Background script - coordinates communication and tracks activity

let timerActive = false;
let currentTabId = null;
let tabStartTime = null;
let tabActivity = {};
let lastActivityTime = Date.now();
let idleCheckInterval = null;

// Auto-pause settings
const IDLE_THRESHOLD = 60; // seconds of inactivity before auto-pause
const IDLE_CHECK_INTERVAL = 5000; // check every 5 seconds

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIMER_STATUS_CHANGED') {
    timerActive = message.isActive;
    
    if (timerActive) {
      startTabTracking();
      startIdleDetection();
    } else {
      stopTabTracking();
      stopIdleDetection();
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
  } else if (message.type === 'USER_ACTIVITY') {
    lastActivityTime = Date.now();
    sendResponse({ success: true });
  } else if (message.type === 'AUTO_PAUSE_TIMER') {
    // Auto-pause the timer due to inactivity
    chrome.storage.local.get(['timerState'], (result) => {
      const timerState = result.timerState || {};
      if (timerState.isRunning && !timerState.isPaused) {
        timerState.isPaused = true;
        timerState.autoPaused = true;
        timerState.elapsedTime = Date.now() - timerState.startTime + (timerState.elapsedTime || 0);
        chrome.storage.local.set({ timerState });
        
        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '⏸️ Timer Auto-Paused',
          message: 'Timer paused due to inactivity. Click to resume when you\'re back!',
          priority: 1
        });
        
        timerActive = false;
        stopIdleDetection();
      }
    });
    sendResponse({ success: true });
  }
  
  return true;
});

// Start idle detection
function startIdleDetection() {
  lastActivityTime = Date.now();
  
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
  
  // Use Chrome's idle API
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD);
  
  chrome.idle.onStateChanged.addListener(handleIdleStateChange);
  
  // Also do manual checks
  idleCheckInterval = setInterval(() => {
    const inactiveTime = (Date.now() - lastActivityTime) / 1000;
    
    if (inactiveTime > IDLE_THRESHOLD && timerActive) {
      chrome.runtime.sendMessage({ type: 'AUTO_PAUSE_TIMER' });
    }
  }, IDLE_CHECK_INTERVAL);
}

// Handle idle state changes
function handleIdleStateChange(state) {
  if (state === 'idle' && timerActive) {
    chrome.runtime.sendMessage({ type: 'AUTO_PAUSE_TIMER' });
  } else if (state === 'active') {
    lastActivityTime = Date.now();
  }
}

// Stop idle detection
function stopIdleDetection() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  
  chrome.idle.onStateChanged.removeListener(handleIdleStateChange);
}

// Track tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  lastActivityTime = Date.now();
  
  if (timerActive) {
    if (currentTabId !== null) {
      recordTabTime(currentTabId);
    }
    
    currentTabId = activeInfo.tabId;
    tabStartTime = Date.now();
    
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
  
  // Update all tabs about which one is active
  updateTabDimming(activeInfo.tabId);
});

// Track tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    lastActivityTime = Date.now();
    
    if (timerActive && tabId === currentTabId) {
      recordTabTime(tabId);
      tabStartTime = Date.now();
    }
    
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
    if (timerActive && currentTabId !== null) {
      recordTabTime(currentTabId);
      currentTabId = null;
      tabStartTime = null;
    }
  } else {
    lastActivityTime = Date.now();
    
    if (timerActive) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          currentTabId = tabs[0].id;
          tabStartTime = Date.now();
          updateTabDimming(tabs[0].id);
        }
      });
    }
  }
});

// Update tab dimming for all tabs
function updateTabDimming(activeTabId) {
  chrome.storage.local.get(['dimInactive', 'timerState'], (result) => {
    const dimEnabled = result.dimInactive !== false;
    const timerState = result.timerState || {};
    const timerActive = timerState.isRunning && !timerState.isPaused;
    
    if (!dimEnabled || !timerActive) return;
    
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          const isActive = tab.id === activeTabId;
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_DIM_STATUS',
            isActive: isActive
          }).catch(() => {});
        }
      });
    });
  });
}

// Record time spent on a tab
function recordTabTime(tabId) {
  if (!tabStartTime) return;
  
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url) return;
    
    const domain = extractDomain(tab.url);
    if (!domain) return;
    
    const timeSpent = Date.now() - tabStartTime;
    
    chrome.storage.local.get(['timeBreakdown'], (result) => {
      const breakdown = result.timeBreakdown || {};
      breakdown[domain] = (breakdown[domain] || 0) + timeSpent;
      chrome.storage.local.set({ timeBreakdown: breakdown });
    });
    
    chrome.storage.local.get(['watchlist', 'whitelist', 'timerState', 'lockInEnabled', 'listMode'], (result) => {
      const watchlist = result.watchlist || [];
      const whitelist = result.whitelist || [];
      const lockInEnabled = result.lockInEnabled !== false;
      const listMode = result.listMode || 'blacklist';
      const timerState = result.timerState || {};
      
      if (lockInEnabled && isDistractingSite(domain, watchlist, whitelist, listMode)) {
        const distractionTime = (timerState.distractionTime || 0) + timeSpent;
        timerState.distractionTime = distractionTime;
        chrome.storage.local.set({ timerState });
      }
    });
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
    if (whitelist.length === 0) return false;
    
    const isAllowed = whitelist.some(site => {
      const cleanSite = site.toLowerCase().replace(/^www\./, '');
      return domain.includes(cleanSite) || cleanSite.includes(domain);
    });
    
    return !isAllowed;
  } else {
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
      updateTabDimming(tabs[0].id);
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
  
  // Remove dimming from all tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'UPDATE_DIM_STATUS',
          isActive: true
        }).catch(() => {});
      }
    });
  });
}

// Initialize timer status from storage on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      timerActive = result.timerState.isRunning && !result.timerState.isPaused;
      if (timerActive) {
        startTabTracking();
        startIdleDetection();
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
        startIdleDetection();
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
  
  // Reset time breakdown daily
  const checkAndResetBreakdown = () => {
    chrome.storage.local.get(['lastBreakdownReset'], (result) => {
      const today = new Date().toDateString();
      if (result.lastBreakdownReset !== today) {
        chrome.storage.local.set({ 
          timeBreakdown: {},
          lastBreakdownReset: today
        });
      }
    });
  };
  
  checkAndResetBreakdown();
  setInterval(checkAndResetBreakdown, 60 * 60 * 1000);
});
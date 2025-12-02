// Content script - handles the "lock in" overlay and tab dimming on web pages

console.log("Work Timer content script loaded");

let overlayActive = false;
let overlayElement = null;
let dimOverlayElement = null;
let isTabActive = true;
let lastActivityTime = Date.now();

// Track user activity
document.addEventListener('mousemove', reportActivity);
document.addEventListener('keydown', reportActivity);
document.addEventListener('click', reportActivity);
document.addEventListener('scroll', reportActivity);

function reportActivity() {
  const now = Date.now();
  if (now - lastActivityTime > 1000) { // Throttle to once per second
    lastActivityTime = now;
    chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' }).catch(() => {});
  }
}

// Listen for tab visibility changes
document.addEventListener('visibilitychange', () => {
  isTabActive = !document.hidden;
  updateDimOverlay();
});

// Listen for window focus changes
window.addEventListener('focus', () => {
  isTabActive = true;
  updateDimOverlay();
  reportActivity();
});

window.addEventListener('blur', () => {
  isTabActive = false;
  updateDimOverlay();
});

// Create dim overlay
function createDimOverlay() {
  if (dimOverlayElement) return dimOverlayElement;
  
  const dim = document.createElement('div');
  dim.id = 'workTimerDimOverlay';
  dim.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483646 !important;
    pointer-events: none !important;
    display: none !important;
    opacity: 0 !important;
    transition: opacity 0.3s ease !important;
  `;
  
  document.body.appendChild(dim);
  dimOverlayElement = dim;
  return dim;
}

// Update dim overlay based on tab activity and timer status
function updateDimOverlay() {
  chrome.storage.local.get(['dimInactive', 'timerState'], (result) => {
    const dimEnabled = result.dimInactive !== false;
    const timerState = result.timerState || {};
    const timerActive = timerState.isRunning && !timerState.isPaused;
    
    if (dimEnabled && timerActive && !isTabActive) {
      showDimOverlay();
    } else {
      hideDimOverlay();
    }
  });
}

// Show dim overlay
function showDimOverlay() {
  if (!dimOverlayElement) {
    createDimOverlay();
  }
  dimOverlayElement.style.display = 'block';
  setTimeout(() => {
    if (dimOverlayElement) {
      dimOverlayElement.style.opacity = '1';
    }
  }, 10);
}

// Hide dim overlay
function hideDimOverlay() {
  if (dimOverlayElement) {
    dimOverlayElement.style.opacity = '0';
    setTimeout(() => {
      if (dimOverlayElement) {
        dimOverlayElement.style.display = 'none';
      }
    }, 300);
  }
}

// Create the overlay element
function createOverlay() {
  if (overlayElement) return overlayElement;
  
  const messages = [
    "Stay focused. Your future self will thank you.",
    "Great work happens when you eliminate distractions.",
    "You're building something amazing. Keep going.",
    "Focus is your superpower. Use it wisely.",
    "Every moment of focus is an investment in yourself.",
    "Distractions fade. Your goals remain. Choose wisely.",
    "The best work happens in deep focus.",
    "You've got this. Stay in the zone."
  ];
  
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  
  const overlay = document.createElement('div');
  overlay.id = 'workTimerOverlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-icon">🎯</div>
      <h1 class="overlay-title">Focus Mode Active</h1>
      <p class="overlay-message">${randomMessage}</p>
      <p class="overlay-hint">Stop the timer to access this site</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  overlayElement = overlay;
  return overlay;
}

// Show the overlay
function showOverlay() {
  if (!overlayElement) {
    createOverlay();
  }
  overlayElement.style.display = 'flex';
  overlayActive = true;
  
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  document.documentElement.style.overflow = 'hidden';
}

// Hide the overlay
function hideOverlay() {
  if (overlayElement) {
    overlayElement.style.display = 'none';
    overlayActive = false;
    
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
  }
}

// Check if current site should be blocked
async function shouldBlockSite() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['watchlist', 'whitelist', 'lockInEnabled', 'listMode'], (result) => {
      const lockInEnabled = result.lockInEnabled !== false;
      
      if (!lockInEnabled) {
        resolve(false);
        return;
      }
      
      const listMode = result.listMode || 'blacklist';
      const currentUrl = window.location.hostname.toLowerCase();
      const cleanCurrent = currentUrl.replace(/^www\./, '');
      
      if (listMode === 'whitelist') {
        const whitelist = result.whitelist || [];
        
        if (whitelist.length === 0) {
          resolve(false);
          return;
        }
        
        const isAllowed = whitelist.some(site => {
          const cleanSite = site.toLowerCase().replace(/^www\./, '');
          return cleanCurrent.includes(cleanSite) || cleanSite.includes(cleanCurrent);
        });
        
        resolve(!isAllowed);
      } else {
        const watchlist = result.watchlist || [];
        
        if (watchlist.length === 0) {
          resolve(false);
          return;
        }
        
        const isBlocked = watchlist.some(site => {
          const cleanSite = site.toLowerCase().replace(/^www\./, '');
          return cleanCurrent.includes(cleanSite) || cleanSite.includes(cleanCurrent);
        });
        
        resolve(isBlocked);
      }
    });
  });
}

// Handle timer status updates
async function handleTimerStatus(isActive) {
  const shouldBlock = await shouldBlockSite();
  
  if (isActive && shouldBlock) {
    showOverlay();
  } else {
    hideOverlay();
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIMER_STATUS_UPDATE') {
    handleTimerStatus(message.isActive);
    updateDimOverlay();
  } else if (message.type === 'WATCHLIST_UPDATED') {
    chrome.runtime.sendMessage({ type: 'GET_TIMER_STATUS' }, (response) => {
      if (response && response.isActive) {
        handleTimerStatus(true);
      }
    });
  } else if (message.type === 'DIM_SETTINGS_CHANGED') {
    updateDimOverlay();
  } else if (message.type === 'UPDATE_DIM_STATUS') {
    isTabActive = message.isActive;
    updateDimOverlay();
  }
  
  sendResponse({ success: true });
  return true;
});

// Request current timer status when page loads
chrome.runtime.sendMessage({ type: 'GET_TIMER_STATUS' }, (response) => {
  if (response && response.isActive) {
    handleTimerStatus(true);
  }
  updateDimOverlay();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  hideOverlay();
  hideDimOverlay();
});
// Content script - handles the "lock in" overlay on web pages

console.log("Work Timer content script loaded");

let overlayActive = false;
let overlayElement = null;

// Create the overlay element
function createOverlay() {
  if (overlayElement) return overlayElement;
  
  // Random motivational messages
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
  
  // Prevent scrolling on body and html
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
    
    // Restore scrolling
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
        // Whitelist mode: block everything EXCEPT whitelist
        const whitelist = result.whitelist || [];
        
        if (whitelist.length === 0) {
          // No whitelist sites = don't block anything
          resolve(false);
          return;
        }
        
        const isAllowed = whitelist.some(site => {
          const cleanSite = site.toLowerCase().replace(/^www\./, '');
          return cleanCurrent.includes(cleanSite) || cleanSite.includes(cleanCurrent);
        });
        
        // Block if NOT in whitelist
        resolve(!isAllowed);
      } else {
        // Blacklist mode: block only blacklist sites
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
  } else if (message.type === 'WATCHLIST_UPDATED') {
    // Recheck if current site should be blocked
    chrome.runtime.sendMessage({ type: 'GET_TIMER_STATUS' }, (response) => {
      if (response && response.isActive) {
        handleTimerStatus(true);
      }
    });
  }
  
  sendResponse({ success: true });
  return true;
});

// Request current timer status when page loads
chrome.runtime.sendMessage({ type: 'GET_TIMER_STATUS' }, (response) => {
  if (response && response.isActive) {
    handleTimerStatus(true);
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  hideOverlay();
});
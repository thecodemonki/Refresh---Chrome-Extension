// Content script - handles the "lock in" overlay on web pages

console.log("Work Timer content script loaded");

let overlayActive = false;
let overlayElement = null;

// Create the overlay element
function createOverlay() {
  if (overlayElement) return overlayElement;
  
  const overlay = document.createElement('div');
  overlay.id = 'workTimerOverlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-icon">🔒</div>
      <h1 class="overlay-title">Lock In Mode Active</h1>
      <p class="overlay-message">Focus on your work. This site is blocked during your work session.</p>
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

// Check if current site is in the distraction watchlist
async function isDistractingSite() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['watchlist', 'lockInEnabled'], (result) => {
      const watchlist = result.watchlist || [];
      const lockInEnabled = result.lockInEnabled !== false; // Default true
      
      if (!lockInEnabled || watchlist.length === 0) {
        resolve(false);
        return;
      }
      
      const currentUrl = window.location.hostname.toLowerCase();
      
      // Check if current site matches any watchlist entry
      const isBlocked = watchlist.some(site => {
        const siteLower = site.toLowerCase();
        // Remove www. for comparison
        const cleanSite = siteLower.replace(/^www\./, '');
        const cleanCurrent = currentUrl.replace(/^www\./, '');
        
        return cleanCurrent.includes(cleanSite) || cleanSite.includes(cleanCurrent);
      });
      
      resolve(isBlocked);
    });
  });
}

// Handle timer status updates
async function handleTimerStatus(isActive) {
  const isDistracting = await isDistractingSite();
  
  if (isActive && isDistracting) {
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
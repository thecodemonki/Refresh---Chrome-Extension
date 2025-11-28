// Timer state
let timerState = {
  isRunning: false,
  isPaused: false,
  startTime: null,
  pausedTime: 0,
  elapsedTime: 0,
  currentSessionTime: 0,
  todayTotalTime: 0,
  distractionTime: 0
};

let timerInterval = null;
let reminderIntervals = {
  posture: null,
  eyeRest: null
};

// DOM elements
const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const todayTotal = document.getElementById('todayTotal');
const currentSession = document.getElementById('currentSession');
const distractionTime = document.getElementById('distractionTime');
const focusScore = document.getElementById('focusScore');

// Settings elements
const lockInToggle = document.getElementById('lockInToggle');
const siteInput = document.getElementById('siteInput');
const addSiteBtn = document.getElementById('addSiteBtn');
const watchlistContainer = document.getElementById('watchlistContainer');
const postureToggle = document.getElementById('postureToggle');
const eyeRestToggle = document.getElementById('eyeRestToggle');

// Format time as HH:MM:SS
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format time as Xh Ym for stats
function formatStatTime(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return `${hours}h ${minutes}m`;
}

// Calculate focus score
function calculateFocusScore() {
  const totalTime = timerState.todayTotalTime;
  const distractTime = timerState.distractionTime;
  
  if (totalTime === 0) return 100;
  
  const score = Math.max(0, Math.round(((totalTime - distractTime) / totalTime) * 100));
  return score;
}

// Update the timer display
function updateDisplay() {
  const currentTime = timerState.isRunning && !timerState.isPaused
    ? Date.now() - timerState.startTime + timerState.elapsedTime
    : timerState.elapsedTime;
  
  timerDisplay.textContent = formatTime(currentTime);
  currentSession.textContent = formatStatTime(currentTime);
  
  // Update timer state for saving
  timerState.currentSessionTime = currentTime;
}

// Update stats display
function updateStats() {
  todayTotal.textContent = formatStatTime(timerState.todayTotalTime);
  distractionTime.textContent = formatStatTime(timerState.distractionTime);
  focusScore.textContent = calculateFocusScore() + '%';
}

// Update button states
function updateButtonStates() {
  if (!timerState.isRunning) {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    timerStatus.textContent = 'Ready to start';
    timerStatus.className = 'timer-status';
    startBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 2.5L13 8L3 13.5V2.5Z" fill="currentColor"/>
      </svg>
      Start
    `;
  } else if (timerState.isPaused) {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = false;
    timerStatus.textContent = 'Paused';
    timerStatus.className = 'timer-status paused';
    startBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 2.5L13 8L3 13.5V2.5Z" fill="currentColor"/>
      </svg>
      Resume
    `;
  } else {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    timerStatus.textContent = 'Working';
    timerStatus.className = 'timer-status running';
  }
}

// Notify background script of timer status
function notifyTimerStatus(isActive) {
  chrome.runtime.sendMessage({
    type: 'TIMER_STATUS_CHANGED',
    isActive: isActive
  });
}

// Setup reminders
function setupReminders() {
  // Clear existing intervals
  if (reminderIntervals.posture) clearInterval(reminderIntervals.posture);
  if (reminderIntervals.eyeRest) clearInterval(reminderIntervals.eyeRest);
  
  // Get reminder settings
  chrome.storage.local.get(['postureEnabled', 'eyeRestEnabled'], (result) => {
    const postureEnabled = result.postureEnabled !== false;
    const eyeRestEnabled = result.eyeRestEnabled !== false;
    
    // Posture reminder - every 30 minutes
    if (postureEnabled && timerState.isRunning && !timerState.isPaused) {
      reminderIntervals.posture = setInterval(() => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '🧘 Posture Check',
          message: 'Time to check your posture! Sit up straight and adjust your position.',
          priority: 1
        });
      }, 30 * 60 * 1000); // 30 minutes
    }
    
    // Eye rest reminder - every 20 minutes (20-20-20 rule)
    if (eyeRestEnabled && timerState.isRunning && !timerState.isPaused) {
      reminderIntervals.eyeRest = setInterval(() => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '👁️ Eye Rest Time',
          message: '20-20-20 Rule: Look at something 20 feet away for 20 seconds.',
          priority: 1
        });
      }, 20 * 60 * 1000); // 20 minutes
    }
  });
}

// Clear reminders
function clearReminders() {
  if (reminderIntervals.posture) {
    clearInterval(reminderIntervals.posture);
    reminderIntervals.posture = null;
  }
  if (reminderIntervals.eyeRest) {
    clearInterval(reminderIntervals.eyeRest);
    reminderIntervals.eyeRest = null;
  }
}

// Start or resume the timer
function startTimer() {
  if (!timerState.isRunning) {
    timerState.isRunning = true;
    timerState.isPaused = false;
    timerState.startTime = Date.now();
    timerState.elapsedTime = 0;
  } else if (timerState.isPaused) {
    timerState.isPaused = false;
    timerState.startTime = Date.now();
  }
  
  timerInterval = setInterval(() => {
    updateDisplay();
    saveState();
  }, 100);
  
  updateButtonStates();
  setupReminders();
  saveState();
  notifyTimerStatus(true);
}

// Pause the timer
function pauseTimer() {
  if (timerState.isRunning && !timerState.isPaused) {
    timerState.isPaused = true;
    timerState.elapsedTime += Date.now() - timerState.startTime;
    
    clearInterval(timerInterval);
    timerInterval = null;
    clearReminders();
    
    updateButtonStates();
    updateDisplay();
    saveState();
    notifyTimerStatus(false);
  }
}

// Stop the timer completely
function stopTimer() {
  if (timerState.isRunning) {
    const finalTime = timerState.isPaused
      ? timerState.elapsedTime
      : Date.now() - timerState.startTime + timerState.elapsedTime;
    
    timerState.todayTotalTime += finalTime;
    
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerState.startTime = null;
    timerState.elapsedTime = 0;
    timerState.currentSessionTime = 0;
    
    clearInterval(timerInterval);
    timerInterval = null;
    clearReminders();
    
    updateDisplay();
    updateButtonStates();
    updateStats();
    saveState();
    notifyTimerStatus(false);
  }
}

// Save state to chrome.storage
function saveState() {
  const stateToSave = {
    ...timerState,
    lastSaved: Date.now(),
    date: new Date().toDateString()
  };
  
  chrome.storage.local.set({ timerState: stateToSave });
}

// Load state from chrome.storage
function loadState() {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      const savedState = result.timerState;
      const savedDate = savedState.date;
      const currentDate = new Date().toDateString();
      
      if (savedDate !== currentDate) {
        timerState.todayTotalTime = 0;
        timerState.distractionTime = 0;
      } else {
        timerState.todayTotalTime = savedState.todayTotalTime || 0;
        timerState.distractionTime = savedState.distractionTime || 0;
        
        if (savedState.isRunning && !savedState.isPaused) {
          const timeSinceLastSave = Date.now() - savedState.lastSaved;
          timerState.elapsedTime = savedState.elapsedTime + timeSinceLastSave;
          timerState.isRunning = true;
          timerState.isPaused = false;
          timerState.startTime = Date.now();
          
          timerInterval = setInterval(() => {
            updateDisplay();
            saveState();
          }, 100);
          
          setupReminders();
          notifyTimerStatus(true);
        } else if (savedState.isRunning && savedState.isPaused) {
          timerState.isRunning = true;
          timerState.isPaused = true;
          timerState.elapsedTime = savedState.elapsedTime;
          notifyTimerStatus(false);
        }
      }
    }
    
    updateDisplay();
    updateStats();
    updateButtonStates();
  });
}

// Watchlist management
function loadWatchlist() {
  chrome.storage.local.get(['watchlist'], (result) => {
    const watchlist = result.watchlist || [];
    renderWatchlist(watchlist);
  });
}

function renderWatchlist(watchlist) {
  if (watchlist.length === 0) {
    watchlistContainer.innerHTML = '<div class="watchlist-empty">No sites added yet</div>';
    return;
  }
  
  watchlistContainer.innerHTML = watchlist.map(site => `
    <div class="watchlist-item">
      <span class="watchlist-site">${site}</span>
      <button class="btn-remove" data-site="${site}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `).join('');
  
  // Add event listeners to remove buttons
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const site = btn.getAttribute('data-site');
      removeSiteFromWatchlist(site);
    });
  });
}

function addSiteToWatchlist() {
  const site = siteInput.value.trim().toLowerCase();
  
  if (!site) return;
  
  chrome.storage.local.get(['watchlist'], (result) => {
    const watchlist = result.watchlist || [];
    
    if (watchlist.includes(site)) {
      siteInput.value = '';
      return;
    }
    
    watchlist.push(site);
    chrome.storage.local.set({ watchlist }, () => {
      renderWatchlist(watchlist);
      siteInput.value = '';
      
      // Notify content scripts
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' });
    });
  });
}

function removeSiteFromWatchlist(site) {
  chrome.storage.local.get(['watchlist'], (result) => {
    const watchlist = result.watchlist || [];
    const filtered = watchlist.filter(s => s !== site);
    
    chrome.storage.local.set({ watchlist: filtered }, () => {
      renderWatchlist(filtered);
      
      // Notify content scripts
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' });
    });
  });
}

// Load settings
function loadSettings() {
  chrome.storage.local.get(['lockInEnabled', 'postureEnabled', 'eyeRestEnabled'], (result) => {
    lockInToggle.checked = result.lockInEnabled !== false;
    postureToggle.checked = result.postureEnabled !== false;
    eyeRestToggle.checked = result.eyeRestEnabled !== false;
  });
}

// Event listeners - check if elements exist before adding listeners
if (startBtn) startBtn.addEventListener('click', startTimer);
if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
if (stopBtn) stopBtn.addEventListener('click', stopTimer);

// Lock in toggle
if (lockInToggle) {
  lockInToggle.addEventListener('change', () => {
    chrome.storage.local.set({ lockInEnabled: lockInToggle.checked }, () => {
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' });
    });
  });
}

// Watchlist
if (addSiteBtn) addSiteBtn.addEventListener('click', addSiteToWatchlist);
if (siteInput) {
  siteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addSiteToWatchlist();
    }
  });
}

// Reminder toggles
if (postureToggle) {
  postureToggle.addEventListener('change', () => {
    chrome.storage.local.set({ postureEnabled: postureToggle.checked }, () => {
      if (timerState.isRunning && !timerState.isPaused) {
        setupReminders();
      }
    });
  });
}

if (eyeRestToggle) {
  eyeRestToggle.addEventListener('change', () => {
    chrome.storage.local.set({ eyeRestEnabled: eyeRestToggle.checked }, () => {
      if (timerState.isRunning && !timerState.isPaused) {
        setupReminders();
      }
    });
  });
}

// Initialize
loadState();
loadWatchlist();
loadSettings();

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  clearReminders();
  saveState();
});
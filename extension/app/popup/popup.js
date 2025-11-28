// Timer state
let timerState = {
  isRunning: false,
  isPaused: false,
  startTime: null,
  pausedTime: 0,
  elapsedTime: 0,
  currentSessionTime: 0,
  todayTotalTime: 0
};

let timerInterval = null;

// DOM elements
const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const todayTotal = document.getElementById('todayTotal');
const currentSession = document.getElementById('currentSession');

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

// Update button states
function updateButtonStates() {
  if (!timerState.isRunning) {
    // Timer is stopped
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
    // Timer is paused
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
    // Timer is running
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

// Start or resume the timer
function startTimer() {
  if (!timerState.isRunning) {
    // Starting fresh
    timerState.isRunning = true;
    timerState.isPaused = false;
    timerState.startTime = Date.now();
    timerState.elapsedTime = 0;
  } else if (timerState.isPaused) {
    // Resuming from pause
    timerState.isPaused = false;
    timerState.startTime = Date.now();
  }
  
  // Start the interval
  timerInterval = setInterval(() => {
    updateDisplay();
    saveState();
  }, 100); // Update every 100ms for smooth display
  
  updateButtonStates();
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
    
    updateButtonStates();
    updateDisplay();
    saveState();
    notifyTimerStatus(false);
  }
}

// Stop the timer completely
function stopTimer() {
  if (timerState.isRunning) {
    // Calculate final time
    const finalTime = timerState.isPaused
      ? timerState.elapsedTime
      : Date.now() - timerState.startTime + timerState.elapsedTime;
    
    // Add to today's total
    timerState.todayTotalTime += finalTime;
    
    // Reset timer
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerState.startTime = null;
    timerState.elapsedTime = 0;
    timerState.currentSessionTime = 0;
    
    clearInterval(timerInterval);
    timerInterval = null;
    
    updateDisplay();
    updateButtonStates();
    updateTodayTotal();
    saveState();
    notifyTimerStatus(false);
  }
}

// Update today's total display
function updateTodayTotal() {
  todayTotal.textContent = formatStatTime(timerState.todayTotalTime);
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
      
      // Reset if it's a new day
      if (savedDate !== currentDate) {
        timerState.todayTotalTime = 0;
      } else {
        timerState.todayTotalTime = savedState.todayTotalTime || 0;
        
        // Restore running timer if it was running
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
          
          notifyTimerStatus(true);
        } else if (savedState.isRunning && savedState.isPaused) {
          // Restore paused state
          timerState.isRunning = true;
          timerState.isPaused = true;
          timerState.elapsedTime = savedState.elapsedTime;
          notifyTimerStatus(false);
        }
      }
    }
    
    updateDisplay();
    updateTodayTotal();
    updateButtonStates();
  });
}

// Event listeners
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
stopBtn.addEventListener('click', stopTimer);

// Initialize
loadState();

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  saveState();
});
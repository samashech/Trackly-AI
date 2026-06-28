// Function to inject the permanent critical task widget
function injectCriticalWidget(taskTitles) {
  if (document.getElementById('actionmate-critical-widget')) return;
  const widget = document.createElement('div');
  widget.id = 'actionmate-critical-widget';
  widget.style.position = 'fixed';
  widget.style.bottom = '20px';
  widget.style.left = '20px';
  widget.style.background = '#1e1e2f'; // Match dashboard dark theme
  widget.style.color = '#ff5555'; // Critical priority red
  widget.style.border = '2px solid #ff5555';
  widget.style.padding = '12px 16px';
  widget.style.borderRadius = '8px';
  widget.style.fontWeight = 'bold';
  widget.style.fontSize = '14px';
  widget.style.zIndex = '9999999';
  widget.style.boxShadow = '4px 4px 0px #ff5555';
  widget.style.fontFamily = 'system-ui, sans-serif';
  widget.style.cursor = 'move';
  widget.style.userSelect = 'none'; // Prevent text selection while dragging
  widget.innerHTML = `⚠️ CRITICAL: ${taskTitles}`;
  document.body.appendChild(widget);

  // Dragging logic
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  widget.addEventListener('mousedown', (e) => {
    isDragging = true;
    // Calculate the offset from the cursor to the top-left of the widget
    const rect = widget.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    widget.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    // Update position
    widget.style.left = (e.clientX - offsetX) + 'px';
    widget.style.top = (e.clientY - offsetY) + 'px';
    widget.style.bottom = 'auto'; // override the initial bottom anchor
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      widget.style.cursor = 'move';
    }
  });
}

// Function to inject the banner directly into the webpage
function injectWarningBanner(taskTitle, minsLeft) {
  if (document.getElementById('actionmate-warning')) return; // Already injected
  const banner = document.createElement('div');
  banner.id = 'actionmate-warning';
  banner.style.position = 'fixed';
  banner.style.top = '0';
  banner.style.left = '0';
  banner.style.width = '100%';
  banner.style.background = '#ef4444'; // Warning Red
  banner.style.color = 'white';
  banner.style.textAlign = 'center';
  banner.style.padding = '12px';
  banner.style.fontWeight = 'bold';
  banner.style.fontSize = '16px';
  banner.style.zIndex = '9999999';
  banner.style.boxShadow = '0 10px 15px rgba(0,0,0,0.5)';
  banner.style.fontFamily = 'system-ui, sans-serif';
  banner.style.animation = 'pulse 2s infinite'; // Requires the site to have a pulse animation, but it's fine
  banner.innerText = `⚠️ ActionMate Warning: You have ${Math.ceil(minsLeft)} minutes left to finish "${taskTitle}" before Nuclear Lockdown. Get to work!`;
  document.body.appendChild(banner);
  
  // Flash it a few times and disappear after 10 seconds so it doesn't break the site completely
  setTimeout(() => banner.remove(), 10000);
}

// Function to fetch overdue tasks and warning tasks from backend
async function getTaskStates() {
  try {
    const response = await fetch('http://localhost:8000/api/tasks');
    const tasks = await response.json();
    
    const now = new Date();
    
    let overdueDomains = [];
    let warningTasks = []; 
    let criticalTasks = []; 

    for (const task of tasks) {
      if (task.status === 'completed') continue;
      
      const dueDate = new Date(task.due_date);
      const diffMins = (dueDate.getTime() - now.getTime()) / (1000 * 60);
      
      if (task.priority === 'critical') {
        criticalTasks.push(task.title);
      }
      
      if (diffMins <= 0) {
        // Task is failed - collect blocked sites for hard redirect
        if (task.blocked_sites && Array.isArray(task.blocked_sites)) {
          overdueDomains.push(...task.blocked_sites);
        }
      } else if (diffMins > 0 && diffMins <= 15) {
        // Task is dangerously close - collect for warning shot
        if (task.blocked_sites && Array.isArray(task.blocked_sites)) {
          warningTasks.push({
            domains: task.blocked_sites,
            title: task.title,
            minsLeft: diffMins
          });
        }
      }
    }
    
    return { overdueDomains, warningTasks, criticalTasks };
  } catch (error) {
    return { overdueDomains: [], warningTasks: [], criticalTasks: [] };
  }
}

// Listen to every tab the user opens or navigates to
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Execute when the page finishes loading
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', ''); // clean the domain
      
      const states = await getTaskStates();
      
      // 1. Is the user trying to visit an overdue domain?
      if (states.overdueDomains.some(d => domain.includes(d))) {
        console.log(`ActionMate Enforcer: Blocked access to ${domain}! Redirecting to dashboard.`);
        chrome.tabs.update(tabId, { url: "http://localhost:5173" });
      } 
      // 2. Is the user visiting a domain they are tracking with < 15 mins left?
      else {
        for (const w of states.warningTasks) {
          if (w.domains.some(d => domain.includes(d))) {
            console.log(`ActionMate Enforcer: Firing warning shot on ${domain} for task "${w.title}"`);
            // Inject the warning banner into the page
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: injectWarningBanner,
              args: [w.title, w.minsLeft]
            });
            break; // Only show one banner
          }
        }
      }
      
      // 3. Is there a critical task? If so, always display the permanent widget
      if (states.criticalTasks && states.criticalTasks.length > 0) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: injectCriticalWidget,
          args: [states.criticalTasks.join(', ')]
        });
      }
    } catch (e) {
      // Ignore internal browser URLs like chrome://
    }
  }
});

// --- TIME TRACKING SURVEILLANCE ---

let activeTabDomain = null;
let activeTabStartTime = null;

function handleTabChange(tab) {
  const now = Date.now();
  
  if (activeTabDomain && activeTabStartTime) {
    const elapsedSeconds = Math.floor((now - activeTabStartTime) / 1000);
    if (elapsedSeconds > 0) {
      fetch('http://localhost:8000/api/usage', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ domain: activeTabDomain, seconds: elapsedSeconds })
      }).catch(console.error);
    }
  }

  if (tab && tab.url && tab.url.startsWith('http')) {
    try {
      const url = new URL(tab.url);
      activeTabDomain = url.hostname.replace('www.', '');
      activeTabStartTime = now;
    } catch (e) {
      activeTabDomain = null;
      activeTabStartTime = null;
    }
  } else {
    activeTabDomain = null;
    activeTabStartTime = null;
  }
}

chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    handleTabChange(tab);
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    handleTabChange(null);
  } else {
    chrome.tabs.query({active: true, windowId: windowId}, tabs => {
      if (tabs.length > 0) handleTabChange(tabs[0]);
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    handleTabChange(tab);
  }
});

// Sync every 10 seconds to catch users sitting on long youtube videos
setInterval(() => {
  if (activeTabDomain && activeTabStartTime) {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - activeTabStartTime) / 1000);
    if (elapsedSeconds >= 10) { 
      fetch('http://localhost:8000/api/usage', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ domain: activeTabDomain, seconds: elapsedSeconds })
      }).catch(console.error);
      activeTabStartTime = now;
    }
  }
}, 10000);

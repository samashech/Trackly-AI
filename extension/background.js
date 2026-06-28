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

    for (const task of tasks) {
      if (task.status === 'completed') continue;
      
      const dueDate = new Date(task.due_date);
      const diffMins = (dueDate.getTime() - now.getTime()) / (1000 * 60);
      
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
    
    return { overdueDomains, warningTasks };
  } catch (error) {
    return { overdueDomains: [], warningTasks: [] };
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
    } catch (e) {
      // Ignore internal browser URLs like chrome://
    }
  }
});

// List of domains to block when a task is overdue
const BLOCKED_DOMAINS = [
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "reddit.com",
  "twitter.com",
  "x.com"
];

// Function to check if the user has failed any deadlines
async function isSystemInLockdown() {
  try {
    // Talk directly to our local FastAPI backend
    const response = await fetch('http://localhost:8000/api/tasks');
    const tasks = await response.json();
    
    const now = new Date();
    
    // Returns true if ANY task is pending and past its due date
    return tasks.some(t => t.status !== 'completed' && new Date(t.due_date) < now);
  } catch (error) {
    // If backend is down, default to not locking down
    return false;
  }
}

// Listen to every tab the user opens or navigates to
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care when the URL changes or the page starts loading
  if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
    try {
      const url = new URL(tab.url || changeInfo.url);
      const domain = url.hostname.replace('www.', ''); // clean the domain
      
      // Is the user trying to visit a blocked domain?
      if (BLOCKED_DOMAINS.includes(domain)) {
        
        // Immediately ask the backend if we are in lockdown
        const lockedDown = await isSystemInLockdown();
        
        if (lockedDown) {
          console.log(`ActionMate Enforcer: Blocked access to ${domain}! Redirecting to dashboard.`);
          
          // Forcefully redirect the tab back to the ActionMate Lockdown screen
          chrome.tabs.update(tabId, { url: "http://localhost:5173" });
        }
      }
    } catch (e) {
      // Ignore internal browser URLs like chrome://
    }
  }
});

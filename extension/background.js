// Function to fetch overdue tasks and dynamically extract blocked domains
async function getActiveBlockedDomains() {
  try {
    // Talk directly to our local FastAPI backend
    const response = await fetch('http://localhost:8000/api/tasks');
    const tasks = await response.json();
    
    const now = new Date();
    // Find all overdue tasks
    const overdueTasks = tasks.filter(t => t.status !== 'completed' && new Date(t.due_date) < now);
    
    // Collect all the domains that these specific overdue tasks asked to block
    let blockedDomains = [];
    for (const task of overdueTasks) {
      if (task.blocked_sites && Array.isArray(task.blocked_sites)) {
        blockedDomains.push(...task.blocked_sites);
      }
    }
    
    return blockedDomains;
  } catch (error) {
    // If backend is down, we don't know what to block
    return [];
  }
}

// Listen to every tab the user opens or navigates to
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care when the URL changes or the page starts loading
  if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
    try {
      const url = new URL(tab.url || changeInfo.url);
      const domain = url.hostname.replace('www.', ''); // clean the domain
      
      // Ask the backend for the currently active list of blocked domains
      const blockedDomains = await getActiveBlockedDomains();
      
      // Is the user trying to visit a blocked domain?
      if (blockedDomains.includes(domain)) {
        console.log(`ActionMate Enforcer: Blocked access to ${domain}! Redirecting to dashboard.`);
        
        // Forcefully redirect the tab back to the ActionMate Lockdown screen
        chrome.tabs.update(tabId, { url: "http://localhost:5173" });
      }
    } catch (e) {
      // Ignore internal browser URLs like chrome://
    }
  }
});

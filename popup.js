// Popup functionality
document.addEventListener('DOMContentLoaded', async function() {
    await loadStats();
    await loadFollowUps();
    setupEventListeners();
});

/**
 * Load and display statistics
 */
async function loadStats() {
    try {
        const result = await chrome.storage.local.get(['connections', 'pendingConnections']);
        const connections = result.connections || {};
        const pending = result.pendingConnections || {};
        
        document.getElementById('totalConnections').textContent = Object.keys(connections).length;
        document.getElementById('pendingConnections').textContent = Object.keys(pending).length;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Load and display upcoming follow-ups
 */
async function loadFollowUps() {
    try {
        const result = await chrome.storage.local.get(['connections']);
        const connections = result.connections || {};
        
        // Filter connections that need follow-up (within next 7 days)
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);
        
        const followUps = Object.values(connections)
            .filter(conn => conn.followUpDate && new Date(conn.followUpDate) <= nextWeek)
            .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
            .slice(0, 5); // Show only next 5
        
        const followUpsList = document.getElementById('followUpsList');
        
        if (followUps.length === 0) {
            followUpsList.innerHTML = '<div class="empty-state">No upcoming follow-ups</div>';
            return;
        }
        
        followUpsList.innerHTML = followUps.map(conn => `
            <div class="follow-up-item">
                <div class="follow-up-name">${conn.name}</div>
                <div class="follow-up-date">Follow up: ${formatDate(conn.followUpDate)}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading follow-ups:', error);
    }
}

/**
 * Setup event listeners for buttons
 */
function setupEventListeners() {
    // Scan connections button
    document.getElementById('scanConnections').addEventListener('click', async function() {
        const button = this;
        const status = document.getElementById('status');
        
        button.classList.add('loading');
        button.textContent = '🔄 Scanning...';
        
        try {
            // Check if we're on the connections page
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('linkedin.com/mynetwork/invite-connect/connections')) {
                showStatus('Please navigate to your LinkedIn connections page first', 'error');
                return;
            }
            
            // Send message to content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_CONNECTIONS' });
            
            if (response && response.success) {
                showStatus('✅ Connections scanned successfully!', 'success');
                await loadStats();
                await loadFollowUps();
            } else {
                showStatus('❌ Could not find connections on this page', 'error');
            }
            
        } catch (error) {
            console.error('Error scanning connections:', error);
            showStatus('❌ Error scanning connections. Make sure you\'re on LinkedIn.', 'error');
        } finally {
            button.classList.remove('loading');
            button.textContent = '🔍 Scan Current Page';
        }
    });
    
    // View connections button
    document.getElementById('viewConnections').addEventListener('click', function() {
        chrome.tabs.create({ url: chrome.runtime.getURL('connections.html') });
    });
    
    // Export data button
    document.getElementById('exportData').addEventListener('click', async function() {
        try {
            const result = await chrome.storage.local.get(['connections', 'pendingConnections']);
            const data = {
                connections: result.connections || {},
                pendingConnections: result.pendingConnections || {},
                exportDate: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const a = document.createElement('a');
            a.href = url;
            a.download = `linkedin-connections-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showStatus('✅ Data exported successfully!', 'success');
            
        } catch (error) {
            console.error('Error exporting data:', error);
            showStatus('❌ Error exporting data', 'error');
        }
    });
    
    // Clear data button
    document.getElementById('clearData').addEventListener('click', async function() {
        if (confirm('Are you sure you want to delete all stored connection data? This cannot be undone.')) {
            try {
                await chrome.storage.local.clear();
                await loadStats();
                await loadFollowUps();
                showStatus('✅ All data cleared', 'success');
            } catch (error) {
                console.error('Error clearing data:', error);
                showStatus('❌ Error clearing data', 'error');
            }
        }
    });
}

/**
 * Show status message
 */
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    if (diffDays < 7) return `In ${diffDays} days`;
    
    return date.toLocaleDateString();
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONNECTIONS_UPDATED') {
        loadStats();
        loadFollowUps();
        showStatus(`✅ Updated ${message.data.updatedCount} connections, found ${message.data.newCount} new ones`, 'success');
    } else if (message.type === 'PENDING_CONNECTION_ADDED') {
        loadStats();
        showStatus(`📤 Pending connection added: ${message.data.name}`, 'success');
    }
});
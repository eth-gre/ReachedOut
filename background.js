// Background service worker for the LinkedIn Connections Tracker extension

console.log('LinkedIn Connections Tracker: Background script loaded');

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('LinkedIn Connections Tracker installed');
        
        // Initialize storage with default values if needed
        chrome.storage.local.get(['connections', 'pendingConnections'], (result) => {
            if (!result.connections) {
                chrome.storage.local.set({ connections: {} });
            }
            if (!result.pendingConnections) {
                chrome.storage.local.set({ pendingConnections: {} });
            }
        });
    }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    switch (message.type) {
        case 'CONNECTIONS_UPDATED':
            // Forward to popup if it's open
            chrome.runtime.sendMessage(message).catch(() => {
                // Popup might not be open, ignore error
            });
            break;
            
        case 'PENDING_CONNECTION_ADDED':
            // Forward to popup if it's open
            chrome.runtime.sendMessage(message).catch(() => {
                // Popup might not be open, ignore error
            });
            break;
            
        default:
            break;
    }
});

// Periodic cleanup of old pending connections (optional)
chrome.alarms.create('cleanupPendingConnections', { 
    delayInMinutes: 60, 
    periodInMinutes: 24 * 60 // Run daily
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanupPendingConnections') {
        cleanupOldPendingConnections();
    }
});

/**
 * Clean up pending connections older than 30 days
 */
async function cleanupOldPendingConnections() {
    try {
        const result = await chrome.storage.local.get(['pendingConnections']);
        const pendingConnections = result.pendingConnections || {};
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        let cleanedCount = 0;
        
        for (const [key, connection] of Object.entries(pendingConnections)) {
            if (new Date(connection.dateSent) < thirtyDaysAgo) {
                delete pendingConnections[key];
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            await chrome.storage.local.set({ pendingConnections });
            console.log(`Cleaned up ${cleanedCount} old pending connections`);
        }
        
    } catch (error) {
        console.error('Error cleaning up pending connections:', error);
    }
}
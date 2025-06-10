// This script runs on all LinkedIn pages to detect when "Connect" buttons are clicked
console.log("LinkedIn Connection Detector: Script loaded");

/**
 * Save a pending connection when Connect button is clicked
 */
async function savePendingConnection(profileUrl, name, title, pfp) {
    try {
        const result = await chrome.storage.local.get(['pendingConnections']);
        const pendingConnections = result.pendingConnections || {};
        
        const connectionData = {
            name: name || 'Unknown',
            profileUrl: profileUrl,
            pfp: pfp || '',
            title: title || '',
            status: 'pending',
            dateSent: new Date().toISOString(),
            followUpDate: null // Will be set when connection is accepted
        };
        
        pendingConnections[profileUrl] = connectionData;
        
        await chrome.storage.local.set({ pendingConnections });
        
        console.log(`Pending connection saved: ${name}`);
        
        // Notify popup if open
        chrome.runtime.sendMessage({
            type: 'PENDING_CONNECTION_ADDED',
            data: connectionData
        }).catch(() => {
            // Popup might not be open, ignore error
        });
        
    } catch (error) {
        console.error('Error saving pending connection:', error);
    }
}

/**
 * Save a connection as already connected (manual add)
 */
async function saveManualConnection(profileUrl, name, title, pfp) {
    try {
        const result = await chrome.storage.local.get(['connections']);
        const connections = result.connections || {};
        
        // Check if connection already exists
        if (connections[profileUrl]) {
            console.log(`Connection already exists: ${name}`);
            chrome.runtime.sendMessage({
                type: 'CONNECTION_EXISTS',
                data: { name }
            }).catch(() => {});
            return;
        }
        
        const connectionData = {
            name: name || 'Unknown',
            profileUrl: profileUrl,
            pfp: pfp || '',
            title: title || '',
            status: 'connected',
            dealStage: 'connected',
            dateConnected: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            followUpDate: (() => {
                const followUpDate = new Date();
                followUpDate.setDate(followUpDate.getDate() + 14);
                followUpDate.setHours(0, 0, 0, 0);
                return followUpDate.toISOString();
            })()
        };
        
        connections[profileUrl] = connectionData;
        
        await chrome.storage.local.set({ connections });
        
        console.log(`Manual connection saved: ${name}`);
        
        // Notify popup if open
        chrome.runtime.sendMessage({
            type: 'MANUAL_CONNECTION_ADDED',
            data: connectionData
        }).catch(() => {});
        
    } catch (error) {
        console.error('Error saving manual connection:', error);
    }
}

/**
 * Extract profile information from the current page or button context
 */
function extractProfileInfo(buttonElement) {
    // Try to get profile URL from current page
    let profileUrl = window.location.href;
    
    // If we're on a profile page, use that URL
    if (profileUrl.includes('/in/')) {
        profileUrl = profileUrl.split('?')[0]; // Remove query parameters
    } else {
        // Try to find profile link near the button
        const profileLink = buttonElement.closest('[data-view-name]')?.querySelector('a[href*="/in/"]');
        if (profileLink) {
            profileUrl = profileLink.href.split('?')[0];
        }
    }
    
    // Extract name and title
    let name = 'Unknown';
    let title = '';
    
    // Try different selectors based on page context
    const nameSelectors = [
        'h1.text-heading-xlarge',
        'h1[data-generated-suggestion-target]',
		'h1.inline.t-24.v-align-middle.break-words',
    ];
    
    const titleSelectors = [
        '.text-body-medium.break-words',
        '.pv-text-details__left-panel .text-body-medium',
        '[data-view-name="profile-card"] .artdeco-entity-lockup__subtitle',
        '.artdeco-entity-lockup__subtitle'
    ];
    
    // Try to find name
    for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            name = element.textContent.trim();
            break;
        }
    }
    
    // Try to find title
    for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            title = element.textContent.trim();
            break;
        }
    }

    // Extract the PFP
    const pfpSelector = 'img.pv-top-card-profile-picture__image--show'
    const pfp = document.querySelector(pfpSelector).src || ''
    
    return { profileUrl, name, title, pfp };
}

/**
 * Handle Connect button clicks
 */
function handleConnectButtonClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    
    // Check if this is a Connect button
    const buttonText = button.textContent.trim().toLowerCase();
    if ((buttonText.includes('connect') && !buttonText.includes('following')) || buttonText.includes('more')) {
        console.log('Connect button clicked');
        
        // Small delay to ensure the click is processed
        setTimeout(() => {
            const profileInfo = extractProfileInfo(button);
            if (profileInfo.profileUrl) {
                savePendingConnection(profileInfo.profileUrl, profileInfo.name, profileInfo.title, profileInfo.pfp);
            }
        }, 500);
    }
}

// Add event listener for button clicks
document.addEventListener('click', handleConnectButtonClick, true);

// Also watch for dynamically added buttons
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if the added node or its children contain Connect buttons
                    const connectButtons = node.querySelectorAll ? 
                        node.querySelectorAll('button[aria-label*="connect" i], button:contains("Connect")') : [];
                    
                    connectButtons.forEach(button => {
                        button.addEventListener('click', handleConnectButtonClick, true);
                    });
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'MARK_AS_CONNECTED') {
        const profileInfo = extractProfileInfo(document.body);
        if (profileInfo.profileUrl) {
            saveManualConnection(profileInfo.profileUrl, profileInfo.name, profileInfo.title, profileInfo.pfp);
            sendResponse({ success: true, data: profileInfo });
        } else {
            sendResponse({ success: false, error: 'Could not extract profile info' });
        }
        return true; // Keep message channel open for async response
    }
});
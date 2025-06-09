console.log("LinkedIn Connections Element Finder: Script injected.");

// Selector for the main connections list container
const mainListContainerSelector = 'div[componentkey="ConnectionsPage_ConnectionsList"]';
// Selector for the main link element for EACH individual connection item
const individualConnectionSelector = 'div[data-view-name="connections-list"]'
const connectionLinkSelector = 'a[data-view-name="connections-profile"]';

/**
 * Attempts to find the connections list element and process it.
 * @returns {Promise<boolean>} True if the element was found and processed, false otherwise.
 */
async function findAndProcessConnectionsList() {
    const connectionsListElement = document.querySelector(mainListContainerSelector);
    
    if (connectionsListElement) {
        // Find all the main links for individual connection items within the container
        const connections = connectionsListElement.querySelectorAll(individualConnectionSelector);
        const connectionsData = [];
        
        console.log(`LinkedIn Connections Element Finder: Found ${connections.length} connection links.`);
        
        // Process each connection
        connections.forEach((connection, index) => {
            try {
                // 1. Extract Profile URL
                const linkElement = connection.querySelector(connectionLinkSelector);
                if (!linkElement) return;
                
                const profileUrl = linkElement.href;
                
                // Iterate over all of the <p> tags
                const textElements = connection.querySelectorAll('p');
                if (textElements.length < 3) return;
                
                // Parse the date
                const dateStr = textElements[2].textContent.replace("connected on ", "");
                const date = new Date(dateStr);

                const followUp = new Date(date)
                followUp.setDate(followUp.getDate() + 14)

                // Extract the PFP
                const pfpElement = connection.querySelector('img')
                
                connectionsData.push({
                    name: textElements[0].textContent.trim(),
                    profileUrl: profileUrl,
                    pfp: pfpElement.src || '',
                    title: textElements[1].textContent.trim(),
                    dateConnectedString: dateStr,
                    dateConnected: date instanceof Date && !isNaN(date) ? date.toISOString() : null,
                    followUpDate: followUp instanceof Date && !isNaN(followUp) ? followUp.toISOString() : null,
                    status: 'connected',
                    lastUpdated: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error processing connection:', error);
            }
        });
        
        if (connectionsData.length > 0) {
            await saveConnectionsData(connectionsData);
            console.log("LinkedIn Connections Element Finder: Data saved to storage");
        }
        
        return true;
    } else {
        return false;
    }
}

/**
 * Saves scanned connections, processing accepted pending requests.
 * Only connections that were previously pending are added to the main connections list.
 * @param {Array<Object>} scannedConnections An array of connection objects scanned from a LinkedIn page.
 */
async function saveConnectionsData(scannedConnections) {
    try {
        // Get existing data
        const result = await chrome.storage.local.get(['connections', 'pendingConnections']);
        const existingConnections = result.connections || {};
        // Use 'let' because we will modify pendingConnections
        let pendingConnections = result.pendingConnections || {};

        // Prepare an object to hold the updated connections list
        // We start with all existing connections and only add accepted pending ones
        const connectionsToSave = { ...existingConnections };

        let acceptedCount = 0; // Count how many pending connections were just accepted

        // Iterate through the connections found on the scanned page
        scannedConnections.forEach(scannedConn => {
            const key = scannedConn.profileUrl;

            // *** Core Logic Change: Check if this scanned connection exists in our PENDING list ***
            if (pendingConnections[key]) {
                console.log(`Pending connection accepted: ${scannedConn.name}`);

                // This connection was indeed previously pending.
                // It has now been accepted.

                // 1. Get the original pending data (might have dateSent etc.)
                const pendingData = pendingConnections[key];

                // 2. Remove it from the pending list
                delete pendingConnections[key];

                // 3. Prepare the data for the main connections list
                // Merge data from pending (e.g., dateSent) with data from the scan (current name, title, profileUrl, status='connected')
                const acceptedConnectionData = {
                    ...pendingData, // Include existing pending data like dateSent
                    ...scannedConn, // Include data from the current scan (name, title, profileUrl). scannedConn.status will likely be 'connected'.
                    status: 'connected', // Ensure status is explicitly 'connected'
                    dateConnected: new Date().toISOString(), // Record the date/time the connection was detected as accepted (the scan time)
                    lastUpdated: new Date().toISOString()
                };

                // 4. Calculate and set the initial follow-up date (2 weeks from acceptance date)
                const acceptanceDate = new Date(); // Use the current date/time as the acceptance date
                acceptanceDate.setDate(acceptanceDate.getDate() + 14);
                // Set time to the beginning of the day for consistent date comparison in the viewer
                acceptanceDate.setHours(0, 0, 0, 0);

                acceptedConnectionData.followUpDate = acceptanceDate.toISOString();

                // 5. Add or update this accepted connection in the main connections list
                // If it somehow already existed, this will ensure its status and follow-up are updated.
                connectionsToSave[key] = acceptedConnectionData;

                acceptedCount++; // Increment the count of accepted requests

            }
             // If the scanned connection's profileUrl is *not* found in pendingConnections,
             // we do nothing. This connection was either already in the network before
             // sending a request, or it's not relevant to the outreach tracking.
        });

        // Save the updated lists back to storage
        await chrome.storage.local.set({
            connections: connectionsToSave, // This object now contains all previously tracked connections PLUS the ones just accepted from pending
            pendingConnections: pendingConnections // This object has the accepted connections removed
        });

        console.log(`Processed scan. ${acceptedCount} pending requests accepted.`);

        // Send message to popup if it's open
        chrome.runtime.sendMessage({
            type: 'CONNECTIONS_UPDATED',
            data: {
                acceptedCount: acceptedCount, // Use acceptedCount for clarity
                totalConnections: Object.keys(connectionsToSave).length // Report total tracked connections
            }
        }).catch(() => {
            // Popup might not be open, ignore error
        });

    } catch (error) {
        console.error('Error saving connections data:', error);
        // Optionally send an error message to the popup/UI if needed
    }
}

/**
 * Calculate follow-up date (2 weeks from now)
 */
function getFollowUpDate(connectionDate) {
  const followUpDate = new Date(connectionDate);
  followUpDate.setDate(followUpDate.getDate() + 14);
  return followUpDate;
}

// --- Use MutationObserver to wait for the element to appear ---
const observer = new MutationObserver((mutations, obs) => {
    const found = findAndProcessConnectionsList();
    if (found) {
        obs.disconnect();
        console.log("LinkedIn Connections Element Finder: Observer disconnected.");
    }
});

// --- Start observing the body for child additions in the subtree ---
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// --- Initial check in case the element is already present ---
const foundImmediately = findAndProcessConnectionsList();
if (foundImmediately) {
    observer.disconnect();
    console.log("LinkedIn Connections Element Finder: Element found immediately, observer disconnected.");
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_CONNECTIONS') {
        findAndProcessConnectionsList().then(result => {
            sendResponse({ success: result });
        });
        return true; // Keep message channel open for async response
    }
});
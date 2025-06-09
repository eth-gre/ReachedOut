// connections.js - Enhanced CRM JavaScript for LinkedIn connections

let allConnections = [];
let allPending = [];
let filteredConnections = [];
let currentPage = 1;
let itemsPerPage = 20;
let currentTab = 'all';

// Deal stages configuration
const DEAL_STAGES = {
    pending: { label: 'Pending', next: ['connected'], color: '#fff3cd' },
    connected: { label: 'Connected', next: ['followedUp'], color: '#d4edda' },
    followedUp: { label: 'Followed Up', next: ['upcomingChat', 'chatDeclined'], color: '#cce5ff' },
    upcomingChat: { label: 'Chat Booked', next: ['upcomingOnboard', 'onboardDeclined'], color: '#b3d9ff' },
    chatDeclined: { label: 'Chat Declined', next: [], color: '#f8d7da' },
    upcomingOnboard: { label: 'Potential Onboard', next: ['onboarded', 'onboardDeclined'], color: '#d1ecf1' },
    onboardDeclined: { label: 'Onboard Declined', next: [], color: '#f8d7da' },
    onboarded: { label: 'Onboarded', next: [], color: '#d4edda' }
};

// Load data when page loads
document.addEventListener('DOMContentLoaded', async function() {
    await loadData();
    setupEventListeners();
    applyFilters();
});

async function loadData() {
    try {
        const result = await chrome.storage.local.get(['connections', 'pendingConnections']);
        const connections = result.connections || {};
        const pending = result.pendingConnections || {};

        // Convert objects back to arrays and ensure dealStage is set
        allConnections = Object.keys(connections).map(profileUrl => {
            const conn = { profileUrl, ...connections[profileUrl] };
            // Set default dealStage if not present
            if (!conn.dealStage) {
                conn.dealStage = conn.status === 'pending' ? 'pending' : 'connected';
            }
            return conn;
        });

        allPending = Object.keys(pending).map(profileUrl => {
            const conn = { profileUrl, ...pending[profileUrl] };
            if (!conn.dealStage) {
                conn.dealStage = 'pending';
            }
            return conn;
        });

        console.log('Loaded connections:', allConnections.length);
        console.log('Loaded pending:', allPending.length);

        updateStats();

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('connectionsList').innerHTML = `
            <div class="empty-state">
                <p>Error loading connections data.</p>
                <p>Make sure the extension is properly installed and you have some connections saved.</p>
            </div>
        `;
    }
}

function updateStats() {
    // Calculate stats based on deal stages
    const allData = [...allConnections, ...allPending];
    
    const stats = {
        total: allData.length,
        pending: allData.filter(c => c.dealStage === 'pending').length,
        reachoutRequired: allData.filter(c => new Date(c.followUpDate).getTime() <= Date.now() && c.dealStage === 'connected').length,
        connected: allData.filter(c => c.dealStage === 'connected').length,
        followedUp: allData.filter(c => c.dealStage === 'followedUp').length,
        upcomingChat: allData.filter(c => c.dealStage === 'upcomingChat').length,
        upcomingOnboard: allData.filter(c => c.dealStage === 'upcomingOnboard').length,
        onboarded: allData.filter(c => c.dealStage === 'onboarded').length,
        declined: allData.filter(c => ['chatDeclined', 'onboardDeclined'].includes(c.dealStage)).length
    };

    // Update stat cards
    document.getElementById('totalConnections').textContent = stats.total;
    document.getElementById('pendingConnections').textContent = stats.pending;
    document.getElementById('followUpConnections').textContent = stats.followedUp;
    document.getElementById('chatBookedConnections').textContent = stats.upcomingChat;
    document.getElementById('onboardingConnections').textContent = stats.upcomingOnboard;
    document.getElementById('onboardedConnections').textContent = stats.onboarded;
    
    // If there is no reachout needed, hide it
    if (stats.reachoutRequired === 0) {
        document.getElementById('reachout-marker').style.display = 'none'
    }
    else {
        document.getElementById('reachout-marker').textContent = stats.reachoutRequired;
    }
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentTab = this.dataset.tab;
            currentPage = 1;
            applyFilters();
        });
    });

    // Filters
    document.getElementById('searchFilter').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('sortFilter').addEventListener('change', applyFilters);
    document.getElementById('orderFilter').addEventListener('change', applyFilters);

    // Event delegation for buttons within the connections list
    document.getElementById('connectionsList').addEventListener('click', handleListClick);
}

async function handleListClick(event) {
    const target = event.target;
    
    // Handle stage progression buttons
    const stageButton = target.closest('[data-action]');
    if (stageButton) {
        event.preventDefault();
        const action = stageButton.dataset.action;
        const profileUrl = stageButton.dataset.profileUrl;
        
        if (action.startsWith('stage-')) {
            const newStage = action.replace('stage-', '');
            await updateConnectionStage(profileUrl, newStage);
        } else if (action === 'delete') {
            await deleteConnection(profileUrl, stageButton.dataset.name);
        }
        return;
    }
}

async function updateConnectionStage(profileUrl, newStage) {
    // Find connection in either array
    let connection = allConnections.find(c => c.profileUrl === profileUrl);
    let isInPending = false;
    
    if (!connection) {
        connection = allPending.find(c => c.profileUrl === profileUrl);
        isInPending = true;
    }
    
    if (!connection) {
        console.warn('Connection not found:', profileUrl);
        return;
    }
    
    console.log(`Updating ${connection.name} from ${connection.dealStage} to ${newStage}`);
    
    // Update the connection
    connection.dealStage = newStage;
    connection.lastUpdated = new Date().toISOString();
    
    // Set follow-up date if moving to followedUp stage
    if (newStage === 'followedUp') {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + 14);
        followUpDate.setHours(0, 0, 0, 0);
        connection.followUpDate = followUpDate.toISOString();
    }
    
    // Move between arrays if necessary
    if (newStage === 'pending' && !isInPending) {
        // Move from connections to pending
        allConnections = allConnections.filter(c => c.profileUrl !== profileUrl);
        allPending.push(connection);
    } else if (newStage !== 'pending' && isInPending) {
        // Move from pending to connections
        allPending = allPending.filter(c => c.profileUrl !== profileUrl);
        allConnections.push(connection);
    }
    
    // Save to storage
    await saveData();
    
    // Update UI
    updateStats();
    applyFilters();
}

async function deleteConnection(profileUrl, name) {
    const isConfirmed = confirm(`Are you sure you want to delete "${name}" from your tracked connections?`);
    
    if (!isConfirmed) return;
    
    console.log('Deleting connection:', name);
    
    // Remove from both arrays
    allConnections = allConnections.filter(c => c.profileUrl !== profileUrl);
    allPending = allPending.filter(c => c.profileUrl !== profileUrl);
    
    await saveData();
    updateStats();
    applyFilters();
}

async function saveData() {
    const connectionsObj = Object.fromEntries(
        allConnections.map(conn => [conn.profileUrl, conn])
    );
    const pendingObj = Object.fromEntries(
        allPending.map(conn => [conn.profileUrl, conn])
    );
    
    try {
        await chrome.storage.local.set({
            connections: connectionsObj,
            pendingConnections: pendingObj
        });
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

function applyFilters() {
    let connections = [];
    const allData = [...allConnections, ...allPending];

    // Select data based on current tab
    switch (currentTab) {
        case 'pending':
            connections = allData.filter(c => c.dealStage === 'pending');
            break;
        case 'reachout':
            connections = allData.filter(c => new Date(c.followUpDate).getTime() <= Date.now() && c.dealStage === 'connected')
            break
        case 'connected':
            connections = allData.filter(c => c.dealStage === 'connected');
            break;
        case 'followedUp':
            connections = allData.filter(c => c.dealStage === 'followedUp');
            break;
        case 'upcomingChat':
            connections = allData.filter(c => c.dealStage === 'upcomingChat');
            break;
        case 'upcomingOnboard':
            connections = allData.filter(c => c.dealStage === 'upcomingOnboard');
            break;
        case 'onboarded':
            connections = allData.filter(c => c.dealStage === 'onboarded');
            break;
        case 'declined':
            connections = allData.filter(c => ['chatDeclined', 'onboardDeclined'].includes(c.dealStage));
            break;
        default: // all
            connections = [...allData];
    }

    // Apply search filter
    const searchTerm = document.getElementById('searchFilter').value.toLowerCase();
    if (searchTerm) {
        connections = connections.filter(conn =>
            conn.name.toLowerCase().includes(searchTerm) ||
            (conn.title && conn.title.toLowerCase().includes(searchTerm))
        );
    }

    // Apply sorting
    const sortBy = document.getElementById('sortFilter').value;
    const order = document.getElementById('orderFilter').value;

    connections.sort((a, b) => {
        let aValue, bValue;

        switch (sortBy) {
            case 'date':
                aValue = new Date(a.dateConnected || a.dateSent || 0);
                bValue = new Date(b.dateConnected || b.dateSent || 0);
                break;
            case 'stage':
                const stageOrder = Object.keys(DEAL_STAGES);
                aValue = stageOrder.indexOf(a.dealStage);
                bValue = stageOrder.indexOf(b.dealStage);
                break;
            case 'updated':
                aValue = new Date(a.lastUpdated || 0);
                bValue = new Date(b.lastUpdated || 0);
                break;
            default: // name
                aValue = a.name.toLowerCase();
                bValue = b.name.toLowerCase();
        }

        if (aValue < bValue) return order === 'asc' ? -1 : 1;
        if (aValue > bValue) return order === 'asc' ? 1 : -1;
        return 0;
    });

    filteredConnections = connections;
    currentPage = 1;
    displayConnections();
}

function displayConnections() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageConnections = filteredConnections.slice(startIndex, endIndex);

    const connectionsList = document.getElementById('connectionsList');
    const connectionsCount = document.getElementById('connectionsCount');

    connectionsCount.textContent = `${filteredConnections.length} connection${filteredConnections.length === 1 ? '' : 's'}`;

    if (pageConnections.length === 0) {
        let emptyMessage = getEmptyMessage();
        connectionsList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
        document.getElementById('pagination').style.display = 'none';
        return;
    }

    connectionsList.innerHTML = pageConnections.map(conn => {
        const stage = DEAL_STAGES[conn.dealStage] || DEAL_STAGES.connected;
        const actionButtons = getActionButtons(conn);

        let pfpLink = 'https://cdn.pfps.gg/pfps/2903-default-blue.png'

        if (conn.pfp) {
            pfpLink = conn.pfp
        }
        
        return `
            <div class="connection-item">
                <img src="${pfpLink}" class="connection-pfp"/img>
                <div class="connection-info">
                    <div class="connection-name">
                        <a href="${conn.profileUrl}" target="_blank">${conn.name}</a>
                    </div>
                    <div class="connection-title">${conn.title || 'No title'}</div>
                    <div class="connection-meta">
                        ${getConnectionMeta(conn)}
                    </div>
                    <div class="connection-actions">
                        ${actionButtons}
                    </div>
                </div>
                <div class="connection-stage" style="background-color: ${stage.color}">
                    ${stage.label}
                </div>
            </div>
        `;
    }).join('');

    displayPagination();
}

function getActionButtons(conn) {
    const stage = DEAL_STAGES[conn.dealStage];
    if (!stage || stage.next.length === 0) {
        return `<button class="delete-btn" data-action="delete" data-profile-url="${conn.profileUrl}" data-name="${conn.name}">Delete</button>`;
    }
    
    const buttons = stage.next.map(nextStage => {
        const nextStageConfig = DEAL_STAGES[nextStage];
        return `<button class="stage-btn" data-action="stage-${nextStage}" data-profile-url="${conn.profileUrl}">${nextStageConfig.label}</button>`;
    }).join('');
    
    return `${buttons} <button class="delete-btn" data-action="delete" data-profile-url="${conn.profileUrl}" data-name="${conn.name}">Delete</button>`;
}

function getConnectionMeta(conn) {
    const parts = [];

    if (conn.dateConnected && !isNaN(new Date(conn.dateConnected).getTime())) {
        parts.push(`Connected: ${formatDate(conn.dateConnected)}`);
    } else if (conn.dateSent && !isNaN(new Date(conn.dateSent).getTime())) {
        parts.push(`Sent: ${formatDate(conn.dateSent)}`);
    }

    if (conn.followUpDate && !isNaN(new Date(conn.followUpDate).getTime())) {
        parts.push(`Follow up: ${formatDate(conn.followUpDate)}`);
    }
    
    if (conn.lastUpdated && !isNaN(new Date(conn.lastUpdated).getTime())) {
        parts.push(`Updated: ${formatDate(conn.lastUpdated)}`);
    }

    return parts.join(' • ');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getEmptyMessage() {
    const messages = {
        pending: 'No pending connections. Start connecting with people on LinkedIn!',
        connected: 'No connected contacts in this stage.',
        followedUp: 'No contacts have been followed up with yet.',
        upcomingChat: 'No chats are currently booked.',
        upcomingOnboard: 'No contacts are in the onboarding pipeline.',
        onboarded: 'No contacts have been successfully onboarded yet.',
        declined: 'No declined contacts.',
        all: 'No connections yet. Visit your LinkedIn connections page and click "Scan Current Page" in the extension popup.'
    };
    
    return messages[currentTab] || messages.all;
}

function displayPagination() {
    const totalPages = Math.ceil(filteredConnections.length / itemsPerPage);
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }

    pagination.style.display = 'block';

    let paginationHTML = '';
    paginationHTML += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Previous</button>`;

    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
        paginationHTML += `<button onclick="changePage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += '<span>...</span>';
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `<button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += '<span>...</span>';
        }
        paginationHTML += `<button onclick="changePage(${totalPages})">${totalPages}</button>`;
    }

    paginationHTML += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>`;

    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredConnections.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;

    currentPage = page;
    displayConnections();

    document.querySelector('.connections-container').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make changePage function global
window.changePage = changePage;
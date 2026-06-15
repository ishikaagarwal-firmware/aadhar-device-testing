// admin.js - Admin Telemetry Dashboard Controller

// DOM Elements
const adminAuthCard = document.getElementById('adminAuthCard');
const adminDashboard = document.getElementById('adminDashboard');
const adminPasscode = document.getElementById('adminPasscode');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminAuthError = document.getElementById('adminAuthError');

const refreshTimerBadge = document.getElementById('refreshTimerBadge');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');

const metricTotalUsers = document.getElementById('metricTotalUsers');
const metricActiveUsers = document.getElementById('metricActiveUsers');
const metricTotalDuration = document.getElementById('metricTotalDuration');
const telemetryTableBody = document.getElementById('telemetryTableBody');

const newWhitelistEmail = document.getElementById('newWhitelistEmail');
const addWhitelistBtn = document.getElementById('addWhitelistBtn');
const whitelistGrid = document.getElementById('whitelistGrid');

// State
let refreshInterval = null;
let refreshCountdown = 3;
let countdownInterval = null;

// Initialize Page
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkAutoLogin();
});

function setupEventListeners() {
    adminLoginBtn.addEventListener('click', handleAdminLogin);
    adminPasscode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminLogin();
    });
    
    adminLogoutBtn.addEventListener('click', handleAdminLogout);
    refreshLogsBtn.addEventListener('click', fetchTelemetryLogs);

    if (addWhitelistBtn) {
        addWhitelistBtn.addEventListener('click', handleAddWhitelistEmail);
    }
    if (newWhitelistEmail) {
        newWhitelistEmail.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAddWhitelistEmail();
        });
    }
}

function checkAutoLogin() {
    const savedPasscode = localStorage.getItem('admin_passcode');
    if (savedPasscode) {
        adminPasscode.value = savedPasscode;
        verifyAndOpenDashboard(savedPasscode);
    }
}

async function handleAdminLogin() {
    const passcode = adminPasscode.value.trim();
    if (!passcode) {
        showAuthError('Passcode is required.');
        return;
    }
    verifyAndOpenDashboard(passcode);
}

async function verifyAndOpenDashboard(passcode) {
    adminLoginBtn.disabled = true;
    adminLoginBtn.textContent = 'Authenticating...';
    hideAuthError();
    
    try {
        const response = await fetch(`/api/admin-logs?passcode=${encodeURIComponent(passcode)}`);
        
        if (response.status === 200) {
            const data = await response.json();
            if (data.success) {
                localStorage.setItem('admin_passcode', passcode);
                adminAuthCard.style.display = 'none';
                adminDashboard.style.display = 'flex';
                
                // Render data and start timers
                renderTelemetry(data.sessions);
                renderWhitelist(data.allowedEmails);
                startTelemetryTimer();
            } else {
                showAuthError('Failed to load telemetry logs.');
                adminLoginBtn.disabled = false;
                adminLoginBtn.textContent = 'Authenticate & Open';
            }
        } else if (response.status === 401) {
            showAuthError('Incorrect passcode. Access denied.');
            localStorage.removeItem('admin_passcode');
            adminLoginBtn.disabled = false;
            adminLoginBtn.textContent = 'Authenticate & Open';
        } else {
            showAuthError('Server error: ' + response.statusText);
            adminLoginBtn.disabled = false;
            adminLoginBtn.textContent = 'Authenticate & Open';
        }
    } catch (err) {
        showAuthError('Could not connect to the local server. Make sure it is running.');
        adminLoginBtn.disabled = false;
        adminLoginBtn.textContent = 'Authenticate & Open';
    }
}

function handleAdminLogout() {
    localStorage.removeItem('admin_passcode');
    adminPasscode.value = '';
    adminAuthCard.style.display = 'block';
    adminDashboard.style.display = 'none';
    
    adminLoginBtn.disabled = false;
    adminLoginBtn.textContent = 'Authenticate & Open';
    
    stopTelemetryTimer();
}

function showAuthError(msg) {
    adminAuthError.textContent = msg;
    adminAuthError.style.display = 'block';
}

function hideAuthError() {
    adminAuthError.style.display = 'none';
}

// Data fetching & rendering
async function fetchTelemetryLogs() {
    const passcode = localStorage.getItem('admin_passcode');
    if (!passcode) {
        handleAdminLogout();
        return;
    }
    
    try {
        const response = await fetch(`/api/admin-logs?passcode=${encodeURIComponent(passcode)}`);
        if (response.status === 200) {
            const data = await response.json();
            if (data.success) {
                renderTelemetry(data.sessions);
                renderWhitelist(data.allowedEmails);
            }
        } else if (response.status === 401) {
            handleAdminLogout();
        }
    } catch (err) {
        console.error('Error fetching telemetry:', err);
    }
}

function renderTelemetry(sessions) {
    if (sessions && !Array.isArray(sessions)) {
        sessions = [sessions];
    }
    if (sessions) {
        sessions = sessions.filter(s => s && s.email);
    }
    if (!sessions || sessions.length === 0) {
        metricTotalUsers.textContent = '0';
        metricActiveUsers.textContent = '0';
        metricTotalDuration.textContent = '00:00:00';
        telemetryTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    No diagnostic sessions recorded yet.
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort sessions: ACTIVE first, then by login time descending
    sessions.sort((a, b) => {
        if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
        if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;
        return new Date(b.loginTime) - new Date(a.loginTime);
    });

    // 1. Calculate Metrics
    const uniqueEmails = new Set(sessions.map(s => s.email.toLowerCase()));
    const totalUniqueUsers = uniqueEmails.size;
    
    const activeCount = sessions.filter(s => s.status === 'ACTIVE').length;
    
    const totalDurationSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    
    metricTotalUsers.textContent = totalUniqueUsers;
    metricActiveUsers.textContent = activeCount;
    metricTotalDuration.textContent = formatDuration(totalDurationSeconds);

    // 2. Render Table Rows
    telemetryTableBody.innerHTML = sessions.map(session => {
        const durationStr = formatDuration(session.duration || 0);
        const isActive = session.status === 'ACTIVE';
        const statusClass = isActive ? 'status-active' : 'status-offline';
        const statusText = isActive ? 'ACTIVE' : 'OFFLINE';
        
        const actionBtn = isActive ? 
            `<button class="btn btn-danger btn-small kick-btn" data-token="${session.token}" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; font-weight: 600; border-radius: 4px;">Terminate</button>` : 
            `<button class="btn btn-secondary btn-small delete-btn" data-token="${session.token}" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; font-weight: 600; opacity: 0.7; border-radius: 4px;">Delete Log</button>`;

        return `
            <tr>
                <td class="font-bold">${escapeHtml(session.email)}</td>
                <td class="font-mono text-cyan" style="font-size: 0.82rem;">${formatDate(session.loginTime)}</td>
                <td class="font-mono text-muted" style="font-size: 0.82rem;">${formatDate(session.lastActive)}</td>
                <td class="font-orbitron text-amber font-bold">${durationStr}</td>
                <td>
                    <span class="status-dot ${statusClass}"></span>
                    <span class="font-orbitron font-bold" style="font-size: 0.8rem; color: ${isActive ? 'var(--success)' : 'var(--text-muted)'}">${statusText}</span>
                </td>
                <td>${actionBtn}</td>
            </tr>
        `;
    }).join('');

    // Attach kick & delete session event handlers
    const kickButtons = telemetryTableBody.querySelectorAll('.kick-btn');
    kickButtons.forEach(btn => {
        btn.addEventListener('click', () => handleKickUser(btn.getAttribute('data-token')));
    });

    const deleteButtons = telemetryTableBody.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', () => handleDeleteLog(btn.getAttribute('data-token')));
    });
}

// Helpers
function formatDuration(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
        hrs.toString().padStart(2, '0'),
        mins.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
}

function formatDate(isoString) {
    if (!isoString) return '--';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' ' + d.toLocaleDateString([], { month: 'short', day: '2-digit' });
    } catch (e) {
        return isoString;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// Countdown refresh timers
function startTelemetryTimer() {
    stopTelemetryTimer();
    
    refreshCountdown = 3;
    updateRefreshBadge();
    
    countdownInterval = setInterval(() => {
        refreshCountdown--;
        if (refreshCountdown <= 0) {
            refreshCountdown = 3;
            fetchTelemetryLogs();
        }
        updateRefreshBadge();
    }, 1000);
}

function stopTelemetryTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = null;
}

function updateRefreshBadge() {
    if (refreshTimerBadge) {
        refreshTimerBadge.textContent = `REFRESHING IN ${refreshCountdown}s`;
    }
}

// Whitelist & Action Event Handlers
function renderWhitelist(allowedEmails) {
    if (!whitelistGrid) return;
    if (!allowedEmails || allowedEmails.length === 0) {
        whitelistGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem;">
                No authorized email addresses defined yet.
            </div>
        `;
        return;
    }
    
    // Sort alphabetically
    allowedEmails.sort();
    
    whitelistGrid.innerHTML = allowedEmails.map(email => {
        return `
            <div class="glass-card" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid var(--primary); background: rgba(15, 23, 42, 0.25);">
                <span style="font-weight: 500; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
                <button class="remove-whitelist-btn" data-email="${escapeHtml(email)}" style="background: transparent; border: none; color: #f87171; cursor: pointer; font-size: 0.78rem; font-weight: 600; padding: 0.25rem 0.5rem; transition: color 0.15s;">
                    Remove
                </button>
            </div>
        `;
    }).join('');
    
    // Attach remove event handlers
    const removeButtons = whitelistGrid.querySelectorAll('.remove-whitelist-btn');
    removeButtons.forEach(btn => {
        btn.addEventListener('click', () => handleRemoveWhitelistEmail(btn.getAttribute('data-email')));
    });
}

async function handleRemoveWhitelistEmail(email) {
    const passcode = localStorage.getItem('admin_passcode');
    if (!passcode) return;
    
    if (!confirm(`Are you sure you want to deauthorize ${email}? They will no longer be able to log in.`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode, action: 'remove_allowed_email', email })
        });
        if (response.status === 200) {
            const data = await response.json();
            if (data.success) {
                renderTelemetry(data.sessions);
                renderWhitelist(data.allowedEmails);
            }
        }
    } catch (err) {
        console.error('Error removing whitelist email:', err);
    }
}

async function handleAddWhitelistEmail() {
    const passcode = localStorage.getItem('admin_passcode');
    if (!passcode) return;
    
    const email = newWhitelistEmail.value.trim();
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
    }
    
    addWhitelistBtn.disabled = true;
    addWhitelistBtn.textContent = 'Adding...';
    
    try {
        const response = await fetch('/api/admin-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode, action: 'add_allowed_email', email })
        });
        if (response.status === 200) {
            const data = await response.json();
            if (data.success) {
                newWhitelistEmail.value = '';
                renderTelemetry(data.sessions);
                renderWhitelist(data.allowedEmails);
            }
        }
    } catch (err) {
        console.error('Error adding whitelist email:', err);
    } finally {
        addWhitelistBtn.disabled = false;
        addWhitelistBtn.textContent = 'Authorize Email';
    }
}

async function handleKickUser(token) {
    const passcode = localStorage.getItem('admin_passcode');
    if (!passcode) return;
    
    if (!confirm('Are you sure you want to terminate this user\'s diagnostic session? They will be logged out immediately.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode, action: 'terminate_session', token })
        });
        if (response.status === 200) {
            const data = await response.json();
            if (data.success) {
                renderTelemetry(data.sessions);
                renderWhitelist(data.allowedEmails);
            }
        }
    } catch (err) {
        console.error('Error terminating session:', err);
    }
}

async function handleDeleteLog(token) {
    const passcode = localStorage.getItem('admin_passcode');
    if (!passcode) return;
    
    if (!confirm('Are you sure you want to delete this session log record permanently?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode, action: 'delete_session', token })
        });
        if (response.status === 200) {
            const data = await response.json();
            if (data.success) {
                renderTelemetry(data.sessions);
                renderWhitelist(data.allowedEmails);
            }
        }
    } catch (err) {
        console.error('Error deleting session log:', err);
    }
}

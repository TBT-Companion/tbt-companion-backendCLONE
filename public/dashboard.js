// Dashboard logic

let socket = null;
let currentUser = null;
let currentPatient = null;
let patients = [];
let conversations = {};
let typingTimeout = null;

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = '/index.html';
        return;
    }
    
    try {
        const idToken = await user.getIdToken();
        localStorage.setItem('idToken', idToken);
        
        // Fetch user profile
        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }
        
        currentUser = await response.json();
        
        if (currentUser.role !== 'doctor' && currentUser.role !== 'admin') {
            console.error('Access denied: User is not a doctor or admin');
            localStorage.removeItem('idToken');
            await auth.signOut();
            // Add a delay to ensure sign out completes
            setTimeout(() => {
                window.location.href = '/index.html?error=access_denied';
            }, 100);
            return;
        }
        
        // Initialize dashboard
        initializeDashboard();
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('idToken');
        await auth.signOut();
        window.location.href = '/index.html?error=auth_failed';
    }
});

// Initialize dashboard
async function initializeDashboard() {
    // Set doctor name
    document.getElementById('doctor-name').textContent = currentUser.displayName || currentUser.email;
    
    // Show admin UI if user is admin
    if (currentUser.role === 'admin') {
        showAdminUI();
    }
    
    // Load patients
    await loadPatients();
    
    // Initialize WebSocket
    initializeSocket();
    
    // Setup event listeners
    setupEventListeners();
}

// Show admin UI elements
function showAdminUI() {
    const roleBadge = document.getElementById('user-role-badge');
    roleBadge.textContent = 'Admin';
    roleBadge.style.display = 'inline-block';
    
    const adminNav = document.getElementById('admin-nav');
    adminNav.style.display = 'flex';
    
    setupAdminListeners();
}

// Load patients
async function loadPatients() {
    try {
        const idToken = localStorage.getItem('idToken');
        const response = await fetch('/api/users/patients', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch patients');
        }
        
        patients = await response.json();
        
        // Load conversations to get unread counts
        await loadConversations();
        
        // Render patient list
        renderPatientList();
        
        // Update stats
        document.getElementById('total-patients').textContent = patients.length;
    } catch (error) {
        console.error('Error loading patients:', error);
        document.getElementById('patient-list').innerHTML = '<div class="error">Failed to load patients</div>';
    }
}

// Load conversations
async function loadConversations() {
    try {
        const idToken = localStorage.getItem('idToken');
        const response = await fetch('/api/chat/conversations', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch conversations');
        }
        
        const convos = await response.json();
        
        // Create a map of conversations by partnerId
        conversations = {};
        let totalUnread = 0;
        
        convos.forEach(conv => {
            conversations[conv.partnerId] = conv;
            totalUnread += conv.unreadCount || 0;
        });
        
        document.getElementById('unread-messages').textContent = totalUnread;
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// Render patient list
function renderPatientList() {
    const patientListEl = document.getElementById('patient-list');
    const searchTerm = document.getElementById('patient-search').value.toLowerCase();
    
    const filteredPatients = patients.filter(patient => {
        const name = (patient.displayName || '').toLowerCase();
        const email = (patient.email || '').toLowerCase();
        return name.includes(searchTerm) || email.includes(searchTerm);
    });
    
    if (filteredPatients.length === 0) {
        patientListEl.innerHTML = '<div class="no-patients">No patients found</div>';
        return;
    }
    
    patientListEl.innerHTML = filteredPatients.map(patient => {
        const conversation = conversations[patient._id] || {};
        const unreadCount = conversation.unreadCount || 0;
        const lastMessage = conversation.lastMessage;
        const isActive = currentPatient && currentPatient._id === patient._id;
        
        let lastMessageText = '';
        if (lastMessage) {
            const isFromMe = lastMessage.senderId === currentUser._id;
            lastMessageText = `${isFromMe ? 'You: ' : ''}${lastMessage.content.substring(0, 40)}${lastMessage.content.length > 40 ? '...' : ''}`;
        }
        
        return `
            <div class="patient-item ${isActive ? 'active' : ''}" data-patient-id="${patient._id}">
                <div class="patient-avatar-small">
                    <span>${getInitials(patient.displayName || patient.email)}</span>
                </div>
                <div class="patient-item-info">
                    <div class="patient-item-name">
                        ${escapeHtml(patient.displayName || patient.email)}
                        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                    </div>
                    ${lastMessageText ? `<div class="patient-item-message">${escapeHtml(lastMessageText)}</div>` : '<div class="patient-item-message text-muted">No messages yet</div>'}
                </div>
            </div>
        `;
    }).join('');
    
    // Add click listeners
    document.querySelectorAll('.patient-item').forEach(item => {
        item.addEventListener('click', () => {
            const patientId = item.dataset.patientId;
            const patient = patients.find(p => p._id === patientId);
            if (patient) {
                selectPatient(patient);
            }
        });
    });
}

// Select a patient
async function selectPatient(patient) {
    currentPatient = patient;
    
    // Update UI
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'flex';
    
    // Update patient header
    const initials = getInitials(patient.displayName || patient.email);
    document.getElementById('patient-avatar-text').textContent = initials;
    document.getElementById('selected-patient-name').textContent = patient.displayName || patient.email;
    document.getElementById('patient-email').textContent = patient.email;
    
    const lastLogin = patient.lastLogin ? new Date(patient.lastLogin) : null;
    document.getElementById('patient-status').textContent = lastLogin 
        ? `Last seen ${formatRelativeTime(lastLogin)}` 
        : 'Never logged in';
    
    // Update patient info
    const patientInfo = patient.patientInfo || {};
    document.getElementById('info-mrn').textContent = patientInfo.medicalRecordNumber || '-';
    document.getElementById('info-dob').textContent = patientInfo.dateOfBirth 
        ? new Date(patientInfo.dateOfBirth).toLocaleDateString() 
        : '-';
    document.getElementById('info-phone').textContent = patientInfo.phoneNumber || '-';
    document.getElementById('info-treatment-start').textContent = patientInfo.treatmentStartDate 
        ? new Date(patientInfo.treatmentStartDate).toLocaleDateString() 
        : '-';
    
    // Load messages
    await loadMessages(patient._id);
    
    // Update patient list to show active state
    renderPatientList();
}

// Load messages
async function loadMessages(patientId) {
    try {
        const chatMessagesEl = document.getElementById('chat-messages');
        chatMessagesEl.innerHTML = '<div class="loading">Loading messages...</div>';
        
        const idToken = localStorage.getItem('idToken');
        const response = await fetch(`/api/chat/messages/${patientId}`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch messages');
        }
        
        const messages = await response.json();
        
        renderMessages(messages);
        
        // Messages are marked as read by the server when fetched
        // Update local conversation to reflect this
        if (conversations[patientId]) {
            conversations[patientId].unreadCount = 0;
        }
        
        // Update UI to reflect zero unread
        updateUnreadCounts();
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('chat-messages').innerHTML = '<div class="error">Failed to load messages</div>';
    }
}

// Mark messages as read for a specific patient
async function markMessagesAsRead(patientId) {
    // Update local state immediately
    if (conversations[patientId]) {
        conversations[patientId].unreadCount = 0;
    }
    updateUnreadCounts();
}

// Update unread count display
function updateUnreadCounts() {
    let totalUnread = 0;
    Object.values(conversations).forEach(conv => {
        totalUnread += conv.unreadCount || 0;
    });
    document.getElementById('unread-messages').textContent = totalUnread;
    renderPatientList();
}

// Render messages
function renderMessages(messages) {
    const chatMessagesEl = document.getElementById('chat-messages');
    
    if (messages.length === 0) {
        chatMessagesEl.innerHTML = '<div class="no-messages">No messages yet. Start the conversation!</div>';
        return;
    }
    
    chatMessagesEl.innerHTML = messages.map(message => {
        const isFromMe = message.senderId._id === currentUser._id;
        const time = new Date(message.createdAt);
        
        return `
            <div class="message ${isFromMe ? 'message-sent' : 'message-received'}">
                <div class="message-content">
                    ${escapeHtml(message.content)}
                </div>
                <div class="message-meta">
                    ${formatTime(time)}
                    ${isFromMe && message.isRead ? '<span class="read-indicator">✓✓</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    scrollToBottom();
}

// Send message
async function sendMessage(content) {
    if (!currentPatient || !content.trim()) return;
    
    try {
        const idToken = localStorage.getItem('idToken');
        
        // Optimistically add message to UI
        const tempMessage = {
            _id: 'temp-' + Date.now(),
            senderId: { _id: currentUser._id },
            content: content,
            createdAt: new Date().toISOString(),
            isRead: false
        };
        
        addMessageToUI(tempMessage);
        
        // Send via Socket.IO for real-time delivery
        if (socket && socket.connected) {
            socket.emit('send_message', {
                recipientId: currentPatient._id,
                content: content,
                messageType: 'text'
            });
        } else {
            // Fallback to REST API
            const response = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipientId: currentPatient._id,
                    content: content,
                    messageType: 'text'
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to send message');
            }
        }
        
        // Clear input
        document.getElementById('message-input').value = '';
        adjustTextareaHeight();
        document.getElementById('send-btn').disabled = true;
        
        // Update conversation
        await loadConversations();
        renderPatientList();
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
}

// Add message to UI
function addMessageToUI(message) {
    const chatMessagesEl = document.getElementById('chat-messages');
    
    // Remove "no messages" placeholder if exists
    const noMessages = chatMessagesEl.querySelector('.no-messages');
    if (noMessages) {
        noMessages.remove();
    }
    
    const isFromMe = message.senderId._id === currentUser._id;
    const time = new Date(message.createdAt);
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isFromMe ? 'message-sent' : 'message-received'}`;
    messageEl.innerHTML = `
        <div class="message-content">
            ${escapeHtml(message.content)}
        </div>
        <div class="message-meta">
            ${formatTime(time)}
            ${isFromMe && message.isRead ? '<span class="read-indicator">✓✓</span>' : ''}
        </div>
    `;
    
    chatMessagesEl.appendChild(messageEl);
    scrollToBottom();
}

// Initialize Socket.IO
function initializeSocket() {
    const idToken = localStorage.getItem('idToken');
    
    socket = io({
        auth: {
            token: idToken
        }
    });
    
    socket.on('connect', () => {
        console.log('WebSocket connected');
    });
    
    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
    });
    
    socket.on('new_message', (message) => {
        console.log('New message received:', message);
        
        // If message is from current patient, add to chat
        if (currentPatient && 
            (message.senderId._id === currentPatient._id || message.recipientId._id === currentPatient._id)) {
            addMessageToUI(message);
            
            // Mark as read since we're viewing this chat
            markMessagesAsRead(currentPatient._id);
        } else {
            // Message from a different patient - update unread count immediately
            const senderId = message.senderId._id || message.senderId;
            
            // Initialize conversation if it doesn't exist
            if (!conversations[senderId]) {
                conversations[senderId] = {
                    partnerId: senderId,
                    unreadCount: 0,
                    lastMessage: message
                };
            }
            
            // Increment unread count
            conversations[senderId].unreadCount = (conversations[senderId].unreadCount || 0) + 1;
            conversations[senderId].lastMessage = message;
            
            // Update UI immediately
            updateUnreadCounts();
        }
        
        // Refresh full data from server after a short delay
        setTimeout(() => {
            loadConversations();
        }, 500);
    });
    
    socket.on('message_sent', (message) => {
        console.log('Message sent confirmation:', message);
    });
    
    socket.on('message_read', (data) => {
        console.log('Message read:', data);
        // Update read indicators in UI
        const messages = document.querySelectorAll('.message-sent');
        messages.forEach(msg => {
            // You could update specific messages here if you track message IDs
        });
    });
    
    socket.on('user_typing', (data) => {
        if (currentPatient && data.userId === currentPatient._id) {
            showTypingIndicator(data.isTyping, data.userName);
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
}

// Show typing indicator
function showTypingIndicator(isTyping, userName) {
    const typingIndicator = document.getElementById('typing-indicator');
    
    if (isTyping) {
        document.getElementById('typing-user-name').textContent = userName || 'Patient';
        typingIndicator.style.display = 'flex';
    } else {
        typingIndicator.style.display = 'none';
    }
}

// Send typing indicator
function sendTypingIndicator(isTyping) {
    if (socket && socket.connected && currentPatient) {
        socket.emit('typing', {
            recipientId: currentPatient._id,
            isTyping: isTyping
        });
    }
}

// Setup event listeners
function setupEventListeners() {
    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to sign out?')) {
            await auth.signOut();
            localStorage.removeItem('idToken');
            window.location.href = '/index.html';
        }
    });
    
    // Patient search
    document.getElementById('patient-search').addEventListener('input', () => {
        renderPatientList();
    });
    
    // Close chat
    document.getElementById('close-chat-btn').addEventListener('click', () => {
        currentPatient = null;
        document.getElementById('chat-screen').style.display = 'none';
        document.getElementById('welcome-screen').style.display = 'flex';
        renderPatientList();
    });
    
    // Message form
    document.getElementById('message-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const content = document.getElementById('message-input').value.trim();
        if (content) {
            sendMessage(content);
        }
    });
    
    // Message input
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('input', () => {
        adjustTextareaHeight();
        document.getElementById('send-btn').disabled = !messageInput.value.trim();
        
        // Send typing indicator
        sendTypingIndicator(true);
        
        // Clear previous timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Set timeout to stop typing indicator
        typingTimeout = setTimeout(() => {
            sendTypingIndicator(false);
        }, 1000);
    });
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('message-form').dispatchEvent(new Event('submit'));
        }
    });
}

// Utility functions
function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // Less than 1 minute
        return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
        const minutes = Math.floor(diff / 60000);
        return `${minutes}m ago`;
    } else if (diff < 86400000) { // Less than 1 day
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) { // Less than 1 week
        const days = Math.floor(diff / 86400000);
        return `${days}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return 'just now';
    } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function adjustTextareaHeight() {
    const textarea = document.getElementById('message-input');
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============= ADMIN PANEL FUNCTIONS =============

let allUsers = [];
let allPatients = [];
let allDoctors = [];

// Setup admin event listeners
function setupAdminListeners() {
    // View navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
    
    // User search and filter
    const searchInput = document.getElementById('admin-user-search');
    const roleFilter = document.getElementById('admin-role-filter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterUsers);
    }
    
    if (roleFilter) {
        roleFilter.addEventListener('change', filterUsers);
    }
    
    // Quick assign dropdown
    const quickDoctorSelect = document.getElementById('quick-assign-doctor-select');
    if (quickDoctorSelect) {
        quickDoctorSelect.addEventListener('change', updateQuickAssignButton);
    }
}

// Switch between patient view and admin view
function switchView(view) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    if (view === 'patients') {
        // Show patients view
        document.getElementById('patients-sidebar-section').style.display = 'block';
        document.getElementById('welcome-screen').style.display = 'flex';
        document.getElementById('chat-screen').style.display = 'none';
        document.getElementById('admin-screen').style.display = 'none';
    } else if (view === 'admin') {
        // Show admin view
        document.getElementById('patients-sidebar-section').style.display = 'none';
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('chat-screen').style.display = 'none';
        document.getElementById('admin-screen').style.display = 'block';
        
        // Load admin data
        loadAllUsers();
    }
}

// Load all users
async function loadAllUsers() {
    try {
        const idToken = localStorage.getItem('idToken');
        const response = await fetch('/api/users/all', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        
        allUsers = await response.json();
        renderUsersList();
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('admin-users-list').innerHTML = 
            '<div class="error">Failed to load users. Make sure you have admin permissions.</div>';
    }
}

// Filter users based on search and role
function filterUsers() {
    const searchTerm = document.getElementById('admin-user-search').value.toLowerCase();
    const roleFilter = document.getElementById('admin-role-filter').value;
    
    let filtered = allUsers;
    
    // Filter by role
    if (roleFilter) {
        filtered = filtered.filter(user => user.role === roleFilter);
    }
    
    // Filter by search term
    if (searchTerm) {
        filtered = filtered.filter(user => {
            const name = (user.displayName || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            return name.includes(searchTerm) || email.includes(searchTerm);
        });
    }
    
    renderUsersList(filtered);
}

// Render users list
function renderUsersList(users = allUsers) {
    const usersListEl = document.getElementById('admin-users-list');
    
    if (users.length === 0) {
        usersListEl.innerHTML = '<div class="no-patients">No users found</div>';
        return;
    }
    
    usersListEl.innerHTML = users.map(user => {
        const initials = getInitials(user.displayName || user.email);
        const assignedDoctor = user.assignedDoctor 
            ? `Assigned to: ${user.assignedDoctor.displayName || user.assignedDoctor.email}` 
            : '';
        const patientCount = user.patients ? user.patients.length : 0;
        const doctorInfo = user.role === 'doctor' ? `${patientCount} patient${patientCount !== 1 ? 's' : ''}` : '';
        
        // Add assign/reassign button for patients
        const hasDoctor = user.role === 'patient' && user.assignedDoctor;
        const assignButton = user.role === 'patient' ? `
            <button class="btn-icon-small" onclick="openAssignPatientModal('${user._id}')" title="${hasDoctor ? 'Change assigned doctor' : 'Assign to doctor'}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
            </button>
        ` : '';
        
        return `
            <div class="user-item">
                <div class="user-info-container">
                    <div class="user-avatar-circle">
                        <span>${escapeHtml(initials)}</span>
                    </div>
                    <div class="user-details">
                        <div class="user-name">${escapeHtml(user.displayName || user.email)}</div>
                        <div class="user-email">${escapeHtml(user.email)}</div>
                        <div class="user-meta">
                            <span class="user-role-tag ${user.role}">${user.role}</span>
                            ${assignedDoctor ? `<span class="user-assigned">${escapeHtml(assignedDoctor)}</span>` : ''}
                            ${doctorInfo ? `<span class="user-assigned">${doctorInfo}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="user-actions">
                    ${assignButton}
                    <button class="btn-icon-small" onclick="openEditUserModal('${user._id}')" title="Edit role">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon-small danger" onclick="deleteUser('${user._id}')" title="Deactivate user">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Open edit user modal
function openEditUserModal(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;
    
    document.getElementById('edit-user-id').value = user._id;
    document.getElementById('edit-user-name').value = user.displayName || user.email;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-role').value = user.role;
    
    document.getElementById('edit-user-modal').style.display = 'flex';
}

// Close edit user modal
function closeEditUserModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
}

// Save user role
async function saveUserRole() {
    const userId = document.getElementById('edit-user-id').value;
    const newRole = document.getElementById('edit-user-role').value;
    
    try {
        const idToken = localStorage.getItem('idToken');
        const response = await fetch(`/api/users/${userId}/role`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: newRole })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update user role');
        }
        
        // Reload users
        await loadAllUsers();
        closeEditUserModal();
        
        alert('User role updated successfully!');
    } catch (error) {
        console.error('Error updating user role:', error);
        alert('Failed to update user role. Please try again.');
    }
}

// Delete (deactivate) user
async function deleteUser(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;
    
    if (!confirm(`Are you sure you want to deactivate ${user.displayName || user.email}?`)) {
        return;
    }
    
    try {
        const idToken = localStorage.getItem('idToken');
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to deactivate user');
        }
        
        // Reload users
        await loadAllUsers();
        
        alert('User deactivated successfully!');
    } catch (error) {
        console.error('Error deactivating user:', error);
        alert('Failed to deactivate user. Please try again.');
    }
}

// Open quick assign patient modal
async function openAssignPatientModal(patientId) {
    const patient = allUsers.find(u => u._id === patientId);
    if (!patient) return;
    
    // Load doctors if not already loaded
    if (allDoctors.length === 0) {
        allDoctors = allUsers.filter(u => u.role === 'doctor' || u.role === 'admin');
    }
    
    document.getElementById('quick-assign-patient-id').value = patient._id;
    document.getElementById('quick-assign-patient-name').value = patient.displayName || patient.email;
    
    // Populate doctor dropdown
    const doctorSelect = document.getElementById('quick-assign-doctor-select');
    doctorSelect.innerHTML = '<option value="">Select a doctor...</option>' +
        allDoctors.map(d => 
            `<option value="${d._id}">${escapeHtml(d.displayName || d.email)}</option>`
        ).join('');
    
    // Update modal text based on whether patient has a doctor
    const hasDoctor = patient.assignedDoctor;
    const modalTitle = document.getElementById('assign-modal-title');
    const actionLabel = document.getElementById('assign-action-label');
    const btnText = document.getElementById('assign-btn-text');
    const currentDoctorDiv = document.getElementById('quick-assign-current-doctor');
    
    if (hasDoctor) {
        modalTitle.textContent = 'Change Patient\'s Doctor';
        actionLabel.textContent = 'Reassign to Doctor';
        btnText.textContent = 'Update Assignment';
        currentDoctorDiv.textContent = `Currently assigned to: ${patient.assignedDoctor.displayName || patient.assignedDoctor.email}`;
        currentDoctorDiv.style.display = 'block';
    } else {
        modalTitle.textContent = 'Assign Patient to Doctor';
        actionLabel.textContent = 'Assign to Doctor';
        btnText.textContent = 'Assign Doctor';
        currentDoctorDiv.textContent = 'Not currently assigned to any doctor';
        currentDoctorDiv.style.display = 'block';
    }
    
    document.getElementById('assign-patient-modal').style.display = 'flex';
}

// Close quick assign patient modal
function closeAssignPatientModal() {
    document.getElementById('assign-patient-modal').style.display = 'none';
    document.getElementById('quick-assign-doctor-select').value = '';
    document.getElementById('quick-assign-btn').disabled = true;
}

// Update quick assign button state
function updateQuickAssignButton() {
    const doctorSelect = document.getElementById('quick-assign-doctor-select');
    const assignBtn = document.getElementById('quick-assign-btn');
    
    assignBtn.disabled = !doctorSelect.value;
}

// Save quick assignment
async function saveQuickAssignment() {
    const patientId = document.getElementById('quick-assign-patient-id').value;
    const doctorId = document.getElementById('quick-assign-doctor-select').value;
    
    if (!patientId || !doctorId) {
        return;
    }
    
    // Check if this is a reassignment
    const patient = allUsers.find(u => u._id === patientId);
    const isReassignment = patient && patient.assignedDoctor;
    
    try {
        const idToken = localStorage.getItem('idToken');
        const response = await fetch('/api/users/assign-doctor', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ patientId, doctorId })
        });
        
        if (!response.ok) {
            throw new Error('Failed to assign doctor');
        }
        
        // Reload users
        await loadAllUsers();
        closeAssignPatientModal();
        
        // Show appropriate success message
        if (isReassignment) {
            alert('Doctor assignment updated successfully!');
        } else {
            alert('Patient assigned to doctor successfully!');
        }
    } catch (error) {
        console.error('Error assigning doctor:', error);
        alert('Failed to update assignment. Please try again.');
    }
}

// Make functions globally available
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.saveUserRole = saveUserRole;
window.deleteUser = deleteUser;
window.openAssignPatientModal = openAssignPatientModal;
window.closeAssignPatientModal = closeAssignPatientModal;
window.saveQuickAssignment = saveQuickAssignment;


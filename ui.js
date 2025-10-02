class UIManager {
    constructor() {
        this.currentActiveChat = null;
        this.chats = [];
        this.searchResults = [];
        this.users = [];
        this.initEventListeners();
    }

    initEventListeners() {
        // Auth event listeners
        document.getElementById('signInBtn').addEventListener('click', () => this.handleSignIn());
        document.getElementById('signUpBtn').addEventListener('click', () => this.handleSignUp());
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        // Chat event listeners
        document.getElementById('sendBtn').addEventListener('click', () => this.handleSendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSendMessage();
            }
        });

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Profile modal
        document.getElementById('userProfileBtn').addEventListener('click', () => this.showProfileModal());
        document.getElementById('closeProfileModal').addEventListener('click', () => this.hideProfileModal());
        document.getElementById('cancelProfileBtn').addEventListener('click', () => this.hideProfileModal());
        document.getElementById('profileForm').addEventListener('submit', (e) => this.handleProfileUpdate(e));

        // New chat modal
        document.getElementById('newChatBtn').addEventListener('click', () => this.showNewChatModal());
        document.getElementById('closeNewChatModal').addEventListener('click', () => this.hideNewChatModal());
        document.getElementById('newChatSearch').addEventListener('input', (e) => this.filterUsers(e.target.value));

        // Profile picture change
        document.getElementById('changePhotoBtn').addEventListener('click', () => {
            document.getElementById('profileModalPicture').click();
        });
        document.getElementById('profileModalPicture').addEventListener('change', (e) => {
            this.handleProfilePictureChange(e.target.files[0]);
        });

        // Close modals on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModals();
                }
            });
        });
    }

    async handleSignIn() {
        const signInBtn = document.getElementById('signInBtn');
        signInBtn.textContent = 'Signing In...';
        signInBtn.disabled = true;

        try {
            await window.authManager.signIn();
        } catch (error) {
            // Error handling is done in auth.js
        } finally {
            signInBtn.textContent = 'Sign In';
            signInBtn.disabled = false;
        }
    }

    async handleSignUp() {
        const signUpBtn = document.getElementById('signUpBtn');
        signUpBtn.textContent = 'Creating Account...';
        signUpBtn.disabled = true;

        try {
            await window.authManager.signUp();
        } catch (error) {
            // Error handling is done in auth.js
        } finally {
            signUpBtn.textContent = 'Create Account';
            signUpBtn.disabled = false;
        }
    }

    async handleLogout() {
        await window.authManager.signOut();
    }

    async loadChats() {
        try {
            const userId = window.authManager.currentUser.id;
            this.chats = await window.databaseManager.getUserChats(userId);
            this.renderChatList();
            
            // Subscribe to chat list updates
            window.realtimeManager.subscribeToUserChats(userId, () => {
                this.loadChats(); // Reload chats when updates occur
            });
        } catch (error) {
            console.error('Error loading chats:', error);
        }
    }

    renderChatList() {
        const chatList = document.getElementById('chatList');
        chatList.innerHTML = '';

        if (this.chats.length === 0) {
            chatList.innerHTML = `
                <div class="no-results">
                    <p>No chats yet</p>
                    <p style="font-size: 12px; margin-top: 0.5rem;">Start a new chat to begin messaging</p>
                </div>
            `;
            return;
        }

        this.chats.forEach(chat => {
            const chatItem = this.createChatItem(chat);
            chatList.appendChild(chatItem);
        });
    }

    createChatItem(chat) {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${this.currentActiveChat === chat.id ? 'active' : ''}`;
        chatItem.dataset.chatId = chat.id;

        const lastMessage = chat.last_message ? chat.last_message.content : 'No messages yet';
        const lastMessageTime = chat.last_message ? this.formatTime(chat.last_message.created_at) : '';

        chatItem.innerHTML = `
            <div class="avatar">${chat.name[0].toUpperCase()}</div>
            <div class="chat-info">
                <span class="chat-name">${chat.name}</span>
                <span class="chat-last-message">${lastMessage}</span>
            </div>
            <div class="chat-time">${lastMessageTime}</div>
        `;

        chatItem.addEventListener('click', () => this.selectChat(chat));
        return chatItem;
    }

    async handleSearch(query) {
        const searchInput = document.getElementById('searchInput');
        const chatList = document.getElementById('chatList');
        
        if (query.trim().length === 0) {
            this.renderChatList();
            return;
        }

        if (query.trim().length < 2) {
            return;
        }

        try {
            this.searchResults = await window.databaseManager.searchUsers(query);
            this.renderSearchResults();
        } catch (error) {
            console.error('Error searching users:', error);
        }
    }

    renderSearchResults() {
        const chatList = document.getElementById('chatList');
        chatList.innerHTML = '';

        if (this.searchResults.length === 0) {
            chatList.innerHTML = `
                <div class="no-results">
                    <p>No users found</p>
                </div>
            `;
            return;
        }

        this.searchResults.forEach(user => {
            const userItem = this.createUserSearchItem(user);
            chatList.appendChild(userItem);
        });
    }

    createUserSearchItem(user) {
        const userItem = document.createElement('div');
        userItem.className = 'chat-item search-result';
        userItem.dataset.userId = user.id;

        userItem.innerHTML = `
            <div class="avatar">
                ${user.avatar_url ? 
                    `<img src="${user.avatar_url}" alt="${user.name || user.username}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    (user.name?.[0] || user.username?.[0] || 'U').toUpperCase()
                }
            </div>
            <div class="chat-info">
                <span class="chat-name">${user.name || user.username}</span>
                <span class="chat-last-message">${user.email}</span>
            </div>
            <div class="chat-action">
                <button class="start-chat-btn">Chat</button>
            </div>
        `;

        userItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('start-chat-btn')) {
                this.startNewChat(user);
            }
        });

        return userItem;
    }

    async startNewChat(user) {
        try {
            const currentUserId = window.authManager.currentUser.id;
            const chatName = user.name || user.username || user.email.split('@')[0];
            
            // Create a new chat
            const chat = await window.databaseManager.createChat(chatName, [currentUserId, user.id]);
            
            // Clear search and show new chat
            document.getElementById('searchInput').value = '';
            await this.loadChats();
            await this.selectChat(chat);
            
        } catch (error) {
            console.error('Error starting new chat:', error);
            alert('Error starting chat: ' + error.message);
        }
    }

    async selectChat(chat) {
        this.currentActiveChat = chat.id;
        
        // Update UI
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-chat-id="${chat.id}"]`).classList.add('active');

        // Update chat header
        document.getElementById('activeChatName').textContent = chat.name;
        document.getElementById('activeChatStatus').textContent = 'Online';
        
        const avatarElement = document.getElementById('activeChatAvatar');
        avatarElement.textContent = chat.name[0].toUpperCase();
        avatarElement.src = '';

        // Show message input
        document.getElementById('messageInputContainer').classList.remove('hidden');
        document.getElementById('messagesContainer').innerHTML = '';

        // Load messages
        await this.loadChatMessages(chat.id);

        // Subscribe to realtime updates for this chat
        window.realtimeManager.subscribeToChat(chat.id, (newMessage) => {
            this.addMessageToUI(newMessage);
        });
    }

    async loadChatMessages(chatId) {
        try {
            const messages = await window.databaseManager.getChatMessages(chatId);
            this.renderMessages(messages);
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    renderMessages(messages) {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <h3>No messages yet</h3>
                    <p>Send a message to start the conversation</p>
                </div>
            `;
            return;
        }

        messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            messagesContainer.appendChild(messageElement);
        });

        this.scrollToBottom();
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        const isSent = message.sender_id === window.authManager.currentUser.id;
        
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const senderName = message.sender?.name || message.sender?.username || 'Unknown';
        const showSender = !isSent && this.chats.find(chat => chat.id === this.currentActiveChat)?.name.includes('Group');
        
        messageDiv.innerHTML = `
            ${showSender ? `<div class="message-sender">${senderName}</div>` : ''}
            <div class="message-content">${this.escapeHtml(message.content)}</div>
            <div class="message-time">${this.formatTime(message.created_at)}</div>
        `;

        return messageDiv;
    }

    addMessageToUI(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        
        // Remove welcome message if it exists
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    async handleSendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();

        if (!content || !this.currentActiveChat) return;

        try {
            const senderId = window.authManager.currentUser.id;
            await window.databaseManager.sendMessage(this.currentActiveChat, content, senderId);
            
            // Clear input
            messageInput.value = '';
            
            // Reload chats to update last message
            this.loadChats();
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    // Profile Modal Methods
    async showProfileModal() {
        console.log('Showing profile modal...');
        console.log('Current profile before reload:', window.authManager.getCurrentProfile());
        
        // Force reload profile data
        await window.authManager.loadUserProfile();
        
        console.log('Current profile after reload:', window.authManager.getCurrentProfile());
        this.populateProfileForm();
        document.getElementById('profileModal').classList.remove('hidden');
    }

    hideProfileModal() {
        document.getElementById('profileModal').classList.add('hidden');
    }

    populateProfileForm() {
        const profile = window.authManager.getCurrentProfile();
        console.log('Populating form with profile:', profile);
        
        if (!profile) {
            console.log('No profile found to populate form');
            return;
        }

        // Populate form fields
        document.getElementById('profileName').value = profile.name || '';
        document.getElementById('profileUsername').value = profile.username || '';
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profilePhone').value = profile.phone || '';

        // Update avatar
        const avatarElement = document.getElementById('profileModalAvatar');
        if (profile.avatar_url) {
            avatarElement.src = profile.avatar_url;
            avatarElement.textContent = '';
            avatarElement.style.display = 'block';
        } else {
            avatarElement.src = '';
            avatarElement.textContent = (profile.name?.[0] || profile.username?.[0] || profile.email?.[0] || 'U').toUpperCase();
            avatarElement.style.display = 'flex';
        }
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        
        const saveBtn = document.getElementById('saveProfileBtn');
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        try {
            const profileData = {
                name: document.getElementById('profileName').value,
                username: document.getElementById('profileUsername').value,
                phone: document.getElementById('profilePhone').value
            };

            await window.authManager.updateProfile(profileData);
            this.hideProfileModal();
            
            // Show success message
            this.showToast('Profile updated successfully', 'success');
        } catch (error) {
            console.error('Error updating profile:', error);
            this.showToast('Error updating profile: ' + error.message, 'error');
        } finally {
            saveBtn.textContent = 'Save Changes';
            saveBtn.disabled = false;
        }
    }

    async handleProfilePictureChange(file) {
        if (!file) return;

        try {
            const avatarUrl = await window.authManager.uploadProfilePicture(window.authManager.currentUser.id);
            if (avatarUrl) {
                await window.authManager.updateProfile({ avatar_url: avatarUrl });
                this.populateProfileForm();
                this.showToast('Profile picture updated successfully', 'success');
            }
        } catch (error) {
            console.error('Error updating profile picture:', error);
            this.showToast('Error updating profile picture', 'error');
        }
    }

    // New Chat Modal Methods
    async showNewChatModal() {
        await this.loadAllUsers();
        document.getElementById('newChatModal').classList.remove('hidden');
    }

    hideNewChatModal() {
        document.getElementById('newChatModal').classList.add('hidden');
        document.getElementById('newChatSearch').value = '';
    }

    async loadAllUsers() {
        try {
            this.users = await window.databaseManager.getAllUsers();
            this.renderUserList();
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUserList() {
        const userList = document.getElementById('userList');
        userList.innerHTML = '';

        if (this.users.length === 0) {
            userList.innerHTML = `
                <div class="no-results">
                    <p>No users found</p>
                </div>
            `;
            return;
        }

        this.users.forEach(user => {
            const userItem = this.createUserItem(user);
            userList.appendChild(userItem);
        });
    }

    createUserItem(user) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.dataset.userId = user.id;

        userItem.innerHTML = `
            <div class="avatar">
                ${user.avatar_url ? 
                    `<img src="${user.avatar_url}" alt="${user.name || user.username}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    (user.name?.[0] || user.username?.[0] || 'U').toUpperCase()
                }
            </div>
            <div class="user-item-info">
                <span class="user-item-name">${user.name || user.username}</span>
                <span class="user-item-email">${user.email}</span>
            </div>
        `;

        userItem.addEventListener('click', () => {
            this.startNewChatFromModal(user);
        });

        return userItem;
    }

    async startNewChatFromModal(user) {
        try {
            const currentUserId = window.authManager.currentUser.id;
            const chatName = user.name || user.username || user.email.split('@')[0];
            
            const chat = await window.databaseManager.createChat(chatName, [currentUserId, user.id]);
            
            this.hideNewChatModal();
            await this.loadChats();
            await this.selectChat(chat);
            
        } catch (error) {
            console.error('Error starting new chat:', error);
            this.showToast('Error starting chat: ' + error.message, 'error');
        }
    }

    filterUsers(query) {
        const filteredUsers = this.users.filter(user => 
            user.name?.toLowerCase().includes(query.toLowerCase()) ||
            user.username?.toLowerCase().includes(query.toLowerCase()) ||
            user.email?.toLowerCase().includes(query.toLowerCase())
        );

        const userList = document.getElementById('userList');
        userList.innerHTML = '';

        if (filteredUsers.length === 0) {
            userList.innerHTML = `
                <div class="no-results">
                    <p>No users found</p>
                </div>
            `;
            return;
        }

        filteredUsers.forEach(user => {
            const userItem = this.createUserItem(user);
            userList.appendChild(userItem);
        });
    }

    hideModals() {
        this.hideProfileModal();
        this.hideNewChatModal();
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Add styles
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#25d366' : '#2a2f32'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            z-index: 1001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(toast);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffInHours = (now - date) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize UI Manager
window.uiManager = new UIManager();
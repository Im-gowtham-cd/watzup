class UIManager {
    constructor() {
        this.currentActiveChat = null;
        this.chats = [];
        this.searchResults = [];
        this.users = [];
        this.selectedUsers = [];
        this.selectedChats = [];
        this.replyingToMessage = null;
        this.forwardingMessage = null;
        this.initEventListeners();
    }

    initEventListeners() {
        // Auth event listeners
        document.getElementById('signInBtn')?.addEventListener('click', () => this.handleSignIn());
        document.getElementById('signUpBtn')?.addEventListener('click', () => this.handleSignUp());
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());

        // Chat event listeners
        document.getElementById('sendBtn')?.addEventListener('click', () => this.handleSendMessage());
        document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSendMessage();
            }
        });

        // Search functionality
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // New chat modal
        document.getElementById('newChatBtn')?.addEventListener('click', () => this.showNewChatModal());
        document.getElementById('closeNewChatModal')?.addEventListener('click', () => this.hideNewChatModal());
        
        // Chat type switching
        document.querySelectorAll('.chat-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.switchChatType(type);
            });
        });

        // Group creation
        document.getElementById('groupMemberSearch')?.addEventListener('input', (e) => {
            this.handleGroupMemberSearch(e.target.value);
        });
        document.getElementById('createGroupBtn')?.addEventListener('click', () => this.handleCreateGroup());

        // Group name input
        document.getElementById('groupName')?.addEventListener('input', () => {
            this.updateCreateGroupButton();
        });

        // Forward modal
        document.getElementById('closeForwardModal')?.addEventListener('click', () => this.hideForwardModal());
        document.getElementById('cancelForward')?.addEventListener('click', () => this.hideForwardModal());
        document.getElementById('confirmForward')?.addEventListener('click', () => this.handleForwardMessage());
        document.getElementById('forwardSearch')?.addEventListener('input', (e) => {
            this.filterForwardChats(e.target.value);
        });

        // Reply cancellation
        document.getElementById('cancelReply')?.addEventListener('click', () => this.cancelReply());

        // Context menu
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu') && !e.target.closest('.message-action-btn')) {
                this.hideContextMenu();
            }
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
        const originalText = signInBtn?.textContent;

        try {
            if (signInBtn) {
                signInBtn.textContent = 'Signing In...';
                signInBtn.disabled = true;
            }

            await window.authManager.signIn();
        } catch (error) {
            // Error handling is done in auth.js
        } finally {
            if (signInBtn) {
                signInBtn.textContent = originalText;
                signInBtn.disabled = false;
            }
        }
    }

    async handleSignUp() {
        const signUpBtn = document.getElementById('signUpBtn');
        const originalText = signUpBtn?.textContent;

        try {
            if (signUpBtn) {
                signUpBtn.textContent = 'Creating Account...';
                signUpBtn.disabled = true;
            }

            await window.authManager.signUp();
        } catch (error) {
            // Error handling is done in auth.js
        } finally {
            if (signUpBtn) {
                signUpBtn.textContent = originalText;
                signUpBtn.disabled = false;
            }
        }
    }

    async handleLogout() {
        await window.authManager.signOut();
    }

    // Temporary debug method
    async debugAuthState() {
        console.log('=== AUTH DEBUG ===');
        console.log('Current User:', window.authManager.currentUser);
        console.log('Current Profile:', window.authManager.currentProfile);
        console.log('Supabase Client:', window.supabaseClient);
        
        if (window.authManager.currentUser) {
            try {
                // Test simple query
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('id, username')
                    .limit(1);
                console.log('Test query result:', data, error);
            } catch (e) {
                console.error('Test query failed:', e);
            }
        }
    }

async loadChats() {
    try {
        console.log('=== LOADING CHATS ===');
        
        // Call this in your loadChats method temporarily:
        await this.debugAuthState();
        
        if (!window.authManager.currentUser) {
            console.error('No user logged in');
            this.showToast('Please log in to view chats', 'error');
            return;
        }

        const userId = window.authManager.currentUser.id;
        console.log('Loading chats for user ID:', userId);

        this.chats = await window.databaseManager.getUserChats(userId);
        console.log('Chats loaded successfully:', this.chats);
        
        this.renderChatList();
        
        // Subscribe to chat list updates
        window.realtimeManager.subscribeToUserChats(userId, () => {
            console.log('Chat list update received, reloading...');
            this.loadChats();
        });
        
    } catch (error) {
        console.error('Error loading chats:', error);
        this.showToast('Error loading chats: ' + (error.message || 'Unknown error'), 'error');
        
        // Show empty state
        const chatList = document.getElementById('chatList');
        if (chatList) {
            chatList.innerHTML = `
                <div class="no-results">
                    <p>Error loading chats</p>
                    <p style="font-size: 12px; margin-top: 0.5rem;">Please try refreshing the page</p>
                </div>
            `;
        }
    }
}

    renderChatList() {
        const chatList = document.getElementById('chatList');
        if (!chatList) return;

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

        const lastMessage = chat.last_message ? 
            (chat.last_message.is_deleted ? 'This message was deleted' : chat.last_message.content) 
            : 'No messages yet';
        const lastMessageTime = chat.last_message ? this.formatTime(chat.last_message.created_at) : '';

        chatItem.innerHTML = `
            <div class="avatar">${chat.name[0].toUpperCase()}</div>
            <div class="chat-info">
                <span class="chat-name">
                    ${chat.name}
                    ${chat.is_group ? '<span class="group-chat-indicator">Group</span>' : ''}
                </span>
                <span class="chat-last-message">${lastMessage}</span>
            </div>
            <div class="chat-time">${lastMessageTime}</div>
        `;

        chatItem.addEventListener('click', () => this.selectChat(chat));
        return chatItem;
    }

    async handleSearch(query) {
        const chatList = document.getElementById('chatList');
        
        if (!chatList) return;
        
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
        if (!chatList) return;

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
            
            console.log('Starting new chat with user:', user);
            
            const chat = await window.databaseManager.createPrivateChat(chatName, [currentUserId, user.id]);
            
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            
            await this.loadChats();
            await this.selectChat(chat);
            
        } catch (error) {
            console.error('Error starting new chat:', error);
            this.showToast('Error starting chat: ' + error.message, 'error');
        }
    }

    async selectChat(chat) {
        if (!chat || !chat.id) {
            console.error('Invalid chat selected');
            return;
        }

        this.currentActiveChat = chat.id;
        
        // Update UI
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeChatItem = document.querySelector(`[data-chat-id="${chat.id}"]`);
        if (activeChatItem) {
            activeChatItem.classList.add('active');
        }

        // Update chat header
        const chatNameElement = document.getElementById('activeChatName');
        const chatStatusElement = document.getElementById('activeChatStatus');
        
        if (chatNameElement) chatNameElement.textContent = chat.name;
        if (chatStatusElement) chatStatusElement.textContent = chat.is_group ? 'Group' : 'Online';
        
        const avatarElement = document.getElementById('activeChatAvatar');
        if (avatarElement) {
            avatarElement.textContent = chat.name[0].toUpperCase();
            avatarElement.src = '';
        }

        // Show message input
        const messageInputContainer = document.getElementById('messageInputContainer');
        if (messageInputContainer) {
            messageInputContainer.classList.remove('hidden');
        }
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        // Cancel any active reply
        this.cancelReply();

        // Load messages
        await this.loadChatMessages(chat.id);

        // Subscribe to realtime updates for this chat
        window.realtimeManager.subscribeToChat(
            chat.id,
            (newMessage) => this.addMessageToUI(newMessage),
            (updatedMessage) => this.updateMessageInUI(updatedMessage),
            (deletedMessage) => this.updateMessageInUI(deletedMessage)
        );
    }

    async loadChatMessages(chatId) {
        try {
            const messages = await window.databaseManager.getChatMessages(chatId);
            this.renderMessages(messages);
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showToast('Error loading messages', 'error');
        }
    }

    renderMessages(messages) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

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
        
        messageDiv.className = `message ${isSent ? 'sent' : 'received'} ${message.is_deleted ? 'deleted' : ''} ${message.replied_to_id ? 'has-reply' : ''}`;
        messageDiv.dataset.messageId = message.id;
        
        let messageHTML = '';

        // Forwarded tag
        if (message.forwarded_count > 0) {
            messageHTML += `
                <div class="forwarded-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8l-8 8-8-8 1.5-1.5L10 13l6.5-6.5L18 8z"/>
                    </svg>
                    Forwarded
                </div>
            `;
        }

        // Reply quote
        if (message.replied_to_message && !message.is_deleted) {
            messageHTML += `
                <div class="reply-quote">
                    <div class="reply-quote-sender">${message.replied_to_message.sender?.name || message.replied_to_message.sender?.username || 'Unknown'}</div>
                    <div class="reply-quote-content">${this.escapeHtml(message.replied_to_message.content)}</div>
                </div>
            `;
        }

        // Message content
        if (message.is_deleted) {
            messageHTML += `
                <div class="message-content">This message was deleted</div>
            `;
        } else {
            messageHTML += `
                <div class="message-content">${this.escapeHtml(message.content)}</div>
            `;
        }

        // Message actions (only for non-deleted messages)
        if (!message.is_deleted) {
            messageHTML += `
                <div class="message-actions">
                    <button class="message-action-btn" data-action="reply" title="Reply">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                        </svg>
                    </button>
                    <button class="message-action-btn" data-action="forward" title="Forward">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8l-8 8-8-8 1.5-1.5L10 13l6.5-6.5L18 8z"/>
                        </svg>
                    </button>
                    ${message.sender_id === window.authManager.currentUser.id ? `
                    <button class="message-action-btn" data-action="delete" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            `;
        }

        messageHTML += `
            <div class="message-time">${this.formatTime(message.created_at)}</div>
        `;

        messageDiv.innerHTML = messageHTML;
        
        // Setup message actions
        if (!message.is_deleted) {
            this.setupMessageActions(messageDiv, message);
        }

        // Add context menu on right-click
        messageDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showMessageContextMenu(message, e.clientX, e.clientY);
        });

        return messageDiv;
    }

    setupMessageActions(messageElement, message) {
        const actions = messageElement.querySelector('.message-actions');
        if (!actions) return;

        // Reply action
        actions.querySelector('[data-action="reply"]')?.addEventListener('click', () => {
            this.handleReplyMessage(message);
        });

        // Forward action
        actions.querySelector('[data-action="forward"]')?.addEventListener('click', () => {
            this.handleForwardMessageInit(message);
        });

        // Delete action
        const deleteBtn = actions.querySelector('[data-action="delete"]');
        if (deleteBtn && message.sender_id === window.authManager.currentUser.id) {
            deleteBtn.addEventListener('click', () => {
                this.handleDeleteMessage(message);
            });
        } else if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }
    }

    addMessageToUI(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        // Remove welcome message if it exists
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    updateMessageInUI(updatedMessage) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        const existingMessage = messagesContainer.querySelector(`[data-message-id="${updatedMessage.id}"]`);
        
        if (existingMessage) {
            const newMessageElement = this.createMessageElement(updatedMessage);
            existingMessage.replaceWith(newMessageElement);
        }
    }

    async handleSendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput?.value.trim();

        console.log('Send message triggered:', { 
            content, 
            currentActiveChat: this.currentActiveChat,
            currentUser: window.authManager.currentUser?.id 
        });

        if (!content || !this.currentActiveChat) {
            console.log('Cannot send: no content or no active chat');
            return;
        }

        if (!window.authManager.currentUser) {
            console.error('No user logged in');
            this.showToast('Please log in to send messages', 'error');
            return;
        }

        const sendBtn = document.getElementById('sendBtn');
        const originalHtml = sendBtn?.innerHTML;

        try {
            // Disable send button
            if (sendBtn) {
                sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
                sendBtn.disabled = true;
            }

            const senderId = window.authManager.currentUser.id;
            const repliedToId = this.replyingToMessage ? this.replyingToMessage.id : null;
            
            console.log('Calling sendMessage with:', { 
                chatId: this.currentActiveChat, 
                content, 
                senderId, 
                repliedToId 
            });

            await window.databaseManager.sendMessage(
                this.currentActiveChat, 
                content, 
                senderId, 
                repliedToId
            );
            
            console.log('Message sent successfully');
            
            // Clear input and cancel reply
            if (messageInput) {
                messageInput.value = '';
            }
            this.cancelReply();
            
            // Reload chats to update last message
            await this.loadChats();
            
        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            this.showToast('Failed to send message: ' + error.message, 'error');
        } finally {
            // Re-enable send button
            if (sendBtn) {
                sendBtn.innerHTML = originalHtml;
                sendBtn.disabled = false;
            }
        }
    }

    // Group Chat Management
    switchChatType(type) {
        const typeButtons = document.querySelectorAll('.chat-type-btn');
        const chatSections = document.querySelectorAll('.chat-section');
        
        if (typeButtons.length === 0 || chatSections.length === 0) {
            console.error('Chat type elements not found');
            return;
        }
        
        typeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        
        chatSections.forEach(section => {
            section.classList.toggle('active', section.id === `${type}ChatSection`);
        });

        if (type === 'group') {
            this.loadUsersForGroup();
        }
    }

    async loadUsersForGroup() {
        try {
            this.users = await window.databaseManager.getAllUsers();
            this.renderGroupUserList();
        } catch (error) {
            console.error('Error loading users for group:', error);
        }
    }

    renderGroupUserList() {
        const userList = document.getElementById('groupUserList');
        if (!userList) return;

        userList.innerHTML = '';

        const availableUsers = this.users.filter(user => 
            !this.selectedUsers.find(selected => selected.id === user.id)
        );

        if (availableUsers.length === 0) {
            userList.innerHTML = `
                <div class="no-results">
                    <p>No users available</p>
                </div>
            `;
            return;
        }

        availableUsers.forEach(user => {
            const userItem = this.createGroupUserItem(user);
            userList.appendChild(userItem);
        });
    }

    createGroupUserItem(user) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
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
            <button class="add-member-btn">+</button>
        `;

        userItem.querySelector('.add-member-btn').addEventListener('click', () => {
            this.addUserToGroup(user);
        });

        return userItem;
    }

    addUserToGroup(user) {
        if (!this.selectedUsers.find(u => u.id === user.id)) {
            this.selectedUsers.push(user);
            this.updateSelectedMembers();
            this.renderGroupUserList();
            this.updateCreateGroupButton();
        }
    }

    removeUserFromGroup(userId) {
        this.selectedUsers = this.selectedUsers.filter(user => user.id !== userId);
        this.updateSelectedMembers();
        this.renderGroupUserList();
        this.updateCreateGroupButton();
    }

    updateSelectedMembers() {
        const container = document.getElementById('selectedMembers');
        if (!container) return;

        container.innerHTML = '';

        this.selectedUsers.forEach(user => {
            const memberEl = document.createElement('div');
            memberEl.className = 'selected-member';
            memberEl.innerHTML = `
                ${user.name || user.username}
                <button class="remove-member" data-user-id="${user.id}">×</button>
            `;
            container.appendChild(memberEl);
        });

        // Add event listeners for remove buttons
        container.querySelectorAll('.remove-member').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.dataset.userId;
                this.removeUserFromGroup(userId);
            });
        });
    }

    updateCreateGroupButton() {
        const btn = document.getElementById('createGroupBtn');
        if (!btn) return;
        
        const groupNameInput = document.getElementById('groupName');
        const groupName = groupNameInput ? groupNameInput.value : '';
        
        btn.disabled = !groupName || this.selectedUsers.length === 0;
    }

    async handleCreateGroup() {
        const groupNameInput = document.getElementById('groupName');
        if (!groupNameInput) {
            console.error('Group name input not found');
            this.showToast('Error: Group name input not found', 'error');
            return;
        }

        const groupName = groupNameInput.value;
        
        if (!groupName || this.selectedUsers.length === 0) {
            this.showToast('Please enter group name and select members', 'error');
            return;
        }

        try {
            const createGroupBtn = document.getElementById('createGroupBtn');
            if (createGroupBtn) {
                createGroupBtn.textContent = 'Creating...';
                createGroupBtn.disabled = true;
            }

            const memberIds = [
                window.authManager.currentUser.id,
                ...this.selectedUsers.map(user => user.id)
            ];

            console.log('Creating group with:', { groupName, memberIds });

            const chat = await window.databaseManager.createGroupChat(groupName, memberIds);
            
            // Hide modal safely
            this.hideNewChatModal();
            
            // Reload chats and select the new group
            await this.loadChats();
            await this.selectChat(chat);
            
            this.showToast('Group created successfully!', 'success');
        } catch (error) {
            console.error('Error creating group:', error);
            this.showToast('Error creating group: ' + error.message, 'error');
        } finally {
            const createGroupBtn = document.getElementById('createGroupBtn');
            if (createGroupBtn) {
                createGroupBtn.textContent = 'Create Group';
                createGroupBtn.disabled = false;
            }
        }
    }

    handleGroupMemberSearch(query) {
        const filteredUsers = this.users.filter(user => 
            (user.name?.toLowerCase().includes(query.toLowerCase()) ||
            user.username?.toLowerCase().includes(query.toLowerCase()) ||
            user.email?.toLowerCase().includes(query.toLowerCase())) &&
            !this.selectedUsers.find(selected => selected.id === user.id)
        );

        const userList = document.getElementById('groupUserList');
        if (!userList) return;

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
            const userItem = this.createGroupUserItem(user);
            userList.appendChild(userItem);
        });
    }

    // Message Context Menu and Actions
    showMessageContextMenu(message, x, y) {
        const menu = document.getElementById('messageContextMenu');
        if (!menu) return;
        
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.classList.remove('hidden');
        
        // Store the message for action handling
        menu.dataset.messageId = message.id;
        menu.dataset.senderId = message.sender_id;

        // Add event listeners to context menu items
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleContextMenuAction(action, message);
            });
        });
    }

    hideContextMenu() {
        const menu = document.getElementById('messageContextMenu');
        if (menu) {
            menu.classList.add('hidden');
            menu.removeAttribute('data-message-id');
            menu.removeAttribute('data-sender-id');
        }
    }

    handleContextMenuAction(action, message) {
        switch (action) {
            case 'reply':
                this.handleReplyMessage(message);
                break;
            case 'forward':
                this.handleForwardMessageInit(message);
                break;
            case 'delete':
                this.handleDeleteMessage(message);
                break;
        }
        this.hideContextMenu();
    }

    async handleReplyMessage(message) {
        this.replyingToMessage = message;
        
        // Show reply preview
        const preview = document.getElementById('replyPreview');
        const sender = document.getElementById('replySender');
        const content = document.getElementById('replyMessage');
        
        if (preview && sender && content) {
            sender.textContent = message.sender?.name || message.sender?.username || 'Unknown';
            content.textContent = message.content;
            preview.classList.remove('hidden');
        }
        
        // Focus message input
        document.getElementById('messageInput')?.focus();
    }

    cancelReply() {
        this.replyingToMessage = null;
        const preview = document.getElementById('replyPreview');
        if (preview) {
            preview.classList.add('hidden');
        }
    }

    async handleDeleteMessage(message) {
        if (message.sender_id !== window.authManager.currentUser.id) {
            this.showToast('You can only delete your own messages', 'error');
            return;
        }

        try {
            await window.databaseManager.softDeleteMessage(message.id);
            this.showToast('Message deleted', 'success');
        } catch (error) {
            console.error('Error deleting message:', error);
            this.showToast('Error deleting message', 'error');
        }
    }

    async handleForwardMessageInit(message) {
        this.forwardingMessage = message;
        await this.showForwardModal();
    }

    async showForwardModal() {
        await this.loadChatsForForward();
        const modal = document.getElementById('forwardModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideForwardModal() {
        const modal = document.getElementById('forwardModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.forwardingMessage = null;
        this.selectedChats = [];
    }

    async loadChatsForForward() {
        const chatList = document.getElementById('forwardChatList');
        if (!chatList) return;

        chatList.innerHTML = '';

        // Exclude current chat
        const availableChats = this.chats.filter(chat => chat.id !== this.currentActiveChat);

        if (availableChats.length === 0) {
            chatList.innerHTML = `
                <div class="no-results">
                    <p>No other chats available</p>
                </div>
            `;
            return;
        }

        availableChats.forEach(chat => {
            const chatItem = this.createForwardChatItem(chat);
            chatList.appendChild(chatItem);
        });
    }

    createForwardChatItem(chat) {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-selection-item';
        chatItem.innerHTML = `
            <div class="chat-selection-checkbox"></div>
            <div class="avatar">${chat.name[0].toUpperCase()}</div>
            <div class="chat-info">
                <span class="chat-name">${chat.name} ${chat.is_group ? '<span class="group-chat-indicator">Group</span>' : ''}</span>
            </div>
        `;

        chatItem.addEventListener('click', () => {
            chatItem.classList.toggle('selected');
            this.toggleChatSelection(chat);
        });

        return chatItem;
    }

    toggleChatSelection(chat) {
        const index = this.selectedChats.findIndex(c => c.id === chat.id);
        if (index > -1) {
            this.selectedChats.splice(index, 1);
        } else {
            this.selectedChats.push(chat);
        }
        this.updateForwardButton();
    }

    updateForwardButton() {
        const btn = document.getElementById('confirmForward');
        if (btn) {
            btn.disabled = this.selectedChats.length === 0;
        }
    }

    filterForwardChats(query) {
        const filteredChats = this.chats.filter(chat => 
            chat.name.toLowerCase().includes(query.toLowerCase()) &&
            chat.id !== this.currentActiveChat
        );

        const chatList = document.getElementById('forwardChatList');
        if (!chatList) return;

        chatList.innerHTML = '';

        if (filteredChats.length === 0) {
            chatList.innerHTML = `
                <div class="no-results">
                    <p>No chats found</p>
                </div>
            `;
            return;
        }

        filteredChats.forEach(chat => {
            const chatItem = this.createForwardChatItem(chat);
            chatList.appendChild(chatItem);
        });
    }

    async handleForwardMessage() {
        if (!this.forwardingMessage || this.selectedChats.length === 0) return;

        try {
            for (const chat of this.selectedChats) {
                await window.databaseManager.forwardMessage(
                    chat.id,
                    this.forwardingMessage,
                    window.authManager.currentUser.id
                );
            }
            
            this.hideForwardModal();
            this.showToast(`Message forwarded to ${this.selectedChats.length} chat(s)`, 'success');
        } catch (error) {
            console.error('Error forwarding message:', error);
            this.showToast('Error forwarding message', 'error');
        }
    }

    // Modal management
    async showNewChatModal() {
        // Reset state first
        this.selectedUsers = [];
        
        // Then update UI elements if they exist
        const groupNameInput = document.getElementById('groupName');
        if (groupNameInput) {
            groupNameInput.value = '';
        }
        
        const selectedMembers = document.getElementById('selectedMembers');
        if (selectedMembers) {
            selectedMembers.innerHTML = '';
        }
        
        const createGroupBtn = document.getElementById('createGroupBtn');
        if (createGroupBtn) {
            createGroupBtn.disabled = true;
        }
        
        // Load users
        await this.loadAllUsers();
        
        // Show modal
        const modal = document.getElementById('newChatModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideNewChatModal() {
        const modal = document.getElementById('newChatModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        const searchInput = document.getElementById('newChatSearch');
        if (searchInput) {
            searchInput.value = '';
        }
        
        const groupSearchInput = document.getElementById('groupMemberSearch');
        if (groupSearchInput) {
            groupSearchInput.value = '';
        }
        
        // Reset group creation state
        this.selectedUsers = [];
        const groupNameInput = document.getElementById('groupName');
        if (groupNameInput) {
            groupNameInput.value = '';
        }
        
        const selectedMembers = document.getElementById('selectedMembers');
        if (selectedMembers) {
            selectedMembers.innerHTML = '';
        }
        
        const createGroupBtn = document.getElementById('createGroupBtn');
        if (createGroupBtn) {
            createGroupBtn.disabled = true;
        }
    }

    async loadAllUsers() {
        try {
            this.users = await window.databaseManager.getAllUsers();
            this.renderUserList();
            this.renderGroupUserList();
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUserList() {
        const userList = document.getElementById('userList');
        if (!userList) return;

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
            
            console.log('Starting new chat from modal with user:', user);
            
            const chat = await window.databaseManager.createPrivateChat(chatName, [currentUserId, user.id]);
            
            this.hideNewChatModal();
            await this.loadChats();
            await this.selectChat(chat);
            
        } catch (error) {
            console.error('Error starting new chat from modal:', error);
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
        if (!userList) return;

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
        this.hideNewChatModal();
        this.hideForwardModal();
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
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
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        
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
        if (!unsafe) return '';
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
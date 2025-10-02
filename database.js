class DatabaseManager {
    constructor() {
        this.supabase = window.supabaseClient;
    }

    // User profiles
    async createProfile(userId, email, username, name, phone, avatarUrl = null) {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .insert([
                    {
                        id: userId,
                        email: email,
                        username: username,
                        name: name,
                        phone: phone,
                        avatar_url: avatarUrl,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                ])
                .select()
                .single();

            if (error) {
                console.error('Error creating profile:', error);
                throw error;
            }
            
            console.log('Profile created successfully:', data);
            return data;
        } catch (error) {
            console.error('Profile creation failed:', error);
            throw error;
        }
    }

    async getProfile(userId) {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // No rows returned
                    return null;
                }
                console.error('Error getting profile:', error);
                throw error;
            }
            return data;
        } catch (error) {
            console.error('Get profile failed:', error);
            throw error;
        }
    }

    async findUserByIdentifier(identifier) {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('*')
                .or(`username.ilike.%${identifier}%,email.ilike.%${identifier}%,phone.ilike.%${identifier}%`)
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error finding user:', error);
                throw error;
            }
            return data;
        } catch (error) {
            console.error('Find user failed:', error);
            throw error;
        }
    }

    // Chats - with duplicate prevention and better error handling
    async createPrivateChat(chatName, participantIds) {
        try {
            console.log('Creating private chat:', { chatName, participantIds });

            // Check for existing chat first
            const existingChat = await this.findExistingPrivateChat(participantIds);
            if (existingChat) {
                console.log('Using existing chat:', existingChat);
                return existingChat;
            }

            const { data, error } = await this.supabase
                .from('chats')
                .insert([
                    {
                        name: chatName,
                        created_by: window.authManager.currentUser.id,
                        is_group: false,
                        created_at: new Date().toISOString()
                    }
                ])
                .select()
                .single();

            if (error) {
                console.error('Error creating chat:', error);
                throw error;
            }

            console.log('Chat created, adding members...');
            await this.addChatMembers(data.id, participantIds);
            return data;
        } catch (error) {
            console.error('Private chat creation failed:', error);
            throw error;
        }
    }

    async findExistingPrivateChat(participantIds) {
        try {
            if (participantIds.length !== 2) return null;

            // Get all private chats for current user
            const { data: userChats, error } = await this.supabase
                .from('chat_members')
                .select(`
                    chat_id,
                    chat:chats (
                        id,
                        name,
                        created_by,
                        is_group,
                        created_at,
                        last_message_at
                    )
                `)
                .eq('user_id', window.authManager.currentUser.id)
                .eq('chats.is_group', false);

            if (error) {
                console.error('Error finding user chats:', error);
                return null;
            }

            if (!userChats || userChats.length === 0) return null;

            // Check each chat for matching participants
            for (let userChat of userChats) {
                const { data: chatMembers, error: membersError } = await this.supabase
                    .from('chat_members')
                    .select('user_id')
                    .eq('chat_id', userChat.chat_id);

                if (membersError) {
                    console.error('Error getting chat members:', membersError);
                    continue;
                }

                if (chatMembers && chatMembers.length === 2) {
                    const memberIds = chatMembers.map(m => m.user_id).sort();
                    const sortedParticipantIds = [...participantIds].sort();
                    
                    if (JSON.stringify(memberIds) === JSON.stringify(sortedParticipantIds)) {
                        console.log('Found existing chat with same participants:', userChat.chat);
                        return userChat.chat;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('Error in findExistingPrivateChat:', error);
            return null;
        }
    }

    async createGroupChat(groupName, memberIds) {
        try {
            console.log('Creating group chat:', { groupName, memberIds });

            // First try using the RPC function
            try {
                const { data, error } = await this.supabase
                    .rpc('create_group_chat', {
                        group_name: groupName,
                        member_ids: memberIds,
                        creator_id: window.authManager.currentUser.id
                    });

                if (!error && data) {
                    const { data: chat, error: chatError } = await this.supabase
                        .from('chats')
                        .select('*')
                        .eq('id', data)
                        .single();

                    if (!chatError) return chat;
                }
            } catch (rpcError) {
                console.log('RPC failed, falling back to manual creation:', rpcError);
            }

            // Fallback: manual group creation
            const { data: chat, error: chatError } = await this.supabase
                .from('chats')
                .insert([
                    {
                        name: groupName,
                        created_by: window.authManager.currentUser.id,
                        is_group: true,
                        created_at: new Date().toISOString()
                    }
                ])
                .select()
                .single();

            if (chatError) throw chatError;

            await this.addChatMembers(chat.id, memberIds);
            return chat;
        } catch (error) {
            console.error('Group chat creation failed:', error);
            throw error;
        }
    }

    async addChatMembers(chatId, memberIds) {
        try {
            const members = memberIds.map(userId => ({
                chat_id: chatId,
                user_id: userId,
                is_admin: userId === window.authManager.currentUser.id,
                joined_at: new Date().toISOString()
            }));

            const { error } = await this.supabase
                .from('chat_members')
                .insert(members);

            if (error) throw error;
        } catch (error) {
            console.error('Add chat members failed:', error);
            throw error;
        }
    }

    async getUserChats(userId) {
        try {
            console.log('Getting chats for user:', userId);

            const { data, error } = await this.supabase
                .from('chat_members')
                .select(`
                    chat:chats (
                        id,
                        name,
                        created_by,
                        is_group,
                        created_at,
                        last_message_at
                    )
                `)
                .eq('user_id', userId);

            if (error) {
                console.error('Error getting user chats:', error);
                throw error;
            }

            console.log('Raw chat data from database:', data);

            if (!data || data.length === 0) {
                console.log('No chats found for user');
                return [];
            }

            // Remove duplicates and invalid chats
            const uniqueChats = [];
            const seenChatIds = new Set();
            
            for (let item of data) {
                if (item.chat && item.chat.id && !seenChatIds.has(item.chat.id)) {
                    seenChatIds.add(item.chat.id);
                    uniqueChats.push(item.chat);
                }
            }

            console.log('Unique chats after processing:', uniqueChats);

            // Get last message for each chat
            for (let chat of uniqueChats) {
                try {
                    const lastMessage = await this.getLastMessage(chat.id);
                    chat.last_message = lastMessage;
                } catch (msgError) {
                    console.error('Error getting last message for chat', chat.id, msgError);
                    chat.last_message = null;
                }
            }

            return uniqueChats;
        } catch (error) {
            console.error('Get user chats completely failed:', error);
            throw error;
        }
    }

    // Messages
    async sendMessage(chatId, content, senderId, repliedToId = null) {
        try {
            console.log('Sending message to chat:', chatId);

            const { data, error } = await this.supabase
                .from('messages')
                .insert([
                    {
                        chat_id: chatId,
                        sender_id: senderId,
                        content: content,
                        replied_to_id: repliedToId,
                        created_at: new Date().toISOString()
                    }
                ])
                .select(`
                    *,
                    sender:profiles (
                        name,
                        username,
                        avatar_url
                    )
                `)
                .single();

            if (error) throw error;

            // Update last message time
            await this.supabase
                .from('chats')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', chatId);

            return data;
        } catch (error) {
            console.error('Send message failed:', error);
            throw error;
        }
    }

    async getLastMessage(chatId) {
        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select('*')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data || null;
        } catch (error) {
            console.error('Get last message failed:', error);
            return null;
        }
    }

    async getChatMessages(chatId, limit = 50) {
        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select(`
                    *,
                    sender:profiles (
                        id,
                        name,
                        username,
                        avatar_url
                    )
                `)
                .eq('chat_id', chatId)
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Get chat messages failed:', error);
            throw error;
        }
    }

    // Search and user management
    async searchUsers(query, excludeCurrentUser = true) {
        try {
            let queryBuilder = this.supabase
                .from('profiles')
                .select('*')
                .or(`username.ilike.%${query}%,email.ilike.%${query}%,name.ilike.%${query}%`)
                .limit(10);

            if (excludeCurrentUser) {
                queryBuilder = queryBuilder.neq('id', window.authManager.currentUser.id);
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Search users failed:', error);
            throw error;
        }
    }

    async getAllUsers(excludeCurrentUser = true) {
        try {
            let queryBuilder = this.supabase
                .from('profiles')
                .select('*')
                .order('username');

            if (excludeCurrentUser) {
                queryBuilder = queryBuilder.neq('id', window.authManager.currentUser.id);
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Get all users failed:', error);
            throw error;
        }
    }

    async forwardMessage(chatId, originalMessage, senderId) {
        try {
            const { data, error } = await this.supabase
                .from('messages')
                .insert([
                    {
                        chat_id: chatId,
                        sender_id: senderId,
                        content: originalMessage.content,
                        forwarded_count: 1,
                        created_at: new Date().toISOString()
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            await this.supabase
                .from('chats')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', chatId);

            return data;
        } catch (error) {
            console.error('Forward message failed:', error);
            throw error;
        }
    }

    async softDeleteMessage(messageId) {
        try {
            const { data, error } = await this.supabase
                .from('messages')
                .update({ 
                    is_deleted: true,
                    content: 'This message was deleted'
                })
                .eq('id', messageId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Soft delete message failed:', error);
            throw error;
        }
    }

    async getMessageById(messageId) {
        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select(`
                    *,
                    sender:profiles (
                        name,
                        username
                    )
                `)
                .eq('id', messageId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Get message by ID failed:', error);
            throw error;
        }
    }

    async getChatMembers(chatId) {
        try {
            const { data, error } = await this.supabase
                .from('chat_members')
                .select(`
                    user:profiles (
                        id,
                        name,
                        username,
                        avatar_url
                    ),
                    is_admin
                `)
                .eq('chat_id', chatId);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Get chat members failed:', error);
            throw error;
        }
    }
}

// Initialize Database Manager
window.databaseManager = new DatabaseManager();
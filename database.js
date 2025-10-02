class DatabaseManager {
    constructor() {
        this.supabase = window.supabaseClient;
    }

    // User profiles
    async createProfile(userId, email, username, name, phone, avatarUrl = null) {
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
    }

    async getProfile(userId) {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No profile found
                return null;
            }
            throw error;
        }
        return data;
    }

    async findUserByIdentifier(identifier) {
        // Search by username, email, or phone
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .or(`username.eq.${identifier},email.eq.${identifier},phone.eq.${identifier}`)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    async updateProfile(userId, profileData) {
        profileData.updated_at = new Date().toISOString();
        
        const { data, error } = await this.supabase
            .from('profiles')
            .update(profileData)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // Chats
    async createChat(chatName, participantIds) {
        const { data, error } = await this.supabase
            .from('chats')
            .insert([
                {
                    name: chatName,
                    created_by: window.authManager.currentUser.id,
                    created_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Add participants
        await this.addChatParticipants(data.id, participantIds);
        return data;
    }

    async addChatParticipants(chatId, participantIds) {
        const participants = participantIds.map(userId => ({
            chat_id: chatId,
            user_id: userId,
            joined_at: new Date().toISOString()
        }));

        const { error } = await this.supabase
            .from('chat_participants')
            .insert(participants);

        if (error) throw error;
    }

    async getUserChats(userId) {
        const { data, error } = await this.supabase
            .from('chat_participants')
            .select(`
                chat:chats (
                    id,
                    name,
                    created_by,
                    created_at,
                    last_message_at
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { foreignTable: 'chats', ascending: false });

        if (error) throw error;

        // Extract chat objects and get last message for each
        const chats = data.map(item => item.chat);
        
        for (let chat of chats) {
            const lastMessage = await this.getLastMessage(chat.id);
            chat.last_message = lastMessage;
        }

        return chats;
    }

    // Messages
    async sendMessage(chatId, content, senderId) {
        const { data, error } = await this.supabase
            .from('messages')
            .insert([
                {
                    chat_id: chatId,
                    sender_id: senderId,
                    content: content,
                    created_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Update chat's last_message_at
        await this.supabase
            .from('chats')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', chatId);

        return data;
    }

    async getChatMessages(chatId, limit = 50) {
        const { data, error } = await this.supabase
            .from('messages')
            .select(`
                *,
                sender:profiles (
                    name,
                    username,
                    avatar_url
                )
            `)
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data;
    }

    async getLastMessage(chatId) {
        const { data, error } = await this.supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    // Search users for new chats
    async searchUsers(query, excludeCurrentUser = true) {
        let queryBuilder = this.supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${query}%,email.ilike.%${query}%,name.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(10);

        if (excludeCurrentUser) {
            queryBuilder = queryBuilder.neq('id', window.authManager.currentUser.id);
        }

        const { data, error } = await queryBuilder;

        if (error) throw error;
        return data;
    }

    // Get all users for new chat modal
    async getAllUsers(excludeCurrentUser = true) {
        let queryBuilder = this.supabase
            .from('profiles')
            .select('*')
            .order('username');

        if (excludeCurrentUser) {
            queryBuilder = queryBuilder.neq('id', window.authManager.currentUser.id);
        }

        const { data, error } = await queryBuilder;

        if (error) throw error;
        return data;
    }
}

// Initialize Database Manager
window.databaseManager = new DatabaseManager();
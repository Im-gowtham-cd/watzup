class RealtimeManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.activeChannel = null;
        this.currentChatId = null;
    }

    subscribeToChat(chatId, onNewMessage, onMessageUpdate, onMessageDelete) {
        // Unsubscribe from previous channel
        if (this.activeChannel) {
            this.supabase.removeChannel(this.activeChannel);
        }

        this.currentChatId = chatId;

        // Subscribe to messages for this chat
        this.activeChannel = this.supabase
            .channel(`chat:${chatId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `chat_id=eq.${chatId}`
                },
                (payload) => {
                    console.log('New message received:', payload);
                    onNewMessage(payload.new);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: `chat_id=eq.${chatId}`
                },
                (payload) => {
                    console.log('Message updated:', payload);
                    if (payload.new.is_deleted) {
                        onMessageDelete(payload.new);
                    } else {
                        onMessageUpdate(payload.new);
                    }
                }
            )
            .subscribe((status) => {
                console.log(`Realtime subscription status for chat ${chatId}:`, status);
            });

        return this.activeChannel;
    }

    unsubscribeFromChat() {
        if (this.activeChannel) {
            this.supabase.removeChannel(this.activeChannel);
            this.activeChannel = null;
            this.currentChatId = null;
        }
    }

    // Subscribe to chat list updates
    subscribeToUserChats(userId, onChatUpdate) {
        return this.supabase
            .channel(`user_chats:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'chat_members',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('Chat list updated:', payload);
                    onChatUpdate(payload);
                }
            )
            .subscribe();
    }

    // Subscribe to profile updates
    subscribeToProfile(userId, onProfileUpdate) {
        return this.supabase
            .channel(`profile:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${userId}`
                },
                (payload) => {
                    console.log('Profile updated:', payload);
                    onProfileUpdate(payload);
                }
            )
            .subscribe();
    }
}

// Initialize Realtime Manager
window.realtimeManager = new RealtimeManager();
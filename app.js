class SimpleChatApp {
    constructor() {
        this.init();
    }

    async init() {
        // Wait for auth to initialize
        setTimeout(() => {
            if (window.authManager.currentUser) {
                this.initializeApp();
            }
        }, 100);

        // Listen for auth state changes to initialize app
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.initializeApp();
            }
        });
    }

    async initializeApp() {
        console.log('Initializing SimpleChat App...');
        
        // Load user's chats
        await window.uiManager.loadChats();
        
        // Subscribe to profile updates
        window.realtimeManager.subscribeToProfile(
            window.authManager.currentUser.id,
            (payload) => {
                console.log('Profile update received:', payload);
                window.authManager.loadUserProfile();
            }
        );
        
        console.log('App initialized successfully');
    }
}

// Initialize the application
window.simpleChatApp = new SimpleChatApp();
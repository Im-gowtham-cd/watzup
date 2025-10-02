class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.profilePictureFile = null;
        this.init();
    }

    async init() {
        this.initEventListeners();
        
        // Check for existing session
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            await this.loadUserProfile();
            this.showMainApp();
        } else {
            this.showAuthScreen();
        }

        // Listen for auth state changes
        window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event, session);
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user;
                await this.loadUserProfile();
                this.showMainApp();
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.currentProfile = null;
                this.showAuthScreen();
            }
        });
    }

    initEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Form switching
        document.getElementById('showSignUp').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchTab('signup');
        });

        document.getElementById('showSignIn').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchTab('signin');
        });

        // Profile picture upload
        document.getElementById('uploadArea').addEventListener('click', () => {
            document.getElementById('profilePicture').click();
        });

        document.getElementById('profilePicture').addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files[0]);
        });
    }

    switchTab(tab) {
        // Update tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update forms
        document.getElementById('signinForm').classList.toggle('active', tab === 'signin');
        document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
    }

    async handleImageUpload(file) {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showAuthMessage('Please select an image file', 'error');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showAuthMessage('Image size should be less than 5MB', 'error');
            return;
        }

        this.profilePictureFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('imagePreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    async uploadProfilePicture(userId) {
        if (!this.profilePictureFile) return null;

        try {
            const fileExt = this.profilePictureFile.name.split('.').pop();
            const fileName = `${userId}/avatar.${fileExt}`;

            const { error: uploadError } = await window.supabaseClient.storage
                .from('avatars')
                .upload(fileName, this.profilePictureFile, {
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = window.supabaseClient.storage
                .from('avatars')
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            return null;
        }
    }

    async signUp() {
        const name = document.getElementById('signupName').value;
        const username = document.getElementById('signupUsername').value;
        const email = document.getElementById('signupEmail').value;
        const phone = document.getElementById('signupPhone').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;

        console.log('Signup data:', { name, username, email, phone });

        // Validation
        if (!name || !username || !email || !password) {
            this.showAuthMessage('Please fill in all required fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showAuthMessage('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showAuthMessage('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            // Sign up with Supabase Auth
            const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: name,
                        username: username,
                        phone: phone
                    }
                }
            });

            if (authError) throw authError;

            console.log('Auth signup successful:', authData);

            // Upload profile picture if available
            let avatarUrl = null;
            if (this.profilePictureFile) {
                avatarUrl = await this.uploadProfilePicture(authData.user.id);
            }

            // Create profile in database
            await this.createProfileDirectly(authData.user.id, email, username, name, phone, avatarUrl);

            this.showAuthMessage('Account created successfully! Please check your email for verification. You can sign in after verification.', 'success');
            
            // Clear form and switch to sign in
            this.clearSignUpForm();
            this.switchTab('signin');
            
        } catch (error) {
            console.error('Signup error:', error);
            this.showAuthMessage(error.message, 'error');
            throw error;
        }
    }

    async createProfileDirectly(userId, email, username, name, phone, avatarUrl = null) {
        try {
            const { data, error } = await window.supabaseClient
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
                console.error('Profile creation error:', error);
                return null;
            }

            console.log('Profile created successfully:', data);
            return data;
        } catch (error) {
            console.error('Failed to create profile:', error);
            return null;
        }
    }

    async signIn() {
        const identifier = document.getElementById('signinIdentifier').value;
        const password = document.getElementById('signinPassword').value;

        if (!identifier || !password) {
            this.showAuthMessage('Please fill in all fields', 'error');
            return;
        }

        try {
            let authData;

            // Determine if identifier is email, username, or phone
            if (identifier.includes('@')) {
                // Email sign in
                authData = await window.supabaseClient.auth.signInWithPassword({
                    email: identifier,
                    password
                });
            } else {
                // Try username or phone by looking up the profile first
                const profile = await window.databaseManager.findUserByIdentifier(identifier);
                if (!profile) {
                    throw new Error('User not found');
                }

                authData = await window.supabaseClient.auth.signInWithPassword({
                    email: profile.email,
                    password
                });
            }

            if (authData.error) throw authData.error;

            return authData;
        } catch (error) {
            this.showAuthMessage(error.message, 'error');
            throw error;
        }
    }

    async loadUserProfile() {
        if (!this.currentUser) return;

        try {
            this.currentProfile = await window.databaseManager.getProfile(this.currentUser.id);
            console.log('Loaded profile:', this.currentProfile);
            
            if (!this.currentProfile) {
                console.log('No profile found, creating one...');
                // Create profile if it doesn't exist
                this.currentProfile = await this.createProfileDirectly(
                    this.currentUser.id,
                    this.currentUser.email,
                    this.currentUser.user_metadata?.username || this.currentUser.email.split('@')[0],
                    this.currentUser.user_metadata?.name || '',
                    this.currentUser.user_metadata?.phone || ''
                );
            }
            
            this.updateUIWithUserInfo();
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    updateUIWithUserInfo() {
        const userNameElement = document.getElementById('userName');
        const userAvatarElement = document.getElementById('userAvatar');
        const profileModalAvatar = document.getElementById('profileModalAvatar');

        console.log('Updating UI with profile:', this.currentProfile);

        if (userNameElement && this.currentProfile) {
            userNameElement.textContent = this.currentProfile.name || 
                                        this.currentProfile.username || 
                                        this.currentUser.email.split('@')[0];
        }

        // Update sidebar avatar
        if (userAvatarElement) {
            if (this.currentProfile?.avatar_url) {
                userAvatarElement.src = this.currentProfile.avatar_url;
                userAvatarElement.textContent = '';
                userAvatarElement.style.display = 'block';
            } else {
                userAvatarElement.src = '';
                userAvatarElement.textContent = (this.currentProfile?.name?.[0] || 
                                               this.currentProfile?.username?.[0] || 
                                               this.currentUser?.email?.[0] || 'U').toUpperCase();
                userAvatarElement.style.display = 'flex';
            }
        }

        // Update profile modal avatar
        if (profileModalAvatar && this.currentProfile) {
            if (this.currentProfile.avatar_url) {
                profileModalAvatar.src = this.currentProfile.avatar_url;
                profileModalAvatar.textContent = '';
                profileModalAvatar.style.display = 'block';
            } else {
                profileModalAvatar.src = '';
                profileModalAvatar.textContent = (this.currentProfile.name?.[0] || 
                                                this.currentProfile.username?.[0] || 
                                                this.currentUser.email?.[0] || 'U').toUpperCase();
                profileModalAvatar.style.display = 'flex';
            }
        }
    }

    async updateProfile(profileData) {
        try {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .update({
                    ...profileData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentUser.id)
                .select()
                .single();

            if (error) throw error;

            // Update local profile
            this.currentProfile = data;
            this.updateUIWithUserInfo();
            return true;
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    }

    async signOut() {
        try {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Error signing out:', error);
        }
    }

    showAuthScreen() {
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        this.clearSignUpForm();
    }

    showMainApp() {
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }

    showAuthMessage(message, type) {
        const messageElement = document.getElementById('authMessage');
        messageElement.textContent = message;
        messageElement.className = `auth-message ${type}`;
        
        setTimeout(() => {
            messageElement.textContent = '';
            messageElement.className = 'auth-message';
        }, 5000);
    }

    clearSignUpForm() {
        document.getElementById('signupName').value = '';
        document.getElementById('signupUsername').value = '';
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupPhone').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('signupConfirmPassword').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('imagePreview').classList.add('hidden');
        this.profilePictureFile = null;
    }

    getCurrentProfile() {
        return this.currentProfile;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

// Initialize Auth Manager
window.authManager = new AuthManager();
// Supabase configuration
const SUPABASE_URL = 'https://vwqaqmunvsownhsccazv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cWFxbXVudnNvd25oc2NjYXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNzg3MDIsImV4cCI6MjA3NDk1NDcwMn0.ZRHwdO4JyMiD_CjfBwwudINFeUG03YWhfSzMA7hfi2Q';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other modules
window.supabaseClient = supabase;
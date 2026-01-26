
const { createClient } = require('@supabase/supabase-js');

// Helper component to initialize Supabase client
// Only initializes if credentials exist in environment variables

let supabase = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Note: In a secure backend environment, we could use the service key if needed for bypassing RLS, 
// but generic analytics usually works fine with Anon key if RLS policies allow "INSERT" for public/authenticated users.

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('[Supabase] Client initialized successfully');
    } catch (error) {
        console.error('[Supabase] Failed to initialize client:', error.message);
    }
} else {
    console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables. Real-time analytics disabled.');
}

module.exports = supabase;

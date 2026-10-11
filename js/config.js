// ShowCrew PixelMap — cloud sync configuration.
// The publishable key is a PUBLIC client key (safe to ship; access is enforced by Postgres RLS).
// Leave SUPABASE_PUBLISHABLE_KEY empty to run fully local: the sync UI stays hidden and nothing is loaded.
export const SUPABASE_URL = 'https://ylilrphbplhauxqdbqni.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_k2aN8LDDQhtUqZJ-ZndnPA_5jgh-Y-C';

// Show a "Create account" link in the account panel. Keep false once Don's account exists
// (and also turn off "Allow new users to sign up" in Supabase → Authentication → Sign In / Providers).
export const ALLOW_SIGNUP = false;

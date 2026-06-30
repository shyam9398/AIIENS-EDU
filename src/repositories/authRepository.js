import { supabase } from '../services/supabase/client.js';

export async function getSession() {
  if (!supabase) return { data: { session: null }, error: new Error('Supabase not configured') };
  return supabase.auth.getSession();
}

export async function getUser() {
  if (!supabase) return { data: { user: null }, error: new Error('Supabase not configured') };
  return supabase.auth.getUser();
}

export async function signIn(email, password) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  if (!supabase) return { error: new Error('Supabase not configured') };
  return supabase.auth.signOut();
}

export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

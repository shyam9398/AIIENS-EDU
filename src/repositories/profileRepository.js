import { supabase } from '../services/supabase/client.js';

export async function fetchProfile(userId) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
}

export async function upsertProfile(profile) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  return supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();
}

export async function listSubAdmins() {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  return supabase
    .from('profiles')
    .select('*')
    .eq('role', 'subadmin')
    .order('created_at', { ascending: false });
}

export async function deleteSubAdminProfile(userId) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  return supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
    .eq('role', 'subadmin');
}

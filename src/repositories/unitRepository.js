import { supabase } from '../services/supabase/client.js';

export async function fetchUnits(subjectId) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  return supabase
    .from('units')
    .select('*')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true });
}

export async function createUnit(subjectId, unit) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const sortOrder = Number(unit.id || unit.sort_order || 0);
  return supabase
    .from('units')
    .insert({
      subject_id: subjectId,
      title: unit.name || unit.title || `Unit ${sortOrder || ''}`.trim(),
      sort_order: sortOrder,
    })
    .select()
    .single();
}

export async function updateUnit(id, unit) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const sortOrder = Number(unit.id || unit.sort_order || 0);
  return supabase
    .from('units')
    .update({
      title: unit.name || unit.title,
      sort_order: sortOrder,
    })
    .eq('id', id)
    .select()
    .single();
}

export async function deleteUnit(id) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  return supabase.from('units').delete().eq('id', id);
}

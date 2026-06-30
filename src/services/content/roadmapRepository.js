import { supabase } from '../supabase/client.js';

/**
 * Fetch roadmap topics for a given subject.
 * Returns an array of rows from `content_items` where content_type = 'roadmap'.
 */
export async function fetchRoadmapBySubject(subjectId) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('subject_id', subjectId)
    .eq('content_type', 'roadmap')
    .order('created_at', { ascending: false });
  return { data, error };
}

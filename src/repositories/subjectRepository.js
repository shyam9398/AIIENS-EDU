import { supabase } from '../services/supabase/client.js';

function normalizeSubject(subject) {
  const row = {
    name: subject?.name || 'Untitled Subject',
    code: subject?.code || null,
    branch: subject?.branch || null,
    regulation_code: subject?.reg || subject?.regulation_code || null,
    semester: subject?.sem || subject?.semester || null,
    university_name: subject?.uni || subject?.university_name || null,
    year: subject?.year || null,
    credits: subject?.credits || '3',
    status: subject?.status || 'active',
    created_by: subject?.createdBy || subject?.created_by || 'subadmin',
  };
  if (subject?.created_by_role) row.created_by_role = subject.created_by_role;
  return row;
}

export async function fetchSubjects(filters = {}) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  const { university_name, branch, regulation_code, semester, created_by, code } = filters;

  let q = supabase.from('subjects').select('*').order('name', { ascending: true });
  if (semester) q = q.eq('semester', semester);
  if (branch) q = q.eq('branch', branch);
  if (regulation_code) q = q.eq('regulation_code', regulation_code);
  if (university_name) q = q.eq('university_name', university_name);
  if (created_by) q = q.eq('created_by', created_by);
  if (code) q = q.eq('code', code);

  return q;
}

export async function fetchSubjectById(id) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!id) return { data: null, error: new Error('Subject ID is required') };
  return supabase.from('subjects').select('*').eq('id', id).maybeSingle();
}

export async function createSubject(subject) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const row = normalizeSubject(subject);
  return supabase.from('subjects').insert(row).select().single();
}

export async function updateSubject(id, subject) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const row = normalizeSubject(subject);
  return supabase.from('subjects').update(row).eq('id', id).select().single();
}

export async function deleteSubject(id) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await supabase.from('subjects').delete().eq('id', id).select('id').maybeSingle();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Subject could not be deleted or no longer exists.') };
  return { data, error: null };
}

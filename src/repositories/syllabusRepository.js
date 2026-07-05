import { supabase } from '../services/supabase/client.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

async function getAuthenticatedUserId() {
  if (!supabase?.auth) return null;
  const { data: sessionData } = supabase.auth.getSession
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  if (isUuid(sessionData?.session?.user?.id)) return sessionData.session.user.id;

  const { data: userData } = supabase.auth.getUser
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  if (isUuid(userData?.user?.id)) return userData.user.id;

  if (typeof window !== 'undefined') {
    const appUserId = window.APP?.user?.id || window.APP?.subAdminData?.id;
    if (isUuid(appUserId)) return appUserId;
  }

  return null;
}

async function resolveSubjectId(subjectId, payload = {}) {
  if (isUuid(subjectId)) return subjectId;

  const subjectName = String(payload.subjectName || payload.subject_name || subjectId || '').trim();
  if (!subjectName || !supabase?.from) return null;

  let query = supabase.from('subjects').select('id').eq('name', subjectName).limit(1);
  if (payload.branch) query = query.eq('branch', payload.branch);
  if (payload.reg || payload.regulation_code) query = query.eq('regulation_code', payload.reg || payload.regulation_code);
  if (payload.sem || payload.semester) query = query.eq('semester', payload.sem || payload.semester);
  if (payload.uni || payload.university_name) query = query.eq('university_name', payload.uni || payload.university_name);

  const { data, error } = await query;
  if (error) return null;
  const resolvedId = Array.isArray(data) ? data[0]?.id : data?.id;
  return isUuid(resolvedId) ? resolvedId : null;
}

export async function fetchSubjectSyllabus(subjectId) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!subjectId) return { data: null, error: new Error('Subject ID is required') };
  if (!isUuid(subjectId)) return { data: null, error: new Error('Subject ID must be a UUID') };
  return supabase
    .from('subject_syllabus')
    .select('*')
    .eq('subject_id', subjectId)
    .maybeSingle();
}

export async function upsertSubjectSyllabus(subjectId, payload = {}) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!subjectId) return { data: null, error: new Error('Subject ID is required') };
  const resolvedSubjectId = await resolveSubjectId(subjectId, payload);
  if (!resolvedSubjectId) return { data: null, error: new Error('Subject ID must be the UUID from the subjects table') };
  const createdBy = await getAuthenticatedUserId();
  if (!createdBy) return { data: null, error: new Error('Authenticated user UUID is required to save syllabus') };

  const row = {
    subject_id: resolvedSubjectId,
    subject_name: payload.subjectName || payload.subject_name || '',
    drive_url: payload.driveUrl || payload.drive_url || payload.url || payload.syllabusUrl || '',
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  };
  console.log({
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    drive_url: row.drive_url,
    created_by: row.created_by,
  });
  return supabase
    .from('subject_syllabus')
    .upsert(row, { onConflict: 'subject_id' })
    .select()
    .single();
}

export async function deleteSubjectSyllabus(subjectId) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  if (!subjectId) return { error: new Error('Subject ID is required') };
  if (!isUuid(subjectId)) return { error: new Error('Subject ID must be a UUID') };
  return supabase.from('subject_syllabus').delete().eq('subject_id', subjectId);
}

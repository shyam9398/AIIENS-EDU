import { supabase } from '../supabase/client.js';
import { getCurrentBranch, isSameBranch } from '../auth/branchContext.js';

const TYPE_MAP = {
  videos: 'video',
  video: 'video',
  notes: 'note',
  note: 'note',
  pyqs: 'pyq',
  pyq: 'pyq',
  iqs: 'iq',
  iq: 'iq',
  roadmap: 'roadmap',
};

export function normalizeContentType(type) {
  return TYPE_MAP[type] || type;
}

async function subjectIdsForBranch(branch) {
  if (!branch) return null;
  const { data, error } = await supabase.from('subjects').select('id, branch').eq('branch', branch);
  if (error) return { error };
  return { ids: (data || []).map((subject) => subject.id).filter(Boolean) };
}

async function assertSubjectBranch(subjectId, branch) {
  if (!subjectId || !branch) return { ok: true };
  const { data, error } = await supabase.from('subjects').select('id, branch').eq('id', subjectId).maybeSingle();
  if (error) return { ok: false, error };
  if (!data || !isSameBranch(data.branch, branch)) {
    return { ok: false, error: new Error('Subject does not belong to the active branch.') };
  }
  return { ok: true };
}

export async function listContentItems({ subjectId, unitId, contentType, branch } = {}) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  const activeBranch = getCurrentBranch(branch);
  let q = supabase.from('content_items').select('*').order('created_at', { ascending: false });
  if (subjectId) q = q.eq('subject_id', subjectId);
  else if (activeBranch) {
    const scopedSubjects = await subjectIdsForBranch(activeBranch);
    if (scopedSubjects?.error) return { data: [], error: scopedSubjects.error };
    if (!scopedSubjects.ids.length) return { data: [], error: null };
    q = q.in('subject_id', scopedSubjects.ids);
  }
  if (unitId) q = q.eq('unit_id', unitId);
  if (contentType) q = q.eq('content_type', normalizeContentType(contentType));
  return q;
}

export async function createContentItem(payload) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const activeBranch = getCurrentBranch(payload.branch);
  const branchCheck = await assertSubjectBranch(payload.subjectId, activeBranch);
  if (!branchCheck.ok) return { data: null, error: branchCheck.error };
  const row = {
    subject_id: payload.subjectId,
    unit_id: payload.unitId,
    content_type: normalizeContentType(payload.contentType),
    title: payload.title || '',
    body: payload.body || '',
    url: payload.url || '',
    metadata: {
      ...(payload.metadata || {}),
      branch: activeBranch || payload.metadata?.branch || null,
      topicId: payload.topicId || null,
    },
    created_by: payload.createdBy || 'subadmin',
  };
  const { data, error } = await supabase.from('content_items').insert(row).select().single();
  return { data, error };
}

export async function updateContentItem(id, patch) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  return supabase.from('content_items').update(patch).eq('id', id).select().single();
}

export async function deleteContentItem(id) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  return supabase.from('content_items').delete().eq('id', id);
}

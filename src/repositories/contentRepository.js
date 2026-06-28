import { supabase } from '../services/supabase/client.js';
import { getCurrentBranch } from '../services/auth/branchContext.js';
import { fetchCurriculumStats as fetchCurriculumStatsService, saveLinkedContentItem as saveLinkedContentItemService } from '../services/curriculum/curriculumRepository.js';

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

export async function fetchCurriculumStats() {
  return fetchCurriculumStatsService();
}

export async function saveLinkedContentItem(payload) {
  return saveLinkedContentItemService(payload);
}

export async function listContentItems({ subjectId, unitId, contentType, branch } = {}) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  const activeBranch = getCurrentBranch(branch);
  let q = supabase.from('content_items').select('*').order('created_at', { ascending: false });
  if (subjectId) q = q.eq('subject_id', subjectId);
  if (unitId) q = q.eq('unit_id', unitId);
  if (contentType) q = q.eq('content_type', normalizeContentType(contentType));
  return q;
}

export async function createContentItem(payload) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const activeBranch = getCurrentBranch(payload.branch);
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

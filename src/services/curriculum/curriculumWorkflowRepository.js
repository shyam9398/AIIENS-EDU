import { supabase } from '../supabase/client.js';
import { getCurrentBranch } from '../auth/branchContext.js';

export const WORKFLOW_STATUS = Object.freeze({
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  SENT_TO_SUBADMIN: 'Sent To SubAdmin',
  PUBLISHED: 'Published',
  RETURNED: 'Returned',
});

function dbUnavailable() {
  return { data: null, error: new Error('Supabase not configured') };
}

export async function createCurriculumBlueprint(payload) {
  if (!supabase) return dbUnavailable();
  const { data: curriculum, error } = await supabase
    .from('curriculums')
    .insert({
      subject_name: payload.subjectName,
      subject_code: payload.subjectCode || null,
      branch: payload.branch || null,
      regulation_code: payload.regulationCode || null,
      semester: payload.semester || null,
      university_name: payload.universityName || null,
      status: WORKFLOW_STATUS.DRAFT,
      created_by: payload.createdBy || null,
      assigned_creator: payload.assignedCreator || null,
    })
    .select()
    .single();
  if (error) return { data: null, error };

  const unitRows = (payload.units || [])
    .filter((unit) => unit?.unitName)
    .map((unit, index) => ({
      curriculum_id: curriculum.id,
      unit_name: unit.unitName,
      display_order: index + 1,
      status: WORKFLOW_STATUS.DRAFT,
    }));
  if (!unitRows.length) return { data: { curriculum, units: [], topics: [] }, error: null };

  const unitInsert = await supabase.from('curriculum_units').insert(unitRows).select();
  if (unitInsert.error) return { data: null, error: unitInsert.error };

  const topicRows = [];
  unitInsert.data.forEach((unit, unitIndex) => {
    const sourceTopics = payload.units?.[unitIndex]?.topics || [];
    sourceTopics
      .filter((topic) => topic?.topicName)
      .forEach((topic, topicIndex) => {
        topicRows.push({
          curriculum_unit_id: unit.id,
          topic_name: topic.topicName,
          display_order: topicIndex + 1,
        });
      });
  });
  const topicInsert = topicRows.length
    ? await supabase.from('curriculum_topics').insert(topicRows).select()
    : { data: [], error: null };
  if (topicInsert.error) return { data: null, error: topicInsert.error };

  return { data: { curriculum, units: unitInsert.data || [], topics: topicInsert.data || [] }, error: null };
}

export async function listCurriculums({ branch, allBranches = false } = {}) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  let query = supabase
    .from('curriculums')
    .select('*, curriculum_units(*, curriculum_topics(*)), curriculum_assignments(*)')
    .order('created_at', { ascending: false });
  const activeBranch = allBranches ? '' : getCurrentBranch(branch);
  if (activeBranch) query = query.eq('branch', activeBranch);
  const { data, error } = await query;
  return { data: data || [], error };
}

export async function listCurriculumContent({ curriculumId, unitId, branch } = {}) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  let query = supabase.from('curriculum_content_items').select('*').order('created_at', { ascending: false });
  if (curriculumId) query = query.eq('curriculum_id', curriculumId);
  else {
    const activeBranch = getCurrentBranch(branch);
    if (activeBranch) {
      const { data: curriculums, error } = await supabase.from('curriculums').select('id').eq('branch', activeBranch);
      if (error) return { data: [], error };
      const ids = (curriculums || []).map((curriculum) => curriculum.id).filter(Boolean);
      if (!ids.length) return { data: [], error: null };
      query = query.in('curriculum_id', ids);
    }
  }
  if (unitId) query = query.eq('curriculum_unit_id', unitId);
  return query;
}

export async function saveCurriculumContent(payload) {
  if (!supabase) return dbUnavailable();
  return supabase
    .from('curriculum_content_items')
    .insert({
      curriculum_id: payload.curriculumId,
      curriculum_unit_id: payload.unitId || null,
      curriculum_topic_id: payload.topicId || null,
      content_type: payload.contentType,
      title: payload.title || '',
      body: payload.body || '',
      url: payload.url || '',
      description: payload.description || '',
      metadata: payload.metadata || {},
      created_by: payload.createdBy || null,
    })
    .select()
    .single();
}

export async function updateCurriculumStatus({ curriculumId, unitId, status, reviewNotes }) {
  if (!supabase) return dbUnavailable();
  const patch = { status };
  if (reviewNotes !== undefined) patch.review_notes = reviewNotes;
  if (status === WORKFLOW_STATUS.SENT_TO_SUBADMIN) patch.submitted_at = new Date().toISOString();
  if (status === WORKFLOW_STATUS.PUBLISHED || status === WORKFLOW_STATUS.RETURNED) patch.reviewed_at = new Date().toISOString();

  const unitResult = unitId
    ? await supabase.from('curriculum_units').update({ status }).eq('id', unitId).select().single()
    : { data: null, error: null };
  if (unitResult.error) return { data: null, error: unitResult.error };

  const curriculumResult = await supabase
    .from('curriculums')
    .update({ status, review_notes: reviewNotes ?? null })
    .eq('id', curriculumId)
    .select()
    .single();
  return curriculumResult;
}

export async function fetchWorkflowDashboardCounts() {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const activeBranch = getCurrentBranch();
  let curriculumIds = null;
  if (activeBranch) {
    const scoped = await supabase.from('curriculums').select('id').eq('branch', activeBranch);
    if (scoped.error) return { data: null, error: scoped.error };
    curriculumIds = (scoped.data || []).map((curriculum) => curriculum.id).filter(Boolean);
    if (!curriculumIds.length) {
      return { data: { assignedUnits: 0, completedUnits: 0, pendingUnits: 0 }, error: null };
    }
  }
  const scopeUnits = (query) => (curriculumIds ? query.in('curriculum_id', curriculumIds) : query);
  const [assignments, completed, pending] = await Promise.all([
    scopeUnits(supabase.from('curriculum_units').select('*', { count: 'exact', head: true })),
    scopeUnits(supabase.from('curriculum_units').select('*', { count: 'exact', head: true }).in('status', [WORKFLOW_STATUS.COMPLETED, WORKFLOW_STATUS.SENT_TO_SUBADMIN, WORKFLOW_STATUS.PUBLISHED])),
    scopeUnits(supabase.from('curriculum_units').select('*', { count: 'exact', head: true }).in('status', [WORKFLOW_STATUS.DRAFT, WORKFLOW_STATUS.IN_PROGRESS, WORKFLOW_STATUS.RETURNED])),
  ]);
  const error = assignments.error || completed.error || pending.error;
  if (error) return { data: null, error };
  return {
    data: {
      assignedUnits: assignments.count || 0,
      completedUnits: completed.count || 0,
      pendingUnits: pending.count || 0,
    },
    error: null,
  };
}

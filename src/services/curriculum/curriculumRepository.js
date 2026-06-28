import { supabase } from '../supabase/client.js';
import { getCurrentBranch, isSameBranch } from '../auth/branchContext.js';
import { subjectCreateMeta } from '../auth/portalUserContext.js';

function normalizeSubject(subject) {
  return {
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
}

function logRoadmap(message, payload) {
  try {
    if (payload === undefined) console.log(`[ROADMAP] ${message}`);
    else console.log(`[ROADMAP] ${message}`, payload);
  } catch {
    /* ignore logging failures */
  }
}

function logDb(message, payload) {
  try {
    if (payload === undefined) console.log(`[DB] ${message}`);
    else console.log(`[DB] ${message}`, payload);
  } catch {
    /* ignore logging failures */
  }
}

async function findSubject(row) {
  let query = supabase.from('subjects').select('*').eq('name', row.name).maybeSingle();
  if (row.code) query = query.eq('code', row.code);
  if (row.branch) query = query.eq('branch', row.branch);
  if (row.semester) query = query.eq('semester', row.semester);
  const exact = await query;
  if (exact.error || exact.data) return exact;
  if (row.branch) return { data: null, error: null };

  // Student-side subjects can be lighter than SubAdmin-created subjects.
  // Fall back to the stable curriculum identity instead of creating an empty twin.
  const loose = await supabase
    .from('subjects')
    .select('*')
    .eq('name', row.name)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return loose;
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export async function ensureSubject(subject, { createIfMissing = true } = {}) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (subject?.dbSubjectId) return { data: { id: subject.dbSubjectId }, error: null };
  if (looksLikeUuid(subject?.rawId || subject?.id)) {
    const foundById = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subject.rawId || subject.id)
      .maybeSingle();
    if (foundById.error || foundById.data) return foundById;
  }
  const row = normalizeSubject(subject);
  const found = await findSubject(row);
  if (found.error) return { data: null, error: found.error };
  if (found.data) return { data: found.data, error: null };
  if (!createIfMissing) return { data: null, error: new Error(`Subject not found: ${row.name}`) };
  return supabase.from('subjects').insert(row).select().single();
}

export async function ensureUnit(subjectId, unit, { createIfMissing = true } = {}) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (unit?.dbUnitId) return { data: { id: unit.dbUnitId }, error: null };
  const sortOrder = Number(unit?.sort_order || 0);
  const candidateId = unit?.dbUnitId || unit?.id;
  const found = looksLikeUuid(candidateId)
    ? await supabase
      .from('units')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle()
    : { data: null, error: null };
  if (found.error) return { data: null, error: found.error };
  if (found.data) return { data: found.data, error: null };

  const legacySortOrder = Number(unit?.id || unit?.sort_order || 0);
  const title = unit?.name || unit?.title || `Unit ${legacySortOrder || sortOrder || ''}`.trim();
  let existing = supabase.from('units').select('*').eq('subject_id', subjectId);
  if (legacySortOrder || sortOrder) existing = existing.eq('sort_order', legacySortOrder || sortOrder);
  else if (title) existing = existing.eq('title', title);
  const foundByIdentity = await existing.limit(1).maybeSingle();
  if (foundByIdentity.error) return { data: null, error: foundByIdentity.error };
  if (foundByIdentity.data) return { data: foundByIdentity.data, error: null };

  if (!createIfMissing) {
    return { data: null, error: new Error(`Unit not found for subject ${subjectId}: ${title || legacySortOrder}`) };
  }
  return supabase
    .from('units')
    .insert({
      subject_id: subjectId,
      title,
      sort_order: legacySortOrder || sortOrder,
    })
    .select()
    .single();
}

import { deleteItem } from '../admin/adminStatsService.js';

async function deleteExistingRoadmapRows(subjectId, unitId) {
  // Legacy helper removed – use generic deleteItem for each topic in the unit.
  // We'll fetch topic IDs first, then delete them individually.
  const { data: topics, error } = await supabase
    .from('topics')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('unit_id', unitId);
  if (error) return { error };
  const topicIds = (topics || []).map((topic) => topic.id).filter(Boolean);
  if (topicIds.length) {
    const { data: videos, error: videoFetchError } = await supabase
      .from('topic_videos')
      .select('id')
      .in('topic_id', topicIds);
    if (videoFetchError) return { error: videoFetchError };
    for (const video of videos || []) {
      const delVideo = await deleteItem('topic_videos', video.id);
      if (delVideo.error) return { error: delVideo.error };
    }
  }
  for (const t of topics) {
    const del = await deleteItem('topics', t.id);
    if (del.error) return { error: del.error };
  }
  return { data: null, error: null };
}

export async function saveUnitRoadmap({ subject, unit, topics }) {
  logRoadmap('SAVE START', { subject: subject?.name, unit: unit?.id || unit?.sort_order, topicCount: topics?.length || 0 });
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const subjectResult = await ensureSubject(subject);
  if (subjectResult.error) return subjectResult;
  const unitResult = await ensureUnit(subjectResult.data.id, unit);
  if (unitResult.error) return unitResult;

  const subjectId = subjectResult.data.id;
  const unitId = unitResult.data.id;
  const removed = await deleteExistingRoadmapRows(subjectId, unitId);
  if (removed.error) return { data: null, error: removed.error };

  const savedTopics = [];
  const ownerMeta = subjectCreateMeta();
  for (const [topicIndex, topic] of (topics || []).entries()) {
    const legacyTopicId = topic.id || `${unitId}-${topicIndex + 1}`;
    const videos = Array.isArray(topic.videos)
      ? topic.videos
      : (topic.youtubeUrls || topic.urls || []).map((url) => ({ url, description: '' }));
    const cleanVideos = videos
      .map((video, videoIndex) => ({
        url: (video.url || video.youtubeUrl || '').trim(),
        description: video.description || video.title || '',
        displayOrder: videoIndex + 1,
      }))
      .filter((video) => video.url || video.description);

    const topicInsert = await supabase
      .from('topics')
      .insert({
        subject_id: subjectId,
        unit_id: unitId,
        topic_name: topic.name || topic.topicName || `Topic ${topicIndex + 1}`,
        display_order: topicIndex + 1,
        created_by: ownerMeta.created_by,
        created_by_role: ownerMeta.created_by_role,
      })
      .select()
      .single();
    if (topicInsert.error) return { data: null, error: topicInsert.error };
    logRoadmap('Topic Saved', { subjectId, unitId, topicId: topicInsert.data.id, topicName: topicInsert.data.topic_name, table: 'topics', databaseResponse: topicInsert.data });
    logDb('Topic Saved', { subjectId, unitId, topicId: topicInsert.data.id, topicName: topicInsert.data.topic_name });

    const savedVideos = [];
    for (const [videoIndex, video] of cleanVideos.entries()) {
      if (!video.url) continue;
      const videoInsert = await supabase
        .from('topic_videos')
        .insert({
          topic_id: topicInsert.data.id,
          video_url: video.url,
          description: video.description || '',
          display_order: videoIndex + 1,
        })
        .select()
        .single();
      if (videoInsert.error) return { data: null, error: videoInsert.error };
      logRoadmap('Video Saved', { subjectId, unitId, topicId: topicInsert.data.id, videoId: videoInsert.data.id, url: video.url, table: 'topic_videos', databaseResponse: videoInsert.data });
      logDb('Video Saved', { subjectId, unitId, topicId: topicInsert.data.id, videoId: videoInsert.data.id, videoUrl: video.url });
      savedVideos.push({
        url: videoInsert.data.video_url || '',
        description: videoInsert.data.description || '',
        dbContentId: videoInsert.data.id,
      });
    }

    savedTopics.push({
      id: topicInsert.data.id || legacyTopicId,
      dbContentId: topicInsert.data.id,
      topicName: topicInsert.data.topic_name,
      name: topicInsert.data.topic_name,
      description: savedVideos[0]?.description || cleanVideos[0]?.description || '',
      videos: savedVideos.length ? savedVideos : cleanVideos,
      youtubeUrl: cleanVideos[0]?.url || '',
      youtubeUrls: cleanVideos.map((video) => video.url).filter(Boolean),
      url: cleanVideos[0]?.url || '',
      urls: cleanVideos.map((video) => video.url).filter(Boolean),
      displayOrder: topicIndex + 1,
    });
  }

  logRoadmap('FETCH START', { subjectId, unitId });
  const reloaded = await fetchUnitRoadmap({ subject: { ...subject, dbSubjectId: subjectId }, unit: { ...unit, dbUnitId: unitId } });
  if (reloaded.error) return reloaded;
  logRoadmap('Save Success', { subjectId, unitId, topicCount: reloaded.data?.topics?.length || 0, databaseResponse: reloaded.data });
  return { data: { subjectId, unitId, topics: reloaded.data?.topics || savedTopics }, error: null };
}

export async function fetchUnitRoadmap({ subject, unit }) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const subjectResult = await ensureSubject(subject, { createIfMissing: false });
  if (subjectResult.error) {
    logRoadmap('FETCH FAILED', subjectResult.error);
    return subjectResult;
  }
  const unitResult = await ensureUnit(subjectResult.data.id, unit, { createIfMissing: false });
  if (unitResult.error) {
    logRoadmap('FETCH FAILED', unitResult.error);
    return unitResult;
  }

  const topicResult = await supabase
    .from('topics')
    .select('*')
    .eq('subject_id', subjectResult.data.id)
    .eq('unit_id', unitResult.data.id)
    .order('created_at', { ascending: true })
    .order('display_order', { ascending: true });
  if (topicResult.error) {
    logRoadmap('FETCH FAILED', topicResult.error);
    return { data: null, error: topicResult.error };
  }
  logDb('Topics Loaded', { subjectId: subjectResult.data.id, unitId: unitResult.data.id, count: topicResult.data?.length || 0 });

  const topicIds = (topicResult.data || []).map((topic) => topic.id).filter(Boolean);
  const videoResult = topicIds.length
    ? await supabase
      .from('topic_videos')
      .select('*')
      .in('topic_id', topicIds)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (videoResult.error) {
    logRoadmap('FETCH FAILED', videoResult.error);
    return { data: null, error: videoResult.error };
  }

  const videos = videoResult.data || [];
  const topics = (topicResult.data || [])
    .sort((a, b) => {
      const created = String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return created || Number(a.display_order || 0) - Number(b.display_order || 0);
    })
    .map((topic, index) => {
      const legacyTopicId = topic.id;
      const topicVideos = videos
        .filter((video) => video.topic_id === topic.id)
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
        .map((video) => ({
          url: video.video_url || video.url || '',
          description: video.description || '',
          dbContentId: video.id,
        }));
      const finalVideos = topicVideos;
      return {
        id: legacyTopicId,
        dbContentId: topic.id,
        topicName: topic.topic_name || topic.title,
        name: topic.topic_name || topic.title,
        description: finalVideos[0]?.description || '',
        videos: finalVideos,
        youtubeUrl: finalVideos[0]?.url || '',
        youtubeUrls: finalVideos.map((video) => video.url).filter(Boolean),
        url: finalVideos[0]?.url || '',
        urls: finalVideos.map((video) => video.url).filter(Boolean),
        displayOrder: topic.display_order || index + 1,
        createdAt: topic.created_at || '',
        created_by: topic.created_by || '',
        created_by_role: topic.created_by_role || '',
      };
    });

  const data = {
    subjectId: subjectResult.data.id,
    unitId: unitResult.data.id,
    topics,
  };
  logRoadmap('Fetch Success', { subjectId: data.subjectId, unitId: data.unitId, topicCount: topics.length, databaseResponse: data });
  return {
    data,
    error: null,
  };
}

export async function saveLinkedContentItem(payload) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const activeBranch = getCurrentBranch(payload.branch || payload.subject?.branch);
  if (activeBranch && payload.subject?.branch && !isSameBranch(payload.subject.branch, activeBranch)) {
    return { data: null, error: new Error('Subject does not belong to the active branch.') };
  }
  const subjectResult = await ensureSubject(payload.subject);
  if (subjectResult.error) return subjectResult;
  const unitResult = await ensureUnit(subjectResult.data.id, payload.unit);
  if (unitResult.error) return unitResult;

  const result = await supabase
    .from('content_items')
    .insert({
      subject_id: subjectResult.data.id,
      unit_id: unitResult.data.id,
      content_type: payload.contentType,
      title: payload.title || payload.question || '',
      body: payload.body || payload.question || '',
      url: payload.url || '',
      metadata: {
        ...(payload.metadata || {}),
        branch: activeBranch || payload.metadata?.branch || null,
        topicTitle: payload.topicTitle || null,
        topicLegacyId: payload.topicLegacyId || null,
      },
      created_by: payload.createdBy || 'subadmin',
    })
    .select()
    .single();
  if (result.error) {
    logRoadmap('CONTENT SAVE FAILED', result.error);
  } else {
    logRoadmap('CONTENT SAVE SUCCESS', {
      subjectId: subjectResult.data.id,
      unitId: unitResult.data.id,
      contentId: result.data?.id,
      contentType: payload.contentType,
      databaseResponse: result.data,
    });
  }
  return result;
}

export async function fetchCurriculumStats(createdBy = null) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  if (createdBy) {
    return fetchCurriculumStatsForOwner(createdBy);
  }

  const [students, subjects, units, roadmapTopics, roadmapVideos, contentVideos, notes, pyqs, iqs] = await Promise.all([
    supabase.from('role_profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('subjects').select('*', { count: 'exact', head: true }),
    supabase.from('units').select('*', { count: 'exact', head: true }),
    supabase.from('topics').select('*', { count: 'exact', head: true }),
    supabase.from('topic_videos').select('*', { count: 'exact', head: true }),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'video'),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'note'),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'pyq'),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'iq'),
  ]);
  const error = [subjects, units, roadmapTopics, roadmapVideos, contentVideos, notes, pyqs, iqs].find((item) => item.error)?.error;
  if (error) return { data: null, error };
  return {
    data: {
      students: students.count || 0,
      subjects: subjects.count || 0,
      units: units.count || 0,
      topics: roadmapTopics.count || 0,
      notes: notes.count || 0,
      pyqs: pyqs.count || 0,
      iqs: iqs.count || 0,
      videos: (roadmapVideos.count || 0) + (contentVideos.count || 0),
      roadmapTopics: roadmapTopics.count || 0,
      roadmapVideos: roadmapVideos.count || 0,
    },
    error: null,
  };
}

async function fetchCurriculumStatsForOwner(createdBy) {
  const owner = String(createdBy);

  const { data: ownedSubjects, error: subjectErr } = await supabase
    .from('subjects')
    .select('id')
    .eq('created_by', owner);
  if (subjectErr) return { data: null, error: subjectErr };

  const subjectIds = (ownedSubjects || []).map((s) => s.id);
  if (!subjectIds.length) {
    return {
      data: {
        students: 0,
        subjects: 0,
        units: 0,
        topics: 0,
        notes: 0,
        pyqs: 0,
        iqs: 0,
        videos: 0,
        roadmapTopics: 0,
        roadmapVideos: 0,
      },
      error: null,
    };
  }

  const [units, topics, roadmapVideos, contentVideos, notes, pyqs, iqs] = await Promise.all([
    supabase.from('units').select('*', { count: 'exact', head: true }).in('subject_id', subjectIds),
    supabase.from('topics').select('*', { count: 'exact', head: true }).in('subject_id', subjectIds),
    supabase.from('topic_videos').select('*', { count: 'exact', head: true }).in('subject_id', subjectIds),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'video').eq('created_by', owner),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'note').eq('created_by', owner),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'pyq').eq('created_by', owner),
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'iq').eq('created_by', owner),
  ]);

  const error = [units, topics, roadmapVideos, contentVideos, notes, pyqs, iqs].find((item) => item.error)?.error;
  if (error) return { data: null, error };

  return {
    data: {
      students: 0,
      subjects: subjectIds.length,
      units: units.count || 0,
      topics: topics.count || 0,
      notes: notes.count || 0,
      pyqs: pyqs.count || 0,
      iqs: iqs.count || 0,
      videos: (roadmapVideos.count || 0) + (contentVideos.count || 0),
      roadmapTopics: topics.count || 0,
      roadmapVideos: roadmapVideos.count || 0,
    },
    error: null,
  };
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

  const { data: subjects, error } = await q;
  return { data: subjects || [], error };
}

export async function createSubject(subject) {

  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const row = normalizeSubject(subject);
  return supabase.from('subjects').insert(row).select().single();
}

export async function updateSubject(id, subject) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const row = normalizeSubject(subject);
  let query = supabase.from('subjects').update(row).eq('id', id);
  if (row.created_by) {
    query = query.eq('created_by', row.created_by);
  }
  return query.select().single();
}

export async function deleteSubject(id, createdBy = null) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  let query = supabase.from('subjects').delete().eq('id', id);
  if (createdBy) {
    query = query.eq('created_by', createdBy);
  }
  return query;
}

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


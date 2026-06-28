import { supabase } from '../services/supabase/client.js';
import { ensureSubject, ensureUnit } from '../services/curriculum/curriculumRepository.js';
import { deleteItem } from '../services/admin/adminStatsService.js';

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

async function deleteExistingRoadmapRows(subjectId, unitId) {
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

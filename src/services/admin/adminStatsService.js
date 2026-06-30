import { supabase } from '../supabase/client.js';

// Generic CRUD helper functions for admin modules

export function hasPermission(action, table) {
  try {
    const role = (APP && APP.role) || 'subadmin';
    if (role === 'subadmin') return true;
    if (action === 'delete' && role !== 'admin') return false;
    return true;
  } catch (e) {
    return false;
  }
}

export async function createItem(table, payload) {
  if (!hasPermission('create', table)) {
    return { data: null, error: new Error('Permission denied for creating items in ' + table) };
  }
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  return { data, error };
}

export async function fetchItems(table, query = {}) {
  if (!hasPermission('read', table)) {
    return { data: [], error: new Error('Permission denied for reading items from ' + table) };
  }
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  let q = supabase.from(table).select('*');
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) q = q.in(key, value);
    else q = q.eq(key, value);
  });
  const { data, error } = await q;
  return { data, error };
}

export const getItems = fetchItems;

export async function updateItem(table, id, payload) {
  if (!hasPermission('update', table)) {
    return { data: null, error: new Error('Permission denied for updating items in ' + table) };
  }
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
  return { data, error };
}

export async function deleteItem(table, id) {
  if (!hasPermission('delete', table)) {
    return { error: new Error('Permission denied for deleting items from ' + table) };
  }
  if (!supabase) return { error: new Error('Supabase not configured') };
  const { error } = await supabase.from(table).delete().eq('id', id);
  return { error };
}

async function fetchDashboardCountsRpc() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('get_dashboard_counts');
    if (!error) return Array.isArray(data) ? data[0] || {} : data || {};
    console.warn('adminStats get_dashboard_counts error:', error.message);
  } catch (error) {
    console.warn('adminStats get_dashboard_counts failed:', error?.message || error);
  }
  return null;
}

async function safeCount(table, configure = (query) => query) {
  if (!supabase) return 0;
  try {
    const result = await configure(supabase.from(table).select('*', { count: 'exact', head: true }));
    if (result.error) {
      console.warn(`adminStats ${table} count error:`, result.error.message);
      return 0;
    }
    return Number(result.count || 0);
  } catch (error) {
    console.warn(`adminStats ${table} count failed:`, error?.message || error);
    return 0;
  }
}

async function safeDistinctCount(table, column) {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase.from(table).select(column);
    if (error) {
      console.warn(`adminStats ${table}.${column} distinct error:`, error.message);
      return 0;
    }
    return new Set((data || []).map((row) => row?.[column]).filter(Boolean)).size;
  } catch (error) {
    console.warn(`adminStats ${table}.${column} distinct failed:`, error?.message || error);
    return 0;
  }
}

async function safeWorkshopParticipantCount() {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase.rpc('get_live_workshop_participant_count');
    if (!error) return Number(data || 0);
  } catch (error) {
    console.warn('adminStats workshop participant rpc failed:', error?.message || error);
  }
  return safeCount('live_workshop_registrations');
}

export async function fetchAdminDashboardStats() {
  if (!supabase) return null;

  const [
    rpcCounts,
    profiles,
    roleProfiles,
    studentProfiles,
    creatorProfiles,
    subAdminProfiles,
    subjects,
    branches,
    branchNames,
    semesterNames,
    units,
    topics,
    topicVideos,
    contentVideos,
    notes,
    pyqs,
    iqs,
    regulations,
    workshopParticipants,
  ] = await Promise.all([
    fetchDashboardCountsRpc(),
    safeCount('profiles'),
    safeCount('role_profiles'),
    safeCount('role_profiles', (query) => query.eq('role', 'student')),
    safeCount('role_profiles', (query) => query.in('role', ['content_creator', 'creator', 'teacher', 'subadmin', 'sub_admin'])),
    safeCount('role_profiles', (query) => query.in('role', ['subadmin', 'sub_admin'])),
    safeCount('subjects'),
    safeCount('branches'),
    safeDistinctCount('subjects', 'branch'),
    safeDistinctCount('subjects', 'semester'),
    safeCount('units'),
    safeCount('topics'),
    safeCount('topic_videos'),
    safeCount('content_items', (query) => query.eq('content_type', 'video')),
    safeCount('content_items', (query) => query.eq('content_type', 'note')),
    safeCount('content_items', (query) => query.eq('content_type', 'pyq')),
    safeCount('content_items', (query) => query.eq('content_type', 'iq')),
    safeCount('regulations'),
    safeWorkshopParticipantCount(),
  ]);

  const students = Number(rpcCounts?.students || studentProfiles || 0);
  const creators = Number(rpcCounts?.creators || creatorProfiles || 0);
  const subAdmins = Number(rpcCounts?.sub_admins || rpcCounts?.subAdmins || subAdminProfiles || 0);
  const users = Number(rpcCounts?.users || roleProfiles || profiles || students + creators + subAdmins || 0);

  return {
    students,
    creators,
    subAdmins,
    users,
    signups: users,
    subjects: Number(rpcCounts?.subjects || subjects || 0),
    universities: 0,
    branches: Number(rpcCounts?.branches || branches || branchNames || 0),
    semesters: Number(rpcCounts?.semesters || semesterNames || 0),
    units,
    topics,
    videos: topicVideos + contentVideos,
    notes,
    pyqs,
    iqs,
    regulations: Number(rpcCounts?.regulations || regulations || 0),
    workshopParticipants: Number(workshopParticipants || 0),
    storageUsage: '-',
    weeklyGrowth: '-',
    weeklyActivity: '-',
  };
}

export async function fetchLandingStats() {
  if (!supabase) {
    return {
      students: 0,
      creators: 0,
      subjects: 0,
      regulations: 0,
      users: 0,
      signups: 0,
      workshopParticipants: 0,
    };
  }

  const stats = await fetchAdminDashboardStats();
  return {
    students: Number(stats?.students || 0),
    creators: Number(stats?.creators || 0),
    subjects: Number(stats?.subjects || 0),
    regulations: Number(stats?.regulations || 0),
    users: Number(stats?.users || 0),
    signups: Number(stats?.signups || stats?.users || 0),
    workshopParticipants: Number(stats?.workshopParticipants || 0),
  };
}

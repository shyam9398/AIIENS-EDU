import {
  hasRemoteBackend,
  loadRemoteState,
  removeRemoteKey,
  saveRemoteKey,
} from './appState.js';

const PATCH_FLAG = '__aimeasyStorageBridgeInstalled';

let isHydrating = false;
const HYDRATION_TIMEOUT_MS = 1500;

// Initialize memory stores on window
if (!window.__aiiensMemoryStore) window.__aiiensMemoryStore = {};
if (!window.__aiiensSessionMemoryStore) window.__aiiensSessionMemoryStore = {};

function isAcademicKey(key) {
  if (typeof key !== 'string') return false;
  const allowedPreferences = [
    'theme', 'dark_mode', 'language', 'intro_hidden',
    'aimeasy_theme', 'aimeasy_dark_mode', 'aimeasy_language',
    'aimeasy_intro_hidden', 'aimeasy_splash_hidden', 'aiiens_theme',
    'aiiens_dark_mode', 'aiiens_language', 'aiiens_intro_hidden',
    'aiiens_splash_hidden', 'aimeasy_login_portal', 'aimeasy_login_portal_backup',
    'aimeasy_cached_regulations'
  ];

  if (allowedPreferences.includes(key)) return false;

  return key.startsWith('edusync_') || key.startsWith('aiiens_') || key.startsWith('aimeasy_');
}

function getMemoryStore(storageInstance) {
  if (storageInstance === window.localStorage) {
    return window.__aiiensMemoryStore;
  }
  if (storageInstance === window.sessionStorage) {
    return window.__aiiensSessionMemoryStore;
  }
  return null;
}

async function migrateLegacyLocalStateToRemote(remoteState = {}) {
  if (!hasRemoteBackend()) return;

  const keysToMigrate = [];
  const originalGetItem = Storage.prototype.getItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!isAcademicKey(key)) continue;

    const value = originalGetItem.call(window.localStorage, key);
    if (value != null) {
      const targetKey = key.replace(/^edusync_/, 'aiiens_');
      keysToMigrate.push({ from: key, to: targetKey, value });
    }
  }

  if (!keysToMigrate.length) return;

  await Promise.all(
    keysToMigrate.map(async ({ from, to, value }) => {
      await saveRemoteKey(to, value);
      window.__aiiensMemoryStore[to] = value;
      originalRemoveItem.call(window.localStorage, from);
    })
  );
  console.log('[AIM EASY backend] Migrated legacy local keys to Supabase and cleared from localStorage:', keysToMigrate.map((item) => item.to));
}

let resolveHydration;
window.__aiiensHydrationPromise = new Promise((resolve) => {
  resolveHydration = resolve;
});

export async function hydrateLegacyState() {
  if (!hasRemoteBackend()) {
    window.__AIMEASY_BACKEND_MODE__ = 'local';
    window.__aiiensStateHydrated = true;
    resolveHydration();
    return;
  }

  isHydrating = true;
  try {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      console.log('[LEGACY STORAGE BRIDGE] No user session found, skipping hydration.');
      window.__aiiensStateHydrated = true;
      resolveHydration();
      return;
    }

    console.log('[LEGACY STORAGE BRIDGE] Hydrating state from relational tables for user:', userId);

    // Fetch user profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (profile) {
      if (profile.role === 'student') {
        const university = profile.university_name || '';
        const branch = profile.branch_name || profile.branch || '';
        const regulation = profile.regulation_code || '';

        // Query subjects for this branch/regulation/university across all semesters
        const { data: subjects } = await supabase
          .from('subjects')
          .select('*')
          .eq('branch', branch)
          .eq('regulation_code', regulation)
          .eq('university_name', university);

        if (subjects && subjects.length) {
          const mappedSubjects = subjects.map(s => ({
            id: s.id,
            dbSubjectId: s.id,
            name: s.name,
            code: s.code || '',
            credits: parseInt(s.credits) || 3,
            semester: s.semester,
            university_name: s.university_name,
            branch: s.branch,
            regulation_code: s.regulation_code
          }));
          window.__aiiensMemoryStore['aiiens_custom_subjects'] = JSON.stringify(mappedSubjects);
        }

        // Fetch completed topics / reviews
        const { data: progressRows } = await supabase
          .from('student_topic_progress')
          .select('*')
          .eq('user_id', userId);

        const completedTopics = [];
        const markedReviews = [];

        (progressRows || []).forEach(row => {
          const key = `${row.subject_key}-${row.unit_key}-${row.topic_index}`;
          if (row.status === 'completed') {
            completedTopics.push(key);
          } else if (row.status === 'review') {
            markedReviews.push(key);
          }
        });

        window.__aiiensMemoryStore['aiiens_completed_topics'] = JSON.stringify(completedTopics);
        window.__aiiensMemoryStore[`aiiens_marked_reviews_${userId}`] = JSON.stringify(markedReviews);

        // Precompute completed units
        const [ { data: dbUnits }, { data: dbTopics } ] = await Promise.all([
          supabase.from('units').select('id, subject_id, sort_order'),
          supabase.from('topics').select('subject_id, unit_id')
        ]);

        const unitIdToNum = {};
        (dbUnits || []).forEach(u => {
          unitIdToNum[u.id] = u.sort_order;
        });

        const topicsCount = {};
        (dbTopics || []).forEach(t => {
          const unitNum = unitIdToNum[t.unit_id];
          if (unitNum !== undefined) {
            const key = `${t.subject_id}-${unitNum}`;
            topicsCount[key] = (topicsCount[key] || 0) + 1;
          }
        });

        const completedUnits = [];
        const completedTopicsGrouped = {};
        completedTopics.forEach(k => {
          const parts = k.split('-');
          if (parts.length >= 3) {
            const key = `${parts[0]}-${parts[1]}`;
            completedTopicsGrouped[key] = (completedTopicsGrouped[key] || 0) + 1;
          }
        });

        Object.entries(topicsCount).forEach(([key, total]) => {
          const completedCount = completedTopicsGrouped[key] || 0;
          if (completedCount >= total && total > 0) {
            completedUnits.push(key);
          }
        });

        window.__aiiensMemoryStore['aiiens_completed_units'] = JSON.stringify(completedUnits);

        // Fetch CGPA payload
        const { data: cgpaRows } = await supabase
          .from('student_cgpa_results')
          .select('*')
          .eq('user_id', userId)
          .order('calculated_at', { ascending: false });

        if (cgpaRows && cgpaRows.length > 0) {
          window.__aiiensMemoryStore['aiiens_cgpa_data'] = JSON.stringify(cgpaRows[0].payload);
        }
      } else if (profile.role === 'admin') {
        // Hydrate sub-admins list
        const { data: subadminProfiles } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'subadmin')
          .order('created_at', { ascending: false });

        const mappedSubadmins = (subadminProfiles || []).map(p => ({
          username: p.name || p.full_name || p.email.split('@')[0],
          password: '••••••••',
          branch: p.branch_name || p.branch || 'CSE',
          department: p.role_type === 'teacher' ? 'Academics' : 'Staff',
          regulation: p.regulation_code || '',
          university: p.university_name || '',
          permissions: ['subjects', 'units', 'content'],
          createdAt: p.created_at ? new Date(p.created_at).toLocaleString() : ''
        }));
        window.__aiiensMemoryStore['aiiens_subadmins'] = JSON.stringify(mappedSubadmins);
      }
    }
  } catch (error) {
    console.warn('[AIM EASY backend] Hydration failed:', error.message);
  } finally {
    isHydrating = false;
    window.__aiiensStateHydrated = true;
    resolveHydration();
  }

  window.__AIMEASY_BACKEND_MODE__ = 'supabase';
}

async function syncAcademicKeyToSupabase(key, value) {
  const supabase = window.__AIMEASY_SUPABASE__;
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    if (key === 'aiiens_cgpa_data') {
      const parsed = JSON.parse(value);
      let cgpaVal = 0;
      let percentageVal = 0;
      if (parsed && Array.isArray(parsed.calcSemesters)) {
        let totalCgpa = 0;
        let count = 0;
        parsed.calcSemesters.forEach(s => {
          if (s.cgpa) {
            totalCgpa += Number(s.cgpa);
            count++;
          }
        });
        if (count > 0) {
          cgpaVal = totalCgpa / count;
          percentageVal = (cgpaVal - 0.75) * 10;
        }
      }
      
      await supabase.from('student_cgpa_results').insert({
        user_id: userId,
        cgpa: cgpaVal,
        percentage: percentageVal,
        payload: parsed,
        calculated_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.warn('[STORAGE BRIDGE] Sync to database failed:', error.message || error);
  }
}

export function installLegacyStorageBridge() {
  if (window[PATCH_FLAG]) return;

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;
  const originalKey = Storage.prototype.key;

  Storage.prototype.getItem = function patchedGetItem(key) {
    const memStore = getMemoryStore(this);
    if (memStore && isAcademicKey(key)) {
      const targetKey = key.replace(/^edusync_/, 'aiiens_');
      return memStore[targetKey] !== undefined ? memStore[targetKey] : null;
    }
    return originalGetItem.call(this, key);
  };

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const memStore = getMemoryStore(this);
    if (memStore && isAcademicKey(key)) {
      const targetKey = key.replace(/^edusync_/, 'aiiens_');
      memStore[targetKey] = String(value);
      // Sync to database in background
      syncAcademicKeyToSupabase(targetKey, value);
      return;
    }
    originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    const memStore = getMemoryStore(this);
    if (memStore && isAcademicKey(key)) {
      const targetKey = key.replace(/^edusync_/, 'aiiens_');
      delete memStore[targetKey];
      // Block removing/syncing from remote database app_state for academic keys
      return;
    }
    originalRemoveItem.call(this, key);
  };

  Storage.prototype.clear = function patchedClear() {
    const memStore = getMemoryStore(this);
    if (memStore) {
      const keys = Object.keys(memStore);
      keys.forEach((key) => {
        delete memStore[key];
        // Block clear sync from remote database app_state for academic keys
      });
    }
    originalClear.call(this);
  };

  Storage.prototype.key = function patchedKey(index) {
    const memStore = getMemoryStore(this);
    if (memStore) {
      const localKeys = [];
      let i = 0;
      while (true) {
        const k = originalKey.call(this, i);
        if (k === null) break;
        localKeys.push(k);
        i++;
      }
      const memoryKeys = Object.keys(memStore);
      const mergedKeys = Array.from(new Set([...localKeys, ...memoryKeys]));
      return mergedKeys[index] !== undefined ? mergedKeys[index] : null;
    }
    return originalKey.call(this, index);
  };

  Object.defineProperty(Storage.prototype, 'length', {
    get() {
      const memStore = getMemoryStore(this);
      if (memStore) {
        const localKeys = [];
        let i = 0;
        while (true) {
          const k = originalKey.call(this, i);
          if (k === null) break;
          localKeys.push(k);
          i++;
        }
        const memoryKeys = Object.keys(memStore);
        const mergedKeys = new Set([...localKeys, ...memoryKeys]);
        return mergedKeys.size;
      }
      let i = 0;
      while (true) {
        if (originalKey.call(this, i) === null) break;
        i++;
      }
      return i;
    },
    configurable: true,
  });

  window[PATCH_FLAG] = true;
}

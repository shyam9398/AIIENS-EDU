import { supabase } from '../supabase/client.js';
import { getCurrentBranch, isSameBranch } from '../auth/branchContext.js';

function norm(s) {
  return String(s || '').toLowerCase();
}

function matches(q, ...fields) {
  const needle = norm(q);
  return fields.some((f) => norm(f).includes(needle));
}

export async function searchStudentContent(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const activeBranch = getCurrentBranch();

  const results = [];

  if (supabase) {
    let subjectQuery = supabase.from('subjects').select('id, name, code, semester, branch');
    if (activeBranch) subjectQuery = subjectQuery.eq('branch', activeBranch);
    const { data: subjects } = await subjectQuery;
    const subjectIds = (subjects || []).map((subject) => subject.id).filter(Boolean);
    (subjects || []).forEach((s) => {
      if (matches(q, s.name, s.code, s.branch, s.semester)) {
        results.push({ type: 'subject', label: s.name, sub: s.code, action: { kind: 'subject', id: s.id, name: s.name } });
      }
    });

    let itemQuery = supabase
      .from('content_items')
      .select('id, title, body, url, content_type, subject_id, unit_id')
      .or(`title.ilike.%${q}%,body.ilike.%${q}%,url.ilike.%${q}%`)
      .limit(40);
    if (activeBranch) {
      if (!subjectIds.length) itemQuery = null;
      else itemQuery = itemQuery.in('subject_id', subjectIds);
    }
    const { data: items } = itemQuery ? await itemQuery : { data: [] };

    (items || []).forEach((item) => {
      results.push({
        type: item.content_type,
        label: item.title || item.url || item.content_type,
        sub: item.content_type,
        action: { kind: 'content', item },
      });
    });
  }

  return results.slice(0, 30);
}

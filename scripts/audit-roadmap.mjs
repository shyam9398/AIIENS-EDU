import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

async function readEnv() {
  const text = await fs.readFile('.env.local', 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}

function compactRows(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    subject_id: row.subject_id,
    unit_id: row.unit_id,
    topic_id: row.topic_id,
    name: row.name || row.title || row.topic_name,
    sort_order: row.sort_order,
    display_order: row.display_order,
    video_url: row.video_url,
    description: row.description,
  }));
}

const env = await readEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

for (const table of ['subjects', 'units', 'topics', 'topic_videos']) {
  const { data, error, count } = await supabase.from(table).select('*', { count: 'exact' }).limit(20);
  console.log(`TABLE ${table} count=${count ?? 'unknown'}`);
  if (error) console.log(`ERROR ${error.code || ''} ${error.message || error}`);
  else console.log(JSON.stringify(compactRows(data), null, 2));
}

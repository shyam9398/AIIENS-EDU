import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');

async function parseEnv(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const [key, ...rest] = line.split('=');
          let value = rest.join('=');
          value = value.trim();
          if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
          }
          return [key.trim(), value];
        })
    );
  } catch (error) {
    throw new Error(`Unable to read .env.local: ${error.message}`);
  }
}

function formatError(error) {
  if (!error) return 'unknown error';
  return error.message || JSON.stringify(error);
}

async function main() {
  const env = await parseEnv(envFile);
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.from('app_state').select('key,value').limit(1);

  if (error) {
    console.error('Supabase connection reached, but app_state query failed.');
    console.error(`Error code: ${error.code}`);
    console.error(`Error message: ${formatError(error)}`);
    if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
      console.error('The table app_state is missing. Run supabase/schema.sql in your Supabase SQL editor.');
    }
    process.exitCode = 1;
    return;
  }

  console.log('Supabase is reachable and app_state is accessible.');
  console.log(`Rows returned: ${data?.length ?? 0}`);

  const requiredProfileColumns = [
    'id',
    'email',
    'role',
    'onboarding_completed',
    'full_name',
    'phone_number',
    'role_type',
    'qualification',
    'experience',
    'university_name',
    'regulation_code',
    'branch_name',
    'semester',
    'created_at',
    'updated_at',
  ];
  const profileCheck = await supabase.from('profiles').select(requiredProfileColumns.join(',')).limit(1);
  if (profileCheck.error) {
    console.error('Profiles schema check failed.');
    console.error(`Error code: ${profileCheck.error.code}`);
    console.error(`Error message: ${formatError(profileCheck.error)}`);
    console.error('Run supabase/schema.sql in your Supabase SQL editor.');
    process.exitCode = 1;
    return;
  }
  console.log('Profiles schema contains the required authentication and onboarding columns.');

  for (const table of ['subjects', 'units', 'topics', 'topic_videos', 'content_items']) {
    const tableCheck = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (tableCheck.error) {
      console.error(`Curriculum schema check failed for ${table}.`);
      console.error(`Error code: ${tableCheck.error.code}`);
      console.error(`Error message: ${formatError(tableCheck.error)}`);
      console.error('Run supabase/schema.sql in your Supabase SQL editor.');
      process.exitCode = 1;
      return;
    }
  }
  const topicsColumnCheck = await supabase
    .from('topics')
    .select('id,subject_id,unit_id,topic_name,display_order,created_at')
    .limit(1);
  if (topicsColumnCheck.error) {
    console.error('topics column check failed.');
    console.error(`Error code: ${topicsColumnCheck.error.code}`);
    console.error(`Error message: ${formatError(topicsColumnCheck.error)}`);
    console.error('Run supabase/migrations/20260601020000_create_topics_topic_videos.sql in your Supabase SQL editor.');
    process.exitCode = 1;
    return;
  }

  const topicVideosColumnCheck = await supabase
    .from('topic_videos')
    .select('id,topic_id,video_url,description,display_order,created_at')
    .limit(1);
  if (topicVideosColumnCheck.error) {
    console.error('topic_videos column check failed.');
    console.error(`Error code: ${topicVideosColumnCheck.error.code}`);
    console.error(`Error message: ${formatError(topicVideosColumnCheck.error)}`);
    console.error('Run supabase/migrations/20260601020000_create_topics_topic_videos.sql in your Supabase SQL editor.');
    process.exitCode = 1;
    return;
  }

  const [topicsSelect, topicVideosSelect] = await Promise.all([
    supabase.from('topics').select('*').limit(1),
    supabase.from('topic_videos').select('*').limit(1),
  ]);
  if (topicsSelect.error || topicVideosSelect.error) {
    console.error('Roadmap SELECT verification failed.');
    console.error(`topics: ${formatError(topicsSelect.error)}`);
    console.error(`topic_videos: ${formatError(topicVideosSelect.error)}`);
    process.exitCode = 1;
    return;
  }

  console.log('Curriculum schema contains subjects, units, topics, topic_videos, and content_items.');
  console.log('SELECT * FROM topics and SELECT * FROM topic_videos both execute successfully.');
}

main().catch((error) => {
  console.error('Failed to check Supabase:', error.message || error);
  process.exitCode = 1;
});

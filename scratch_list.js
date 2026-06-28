import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function parseEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
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
}

const env = parseEnv('.env.local');
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, anonKey);

async function main() {
  const { data: subjects, error: sErr } = await supabase.from('subjects').select('*');
  if (sErr) console.error("Subjects error:", sErr);
  else console.log("Subjects:", subjects);

  const { data: units, error: uErr } = await supabase.from('units').select('*');
  if (uErr) console.error("Units error:", uErr);
  else console.log("Units count:", units?.length, units);

  const { data: topics, error: tErr } = await supabase.from('topics').select('*');
  if (tErr) console.error("Topics error:", tErr);
  else console.log("Topics count:", topics?.length, topics);
}

main().catch(console.error);

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
  const filters = {
    semester: '3-2',
    university_name: 'JNTUK',
    branch: 'CSE',
    regulation_code: 'R23'
  };

  console.log("Subjects Filter Params:", filters);
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('semester', filters.semester)
    .eq('branch', filters.branch)
    .eq('regulation_code', filters.regulation_code)
    .eq('university_name', filters.university_name);

  if (error) {
    console.error("Query Error:", error);
  } else {
    console.log("Filtered Subjects Returned:", data);
  }
}

main().catch(console.error);

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');

async function parseEnv(filePath) {
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
}

async function main() {
  const env = await parseEnv(envFile);
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(url, anonKey);

  console.log('--- SUBADMIN AND ADMIN PROFILES ---');
  const { data: profiles, error: errorProf } = await supabase.from('profiles').select('*').in('role', ['subadmin', 'admin']);
  if (errorProf) {
    console.error('Error profiles:', errorProf);
  } else {
    console.log(profiles);
  }
}

main().catch(console.error);

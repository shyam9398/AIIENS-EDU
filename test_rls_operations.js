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
  console.log("--- TESTING SELECT ---");
  const { data: selectData, error: selectError } = await supabase
    .from('subjects')
    .select('*');
  console.log("SELECT success:", !selectError);
  console.log("SELECT count:", selectData ? selectData.length : 0);
  if (selectError) console.error("SELECT error:", selectError);

  console.log("\n--- TESTING INSERT ---");
  const { data: insertData, error: insertError } = await supabase
    .from('subjects')
    .insert({
      name: 'RLS Test Subject',
      code: 'RLS101',
      semester: '1-2',
      branch: 'CSE',
      regulation_code: 'R23',
      university_name: 'JNTUK',
      created_by: 'student'
    })
    .select();
  console.log("INSERT success:", !insertError);
  console.log("INSERT data:", insertData);
  if (insertError) console.log("INSERT error:", insertError.message);

  console.log("\n--- TESTING UPDATE ---");
  const { data: updateData, error: updateError } = await supabase
    .from('subjects')
    .update({ name: 'RLS Updated' })
    .eq('code', 'OP021')
    .select();
  console.log("UPDATE success:", !updateError);
  console.log("UPDATE data:", updateData);
  if (updateError) console.log("UPDATE error:", updateError.message);

  console.log("\n--- TESTING DELETE ---");
  const { error: deleteError } = await supabase
    .from('subjects')
    .delete()
    .eq('code', 'OP021');
  console.log("DELETE success:", !deleteError);
  if (deleteError) console.log("DELETE error:", deleteError.message);
}

main().catch(console.error);

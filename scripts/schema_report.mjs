import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
  const env = await parseEnv(envPath);
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

  const tables = [
    'subjects', 'units', 'roadmap_topics', 'notes', 'pyqs', 'important_questions', 'profiles', 'users', 'topics', 'topic_videos', 'content_items'
  ];

  const report = {};

  for (const table of tables) {
    // Try a lightweight head query to see if table exists
    const { error, count } = await supabase.from(table).select('*', { head: true, count: 'exact' });
    if (error) {
      report[table] = { exists: false, error: error.message };
      continue;
    }
    report[table] = { exists: true, rowCount: count };

    // Columns
    const { data: cols, error: colErr } = await supabase
      .from('information_schema.columns')
      .select('column_name,data_type,is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', table);
    if (!colErr) report[table].columns = cols;

    // Primary key
    const { data: pk, error: pkErr } = await supabase
      .from('information_schema.table_constraints')
      .select('constraint_name')
      .eq('table_schema', 'public')
      .eq('table_name', table)
      .eq('constraint_type', 'PRIMARY KEY');
    if (!pkErr && pk.length) {
      const pkName = pk[0].constraint_name;
      const { data: pkCols, error: pkColsErr } = await supabase
        .from('information_schema.key_column_usage')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', table)
        .eq('constraint_name', pkName);
      if (!pkColsErr) report[table].primaryKey = pkCols.map((c) => c.column_name);
    }

    // Foreign keys
    const { data: fks, error: fkErr } = await supabase
      .from('information_schema.referential_constraints')
      .select('constraint_name')
      .eq('constraint_schema', 'public')
      .eq('constraint_name', table); // placeholder, will be filtered later
    if (!fkErr) {
      // Simplify: fetch all constraints where table_name matches
      const { data: allFks, error: allFkErr } = await supabase
        .from('information_schema.table_constraints')
        .select('constraint_name')
        .eq('table_schema', 'public')
        .eq('table_name', table)
        .eq('constraint_type', 'FOREIGN KEY');
      if (!allFkErr && allFks.length) {
        const fkDetails = [];
        for (const fk of allFks) {
          const { data: cols, error: colErr2 } = await supabase
            .from('information_schema.key_column_usage')
            .select('column_name')
            .eq('table_schema', 'public')
            .eq('table_name', table)
            .eq('constraint_name', fk.constraint_name);
          if (!colErr2) {
            fkDetails.push({ name: fk.constraint_name, columns: cols.map((c) => c.column_name) });
          }
        }
        report[table].foreignKeys = fkDetails;
      }
    }

    // RLS policies (Postgres specific view pg_policy)
    const { data: policies, error: polErr } = await supabase.from('pg_policy').select('*').eq('schemaname', 'public').eq('tablename', table);
    if (!polErr && policies.length) {
      report[table].rlsPolicies = policies.map((p) => ({ name: p.polname, role: p.role, cmd: p.cmd, using: p.qual, withCheck: p.with_check }));
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => console.error('Script error', e));

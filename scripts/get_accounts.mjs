import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: admins, error: errA } = await supabase.from('admin_accounts').select('*');
  console.log('--- ADMIN ACCOUNTS ---');
  if (errA) console.error(errA);
  else console.log(admins);

  const { data: subadmins, error: errS } = await supabase.from('sub_admin_accounts').select('*');
  console.log('--- SUBADMIN ACCOUNTS ---');
  if (errS) console.error(errS);
  else console.log(subadmins);
}
main();

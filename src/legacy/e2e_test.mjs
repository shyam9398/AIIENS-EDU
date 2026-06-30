import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runE2ETest() {
  console.log('--- STARTING E2E TEST ---');

  // 1. Create a brand new subject from Sub-Admin (simulated via API)
  console.log('1. Sub-Admin creating Subject...');
  const { data: subject, error: subErr } = await supabase.from('subjects').insert({
    name: 'E2E Test Subject',
    code: 'E2E101',
    semester: '3-1',
    branch: 'CSE',
    university_name: 'JNTUK',
    regulation_code: 'R23'
  }).select().single();
  if (subErr) return console.error('Failed to create subject:', subErr);
  console.log('✅ Supabase row created (Subject):', subject.id);

  // 2. Create Unit
  console.log('2. Sub-Admin creating Unit...');
  const { data: unit, error: unitErr } = await supabase.from('units').insert({
    subject_id: subject.id,
    title: 'Unit 1: E2E Testing Basics',
    sort_order: 1
  }).select().single();
  if (unitErr) return console.error('Failed to create unit:', unitErr);
  console.log('✅ Supabase row created (Unit):', unit.id);

  // 3. Create Topic
  console.log('3. Sub-Admin creating Topic...');
  const { data: topic, error: topicErr } = await supabase.from('topics').insert({
    subject_id: subject.id,
    unit_id: unit.id,
    topic_name: 'Introduction to E2E',
    display_order: 1
  }).select().single();
  if (topicErr) return console.error('Failed to create topic:', topicErr);
  console.log('✅ Supabase row created (Topic):', topic.id);

  // 4. Create Video (Roadmap)
  console.log('4. Sub-Admin creating Video...');
  const { data: video, error: vidErr } = await supabase.from('topic_videos').insert({
    topic_id: topic.id,
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'E2E Video Tutorial',
    display_order: 1
  }).select().single();
  if (vidErr) return console.error('Failed to create video:', vidErr);
  console.log('✅ Supabase row created (Video):', video.id);

  // 5. Create Note
  console.log('5. Sub-Admin creating Note...');
  const { data: note, error: noteErr } = await supabase.from('content_items').insert({
    subject_id: subject.id,
    unit_id: unit.id,
    content_type: 'note',
    title: 'E2E Test PDF',
    url: 'https://example.com/test.pdf'
  }).select().single();
  if (noteErr) return console.error('Failed to create note:', noteErr);
  console.log('✅ Supabase row created (Note):', note.id);

  // 6. Student Query Simulation
  console.log('\n--- SIMULATING STUDENT LOGIN ---');
  console.log('Student Profile: JNTUK, CSE, R23, 3-1');
  
  const { data: studentSubjects, error: ssErr } = await supabase.from('subjects')
    .select('id, name, code')
    .eq('branch', 'CSE')
    .eq('semester', '3-1')
    .eq('university_name', 'JNTUK')
    .eq('regulation_code', 'R23');
    
  if (ssErr) return console.error('Student query failed:', ssErr);
  
  const foundSubject = studentSubjects.find(s => s.id === subject.id);
  if (foundSubject) {
    console.log('✅ Student Query Result: Subject Found!', foundSubject);
  } else {
    console.error('❌ Student Query Result: Subject NOT Found!');
  }

  // 7. Cleanup
  console.log('\nCleaning up test data...');
  await supabase.from('subjects').delete().eq('id', subject.id);
  console.log('✅ Test Data Cleaned up');
}

runE2ETest();

import { createClient } from '@supabase/supabase-js';

const FRIENDLY_ERROR = "Sorry, I'm unable to answer right now. Please try again later.";
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const IS_DEV = process.env.NODE_ENV !== 'production';

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function cleanText(value, limit = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function rowText(row) {
  if (!row || typeof row !== 'object') return '';
  return Object.values(row)
    .map((value) => {
      if (value == null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
    .join(' ');
}

function queryTerms(message) {
  return Array.from(new Set(cleanText(message, 300).toLowerCase().match(/[a-z0-9]{3,}/g) || []))
    .filter((term) => !['what', 'when', 'where', 'which', 'with', 'from', 'this', 'that', 'about', 'please'].includes(term))
    .slice(0, 8);
}

function scoreRow(row, terms) {
  const text = rowText(row).toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function formatContext(label, rows, mapper) {
  if (!rows.length) return '';
  const lines = rows.slice(0, 8).map(mapper).filter(Boolean);
  return lines.length ? `${label}:\n${lines.join('\n')}` : '';
}

async function readTable(supabase, table, select, orderColumn) {
  try {
    let query = supabase.from(table).select(select).limit(80);
    if (orderColumn) query = query.order(orderColumn, { ascending: false });
    const { data, error } = await query;
    if (error) {
      console.warn(`[CHAT] Supabase ${table} load failed:`, error.message || error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`[CHAT] Supabase ${table} exception:`, error?.message || error);
    return [];
  }
}

async function loadSupabaseContext(message) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[CHAT] Supabase context skipped: missing Supabase URL or anon key.');
    return '';
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const terms = queryTerms(message);

  const [subjects, units, topics, videos, contentItems, workshops] = await Promise.all([
    readTable(supabase, 'subjects', 'id,name,code,semester,branch,regulation_code,university_name', 'created_at'),
    readTable(supabase, 'units', 'id,subject_id,title,sort_order', 'created_at'),
    readTable(supabase, 'topics', 'id,subject_id,unit_id,topic_name,display_order', 'created_at'),
    readTable(supabase, 'topic_videos', 'id,topic_id,video_url,description,display_order', 'created_at'),
    readTable(supabase, 'content_items', 'id,subject_id,unit_id,content_type,title,body,url,metadata,created_at', 'created_at'),
    readTable(supabase, 'live_workshops', 'id,workshop_name,speaker_name,workshop_date,workshop_time,description,status', 'created_at'),
  ]);

  const rank = (rows) => rows
    .map((row) => ({ row, score: scoreRow(row, terms) }))
    .filter((entry) => !terms.length || entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.row);

  const rankedSubjects = rank(subjects);
  const rankedUnits = rank(units);
  const rankedTopics = rank(topics);
  const rankedVideos = rank(videos);
  const rankedContent = rank(contentItems);
  const rankedWorkshops = rank(workshops.filter((row) => row.status === 'published' || scoreRow(row, terms) > 0));

  const sections = [
    formatContext('Subjects', rankedSubjects, (row) => `- ${cleanText(row.name)} (${cleanText(row.code || row.branch || row.semester)})`),
    formatContext('Units', rankedUnits, (row) => `- ${cleanText(row.title)} (subject ${row.subject_id}, unit ${row.id})`),
    formatContext('Learning Roadmap Topics', rankedTopics, (row) => `- ${cleanText(row.topic_name)} (subject ${row.subject_id}, unit ${row.unit_id})`),
    formatContext('Topic Videos', rankedVideos, (row) => `- ${cleanText(row.description || row.video_url)} (${cleanText(row.video_url, 220)})`),
    formatContext('Notes, PYQs, Important Questions, Assignments, Reference Materials, SkillUp', rankedContent, (row) => {
      const meta = typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata || {});
      return `- [${cleanText(row.content_type)}] ${cleanText(row.title || row.url)}: ${cleanText(row.body || meta || row.url, 500)}`;
    }),
    formatContext('Workshops', rankedWorkshops, (row) => `- ${cleanText(row.workshop_name)} by ${cleanText(row.speaker_name)} on ${cleanText(row.workshop_date)}: ${cleanText(row.description, 400)}`),
  ].filter(Boolean);

  const context = cleanText(sections.join('\n\n'), 9000);
  console.log('[CHAT] Supabase context loaded:', { sections: sections.length, size: context.length });
  return context;
}

function buildPrompt(message, context) {
  return [
    'You are AIIENS Edu AI, a helpful study assistant for engineering students.',
    'Answer clearly, educationally, and concisely. Use the provided AIIENS Supabase context when it is relevant.',
    'If context is not relevant or missing, answer using general knowledge.',
    'Do not invent database records, dates, links, or student progress.',
    context ? `AIIENS context:\n${context}` : 'AIIENS context: No relevant records were found.',
    `Student question: ${cleanText(message, 2000)}`,
  ].join('\n\n');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const { message } = parseBody(req);
  const cleanMessage = cleanText(message, 2000);

  console.log('[CHAT] Incoming user message:', cleanMessage.slice(0, 220));
  console.log('[CHAT] Gemini API key status:', apiKey ? `loaded (${apiKey.slice(0, 4)}...${apiKey.slice(-4)})` : 'missing');

  if (!cleanMessage) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  if (!apiKey) {
    const messageText = 'Gemini API key is missing. Set GEMINI_API_KEY or VITE_GEMINI_API_KEY on the server.';
    console.error('[CHAT]', messageText);
    res.status(IS_DEV ? 500 : 200).json(IS_DEV ? { error: messageText } : { answer: FRIENDLY_ERROR });
    return;
  }

  try {
    let context = '';
    try {
      context = await loadSupabaseContext(cleanMessage);
    } catch (contextError) {
      console.warn('[CHAT] Supabase context failed; continuing without context:', contextError?.message || contextError);
    }
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(cleanMessage, context) }] }],
      generationConfig: { maxOutputTokens: 900 },
    };
    console.log('[CHAT] Gemini request start:', { model: MODEL, bodySize: JSON.stringify(requestBody).length });
    console.log('[CHAT] Gemini request body:', JSON.stringify(requestBody));
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody),
      },
    );

    console.log('[CHAT] Gemini response status:', geminiResponse.status, geminiResponse.statusText);

    const rawText = await geminiResponse.text();
    if (!geminiResponse.ok) {
      console.error('[CHAT] Gemini error response:', rawText);
      res.status(IS_DEV ? geminiResponse.status : 200).json(IS_DEV ? { error: rawText || geminiResponse.statusText } : { answer: FRIENDLY_ERROR });
      return;
    }

    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseError) {
      console.error('[CHAT] Gemini JSON parse failed:', parseError?.message || parseError, rawText);
      res.status(IS_DEV ? 502 : 200).json(IS_DEV ? { error: 'Gemini returned invalid JSON.' } : { answer: FRIENDLY_ERROR });
      return;
    }
    console.log('[CHAT] Gemini response:', JSON.stringify(data).slice(0, 4000));
    const answer = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('\n')
      .trim();

    if (!answer) {
      console.error('[CHAT] Gemini returned no candidate text:', JSON.stringify(data).slice(0, 2000));
      res.status(IS_DEV ? 502 : 200).json(IS_DEV ? { error: 'Gemini returned an empty answer.' } : { answer: FRIENDLY_ERROR });
      return;
    }

    console.log('[CHAT] Parsed answer:', answer.slice(0, 1000));
    console.log('[CHAT] Final response returned to frontend.');
    res.status(200).json({ answer });
  } catch (error) {
    console.error('[CHAT] Unhandled exception:', error?.stack || error?.message || error);
    res.status(IS_DEV ? 500 : 200).json(IS_DEV ? { error: error?.message || 'Chat request failed.' } : { answer: FRIENDLY_ERROR });
  }
}

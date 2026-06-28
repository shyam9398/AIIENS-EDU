import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
          persistSession: true,
        },
      })
    : null;

if (typeof window !== 'undefined') {
  if (window.location.search.includes('mock_user=clear')) {
    localStorage.removeItem('mock_user');
    localStorage.removeItem('mock_workshop_registered');
    console.log('[AUTH MOCK] Cleared workshop mock.');
  } else if (window.location.search.includes('mock_user=workshop') || localStorage.getItem('mock_user') === 'workshop') {
    localStorage.setItem('mock_user', 'workshop');
    if (supabase) {
      console.log('[AUTH MOCK] Intercepting Supabase for workshop flow testing.');
      const mockUser = {
        id: 'd9bfa212-3269-42ec-a059-ea16027e0258',
        email: 'workshop_test@example.com',
        user_metadata: { full_name: 'Workshop Tester' }
      };
      const mockSession = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        user: mockUser,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };
      supabase.auth.getSession = async () => ({ data: { session: mockSession }, error: null });
      supabase.auth.getUser = async () => ({ data: { user: mockUser }, error: null });
      supabase.auth.onAuthStateChange = (callback) => {
        setTimeout(() => callback('SIGNED_IN', mockSession), 0);
        return { data: { subscription: { unsubscribe: () => {} } } };
      };

      const originalFrom = supabase.from;
      supabase.from = function(tableName) {
        if (['live_workshop_registrations', 'live_workshops', 'live_workshop_banners'].includes(tableName)) {
          const builder = {
            select: function() { return this; },
            eq: function() { return this; },
            is: function() { return this; },
            order: function() { return this; },
            limit: function() { return this; },
            maybeSingle: async function() {
              if (tableName === 'live_workshop_registrations') {
                const hasReg = localStorage.getItem('mock_workshop_registered') === 'true';
                if (hasReg) {
                  return {
                    data: {
                      id: 'mock_reg_id',
                      user_id: 'd9bfa212-3269-42ec-a059-ea16027e0258',
                      name: 'Workshop Tester',
                      mobile_number: '9876543210',
                      role_type: 'student',
                      college_name: 'Mock University'
                    },
                    error: null
                  };
                }
                return { data: null, error: null };
              }
              if (tableName === 'live_workshop_banners') {
                return {
                  data: {
                    id: 'mock_banner_id',
                    banner_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
                    is_active: true,
                  },
                  error: null
                };
              }
              return { data: null, error: null };
            },
            then: function(resolve, reject) {
              if (tableName === 'live_workshops') {
                resolve({
                  data: [
                    {
                      id: 'mock_ws_1',
                      workshop_name: 'Introduction to Advanced Agentic AI Development',
                      speaker_name: 'Dr. Evelyn Vance',
                      workshop_date: '2026-06-20',
                      workshop_time: '14:00:00',
                      description: 'Learn the fundamentals of creating autonomous agents, multi-agent coordination, and sandbox environments.',
                      join_link: 'https://example.com/join-workshop-1',
                      status: 'published'
                    },
                    {
                      id: 'mock_ws_2',
                      workshop_name: 'Mastering Next.js & Supabase for Modern Apps',
                      speaker_name: 'Marcus Chen',
                      workshop_date: '2026-06-25',
                      workshop_time: '18:30:00',
                      description: 'A deep dive into SSR, server actions, connection pooling, and Row Level Security.',
                      join_link: 'https://example.com/join-workshop-2',
                      status: 'published'
                }
                  ],
                  error: null
                });
                return;
              }
              this.maybeSingle().then(resolve, reject);
            },
            insert: async function(row) {
              localStorage.setItem('mock_workshop_registered', 'true');
              return { data: [row], error: null };
            },
            update: async function(row) {
              return { data: [row], error: null };
            }
          };
          return builder;
        }
        return originalFrom.apply(this, arguments);
      };
    }
  }
}

console.log('[AUTH] Supabase client config', {
  configured: Boolean(supabase),
  persistSession: true,
  autoRefreshToken: true,
  flowType: 'pkce',
  detectSessionInUrl: false,
});


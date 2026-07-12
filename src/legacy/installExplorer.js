const EXPLORER_FIELDS = 'id,title,description,category,company_name,banner_url,apply_url,start_date,end_date,eligibility,tags,status,is_published,created_by,created_at,updated_at';
const EXPLORER_CATEGORIES = ['Internships', 'Hackathons', 'Free Certifications', 'Workshops', 'Competitions', 'Bootcamps', 'Tech Events', 'Scholarships'];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const escapeAttr = escapeHtml;

async function explorerClientAndUser() {
  const supabase = window.__AIMEASY_SUPABASE__;
  const { data } = await supabase?.auth?.getUser?.() || {};
  return { supabase, user: data?.user || null };
}

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const diff = Math.floor((Date.now() - then.getTime()) / 1000);
  if (diff < 60) return `Posted ${diff} seconds ago`;
  if (diff < 3600) return `Posted ${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `Posted ${Math.floor(diff / 3600)} hours ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}

function explorerCard(post, creator = false) {
  const published = Boolean(post.is_published) || post.status === 'published';
  const deadline = post.end_date ? `Ends: ${escapeHtml(post.end_date)}` : '';
  const posted = timeAgo(post.created_at);
  const action = creator
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="btn btn-ghost btn-sm" onclick="editExplorerPost('${post.id}')">Edit</button><button class="btn btn-ghost btn-sm" onclick="toggleExplorerPost('${post.id}',${!published})">${published ? 'Unpublish' : 'Publish'}</button><button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="deleteExplorerPost('${post.id}')">Delete</button></div>`
    : `<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-ghost btn-sm" onclick="viewExplorerPost('${post.id}')">Details</button><a class="btn btn-primary btn-sm" href="${escapeAttr(post.apply_url || '#')}" target="_blank" rel="noreferrer">Apply</a></div>`;
  return `<article class="explore-card" data-explorer-id="${post.id}" style="overflow:hidden;border-radius:10px;">
    ${post.banner_url ? `<div style="height:140px;background-image:url('${escapeAttr(post.banner_url)}');background-size:cover;background-position:center;border-radius:10px 10px 0 0;"></div>` : ''}
    <div style="padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(post.title)}</div>
          <div style="font-size:0.85rem;color:var(--text3);">${escapeHtml(post.company_name || 'Opportunity')} · <span style="font-weight:600;">${escapeHtml(post.category)}</span></div>
        </div>
        <div style="text-align:right;font-size:0.82rem;color:var(--text3);">${escapeHtml(deadline)}<div style="margin-top:6px;color:var(--text2);font-size:0.78rem;">${escapeHtml(posted)}</div></div>
      </div>
      <p style="font-size:.86rem;color:var(--text2);margin:10px 0 0 0;line-height:1.4;">${escapeHtml(post.description || '').slice(0, 220)}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
        <div><span class="badge badge-teal">${escapeHtml(post.category)}</span> ${published ? '<span class="badge badge-green">Published</span>' : '<span class="badge badge-amber">Unpublished</span>'}</div>
        ${action}
      </div>
    </div>
  </article>`;
}

async function fetchExplorerPosts({ mine = false, published = false } = {}) {
  const { supabase, user } = await explorerClientAndUser();
  if (!supabase) return [];
  let query = supabase.from('explorer_posts').select(EXPLORER_FIELDS).order('created_at', { ascending: false });
  if (mine) query = query.eq('created_by', user?.id || '');
  if (published) query = query.eq('is_published', true);
  const { data, error } = await query;
  if (error) throw error;
  const now = new Date();
  // Filter out expired posts (end_date before today)
  return (data || []).filter((p) => {
    if (!p.end_date) return true;
    const end = new Date(p.end_date + 'T23:59:59');
    return end >= now;
  });
}

function creatorExplorerForm(post = {}) {
  const categoryOptions = EXPLORER_CATEGORIES.map((category) => `<option ${post.category === category ? 'selected' : ''}>${category}</option>`).join('');
  return `<form id="explorer-post-form" class="card" style="padding:1rem;margin-bottom:1rem;">
    <input type="hidden" name="id" value="${escapeAttr(post.id || '')}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
    <input class="input" required name="title" placeholder="Title" value="${escapeAttr(post.title || '')}"><select class="select" name="category">${categoryOptions}</select><input class="input" name="company_name" placeholder="Company / Organizer" value="${escapeAttr(post.company_name || '')}"><input class="input" type="url" name="apply_url" required placeholder="Apply URL" value="${escapeAttr(post.apply_url || '')}"><input class="input" type="url" name="banner_url" placeholder="Banner image URL" value="${escapeAttr(post.banner_url || '')}"><input class="input" type="date" name="start_date" value="${escapeAttr(post.start_date || '')}"><input class="input" type="date" name="end_date" value="${escapeAttr(post.end_date || '')}"><input class="input" name="eligibility" placeholder="Eligibility" value="${escapeAttr(post.eligibility || '')}"><input class="input" name="tags" placeholder="Tags (comma separated)" value="${escapeAttr(Array.isArray(post.tags) ? post.tags.join(', ') : post.tags || '')}"></div><textarea class="input" style="width:100%;min-height:80px;margin-top:10px;" name="description" placeholder="Description">${escapeHtml(post.description || '')}</textarea><div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-primary" type="submit">${post.id ? 'Save changes' : 'Create post'}</button>${post.id ? '<button class="btn btn-ghost" type="button" onclick="renderCreatorExplorer()">Cancel</button>' : ''}</div></form>`;
}

export function installExplorer() {
  let explorerChannel = null;
  const subscribeExplorerUpdates = async () => {
    const { supabase } = await explorerClientAndUser();
    if (!supabase || explorerChannel) return;
    explorerChannel = supabase.channel('explorer-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'explorer_posts' }, () => {
        if (document.getElementById('page-explorer')?.style.display !== 'none') window.renderStudentExplorer();
        if (document.getElementById('cr-nav-explorer')?.classList.contains('active')) window.renderCreatorExplorer();
      })
      .subscribe();
  };
  subscribeExplorerUpdates();
  const originalCreatorSwitch = window.switchCRSection;
  window.switchCRSection = globalThis.switchCRSection = function explorerCreatorSwitch(section) {
    if (section !== 'explorer') return originalCreatorSwitch?.(section);
    window.closeCRSidebar?.();
    document.querySelectorAll('[id^="cr-nav-"]').forEach((item) => item.classList.remove('active'));
    document.getElementById('cr-nav-explorer')?.classList.add('active');
    const title = document.getElementById('cr-topbar-title');
    if (title) title.textContent = 'Explorer';
    return window.renderCreatorExplorer();
  };

  const originalNavigate = window.navigateTo;
  window.navigateTo = globalThis.navigateTo = function explorerNavigate(page) {
    const result = originalNavigate?.(page);
    if (page === 'explorer') window.renderStudentExplorer();
    return result;
  };

  window.renderCreatorExplorer = async function renderCreatorExplorer(editing = null) {
    const root = document.getElementById('cr-content');
    if (!root) return;
    root.innerHTML = `<div class="admin-section-head" style="margin-bottom:1rem;"><div><h2>Explorer</h2><p>Publish opportunities for students.</p></div><button class="btn btn-primary" onclick="renderCreatorExplorer({})">Create opportunity</button></div>${editing !== null ? creatorExplorerForm(editing) : ''}<div id="creator-explorer-list" class="subject-grid">Loading…</div>`;
    try {
      const posts = await fetchExplorerPosts({ mine: true });
      const list = document.getElementById('creator-explorer-list');
      if (list) list.innerHTML = posts.length ? posts.map((post) => explorerCard(post, true)).join('') : '<div class="empty-state-card">No Explorer posts yet.</div>';
    } catch (error) { window.showToast?.(`Unable to load Explorer: ${error.message}`, 'red'); }
    document.getElementById('explorer-post-form')?.addEventListener('submit', saveExplorerPost);
  };

  window.editExplorerPost = async (id) => {
    const posts = await fetchExplorerPosts({ mine: true });
    window.renderCreatorExplorer(posts.find((post) => post.id === id) || {});
  };
  window.deleteExplorerPost = async (id) => {
    const { supabase, user } = await explorerClientAndUser();
    if (!supabase || !user) return window.showToast?.('Please sign in again to manage posts.', 'red');
    const { error } = await supabase.from('explorer_posts').delete().eq('id', id).eq('created_by', user.id);
    if (error) return window.showToast?.(`Unable to delete post: ${error.message}`, 'red');
    window.renderCreatorExplorer();
    if (document.getElementById('page-explorer')?.style.display !== 'none') window.renderStudentExplorer();
  };
  window.toggleExplorerPost = async (id, publish) => {
    const { supabase, user } = await explorerClientAndUser();
    if (!supabase || !user) return window.showToast?.('Please sign in again to manage posts.', 'red');
    const { error } = await supabase.from('explorer_posts').update({ is_published: publish, status: publish ? 'published' : 'unpublished', updated_at: new Date().toISOString() }).eq('id', id).eq('created_by', user.id);
    if (error) return window.showToast?.(`Unable to update post: ${error.message}`, 'red');
    window.renderCreatorExplorer();
    if (document.getElementById('page-explorer')?.style.display !== 'none') window.renderStudentExplorer();
  };

  async function saveExplorerPost(event) {
    event.preventDefault();
    const { supabase, user } = await explorerClientAndUser();
    if (!supabase || !user) return window.showToast?.('Please sign in again to save a post.', 'red');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const row = { title: values.title.trim(), description: values.description.trim(), category: values.category, company_name: values.company_name.trim() || null, banner_url: values.banner_url.trim() || null, apply_url: values.apply_url.trim(), start_date: values.start_date || null, end_date: values.end_date || null, eligibility: values.eligibility.trim() || null, tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean), updated_at: new Date().toISOString() };
    const request = values.id ? supabase.from('explorer_posts').update(row).eq('id', values.id).eq('created_by', user.id) : supabase.from('explorer_posts').insert({ ...row, created_by: user.id, status: 'unpublished', is_published: false });
    const { error } = await request;
    if (error) return window.showToast?.(`Unable to save post: ${error.message}`, 'red');
    window.renderCreatorExplorer();
    if (document.getElementById('page-explorer')?.style.display !== 'none') window.renderStudentExplorer();
  }

  window.renderStudentExplorer = async function renderStudentExplorer() {
    const root = document.getElementById('page-explorer');
    if (!root) return;
    root.innerHTML = `
      <div style="margin-bottom:1rem;">
        <h2 class="explorer-title"><span aria-hidden="true">🧭</span> Explorer</h2>
        <p style="font-size:.82rem;color:var(--text3);">Discover published opportunities.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <input id="explorer-search" class="input" style="flex:1;max-width:420px;" placeholder="Search opportunities">
      </div>
      <div id="explorer-categories" class="explorer-category-pills">
        ${['All', ...EXPLORER_CATEGORIES].map(cat => `<button class="explorer-category-pill" data-category="${cat}">${cat}</button>`).join('')}
      </div>
      <div id="student-explorer-list" class="explorer-grid">Loading…</div>`;
    try {
      const posts = await fetchExplorerPosts({ published: true });
      const searchEl = document.getElementById('explorer-search');
      const categoryContainer = document.getElementById('explorer-categories');
      const draw = () => {
        const search = searchEl?.value.toLowerCase() || '';
        const active = categoryContainer?.querySelector('.explorer-category-pill.active')?.dataset?.category || 'All';
        const filtered = posts.filter((post) => {
          if (active && active !== 'All' && post.category !== active) return false;
          return `${post.title} ${post.description} ${post.company_name}`.toLowerCase().includes(search);
        });
        const list = document.getElementById('student-explorer-list');
        if (list) list.innerHTML = filtered.length ? filtered.map((post) => explorerCard(post)).join('') : '<div class="empty-state-card">No matching opportunities.</div>';
      };
      searchEl?.addEventListener('input', draw);
      categoryContainer?.addEventListener('click', (e) => {
        const btn = e.target.closest('.explorer-category-pill');
        if (!btn) return;
        categoryContainer.querySelectorAll('.explorer-category-pill').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        draw();
      });
      // Activate first chip
      const first = categoryContainer.querySelector('.explorer-category-pill'); if (first) first.classList.add('active');
      draw();
    } catch (error) { window.showToast?.(`Unable to load Explorer: ${error.message}`, 'red'); }
  };
  window.viewExplorerPost = async (id) => {
    const posts = await fetchExplorerPosts({ published: true });
    const post = posts.find((item) => item.id === id);
    const root = document.getElementById('page-explorer');
    if (!post || !root) return;
      const posted = timeAgo(post.created_at);
      root.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="renderStudentExplorer()">← Back to Explorer</button><article class="card" style="padding:1.25rem;margin-top:1rem;">${post.banner_url ? `<img src="${escapeAttr(post.banner_url)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin-bottom:1rem;">` : ''}<h2>${escapeHtml(post.title)}</h2><p style="color:var(--text3);">${escapeHtml(post.company_name || '')} · ${escapeHtml(post.category)}</p><p style="line-height:1.6;">${escapeHtml(post.description || '')}</p><p><strong>Eligibility:</strong> ${escapeHtml(post.eligibility || 'Not specified')}</p><p><strong>Dates:</strong> ${escapeHtml(post.start_date || 'TBA')} – ${escapeHtml(post.end_date || 'TBA')}</p><p style="color:var(--text3);font-size:0.9rem;margin-top:8px;">${escapeHtml(posted)}</p><a class="btn btn-primary" href="${escapeAttr(post.apply_url || '#')}" target="_blank" rel="noreferrer">Apply</a></article>`;
  };
}

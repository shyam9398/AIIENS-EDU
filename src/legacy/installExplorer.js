const EXPLORER_FIELDS = 'id,title,description,category,company_name,banner_url,apply_url,start_date,end_date,eligibility,tags,status,is_published,created_by,created_at,updated_at';
const EXPLORER_CATEGORIES = ['Internship', 'Hackathon', 'Free Certification', 'Workshop', 'Competition', 'Bootcamp', 'Tech Event', 'Scholarship'];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const escapeAttr = escapeHtml;

async function explorerClientAndUser() {
  const supabase = window.__AIMEASY_SUPABASE__;
  const { data } = await supabase?.auth?.getUser?.() || {};
  return { supabase, user: data?.user || null };
}

function explorerCard(post, creator = false) {
  const published = Boolean(post.is_published) || post.status === 'published';
  const action = creator
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="btn btn-ghost btn-sm" onclick="editExplorerPost('${post.id}')">Edit</button><button class="btn btn-ghost btn-sm" onclick="toggleExplorerPost('${post.id}',${!published})">${published ? 'Unpublish' : 'Publish'}</button><button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="deleteExplorerPost('${post.id}')">Delete</button></div>`
    : `<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-ghost btn-sm" onclick="viewExplorerPost('${post.id}')">Details</button><a class="btn btn-primary btn-sm" href="${escapeAttr(post.apply_url || '#')}" target="_blank" rel="noreferrer">Apply</a></div>`;
  return `<article class="subject-card" data-explorer-id="${post.id}">
    <div class="subject-card-header">${post.banner_url ? `<img src="${escapeAttr(post.banner_url)}" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;float:right;">` : ''}<div class="subject-name">${escapeHtml(post.title)}</div><div class="subject-code">${escapeHtml(post.company_name || 'Opportunity')} · ${escapeHtml(post.category)}</div></div>
    <div class="subject-card-body"><p style="font-size:.8rem;color:var(--text2);margin:0;line-height:1.5;">${escapeHtml(post.description || '')}</p><div class="subject-meta" style="margin-top:10px;"><span class="badge badge-teal">${escapeHtml(post.category)}</span><span class="badge ${published ? 'badge-green' : 'badge-amber'}">${published ? 'Published' : 'Unpublished'}</span></div>${action}</div>
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
  return data || [];
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
    const { error } = await supabase.from('explorer_posts').delete().eq('id', id).eq('created_by', user.id);
    if (error) return window.showToast?.(`Unable to delete post: ${error.message}`, 'red');
    window.renderCreatorExplorer();
  };
  window.toggleExplorerPost = async (id, publish) => {
    const { supabase, user } = await explorerClientAndUser();
    const { error } = await supabase.from('explorer_posts').update({ is_published: publish, status: publish ? 'published' : 'unpublished', updated_at: new Date().toISOString() }).eq('id', id).eq('created_by', user.id);
    if (error) return window.showToast?.(`Unable to update post: ${error.message}`, 'red');
    window.renderCreatorExplorer();
  };

  async function saveExplorerPost(event) {
    event.preventDefault();
    const { supabase, user } = await explorerClientAndUser();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const row = { title: values.title.trim(), description: values.description.trim(), category: values.category, company_name: values.company_name.trim() || null, banner_url: values.banner_url.trim() || null, apply_url: values.apply_url.trim(), start_date: values.start_date || null, end_date: values.end_date || null, eligibility: values.eligibility.trim() || null, tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean), updated_at: new Date().toISOString() };
    const request = values.id ? supabase.from('explorer_posts').update(row).eq('id', values.id).eq('created_by', user.id) : supabase.from('explorer_posts').insert({ ...row, created_by: user.id, status: 'unpublished', is_published: false });
    const { error } = await request;
    if (error) return window.showToast?.(`Unable to save post: ${error.message}`, 'red');
    window.renderCreatorExplorer();
  }

  window.renderStudentExplorer = async function renderStudentExplorer() {
    const root = document.getElementById('page-explorer');
    if (!root) return;
    root.innerHTML = `<div style="margin-bottom:1rem;"><h2 style="font-size:1.3rem;margin-bottom:3px;">Explorer</h2><p style="font-size:.82rem;color:var(--text3);">Discover published opportunities.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem;"><input id="explorer-search" class="input" style="max-width:260px;" placeholder="Search opportunities"><select id="explorer-category" class="select"><option value="">All categories</option>${EXPLORER_CATEGORIES.map((category) => `<option>${category}</option>`).join('')}</select></div><div id="student-explorer-list" class="subject-grid">Loading…</div>`;
    try {
      const posts = await fetchExplorerPosts({ published: true });
      const draw = () => { const search = document.getElementById('explorer-search')?.value.toLowerCase() || ''; const category = document.getElementById('explorer-category')?.value || ''; const filtered = posts.filter((post) => (!category || post.category === category) && `${post.title} ${post.description}`.toLowerCase().includes(search)); const list = document.getElementById('student-explorer-list'); if (list) list.innerHTML = filtered.length ? filtered.map((post) => explorerCard(post)).join('') : '<div class="empty-state-card">No matching opportunities.</div>'; };
      document.getElementById('explorer-search')?.addEventListener('input', draw); document.getElementById('explorer-category')?.addEventListener('change', draw); draw();
    } catch (error) { window.showToast?.(`Unable to load Explorer: ${error.message}`, 'red'); }
  };
  window.viewExplorerPost = async (id) => {
    const posts = await fetchExplorerPosts({ published: true });
    const post = posts.find((item) => item.id === id);
    const root = document.getElementById('page-explorer');
    if (!post || !root) return;
    root.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="renderStudentExplorer()">← Back to Explorer</button><article class="card" style="padding:1.25rem;margin-top:1rem;">${post.banner_url ? `<img src="${escapeAttr(post.banner_url)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin-bottom:1rem;">` : ''}<h2>${escapeHtml(post.title)}</h2><p style="color:var(--text3);">${escapeHtml(post.company_name || '')} · ${escapeHtml(post.category)}</p><p style="line-height:1.6;">${escapeHtml(post.description || '')}</p><p><strong>Eligibility:</strong> ${escapeHtml(post.eligibility || 'Not specified')}</p><p><strong>Dates:</strong> ${escapeHtml(post.start_date || 'TBA')} – ${escapeHtml(post.end_date || 'TBA')}</p><a class="btn btn-primary" href="${escapeAttr(post.apply_url || '#')}" target="_blank" rel="noreferrer">Apply</a></article>`;
  };
}

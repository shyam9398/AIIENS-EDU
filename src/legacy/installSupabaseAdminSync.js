/**
 * Supabase-backed admin module sync — notifications, features, universities,
 * branches, video approvals, subadmin delete. Does not modify auth/login flows.
 */
import {
  createBranch,
  deleteBranch,
  fetchActiveBranches,
  updateBranch,
} from '../repositories/branchRepository.js';
import {
  createUniversity,
  deleteUniversity,
  fetchActiveUniversities,
  fetchAllUniversities,
  updateUniversity,
  universityOptionsHtml,
} from '../repositories/universityRepository.js';
import { refreshCatalog } from '../services/academic/academicCatalogStore.js';

const CORE_FEATURE_SLUGS = new Set(['videos', 'notes', 'pyqs', 'important-questions']);

const ACTION_ICON = {
  edit: '<span aria-hidden="true">✎</span>',
  delete: '<span aria-hidden="true">×</span>',
};

let featureCache = null;
let universityCache = null;
let notifChannel = null;

function sb() {
  return window.__AIMEASY_SUPABASE__;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]),
  );
}

function iconActionBtn(onclick, type, label) {
  const danger = type === 'delete' ? ' danger' : '';
  return `<button class="icon-action-btn${danger}" onclick="${onclick}" title="${esc(label)}" aria-label="${esc(label)}">${ACTION_ICON[type]}</button>`;
}

window.aiiensIsAdminEditing = function aiiensIsAdminEditing() {
  const regInput = document.getElementById('aimeasy-reg-name');
  if (regInput && regInput.dataset.editId) return true;

  const branchInput = document.getElementById('aimeasy-branch-name');
  if (branchInput && branchInput.dataset.editId) return true;

  const uniInput = document.getElementById('uni-name');
  if (uniInput && uniInput.dataset.editId) return true;

  const subadminModal = document.getElementById('create-subadmin-modal');
  if (subadminModal && (subadminModal.classList.contains('open') || subadminModal.dataset.editIndex)) return true;

  return false;
};

function setCrudSubmitButton(buttonId, isEdit, { createLabel = 'Create', editLabel = 'Save Changes' } = {}) {
  const btn = document.getElementById(buttonId);
  if (btn) btn.textContent = isEdit ? editLabel : createLabel;

  const cancelId = buttonId + '-cancel';
  let cancelBtn = document.getElementById(cancelId);
  if (isEdit) {
    if (!cancelBtn && btn) {
      let onclickCall = '';
      if (buttonId === 'aimeasy-branch-submit') onclickCall = 'aimeasyCancelBranchEdit()';
      else if (buttonId === 'uni-save-btn') onclickCall = 'aiiensCancelUniversityEdit()';
      else if (buttonId === 'aimeasy-reg-submit') onclickCall = 'aimeasyCancelRegulationEdit()';

      if (onclickCall) {
        btn.insertAdjacentHTML('afterend', ` <button class="btn btn-ghost btn-sm" id="${cancelId}" onclick="${onclickCall}">Cancel</button>`);
      }
    }
  } else {
    if (cancelBtn) cancelBtn.remove();
  }
}

function clearCrudEditState(inputId, buttonId, { createLabel = 'Create' } = {}) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = '';
    delete input.dataset.editId;
    delete input.dataset.editIndex;
  }
  if (inputId === 'uni-name') {
    const uniCode = document.getElementById('uni-code');
    if (uniCode) uniCode.value = '';
    const uniState = document.getElementById('uni-state');
    if (uniState) uniState.value = '';
    const uniStatus = document.getElementById('uni-status');
    if (uniStatus) uniStatus.value = 'Active';
  }
  setCrudSubmitButton(buttonId, false, { createLabel });
}

window.aimeasyCancelBranchEdit = async function aimeasyCancelBranchEdit() {
  clearCrudEditState('aimeasy-branch-name', 'aimeasy-branch-submit');
  if (typeof window.aiiensRenderBranchList === 'function') {
    await window.aiiensRenderBranchList();
  }
};

window.aiiensCancelUniversityEdit = async function aiiensCancelUniversityEdit() {
  clearCrudEditState('uni-name', 'uni-save-btn');
  if (typeof refreshUniversityCache === 'function') {
    await refreshUniversityCache();
  }
  if (typeof window.aiiensRenderUniversities === 'function') {
    window.aiiensRenderUniversities();
  }
  await refreshCatalogUi(document);
};

async function refreshCatalogUi(root = document) {
  await refreshCatalog();
  await window.aiiensRefreshAllCatalogDropdowns?.(root);
}

async function ensurePlatformFeatureScope() {
  if (window.__aiiensPlatformFeatureScope) return window.__aiiensPlatformFeatureScope;
  const supabase = sb();
  if (!supabase) return null;

  const { data: existing } = await supabase
    .from('content_items')
    .select('subject_id, unit_id')
    .eq('content_type', 'feature')
    .limit(1)
    .maybeSingle();
  if (existing?.subject_id && existing?.unit_id) {
    window.__aiiensPlatformFeatureScope = existing;
    return existing;
  }

  const { data: subjectRow } = await supabase
    .from('subjects')
    .select('id')
    .eq('code', 'SYS')
    .maybeSingle();
  let subjectId = subjectRow?.id;
  if (!subjectId) {
    const { data: createdSubject, error: subjectErr } = await supabase
      .from('subjects')
      .insert({ name: '__platform_features__', code: 'SYS', branch: 'SYS', created_by: 'system' })
      .select('id')
      .single();
    if (subjectErr) {
      console.warn('[FEATURES] platform subject bootstrap failed:', subjectErr.message);
      return null;
    }
    subjectId = createdSubject.id;
  }

  const { data: unitRow } = await supabase
    .from('units')
    .select('id')
    .eq('subject_id', subjectId)
    .limit(1)
    .maybeSingle();
  let unitId = unitRow?.id;
  if (!unitId) {
    const { data: createdUnit, error: unitErr } = await supabase
      .from('units')
      .insert({ subject_id: subjectId, title: 'Feature Registry', sort_order: 0 })
      .select('id')
      .single();
    if (unitErr) {
      console.warn('[FEATURES] platform unit bootstrap failed:', unitErr.message);
      return null;
    }
    unitId = createdUnit.id;
  }

  window.__aiiensPlatformFeatureScope = { subject_id: subjectId, unit_id: unitId };
  return window.__aiiensPlatformFeatureScope;
}

function featureSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCurrentUserKey() {
  const user = window.APP?.user || {};
  return String(user.id || user.googleId || user.email || 'guest');
}

function normalizeNotifRole(role) {
  const r = String(role || 'student').toLowerCase();
  if (r === 'content_creator' || r === 'creator' || r === 'subadmin') return 'content_creator';
  return 'student';
}

function roleMatchesRecipient(userRole, recipient) {
  const normalized = normalizeNotifRole(userRole);
  return recipient === 'both' || recipient === normalized;
}

async function fetchNotificationsFromDb() {
  const supabase = sb();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, target_role, is_active, created_at, created_by')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('[NOTIFICATIONS] load failed:', error.message);
    return [];
  }
  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    recipient: row.target_role,
    sentAt: row.created_at ? new Date(row.created_at).toLocaleString() : '',
  }));
}

async function fetchReadNotificationIds(userKey) {
  const supabase = sb();
  if (!supabase || !userKey) return new Set();
  const { data, error } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_key', userKey);
  if (error) return new Set();
  return new Set((data || []).map((row) => row.notification_id));
}

async function markNotificationReadDb(notificationId, userKey) {
  const supabase = sb();
  if (!supabase || !notificationId || !userKey) return;
  await supabase.from('notification_reads').upsert(
    { notification_id: notificationId, user_key: userKey, read_at: new Date().toISOString() },
    { onConflict: 'notification_id,user_key' },
  );
}

async function fetchFeatureRowsFromDb() {
  const defaults = [
    { id: null, title: 'Videos', slug: 'videos', isCore: true },
    { id: null, title: 'Notes', slug: 'notes', isCore: true },
    { id: null, title: 'PYQs', slug: 'pyqs', isCore: true },
    { id: null, title: 'Important Questions', slug: 'important-questions', isCore: true },
  ];
  const supabase = sb();
  if (!supabase) return defaults;

  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, metadata, created_at')
    .eq('content_type', 'feature')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[FEATURES] load failed:', error.message);
    return defaults;
  }

  const rows = data || [];
  const disabledSlugs = new Set(
    rows
      .filter((row) => row.metadata?.active === false)
      .map((row) => row.metadata?.slug || featureSlug(row.title)),
  );
  const activeDb = rows
    .filter((row) => row.metadata?.active !== false)
    .map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.metadata?.slug || featureSlug(row.title),
      isCore: row.metadata?.is_core === true || CORE_FEATURE_SLUGS.has(row.metadata?.slug || featureSlug(row.title)),
    }));

  const merged = [
    ...defaults
      .filter((row) => !disabledSlugs.has(row.slug))
      .map((row) => activeDb.find((item) => item.slug === row.slug) || row),
    ...activeDb.filter((row) => !defaults.some((item) => item.slug === row.slug)),
  ];
  return merged;
}

async function refreshFeatureCache() {
  featureCache = await fetchFeatureRowsFromDb();
  return featureCache;
}

async function fetchUniversitiesFromDb() {
  const rows = await fetchAllUniversities();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code || row.name,
    state: row.state || '',
    status: row.status || 'Active',
    updatedAt: row.updated_at,
  }));
}

async function refreshUniversityCache() {
  universityCache = await fetchUniversitiesFromDb();
  return universityCache;
}

function injectNotifBadgeStyles() {
  if (document.getElementById('aiiens-notif-badge-style')) return;
  const style = document.createElement('style');
  style.id = 'aiiens-notif-badge-style';
  style.textContent = `
    .notif-count-badge {
      position: absolute; top: 2px; right: 2px;
      min-width: 16px; height: 16px; padding: 0 4px;
      border-radius: 999px; background: var(--red); color: #fff;
      font-size: 0.62rem; font-weight: 800; line-height: 16px;
      text-align: center; border: 1.5px solid var(--surface2);
    }
  `;
  document.head.appendChild(style);
}

function setNotifBadge(el, count) {
  if (!el) return;
  injectNotifBadgeStyles();
  if (count > 0) {
    el.style.display = 'flex';
    el.className = 'notif-count-badge';
    el.textContent = count > 9 ? '9+' : String(count);
  } else {
    el.style.display = 'none';
    el.className = 'notif-dot';
    el.textContent = '';
  }
}

function patchNotifications() {
  window.sendAdminNotification = async function sendAdminNotificationDb() {
    const title = document.getElementById('notif-title')?.value.trim();
    const recipient = document.getElementById('notif-recipient')?.value || 'both';
    const message = document.getElementById('notif-message')?.value.trim();
    if (!title || !message) {
      window.showToast?.('Please fill in both the title and message fields.', 'red');
      return;
    }
    const supabase = sb();
    if (!supabase) {
      window.showToast?.('Supabase not configured.', 'red');
      return;
    }
    const { error } = await supabase.from('notifications').insert({
      title,
      message,
      target_role: recipient,
      is_active: true,
      created_by: window.APP?.user?.name || window.APP?.adminType || 'admin',
    });
    if (error) {
      window.showToast?.('Notification send failed: ' + error.message, 'red');
      return;
    }
    document.getElementById('notif-title').value = '';
    document.getElementById('notif-message').value = '';
    window.showToast?.('✅ Notification sent successfully!', 'green');
    await window.renderAdminNotificationsUI?.();
  };

  window.deleteAdminNotification = async function deleteAdminNotificationDb(id) {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    const supabase = sb();
    if (!supabase) return;
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) {
      window.showToast?.('Delete failed: ' + error.message, 'red');
      return;
    }
    window.showToast?.('Notification deleted', 'red');
    await window.renderAdminNotificationsUI?.();
  };

  window.renderAdminNotificationsUI = async function renderAdminNotificationsUiDb() {
    const content = document.getElementById('admin-content');
    if (!content) return;
    const notifications = await fetchNotificationsFromDb();
    content.innerHTML = `
      <div style="padding:2rem; max-width:1200px; margin:0 auto; width:100%;">
        <div style="margin-bottom:1.6rem;">
          <h2 style="font-size:1.5rem; font-weight:800; letter-spacing:-0.02em; margin-bottom:4px;">🔔 Notifications Management</h2>
          <p style="font-size:0.85rem; color:var(--text3);">Compose and send notifications to Students or Content Creators (stored in Supabase)</p>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.6rem; align-items:start;">
          <div class="card" style="padding: 1.5rem;">
            <h3 style="margin-bottom: 1.2rem; font-size:1.1rem; font-weight:700;">➕ Compose Notification</h3>
            <div class="input-group" style="margin-bottom: 1rem;">
              <label style="font-weight:600; margin-bottom: 4px; display:block;">Title</label>
              <input class="input" id="notif-title" placeholder="e.g. System Update" style="width:100%;">
            </div>
            <div class="input-group" style="margin-bottom: 1rem;">
              <label style="font-weight:600; margin-bottom: 4px; display:block;">Recipient Role</label>
              <select class="select" id="notif-recipient" style="width:100%;">
                <option value="student">Student</option>
                <option value="content_creator">Content Creator</option>
                <option value="both">Both (All)</option>
              </select>
            </div>
            <div class="input-group" style="margin-bottom: 1.5rem;">
              <label style="font-weight:600; margin-bottom: 4px; display:block;">Message</label>
              <textarea class="input" id="notif-message" rows="5" placeholder="Write notification message here..." style="width:100%; resize: vertical; min-height: 120px;"></textarea>
            </div>
            <button class="btn btn-primary" onclick="sendAdminNotification()" style="width:100%; font-weight:700; padding:10px;">🔔 Send Broadcast</button>
          </div>
          <div class="card" style="padding: 1.5rem;">
            <h3 style="margin-bottom: 1.2rem; font-size:1.1rem; font-weight:700;">📋 Broadcast History</h3>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${!notifications.length
                ? '<div style="text-align:center; padding:3rem; color:var(--text3); border:1.5px dashed var(--border); border-radius:var(--radius-md);">📬 No notifications sent yet.</div>'
                : notifications
                    .slice(0, 20)
                    .map(
                      (n) => `
                <div style="padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface2); display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.9rem;">${esc(n.title)}</div>
                    <p style="font-size:0.82rem; color:var(--text2); margin-top:4px;">${esc(n.message)}</p>
                    <span style="font-size:0.7rem; color:var(--text3);">🕒 ${esc(n.sentAt)}</span>
                  </div>
                  <button class="btn btn-danger btn-sm" onclick="deleteAdminNotification('${esc(n.id)}')" title="Delete" aria-label="Delete notification">${ACTION_ICON.delete}</button>
                </div>`,
                    )
                    .join('')}
            </div>
          </div>
        </div>
      </div>`;
  };

  async function renderNotificationsListDb() {
    const container = document.getElementById('notif-list-container');
    if (!container) return;
    const userRole = window.APP?.user?.role || window.APP?.role || 'student';
    const userKey = getCurrentUserKey();
    const notifications = await fetchNotificationsFromDb();
    const readSet = await fetchReadNotificationIds(userKey);
    const relevant = notifications.filter((n) => roleMatchesRecipient(userRole, n.recipient));

    if (!relevant.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text3);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📬</div>
          <div style="font-weight:600; font-size:0.88rem;">All caught up!</div>
          <div style="font-size:0.78rem; margin-top:2px;">No announcements from Admin.</div>
        </div>`;
      return;
    }

    container.innerHTML = relevant
      .map((n) => {
        const isRead = readSet.has(n.id);
        return `
        <div onclick="openNotificationDetail('${esc(n.id)}')" style="padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: ${isRead ? 'var(--surface)' : 'var(--primary-light)'}; cursor: pointer; display: flex; gap: 10px;">
          <div style="font-size: 1.3rem;">📢</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem;">${esc(n.title)}${!isRead ? ' <span style="color:var(--red);">●</span>' : ''}</div>
            <div style="font-size: 0.8rem; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(n.message)}</div>
            <div style="font-size: 0.7rem; color: var(--text3); margin-top: 6px;">🕒 ${esc(n.sentAt)}</div>
          </div>
        </div>`;
      })
      .join('');
  }

  window.openNotificationsModal = async function openNotificationsModalDb() {
    const modal = document.getElementById('notifications-modal');
    if (!modal) return;
    document.getElementById('notif-detail-container').style.display = 'none';
    document.getElementById('notif-list-container').style.display = 'flex';
    await renderNotificationsListDb();
    modal.classList.add('open');
  };

  window.backToNotifList = async function backToNotifListDb() {
    document.getElementById('notif-detail-container').style.display = 'none';
    document.getElementById('notif-list-container').style.display = 'flex';
    await renderNotificationsListDb();
  };

  window.openNotificationDetail = async function openNotificationDetailDb(id) {
    const notifications = await fetchNotificationsFromDb();
    const notif = notifications.find((n) => String(n.id) === String(id));
    if (!notif) return;
    await markNotificationReadDb(id, getCurrentUserKey());
    document.getElementById('notif-list-container').style.display = 'none';
    document.getElementById('notif-detail-container').style.display = 'flex';
    document.getElementById('notif-detail-title').textContent = notif.title;
    document.getElementById('notif-detail-time').textContent = '🕒 Received: ' + notif.sentAt;
    document.getElementById('notif-detail-message').textContent = notif.message;
    window.updateNotificationDots?.();
  };

  window.updateNotificationDots = async function updateNotificationDotsDb() {
    const userRole = window.APP?.user?.role || window.APP?.role;
    if (!userRole) return;
    const userKey = getCurrentUserKey();
    const notifications = await fetchNotificationsFromDb();
    const readSet = await fetchReadNotificationIds(userKey);
    const unreadCount = notifications.filter(
      (n) => roleMatchesRecipient(userRole, n.recipient) && !readSet.has(n.id),
    ).length;
    setNotifBadge(document.getElementById('student-notif-dot'), userRole === 'student' ? unreadCount : 0);
    setNotifBadge(document.getElementById('creator-notif-dot'), normalizeNotifRole(userRole) === 'content_creator' ? unreadCount : 0);
  };

  window.closeNotificationsModal = function closeNotificationsModalDb() {
    document.getElementById('notifications-modal')?.classList.remove('open');
    window.updateNotificationDots?.();
  };
}

function patchSubAdminDelete() {
  window.adminDeleteSubAdmin = async function adminDeleteSubAdminRedirect(index) {
    if (typeof window.aiiensDeleteSubAdmin === 'function') {
      return window.aiiensDeleteSubAdmin(index);
    }
    window.showToast?.('Delete handler unavailable', 'red');
  };
}

function patchVideoApproval() {
  const formatSubmittedAt = (value) => {
    if (!value) return '-';
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  };
  const normalizeStatus = (value) => String(value || 'pending').trim().toLowerCase();

  async function fetchSuggestionCounts(supabase) {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    const { data, error } = await supabase
      .from('student_url_suggestions')
      .select('status');
    if (error) {
      console.error('[URL APPROVALS] Failed to load approval counts:', error);
      return counts;
    }
    (data || []).forEach((row) => {
      const status = normalizeStatus(row.status);
      if (counts[status] !== undefined) counts[status] += 1;
    });
    return counts;
  }

  async function updateApprovalBadge() {
    const supabase = sb();
    const badge = document.getElementById('admin-approval-badge');
    if (!badge || !supabase) return;
    const { data, error } = await supabase
      .from('student_url_suggestions')
      .select('id, status');
    if (error) console.error('[URL APPROVALS] Failed to refresh pending badge:', error);
    const pending = error ? 0 : (data || []).filter((row) => normalizeStatus(row.status) === 'pending').length;
    badge.textContent = String(pending);
    badge.style.display = pending ? 'inline-flex' : 'none';
  }

  window.aiiensRefreshUrlApprovalBadge = updateApprovalBadge;

  window.renderApprovalLinksProduction = async function renderApprovalLinksSupabaseOnly(owner = 'admin') {
    const content = document.getElementById(owner === 'admin' ? 'admin-content' : 'sa-content');
    if (!content) return;
    const supabase = sb();
    if (!supabase) {
      content.innerHTML = '<div class="empty-state-card">Supabase is required to load URL approvals.</div>';
      return;
    }

    // Return the table's real deployed columns only. `select('*')` avoids a
    // failed approval queue when an older deployment lacks optional metadata
    // such as title, subject_name, or relationship definitions.
    const result = await supabase
      .from('student_url_suggestions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (result.error) {
      console.error('[URL APPROVALS] Failed to load pending requests from student_url_suggestions:', {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint,
      });
      content.innerHTML = '<div class="empty-state-card">Unable to load pending URL requests from Supabase.</div>';
      return;
    }

    const requests = result.data || [];
    const counts = await fetchSuggestionCounts(supabase);
    await updateApprovalBadge();

    content.innerHTML = `
      <div class="admin-dashboard-wrap approval-workspace">
        <div class="admin-section-head approval-page-head">
          <div>
            <h2>URL Approvals</h2>
            <p>Review submitted learning links and keep the content library clean.</p>
          </div>
          <div class="approval-stat-cards" aria-label="URL approval statistics">
            <div class="approval-stat-card approved"><span>Approved URLs</span><strong>${esc(counts.approved || 0)}</strong></div>
            <div class="approval-stat-card rejected"><span>Rejected URLs</span><strong>${esc(counts.rejected || 0)}</strong></div>
          </div>
        </div>
        <div class="approval-summary-line"><span class="badge badge-amber">${esc(requests.length)} pending</span></div>
        <div class="approval-card-grid">
          ${requests.length ? requests.map((request) => {
            const url = String(request.url || '').trim();
            let valid = false;
            try { valid = Boolean(url) && Boolean(new URL(url)); } catch { valid = false; }
            const topic = request.topics?.topic_name || request.topic_name || 'Not specified';
            const subjectName = request.subjects?.name || request.subject_name || 'Subject';
            const unitName = request.units?.title || request.unit_name || ('Unit ' + (request.units?.sort_order || '-'));
            const branch = request.branch || request.subjects?.branch || '-';
            const regulation = request.regulation || request.subjects?.regulation_code || '-';
            const university = request.university || request.subjects?.university_name || '-';
            const student = request.student_name || request.student_id || 'Student';
            return `<div class="approval-card approval-pending">
              <div class="approval-card-top">
                <div class="approval-card-title"><span>Pending video suggestion</span><h3>${esc(topic)}</h3></div>
                <span class="badge badge-amber">${esc(request.status || 'pending')}</span>
              </div>
              <div class="approval-detail-grid approval-meta-grid">
                <div><span>Student Name</span><strong>${esc(student)}</strong></div>
                <div><span>Subject</span><strong>${esc(subjectName)}</strong></div>
                <div><span>Unit</span><strong>${esc(unitName)}</strong></div>
                <div><span>Topic</span><strong>${esc(topic)}</strong></div>
                <div><span>Submitted Date</span><strong>${esc(formatSubmittedAt(request.created_at))}</strong></div>
              </div>
              <p class="approval-description"><strong>Description</strong><br>${esc(request.description || 'No description provided.')}</p>
              <div class="approval-url-row ${valid ? '' : 'invalid'}">
                <span class="approval-url-label">Suggested URL</span>
                ${valid
                  ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="approval-url-text">${esc(url)} <span class="external-link-icon">&nearr;</span></a>`
                  : `<span class="approval-url-text invalid">Invalid URL: ${esc(url || '-')}</span>`}
              </div>
              <div class="approval-actions">
                <button class="btn btn-primary btn-sm" data-suggestion-action="${esc(request.id)}" onclick="adminApproveUrl('${esc(request.id)}')">Approve</button>
                <button class="btn btn-danger btn-sm" data-suggestion-action="${esc(request.id)}" onclick="adminRejectUrl('${esc(request.id)}')">Reject</button>
              </div>
            </div>`;
          }).join('') : '<div class="empty-state-card">No pending URL requests.</div>'}
        </div>
      </div>`;
  };

  const originalSwitchAdminSection = window.switchAdminSection;
  if (typeof originalSwitchAdminSection === 'function') {
    window.switchAdminSection = function switchAdminSectionWithSupabaseApprovals(section, ...rest) {
      const result = originalSwitchAdminSection.call(this, section, ...rest);
      if (['approvals', 'url-approvals', 'urls'].includes(String(section || ''))) {
        window.setTimeout(() => window.renderApprovalLinksProduction?.('admin'), 0);
      }
      return result;
    };
  }

  const originalRenderAdminSection = window.renderAdminSection;
  if (typeof originalRenderAdminSection === 'function') {
    window.renderAdminSection = function renderAdminSectionWithSupabaseApprovals(section, ...rest) {
      const result = originalRenderAdminSection.call(this, section, ...rest);
      if (['approvals', 'url-approvals', 'urls'].includes(String(section || ''))) {
        window.setTimeout(() => window.renderApprovalLinksProduction?.('admin'), 0);
      }
      return result;
    };
  }

  const originalSwitchSASection = window.switchSASection;
  if (typeof originalSwitchSASection === 'function') {
    window.switchSASection = function switchSASectionWithSupabaseApprovals(section, ...rest) {
      const result = originalSwitchSASection.call(this, section, ...rest);
      if (['urls', 'approvals', 'url-approvals'].includes(String(section || ''))) {
        window.setTimeout(() => window.renderApprovalLinksProduction?.('subadmin'), 0);
      }
      return result;
    };
  }

  const originalRefreshActiveAdminSurfaces = window.aiiensRefreshActiveAdminSurfaces || window.refreshActiveAdminSurfaces;
  if (typeof originalRefreshActiveAdminSurfaces === 'function') {
    const refreshWithSupabaseApprovals = function refreshActiveAdminSurfacesWithSupabaseApprovals(...args) {
      const result = originalRefreshActiveAdminSurfaces.apply(this, args);
      const activeScreen = document.querySelector('.screen.active')?.id;
      const adminSection = document.querySelector('#screen-admin .admin-nav-item.active')?.id?.replace('admin-nav-', '');
      const subadminSection = document.querySelector('#screen-subadmin .admin-nav-item.active')?.id?.replace('sa-nav-', '');
      if (activeScreen === 'screen-admin' && adminSection === 'approvals') {
        window.setTimeout(() => window.renderApprovalLinksProduction?.('admin'), 0);
      }
      if (activeScreen === 'screen-subadmin' && subadminSection === 'urls') {
        window.setTimeout(() => window.renderApprovalLinksProduction?.('subadmin'), 0);
      }
      return result;
    };
    window.aiiensRefreshActiveAdminSurfaces = refreshWithSupabaseApprovals;
    window.refreshActiveAdminSurfaces = refreshWithSupabaseApprovals;
  }

  window.adminApproveUrl = async function adminApproveUrlWithTopicVideo(idOrIndex) {
    const supabase = sb();
    if (!supabase) return;
    const suggestionId = String(idOrIndex);
    document.querySelectorAll(`[data-suggestion-action="${suggestionId}"]`).forEach((button) => { button.disabled = true; });
    const { error: approveErr } = await supabase.rpc('approve_student_url_suggestion', {
      suggestion_id: suggestionId,
    });
    if (approveErr) {
      console.error('[URL APPROVALS] Approval and permanent video save failed:', approveErr);
      window.showToast?.('Approval failed: ' + approveErr.message, 'red');
      document.querySelectorAll(`[data-suggestion-action="${suggestionId}"]`).forEach((button) => { button.disabled = false; });
      return;
    }

    await window.renderApprovalLinksProduction?.(
      document.querySelector('.screen.active')?.id === 'screen-subadmin' ? 'subadmin' : 'admin',
    );
    await updateApprovalBadge();
    if (document.querySelector('.screen.active')?.id === 'screen-app' && window.APP?.currentSubject && window.APP?.currentUnit) {
      window.renderVideoList?.(window.APP.currentSubject.id || window.APP.currentSubject.rawId, window.APP.currentUnit);
    }
    window.showToast?.('URL approved and permanently added under its topic.', 'green');
  };

  window.adminRejectUrl = async function adminRejectUrlSupabaseOnly(idOrIndex) {
    const supabase = sb();
    if (!supabase) return;
    const suggestionId = String(idOrIndex);
    document.querySelectorAll(`[data-suggestion-action="${suggestionId}"]`).forEach((button) => { button.disabled = true; });
    const { error } = await supabase
      .from('student_url_suggestions')
      .update({
        status: 'rejected',
        approved_by: null,
        approved_at: null,
      })
      .eq('id', suggestionId);
    if (error) {
      console.error('[URL APPROVALS] Reject failed:', error);
      window.showToast?.('Reject failed: ' + error.message, 'red');
      document.querySelectorAll(`[data-suggestion-action="${suggestionId}"]`).forEach((button) => { button.disabled = false; });
      return;
    }
    await window.renderApprovalLinksProduction?.(
      document.querySelector('.screen.active')?.id === 'screen-subadmin' ? 'subadmin' : 'admin',
    );
    await updateApprovalBadge();
    window.showToast?.('URL rejected', 'red');
  };

  window.setTimeout(() => updateApprovalBadge(), 0);

  // Realtime is the fast path. This keeps an already-open approval page in
  // sync even on a deployment where Realtime was not enabled yet.
  window.setInterval(() => {
    const activeScreen = document.querySelector('.screen.active')?.id;
    const adminSection = document.querySelector('#screen-admin .admin-nav-item.active')?.id?.replace('admin-nav-', '');
    const subadminSection = document.querySelector('#screen-subadmin .admin-nav-item.active')?.id?.replace('sa-nav-', '');
    if (activeScreen === 'screen-admin' && ['approvals', 'url-approvals', 'urls'].includes(adminSection)) {
      window.renderApprovalLinksProduction?.('admin');
    }
    if (activeScreen === 'screen-subadmin' && ['urls', 'approvals', 'url-approvals'].includes(subadminSection)) {
      window.renderApprovalLinksProduction?.('subadmin');
    }
  }, 15000);
}

function patchVideoSuggestionSubmit() {
  let suggestionTopics = [];
  let topicLoadPromise = null;

  const topicLabel = (topic) => `${topic.subject_name} → ${topic.unit_name} → ${topic.topic_name}`;

  async function loadSuggestionTopics(force = false) {
    if (suggestionTopics.length && !force) return suggestionTopics;
    if (topicLoadPromise && !force) return topicLoadPromise;
    const supabase = sb();
    const status = document.getElementById('suggest-topic-status');
    const options = document.getElementById('suggest-topic-options');
    if (!supabase) {
      if (status) status.textContent = 'Topics are unavailable until Supabase connects.';
      return [];
    }
    if (status) status.textContent = 'Loading topics...';
    topicLoadPromise = (async () => {
      const [topicsResult, unitsResult, subjectsResult] = await Promise.all([
        supabase.from('topics').select('id, subject_id, unit_id, topic_name, display_order').order('display_order'),
        supabase.from('units').select('id, subject_id, title, sort_order').order('sort_order'),
        supabase.from('subjects').select('id, name').order('name'),
      ]);
      const error = topicsResult.error || unitsResult.error || subjectsResult.error;
      if (error) {
        console.error('[SUGGESTIONS] Failed to load topics:', error);
        if (status) status.textContent = 'Could not load topics. Please try again.';
        return [];
      }
      const units = new Map((unitsResult.data || []).map((unit) => [unit.id, unit]));
      const subjects = new Map((subjectsResult.data || []).map((subject) => [subject.id, subject]));
      suggestionTopics = (topicsResult.data || []).map((topic) => {
        const unit = units.get(topic.unit_id);
        const subject = subjects.get(topic.subject_id || unit?.subject_id);
        return {
          id: topic.id,
          topic_name: topic.topic_name,
          unit_id: topic.unit_id,
          unit_name: unit?.title || 'Untitled unit',
          subject_id: topic.subject_id || unit?.subject_id,
          subject_name: subject?.name || 'Untitled subject',
        };
      }).filter((topic) => topic.id && topic.subject_id && topic.unit_id);
      if (options) options.innerHTML = suggestionTopics.map((topic) => `<option value="${esc(topicLabel(topic))}"></option>`).join('');
      if (status) status.textContent = suggestionTopics.length
        ? `${suggestionTopics.length} topics available. Search by subject, unit, or topic.`
        : 'No topics are available yet.';
      return suggestionTopics;
    })();
    try {
      return await topicLoadPromise;
    } finally {
      topicLoadPromise = null;
    }
  }

  window.aiiensLoadSuggestionTopics = loadSuggestionTopics;
  document.addEventListener('focusin', (event) => {
    if (event.target?.id === 'suggest-topic-input') loadSuggestionTopics();
  });
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'suggest-topic-input') delete event.target.dataset.topicId;
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.id !== 'suggest-topic-input') return;
    const selected = suggestionTopics.find((topic) => topicLabel(topic) === input.value);
    if (selected) input.dataset.topicId = selected.id;
  });
  window.setTimeout(() => loadSuggestionTopics(), 0);

  window.renderPendingUrls = async function renderPendingUrlsSupabaseOnly() {
    const list = document.getElementById('suggest-pending-list');
    if (!list) return;
    const supabase = sb();
    if (!supabase) {
      list.innerHTML = '';
      return;
    }

    const authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    const student = window.APP?.user || {};
    let query = supabase
      .from('student_url_suggestions')
      .select('id, topic_name, url, description, status, created_at, student_id')
      .order('created_at', { ascending: false });

    if (authUser?.id) {
      query = query.eq('student_id', authUser.id);
    } else if (student.id || student.googleId) {
      query = query.eq('student_id', student.id || student.googleId);
    } else {
      list.innerHTML = '';
      return;
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[SUGGESTIONS] Student submission history load failed:', error.message || error);
      list.innerHTML = '';
      return;
    }
    if (!data?.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = `<div style="font-size:0.78rem;font-weight:700;color:var(--text2);margin-bottom:6px;">Your Submissions:</div>` +
      data.map((row) => {
        const status = String(row.status || 'pending').toLowerCase();
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        const badge = status === 'approved' ? 'badge-green' : status === 'rejected' ? 'badge-red' : 'badge-amber';
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.78rem;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);">${esc(row.topic_name || row.url)}</span>
          <span class="badge ${badge}">${esc(label)}</span>
          ${status === 'approved' ? `<button class="btn btn-primary btn-sm" onclick="window.openApprovedVideo('${esc(row.url)}')">Watch</button>` : ''}
        </div>`;
      }).join('');
  };

  window.submitVideoSuggestion = async function submitVideoSuggestionWithMeta() {
    const supabase = sb();
    const topicInput = document.getElementById('suggest-topic-input');
    const urlInput = document.getElementById('suggest-url-input');
    const url = urlInput?.value.trim();
    if (!url) {
      window.showToast?.('Please enter a URL', 'red');
      return;
    }
    try {
      new URL(url);
    } catch {
      window.showToast?.('Please enter a valid URL', 'red');
      return;
    }
    if (!supabase) return;

    const topics = await loadSuggestionTopics();
    const selectedTopic = topics.find((topic) => topic.id === topicInput?.dataset.topicId)
      || topics.find((topic) => topicLabel(topic) === topicInput?.value.trim());
    if (!selectedTopic) {
      window.showToast?.('Search for and select a topic from the list.', 'red');
      return;
    }

    const authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    if (!authUser?.id) {
      console.error('[URL APPROVALS] URL submission blocked: no authenticated student session.');
      window.showToast?.('Please sign in again before submitting a URL.', 'red');
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('full_name, name').eq('id', authUser.id).maybeSingle();
    const appUser = window.APP?.user || {};
    const studentName = profile?.full_name || profile?.name || appUser.full_name || appUser.name || authUser.user_metadata?.full_name || authUser.email || 'Student';
    const payload = {
      student_id: authUser.id,
      student_name: studentName,
      subject_id: selectedTopic.subject_id,
      unit_id: selectedTopic.unit_id,
      topic_id: selectedTopic.id,
      subject_name: selectedTopic.subject_name,
      unit_name: selectedTopic.unit_name,
      topic_name: selectedTopic.topic_name,
      title: selectedTopic.topic_name,
      url,
      description: document.getElementById('suggest-desc-input')?.value.trim() || '',
      status: 'pending',
    };
    const { data, error } = await supabase.from('student_url_suggestions').insert(payload).select('id, status').single();
    if (error) {
      console.error('[URL APPROVALS] Student URL insert failed:', { error, payload });
      window.showToast?.('Suggestion save failed: ' + error.message, 'red');
      return;
    }
    if (data?.status !== 'pending') {
      console.error('[URL APPROVALS] Insert returned an unexpected status:', data);
      window.showToast?.('Suggestion was not saved as pending. Please try again.', 'red');
      return;
    }
    if (topicInput) {
      topicInput.value = '';
      delete topicInput.dataset.topicId;
    }
    if (urlInput) urlInput.value = '';
    document.getElementById('suggest-desc-input') && (document.getElementById('suggest-desc-input').value = '');
    await window.renderPendingUrls?.();
    await window.aiiensRefreshUrlApprovalBadge?.();
    window.showToast?.('URL submitted. Awaiting admin approval.', 'green');
  };
}

function patchUniversities() {
  window.aiiensSaveUniversity = async function aiiensSaveUniversityDb() {
    const name = document.getElementById('uni-name')?.value.trim();
    const code = document.getElementById('uni-code')?.value.trim();
    const state = document.getElementById('uni-state')?.value.trim();
    const status = (document.getElementById('uni-status')?.value || 'Active').toLowerCase();
    const editId = document.getElementById('uni-name')?.dataset.editId;
    if (!name) {
      window.showToast?.('Enter university name', 'red');
      return;
    }
    const supabase = sb();
    if (!supabase) {
      window.showToast?.('Supabase not configured', 'red');
      return;
    }
    const payload = {
      name,
      code: code || name,
      state: state || null,
      status: status === 'inactive' ? 'inactive' : 'active',
    };
    let error;
    if (editId) {
      const { data: oldData } = await supabase.from('universities').select('name').eq('id', editId).maybeSingle();
      const oldName = oldData?.name;
      
      ({ error } = await updateUniversity(editId, payload));
      
      if (!error && oldName && oldName !== name) {
        try {
          const updates = [
            supabase.from('subjects').update({ university_name: name }).eq('university_name', oldName),
            supabase.from('sub_admin_accounts').update({ university: name }).eq('university', oldName),
            supabase.from('profiles').update({ university_name: name }).eq('university_name', oldName),
            supabase.from('regulations').update({ university: name }).eq('university', oldName)
          ];
          const results = await Promise.all(updates);
          const hasError = results.find(r => r.error);
          if (hasError) {
             throw new Error('Cascade update failed: ' + hasError.error.message);
          }
        } catch (updateErr) {
          console.error('[UniversityRename] Cascade failed, rolling back...', updateErr);
          await updateUniversity(editId, { name: oldName });
          const rollbacks = [
            supabase.from('subjects').update({ university_name: oldName }).eq('university_name', name),
            supabase.from('sub_admin_accounts').update({ university: oldName }).eq('university', name),
            supabase.from('profiles').update({ university_name: oldName }).eq('university_name', name),
            supabase.from('regulations').update({ university: oldName }).eq('university', name)
          ];
          await Promise.all(rollbacks);
          error = updateErr;
        }
      }
    } else {
      ({ error } = await createUniversity(payload));
    }
    if (error) {
      window.showToast?.('University save failed: ' + error.message, 'red');
      return;
    }
    delete document.getElementById('uni-name').dataset.editId;
    document.getElementById('uni-name').value = '';
    document.getElementById('uni-code').value = '';
    if (document.getElementById('uni-state')) document.getElementById('uni-state').value = '';
    clearCrudEditState('uni-name', 'uni-save-btn');
    await refreshUniversityCache();
    window.aiiensRenderUniversities?.();
    await refreshCatalogUi(document);
    window.showToast?.(editId ? 'University updated' : 'University saved', 'green');
  };

  window.aiiensDeleteUniversity = async function aiiensDeleteUniversityDb(index) {
    const rows = universityCache || (await refreshUniversityCache());
    const row = rows[index];
    if (!row?.id) return;
    if (!confirm(`Delete university "${row.name}"?`)) return;
    const supabase = sb();
    if (!supabase) return;
    const { error } = await deleteUniversity(row.id);
    if (error) {
      window.showToast?.('Delete failed: ' + error.message, 'red');
      return;
    }
    await refreshUniversityCache();
    window.aiiensRenderUniversities?.();
    await refreshCatalogUi(document);
    window.showToast?.('University deleted', 'red');
  };

  window.aiiensEditUniversity = function aiiensEditUniversityDb(index) {
    const rows = universityCache || [];
    const row = rows[index];
    if (!row) return;
    document.getElementById('uni-name').value = row.name || '';
    document.getElementById('uni-name').dataset.editId = row.id || '';
    document.getElementById('uni-code').value = row.code || '';
    if (document.getElementById('uni-state')) document.getElementById('uni-state').value = row.state || '';
    document.getElementById('uni-status').value = String(row.status || 'active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
    setCrudSubmitButton('uni-save-btn', true);
    document.getElementById('uni-name')?.focus();
  };

  window.aiiensRenderUniversities = async function aiiensRenderUniversitiesDb() {
    if (window.aiiensIsAdminEditing && window.aiiensIsAdminEditing()) {
      console.log('[Aiiens Admin] Skipping aiiensRenderUniversities because Admin is editing.');
      return;
    }
    const list = document.getElementById('university-list');
    if (!list) return;
    const rows = await refreshUniversityCache();
    const q = String(document.getElementById('uni-search')?.value || '').toLowerCase();
    const stateQ = String(document.getElementById('uni-state-filter')?.value || '').toLowerCase();
    const statusQ = String(document.getElementById('uni-status-filter')?.value || '').toLowerCase();
    const filtered = rows.filter((row) => {
      const nameMatch = !q || row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q);
      const stateMatch = !stateQ || row.state.toLowerCase().includes(stateQ);
      const statusMatch = !statusQ || row.status.toLowerCase() === statusQ;
      return nameMatch && stateMatch && statusMatch;
    });
    list.innerHTML = filtered.length
      ? filtered
          .map(
            (row, index) => `
        <div class="v10-item management-record">
          <div class="v10-item-body">
            <div class="v10-item-title">${esc(row.name)}</div>
            <div class="v10-item-meta">${esc(row.code)} · ${esc(row.state || '—')} · ${esc(row.status)}</div>
          </div>
          ${iconActionBtn(`aiiensEditUniversity(${rows.indexOf(row)})`, 'edit', `Edit ${row.name}`)}
          ${iconActionBtn(`aiiensDeleteUniversity(${rows.indexOf(row)})`, 'delete', `Delete ${row.name}`)}
        </div>`,
          )
          .join('')
      : '<p style="color:var(--text3);">No universities found.</p>';
  };

  window.aiiensUpdateUniversityDropdowns = async function updateUniversityDropdownsDb(root = document) {
    const rows = await fetchActiveUniversities();
    root.querySelectorAll('select').forEach((select) => {
      const id = (select.id || '').toLowerCase();
      const label = (select.closest('.input-group')?.querySelector('label,.v10-label')?.textContent || '').toLowerCase();
      const onchange = select.getAttribute('onchange') || '';
      if (!id.includes('uni') && !label.includes('university') && !onchange.toLowerCase().includes('uni')) return;
      const isFilter = onchange.includes('Filter') || onchange.includes('filter');
      select.innerHTML = universityOptionsHtml(rows, {
        selectedValue: select.value,
        includeAll: isFilter,
        allLabel: 'All Universities',
      });
    });
    await window.aiiensHydrateAllBranchDropdowns?.(root);
  };
  window.aimeasyUpdateUniversityDropdowns = window.aiiensUpdateUniversityDropdowns;
}

function patchFeatures() {
  window.adminAddFeature = async function adminAddFeatureDb() {
    const input = document.getElementById('adm-feature-name');
    const name = input?.value.trim();
    const editId = input?.dataset.editId;
    if (!name) {
      window.showToast?.('Enter feature name', 'red');
      return;
    }
    const slug = featureSlug(name);
    const supabase = sb();
    if (!supabase) {
      window.showToast?.('Supabase not configured', 'red');
      return;
    }

    if (editId) {
      const { error } = await supabase
        .from('content_items')
        .update({
          title: name,
          metadata: {
            type: 'platform_feature',
            slug,
            active: true,
            is_core: false,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', editId);
      if (error) {
        window.showToast?.('Feature update failed: ' + error.message, 'red');
        return;
      }
      clearCrudEditState('adm-feature-name', 'adm-feature-submit');
      await refreshFeatureCache();
      window.renderFeatureList?.();
      window.showToast?.('Feature updated everywhere.', 'green');
      return;
    }

    const scope = await ensurePlatformFeatureScope();
    if (!scope) {
      window.showToast?.('Unable to initialize feature registry', 'red');
      return;
    }
    const { error } = await supabase.from('content_items').insert({
      subject_id: scope.subject_id,
      unit_id: scope.unit_id,
      content_type: 'feature',
      title: name,
      body: 'Platform Feature',
      metadata: { type: 'platform_feature', slug, active: true, is_core: false },
      created_by: window.APP?.adminType || window.APP?.user?.name || 'admin',
    });
    if (error) {
      window.showToast?.('Feature add failed: ' + error.message, 'red');
      return;
    }
    if (input) input.value = '';
    await refreshFeatureCache();
    window.renderFeatureList?.();
    window.showToast?.('Feature added and synced to all panels.', 'green');
  };

  window.adminEditFeature = function adminEditFeatureDb(index) {
    const rows = featureCache || [];
    const row = rows[index];
    if (!row) return;
    if (!row.id) {
      window.showToast?.('Core features cannot be renamed here.', 'amber');
      return;
    }
    const input = document.getElementById('adm-feature-name');
    if (!input) return;
    input.value = row.title;
    input.dataset.editId = row.id;
    setCrudSubmitButton('adm-feature-submit', true);
    input.focus();
  };

  window.adminDeleteFeature = async function adminDeleteFeatureDb(index) {
    const rows = featureCache || (await refreshFeatureCache()) || [];
    const row = rows[index];
    if (!row || !confirm(`Delete "${row.title}"?`)) return;
    const supabase = sb();
    if (!supabase) return;
    if (!row.id) {
      const scope = await ensurePlatformFeatureScope();
      if (!scope) return;
      await supabase.from('content_items').insert({
        subject_id: scope.subject_id,
        unit_id: scope.unit_id,
        content_type: 'feature',
        title: row.title,
        body: 'Platform Feature',
        metadata: { type: 'platform_feature', slug: row.slug, active: false, is_core: true },
        created_by: window.APP?.adminType || 'admin',
      });
    } else if (row.isCore) {
      await supabase
        .from('content_items')
        .update({
          metadata: { type: 'platform_feature', slug: row.slug, active: false, is_core: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    } else {
      const { error } = await supabase.from('content_items').delete().eq('id', row.id);
      if (error) {
        window.showToast?.('Feature delete failed: ' + error.message, 'red');
        return;
      }
    }
    await refreshFeatureCache();
    window.renderFeatureList?.();
    window.showToast?.('Feature deleted', 'red');
  };

  window.renderFeatureList = async function renderFeatureListDb() {
    const list = document.getElementById('admin-feature-list');
    if (!list) return;
    const rows = (await refreshFeatureCache()) || [];
    featureCache = rows;
    list.innerHTML = rows.length
      ? rows
          .map(
            (feature, index) => `
      <div class="v10-item management-record feature-row">
        <div class="record-icon">${esc(feature.title.charAt(0).toUpperCase())}</div>
        <div class="v10-item-body">
          <div class="v10-item-title">${esc(feature.title)}</div>
          <div class="v10-item-meta">${feature.isCore ? 'Core learning module' : 'Custom module'}</div>
        </div>
        <span class="badge badge-green">${feature.isCore ? 'Core' : 'Live'}</span>
        ${iconActionBtn(`adminEditFeature(${index})`, 'edit', `Edit ${feature.title}`)}
        ${iconActionBtn(`adminDeleteFeature(${index})`, 'delete', `Delete ${feature.title}`)}
      </div>`,
          )
          .join('')
      : '<div class="empty-state-card">No features yet.</div>';
  };
}

function patchBranches() {
  window.__aiiensBranchRows = [];

  window.aiiensRenderBranchList = async function aiiensRenderBranchListDb() {
    if (window.aiiensIsAdminEditing && window.aiiensIsAdminEditing()) {
      console.log('[Aiiens Admin] Skipping aiiensRenderBranchList because Admin is editing.');
      return;
    }
    const list = document.getElementById('aimeasy-branch-list');
    if (!list) return;

    const branches = await fetchActiveBranches();
    window.__aiiensBranchRows = branches;

    list.innerHTML = branches.length
      ? branches
          .map(
            (branch, index) => `
      <div class="v10-item regulation-row">
        <div class="v10-item-body"><div class="v10-item-title">${esc(branch.name)}</div></div>
        <span class="badge badge-green">Live</span>
        ${iconActionBtn(`aimeasyEditBranch(${index})`, 'edit', `Edit ${branch.name}`)}
        ${iconActionBtn(`aimeasyDeleteBranch(${index})`, 'delete', `Delete ${branch.name}`)}
      </div>`,
          )
          .join('')
      : '<div class="empty-state-card">No branches created yet.</div>';
  };

  window.aiiensRenderBranches = window.aiiensRenderBranchList;

  async function refreshBranchUi() {
    await refreshCatalog();
    await window.aiiensRenderBranchList?.();
    await refreshCatalogUi(document);
  }

  window.aimeasyAddBranch = window.aimeasySaveBranch = async function aimeasySaveBranchDb() {
    const input = document.getElementById('aimeasy-branch-name');
    const name = input?.value.trim().toUpperCase();
    const editId = input?.dataset.editId;
    if (!name) {
      window.showToast?.('Enter branch name', 'red');
      return;
    }

    const supabase = sb();
    if (!supabase) {
      window.showToast?.('Supabase not configured', 'red');
      return;
    }

    if (editId) {
      const { data: duplicate } = await supabase
        .from('branches')
        .select('id')
        .eq('name', name)
        .eq('status', 'active')
        .neq('id', editId)
        .maybeSingle();
      if (duplicate?.id) {
        window.showToast?.('Branch already exists', 'amber');
        return;
      }
      const { error } = await updateBranch(editId, { name });
      if (error) {
        window.showToast?.('Branch update failed: ' + error.message, 'red');
        return;
      }
      clearCrudEditState('aimeasy-branch-name', 'aimeasy-branch-submit');
      window.showToast?.('Branch updated.', 'green');
      await refreshBranchUi();
      return;
    }

    const { data: existing } = await supabase
      .from('branches')
      .select('id')
      .eq('name', name)
      .eq('status', 'active')
      .maybeSingle();

    if (existing?.id) {
      window.showToast?.('Branch already exists', 'amber');
      return;
    }

    const { error } = await createBranch({ name, universityId: null, status: 'active' });
    if (error) {
      window.showToast?.('Branch save failed: ' + error.message, 'red');
      return;
    }

    if (input) input.value = '';
    window.showToast?.('Branch saved to Supabase.', 'green');
    await refreshBranchUi();
  };

  window.aimeasyEditBranch = function aimeasyEditBranchDb(index) {
    const branches = window.__aiiensBranchRows || [];
    const current = branches[index];
    if (!current) return;
    const input = document.getElementById('aimeasy-branch-name');
    if (!input) return;
    input.value = current.name;
    input.dataset.editId = current.id;
    setCrudSubmitButton('aimeasy-branch-submit', true);
    input.focus();
  };

  window.aimeasyDeleteBranch = async function aimeasyDeleteBranchDb(index) {
    const branches = window.__aiiensBranchRows || [];
    const current = branches[index];
    if (!current) return;
    if (!confirm(`Delete "${current.name}"?`)) return;

    const { error } = await deleteBranch(current.id);
    if (error) {
      window.showToast?.('Delete failed: ' + error.message, 'red');
      return;
    }

    window.showToast?.('Branch deleted.', 'red');
    await refreshBranchUi();
  };

  const origSwitchAdmin = window.switchAdminSection;
  if (origSwitchAdmin && !origSwitchAdmin.__branchPatched) {
    window.switchAdminSection = function switchAdminSectionWithBranchList(section) {
      const result = origSwitchAdmin.apply(this, arguments);
      if (section === 'create') {
        window.setTimeout(() => window.aiiensRenderBranchList?.(), 0);
      }
      return result;
    };
    window.switchAdminSection.__branchPatched = true;
  }
}

function setupRealtimeChannels() {
  const supabase = sb();
  if (!supabase || notifChannel) return;
  notifChannel = supabase
    .channel('aiiens-admin-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
      window.updateNotificationDots?.();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, (payload) => {
      if (payload?.new?.content_type === 'feature' || payload?.old?.content_type === 'feature') {
        refreshFeatureCache().then(() => window.renderFeatureList?.());
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'universities' }, () => {
      refreshUniversityCache().then(async () => {
        window.aiiensRenderUniversities?.();
        await refreshCatalog();
        await refreshCatalogUi(document);
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, async () => {
      await window.aiiensRenderBranchList?.();
      await refreshCatalog();
      await refreshCatalogUi(document);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_url_suggestions' }, async () => {
      await window.aiiensRefreshUrlApprovalBadge?.();
      const activeScreen = document.querySelector('.screen.active')?.id;
      const adminSection = document.querySelector('#screen-admin .admin-nav-item.active')?.id?.replace('admin-nav-', '');
      const subadminSection = document.querySelector('#screen-subadmin .admin-nav-item.active')?.id?.replace('sa-nav-', '');
      if (activeScreen === 'screen-admin' && ['approvals', 'url-approvals', 'urls'].includes(adminSection)) {
        await window.renderApprovalLinksProduction?.('admin');
      }
      if (activeScreen === 'screen-subadmin' && ['urls', 'approvals', 'url-approvals'].includes(subadminSection)) {
        await window.renderApprovalLinksProduction?.('subadmin');
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'topic_videos' }, async (payload) => {
      // An approved suggestion is inserted here by the approval RPC. Refresh an
      // open student topic so the new video is visible without a page reload.
      if (document.querySelector('.screen.active')?.id !== 'screen-app' || !window.APP?.currentSubject || !window.APP?.currentUnit) return;
      const currentTopic = window.APP?._videoItems?.[window.APP.currentVideoIndex]?.topicId;
      if (!currentTopic || currentTopic !== payload?.new?.topic_id) return;
      await window.renderVideoList?.(window.APP.currentSubject.id || window.APP.currentSubject.rawId, window.APP.currentUnit);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'regulations' }, () => {
      window.aimeasyRefreshRegulationUI?.();
    })
    .subscribe();
}

export function installSupabaseAdminSync() {
  if (window.__aiiensSupabaseAdminSyncInstalled) return;
  window.__aiiensSupabaseAdminSyncInstalled = true;

  patchNotifications();
  patchSubAdminDelete();
  patchVideoApproval();
  patchVideoSuggestionSubmit();
  patchUniversities();
  patchFeatures();
  patchBranches();
  setupRealtimeChannels();

  window.aiiensSetCrudSubmitButton = setCrudSubmitButton;
  window.aiiensClearCrudEditState = clearCrudEditState;

  refreshFeatureCache();
  refreshUniversityCache();

  window.setInterval(() => window.updateNotificationDots?.(), 5000);
  window.setTimeout(() => window.updateNotificationDots?.(), 500);
}

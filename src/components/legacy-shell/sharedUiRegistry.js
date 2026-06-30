import createSubAdminModalHtml from '../admin/create-subadmin-modal.html?raw';
import chatFabHtml from '../chat/chat-fab.html?raw';
import chatWindowHtml from '../chat/chat-window.html?raw';
import notePreviewModalHtml from '../notes/note-preview-modal.html?raw';
import adminLoginModalHtml from './admin-login-modal.html?raw';
import loadingOverlayHtml from './loading-overlay.html?raw';
import logoutModalHtml from './logout-modal.html?raw';
import toastHtml from './toast.html?raw';
import notificationsModalHtml from './notifications-modal.html?raw';

export const shellBlocks = [
  {
    id: 'loading-overlay',
    title: 'Loading Overlay',
    html: loadingOverlayHtml,
  },
  {
    id: 'toast',
    title: 'Toast',
    html: toastHtml,
  },
];

export const floatingBlocks = [
  {
    id: 'chat-fab',
    title: 'Chat Button',
    html: chatFabHtml,
  },
  {
    id: 'chat-window',
    title: 'Chat Window',
    html: chatWindowHtml,
  },
];

export const modalBlocks = [
  {
    id: 'logout-modal',
    title: 'Logout Modal',
    html: logoutModalHtml,
  },
  {
    id: 'admin-login-modal',
    title: 'Admin Login Modal',
    html: adminLoginModalHtml,
  },
  {
    id: 'note-preview-modal',
    title: 'Note Preview Modal',
    html: notePreviewModalHtml,
  },
  {
    id: 'create-subadmin-modal',
    title: 'Create Sub Admin Modal',
    html: createSubAdminModalHtml,
  },
  {
    id: 'notifications-modal',
    title: 'Notifications Modal',
    html: notificationsModalHtml,
  },
];

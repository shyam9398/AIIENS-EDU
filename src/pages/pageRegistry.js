import adminHtml from './admin/admin.html?raw';
import aboutHtml from './about/about.html?raw';
import contactHtml from './contact/contact.html?raw';
import creatorHtml from './creator/creator.html?raw';
import googleAuthHtml from './google-auth/google-auth.html?raw';
import introHtml from './intro/intro.html?raw';
import landingHtml from './landing/landing.html?raw';
import privacySecurityHtml from './privacy-security/privacy-security.html?raw';
import profileHtml from './profile/profile.html?raw';
import studentAppHtml from './student-app/student-app.html?raw';
import subAdminHtml from './subadmin/subadmin.html?raw';
import settingUpProfileHtml from './setting-up-profile/setting-up-profile.html?raw';

export const appPages = [
  {
    id: 'landing',
    path: '/landing',
    screenId: 'screen-landing',
    title: 'Landing',
    role: 'public',
    html: landingHtml,
  },
  {
    id: 'google-auth',
    path: '/auth',
    screenId: 'screen-google-auth',
    title: 'Google Auth',
    role: 'public',
    html: googleAuthHtml,
  },
  {
    id: 'intro',
    path: '/intro',
    screenId: 'screen-intro',
    title: 'Intro',
    role: 'public',
    html: introHtml,
  },
  {
    id: 'about',
    path: '/about',
    screenId: 'screen-about',
    title: 'About Us',
    role: 'public',
    html: aboutHtml,
  },
  {
    id: 'contact',
    path: '/contact',
    screenId: 'screen-contact',
    title: 'Contact Us',
    role: 'public',
    html: contactHtml,
  },
  {
    id: 'privacy-security',
    path: '/privacy-security',
    screenId: 'screen-privacy-security',
    title: 'Privacy and Security',
    role: 'public',
    html: privacySecurityHtml,
  },
  {
    id: 'profile',
    path: '/profile',
    aliases: ['/personal-details', '/academic-details'],
    screenId: 'screen-profile',
    title: 'Profile Setup',
    role: 'onboarding',
    html: profileHtml,
  },
  {
    id: 'student-app',
    path: '/student',
    screenId: 'screen-app',
    title: 'Student App',
    role: 'student',
    html: studentAppHtml,
  },
  {
    id: 'admin',
    path: '/admin',
    screenId: 'screen-admin',
    title: 'Admin Portal',
    role: 'admin',
    html: adminHtml,
  },
  {
    id: 'subadmin',
    path: '/subadmin',
    screenId: 'screen-subadmin',
    title: 'Sub Admin Portal',
    role: 'subadmin',
    html: subAdminHtml,
  },
  {
    id: 'creator',
    path: '/creator',
    screenId: 'screen-creator',
    title: 'Creator Portal',
    role: 'content_creator',
    html: creatorHtml,
  },
  {
    id: 'setting-up-profile',
    path: '/setting-up-profile',
    screenId: 'screen-setting-up-profile',
    title: 'Setting up your profile',
    role: 'public',
    html: settingUpProfileHtml,
  },
  {
    id: 'live-workshops',
    path: '/live-workshops',
    screenId: 'screen-live-workshops',
    title: 'Live Workshops',
    role: 'public',
    html: '',
  },
];

export function getPageByScreenId(screenId) {
  return appPages.find((page) => page.screenId === screenId);
}

export function getPageByPath(path) {
  return appPages.find((page) => page.path === path || page.aliases?.includes(path));
}

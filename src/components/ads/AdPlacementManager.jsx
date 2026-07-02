import React from 'react';
import { createPortal } from 'react-dom';
import BannerAd from './BannerAd.jsx';
import InArticleAd from './InArticleAd.jsx';
import ResponsiveAd from './ResponsiveAd.jsx';

const DISALLOWED_SCREEN_IDS = new Set([
  'screen-google-auth',
  'screen-profile',
  'screen-setting-up-profile',
  'screen-admin',
  'screen-subadmin',
  'screen-intro',
]);

const DISALLOWED_HASH_PARTS = [
  'login',
  'register',
  'forgot-password',
  'otp',
  'payment',
  'checkout',
  'subscription',
  'admin',
  'subadmin',
  'quiz',
  'exam',
  'mock-test',
  'fullscreen',
];

function activeScreenId() {
  return document.querySelector('.screen.active')?.id || '';
}

function activeStudentPageId() {
  return Array.from(document.querySelectorAll('#screen-app [id^="page-"]'))
    .find((page) => page.style.display !== 'none')?.id || '';
}

function isDisallowedRoute() {
  const hash = (window.location.hash || '').toLowerCase();
  return DISALLOWED_HASH_PARTS.some((part) => hash.includes(part));
}

function isAllowedScreen() {
  const screenId = activeScreenId();
  return Boolean(screenId) && !DISALLOWED_SCREEN_IDS.has(screenId) && !isDisallowedRoute();
}

function insertAnchor({ id, targetSelector, position = 'afterend' }) {
  const existing = document.querySelector(`[data-aiiens-ad-anchor="${id}"]`);
  const target = document.querySelector(targetSelector);

  if (!target || !isAllowedScreen()) {
    existing?.remove();
    return null;
  }

  if (existing?.isConnected) return existing;

  const anchor = document.createElement('div');
  anchor.dataset.aiiensAdAnchor = id;
  anchor.className = 'aiiens-ad-anchor';
  target.insertAdjacentElement(position, anchor);
  return anchor;
}

const PLACEMENTS = [
  {
    id: 'home-after-hero',
    targetSelector: '#screen-landing .landing-hero',
    Component: BannerAd,
    active: () => activeScreenId() === 'screen-landing',
  },
  {
    id: 'home-above-footer',
    targetSelector: '#screen-landing .landing-footer',
    position: 'beforebegin',
    Component: ResponsiveAd,
    active: () => activeScreenId() === 'screen-landing',
  },
  {
    id: 'dashboard-bottom',
    targetSelector: '#page-dashboard',
    Component: BannerAd,
    active: () => activeScreenId() === 'screen-app' && activeStudentPageId() === 'page-dashboard',
  },
  {
    id: 'subjects-between-sections',
    targetSelector: '#page-subjects .subjects-topbar',
    Component: ResponsiveAd,
    active: () => activeScreenId() === 'screen-app' && activeStudentPageId() === 'page-subjects',
  },
  {
    id: 'course-below-description',
    targetSelector: '#page-units .units-header',
    Component: ResponsiveAd,
    active: () => activeScreenId() === 'screen-app' && activeStudentPageId() === 'page-units',
  },
  {
    id: 'course-end',
    targetSelector: '#page-units .units-grid',
    Component: BannerAd,
    active: () => activeScreenId() === 'screen-app' && activeStudentPageId() === 'page-units',
  },
  {
    id: 'learning-section-between',
    targetSelector: '#page-unit-content .content-tabs',
    Component: BannerAd,
    active: () => activeScreenId() === 'screen-app' && activeStudentPageId() === 'page-unit-content',
  },
  {
    id: 'video-after-player',
    targetSelector: '#video-embed-wrapper',
    Component: InArticleAd,
    active: () =>
      activeScreenId() === 'screen-app' &&
      activeStudentPageId() === 'page-unit-content' &&
      document.getElementById('tab-videos')?.classList.contains('active'),
  },
  {
    id: 'notes-after-viewer',
    targetSelector: '#notes-list',
    Component: ResponsiveAd,
    active: () =>
      activeScreenId() === 'screen-app' &&
      activeStudentPageId() === 'page-unit-content' &&
      document.getElementById('tab-notes')?.classList.contains('active'),
  },
];

export default function AdPlacementManager() {
  const [anchors, setAnchors] = React.useState([]);
  const [routeKey, setRouteKey] = React.useState(() => window.location.hash || 'initial');

  React.useEffect(() => {
    let frameId = 0;

    const sync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const nextAnchors = PLACEMENTS
          .map((placement) => {
            if (!placement.active()) {
              document.querySelector(`[data-aiiens-ad-anchor="${placement.id}"]`)?.remove();
              return null;
            }

            const node = insertAnchor(placement);
            return node ? { ...placement, node } : null;
          })
          .filter(Boolean);

        setAnchors(nextAnchors);
        setRouteKey(`${window.location.hash || '/'}:${activeScreenId()}:${activeStudentPageId()}`);
      });
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true,
    });

    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      document.querySelectorAll('[data-aiiens-ad-anchor]').forEach((node) => node.remove());
    };
  }, []);

  return anchors.map(({ id, Component, node }) =>
    createPortal(<Component routeKey={`${routeKey}:${id}`} />, node, id),
  );
}

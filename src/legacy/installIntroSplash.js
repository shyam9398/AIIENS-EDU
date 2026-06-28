const INTRO_PLAYED_KEY = 'introPlayed';
const SUPPRESS_INTRO_ONCE_KEY = 'aimeasy:suppress_intro_once';
const PROTECTED_ROUTE_RE = /^\/(student|creator|subadmin|admin)(\/|$)/;

function isOAuthCallbackUrl() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return (
    hash.includes('access_token') ||
    hash.includes('refresh_token') ||
    hash.includes('code=') ||
    search.includes('code=')
  );
}

function isAuthRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  return raw === '/auth' || raw.startsWith('/auth?') || raw.startsWith('/auth&') || raw.startsWith('/auth/');
}

function currentRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw || raw === '/') return '/landing';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function isProtectedRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  return PROTECTED_ROUTE_RE.test(raw) || raw === '/personal-details' || raw === '/academic-details';
}

function isAuthRestoring() {
  return Boolean(window.__aimeasyAuthRestoring) || window.__aimeasyAuthBootstrapComplete === false;
}

function hasStoredSession() {
  return Boolean(window.APP?.session || window.APP?.user || window.APP?.adminType);
}

function isOnboardingLocked() {
  return Boolean(window.__aimeasyOnboardingRouteLock || window.__aimeasyRoutingInProgress);
}

function isRefreshNavigation() {
  const navEntry = performance?.getEntriesByType?.('navigation')?.[0];
  return navEntry?.type === 'reload';
}

function hasIntroPlayedThisSession() {
  return window.__aimeasyIntroPlayedInMem === true;
}

function markIntroHandledThisSession() {
  window.__aimeasyIntroPlayedInMem = true;
}

function introSkipReason() {
  if (isAuthRestoring() || isOAuthCallbackUrl() || isAuthRoute()) return 'Auth Restore';
  if (isOnboardingLocked()) return 'Session Restore';
  if (hasIntroPlayedThisSession()) return 'Session Restore';
  return '';
}

export function installIntroSplash() {
  if (window.__aimeasyIntroInstalled) return;
  window.__aimeasyIntroInstalled = true;

  const cleanupTasks = new Set();
  function addCleanupTask(task) {
    cleanupTasks.add(task);
    return task;
  }

  function resetScreenInlineState(screen) {
    if (!screen) return;
    screen.style.removeProperty('display');
    screen.style.removeProperty('opacity');
    screen.style.removeProperty('transition');
    screen.style.removeProperty('pointer-events');
  }

  function showOnlyScreen(screenId) {
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.toggle('active', screen.id === screenId);
      resetScreenInlineState(screen);
    });
  }

  function cleanupVideo(video) {
    if (!video) return;
    try {
      video.pause();
      video.currentTime = 0;
      video.removeAttribute('src');
      video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'));
      video.load();
    } catch {
      /* ignore */
    }
  }

  function unmountIntro() {
    const introScreen = document.getElementById('screen-intro');
    introScreen?.remove();
    document.body.classList.remove('intro-playing');
    document.documentElement.classList.remove('intro-playing');
    document.querySelectorAll('.intro-overlay, #intro-overlay, .loading-overlay').forEach((element) => {
      element.style.pointerEvents = 'none';
    });
  }

  function activateRoleScreen() {
    showOnlyScreen('screen-landing');
    window.showScreen?.('screen-landing');
    const landing = document.getElementById('screen-landing');
    if (landing) {
      landing.style.pointerEvents = 'auto';
      landing.style.zIndex = '1000';
    }
    document.querySelectorAll('.role-card, .admin-dropdown-wrap, .admin-dropdown-item').forEach((element) => {
      element.style.pointerEvents = 'auto';
    });
    console.log('[INTRO] Role Screen Activated');
  }

  function navigateAfterIntro() {
    if (isAuthRestoring() || isOnboardingLocked()) return;
    console.log('[INTRO] Video Ended');
    const route = window.__aimeasyRouteAfterIntro || currentRoute();
    window.__aimeasyRouteAfterIntro = '';
    if (!route || route === '/intro' || route === '/landing') {
      window.history.replaceState({ aimeasyPath: '/landing', aimeasyIndex: 1 }, '', '#/landing');
      activateRoleScreen();
      return;
    }
    if (route && route !== currentRoute()) {
      window.history.replaceState({ aimeasyPath: route, aimeasyIndex: 1 }, '', `#${route}`);
    }
    if (typeof window.startBrowserNavigation === 'function') {
      window.startBrowserNavigation();
      return;
    }
    if (typeof window.syncSessionFromSupabase === 'function' && hasStoredSession()) {
      window.syncSessionFromSupabase({ reason: 'intro-complete-session-restore' });
      return;
    }
    activateRoleScreen();
    window.history.replaceState({ aimeasyPath: route || '/landing', aimeasyIndex: 1 }, '', `#${route || '/landing'}`);
  }

  function completeIntro(introVideo) {
    if (!introVideo || introVideo.dataset.completed === 'true') return;
    introVideo.dataset.completed = 'true';
    try {
      markIntroHandledThisSession();
    } catch {
      /* ignore */
    }

    console.log('[INTRO] Intro Completed');
    try {
      window.__aimeasyIntroActive = false;
    } catch {
      /* ignore */
    }

    cleanupTasks.forEach((task) => {
      try {
        task();
      } catch {
        /* ignore */
      }
    });
    cleanupTasks.clear();

    cleanupVideo(introVideo);
    unmountIntro();
    if (!isAuthRestoring()) navigateAfterIntro();
  }

  function loadVideoSource(introVideo) {
    try {
      const src = '/intro.mp4';
      const source = introVideo.querySelector('source');
      if (source) source.src = src;
      introVideo.src = src;
      introVideo.load();
    } catch {
      /* ignore */
    }
  }

  function initIntro() {
    const introVideo = document.getElementById('intro-video');
    const overlay = document.getElementById('intro-overlay');
    const overlayCopy = overlay?.querySelector('.intro-overlay-copy');
    const startButton = document.getElementById('intro-start-btn');
    if (!introVideo || !overlay || !overlayCopy || !startButton) return;

    const skipReason = introSkipReason();
    if (skipReason) {
      console.log(`[INTRO] Skipped - ${skipReason}`);
      markIntroHandledThisSession();
      cleanupVideo(introVideo);
      unmountIntro();
      return;
    }

    if (introVideo.dataset.introStarted === 'true') return;
    introVideo.dataset.introStarted = 'true';

    console.log('[INTRO] First Visit');
    try {
      window.__aimeasyIntroActive = true;
    } catch {
      /* ignore */
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.style.display = 'none';
    }

    // Remove manual controls.
    try {
      startButton.style.display = 'none';
      startButton.disabled = true;
      overlay.classList.remove('visible');
      overlay.style.display = 'none';
    } catch {
      /* ignore */
    }

    document.body.classList.add('intro-playing');
    document.documentElement.classList.add('intro-playing');

    loadVideoSource(introVideo);

    const onPlaying = () => {
      console.log('[INTRO] Video Started');
    };
    const onEnded = () => completeIntro(introVideo);
    const onError = (e) => {
      console.log('[INTRO] Intro Skipped', { reason: 'video-error' });
      console.warn('[INTRO] Video error', e);
      completeIntro(introVideo);
    };

    introVideo.addEventListener('playing', onPlaying);
    introVideo.addEventListener('ended', onEnded);
    introVideo.addEventListener('error', onError);
    addCleanupTask(() => {
      introVideo.removeEventListener('playing', onPlaying);
      introVideo.removeEventListener('ended', onEnded);
      introVideo.removeEventListener('error', onError);
    });

    // Try audio on first; fall back to muted if blocked.
    try {
      introVideo.volume = 1;
      introVideo.muted = false;
    } catch {
      /* ignore */
    }
    console.log('Muted:', introVideo.muted);
    console.log('Volume:', introVideo.volume);

    const p = introVideo.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        const name = err?.name || '';
        const message = err?.message || String(err);
        if (name === 'NotAllowedError' || /notallowed/i.test(message) || /autoplay/i.test(message)) {
          console.warn('[INTRO] Autoplay audio blocked; retrying muted', err);
          try {
            introVideo.muted = true;
            introVideo.volume = 0;
          } catch {
            /* ignore */
          }
          console.log('Muted:', introVideo.muted);
          console.log('Volume:', introVideo.volume);
          introVideo.play().catch(() => {
            console.log('[INTRO] Intro Skipped', { reason: 'autoplay-blocked' });
            completeIntro(introVideo);
          });
          return;
        }
        console.log('[INTRO] Intro Skipped', { reason: 'play-rejected', name });
        completeIntro(introVideo);
      });
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.setTimeout(initIntro, 0);
  } else {
    window.addEventListener('DOMContentLoaded', () => window.setTimeout(initIntro, 0));
  }
}

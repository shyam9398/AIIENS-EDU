function safeCall(fnName, ...args) {
  if (typeof window[fnName] === 'function') {
    window[fnName](...args);
    return true;
  }

  return false;
}

function showOnlyScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });

  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('open');
}

function stopVideoIfAvailable() {
  if (typeof window.stopVideoPlayer === 'function') window.stopVideoPlayer();
}

function showStudentPage(pageName) {
  document.querySelectorAll('[id^="page-"]').forEach((page) => {
    page.style.display = 'none';
  });

  const target = document.getElementById(`page-${pageName}`);
  if (target) target.style.display = 'block';
}

window.aimeasySafeBack = function aimeasySafeBack(defaultFallbackPath, fallbackFn) {
  const currentIndex = window.history.state?.aimeasyIndex ?? 0;
  if (currentIndex > 0) {
    window.history.back();
  } else {
    // Graceful fallback to avoid closing/exiting the site
    if (typeof fallbackFn === 'function') {
      fallbackFn();
    } else if (defaultFallbackPath) {
      if (defaultFallbackPath.startsWith('/student/')) {
        const page = defaultFallbackPath.replace('/student/', '');
        if (!safeCall('navigateTo', page)) showStudentPage(page);
      } else {
        let screenId = 'screen-landing';
        if (defaultFallbackPath === '/auth') screenId = 'screen-google-auth';
        else if (defaultFallbackPath === '/about') screenId = 'screen-about';
        else if (defaultFallbackPath === '/contact') screenId = 'screen-contact';
        else if (defaultFallbackPath === '/privacy-security') screenId = 'screen-privacy-security';
        
        if (!safeCall('showScreen', screenId)) showOnlyScreen(screenId);
      }
    }
  }
};

function handleBackAction(button) {
  const text = button.textContent.trim().toLowerCase();

  if (button.closest('#screen-google-auth')) {
    if (!safeCall('showScreen', 'screen-landing')) showOnlyScreen('screen-landing');
    return true;
  }

  if (button.closest('#screen-teacher') || text.includes('back to home')) {
    if (!safeCall('showScreen', 'screen-landing')) showOnlyScreen('screen-landing');
    return true;
  }

  if (button.closest('#screen-app') && text.includes('back to units')) {
    stopVideoIfAvailable();
    if (!safeCall('backToUnits')) showStudentPage('units');
    return true;
  }

  if (button.closest('#screen-app') && text.includes('back to subjects')) {
    stopVideoIfAvailable();
    if (!safeCall('navigateTo', 'subjects')) showStudentPage('subjects');
    return true;
  }

  if (button.closest('#profile-step2') || text === 'back') {
    if (button.closest('#screen-profile')) {
      if (!safeCall('backToStep1')) {
        document.getElementById('profile-step1').style.display = 'block';
        document.getElementById('profile-step2').style.display = 'none';
      }
      return true;
    }
  }

  if (text.includes('back to subjects')) {
    stopVideoIfAvailable();
    if (!safeCall('navigateTo', 'subjects')) showStudentPage('subjects');
    return true;
  }

  if (text.includes('back to units')) {
    stopVideoIfAvailable();
    if (!safeCall('backToUnits')) showStudentPage('units');
    return true;
  }

  if (button.closest('#screen-subadmin') && text.includes('back')) {
    if (!safeCall('subAdminNavigateBack')) safeCall('subAdminBack');
    return true;
  }

  if (button.closest('#screen-admin') && text.includes('back')) {
    if (!safeCall('adminNavigateBack')) window.aimeasySafeBack('/landing');
    return true;
  }

  if (button.closest('#screen-creator') && text.includes('back')) {
    if (!safeCall('creatorNavigateBack')) window.aimeasySafeBack('/landing');
    return true;
  }

  if (text.includes('back')) {
    if (button.hasAttribute('onclick')) {
      return false;
    }
    if (button.closest('#screen-app')) {
      window.history.back();
      return true;
    }
    window.history.back();
    return true;
  }

  if (button.closest('#screen-admin') && text.includes('logout')) {
    if (!safeCall('adminLogout')) showOnlyScreen('screen-landing');
    return true;
  }

  if (button.closest('#screen-creator') && text.includes('logout')) {
    if (!safeCall('creatorLogout')) showOnlyScreen('screen-landing');
    return true;
  }

  if (button.closest('#logout-modal') && text.includes('stay')) {
    if (!safeCall('closeLogoutModal')) closeModal('logout-modal');
    return true;
  }

  if (button.closest('#admin-login-modal') && text.includes('cancel')) {
    if (!safeCall('closeAdminLogin')) closeModal('admin-login-modal');
    return true;
  }

  if (button.closest('#create-subadmin-modal') && text.includes('cancel')) {
    if (!safeCall('closeCreateSubAdminModal')) closeModal('create-subadmin-modal');
    return true;
  }

  if (button.closest('#note-preview-modal') && text.includes('close')) {
    if (!safeCall('closeNotePreview')) closeModal('note-preview-modal');
    return true;
  }

  return false;
}

export function installBackButtonFixes() {
  if (window.__aimeasyBackButtonFixesInstalled) return;

  document.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('button, .back-btn');
      if (!button) return;

      const text = button.textContent.trim().toLowerCase();
      const looksLikeBackControl =
        text.includes('back') ||
        text.includes('logout') ||
        text.includes('cancel') ||
        text.includes('stay here') ||
        text.includes('close');

      if (!looksLikeBackControl) return;

      if (handleBackAction(button)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  window.__aimeasyBackButtonFixesInstalled = true;
}

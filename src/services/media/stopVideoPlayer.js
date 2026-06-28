/** Stop and destroy in-app YouTube / video embed (Issue 4). */
export function stopVideoPlayer() {
  const wrapper = document.getElementById('video-embed-wrapper');
  const iframe = document.getElementById('student-video-player');
  window.aimeasySaveStudentVideoPosition?.();
  if (iframe) {
    try {
      iframe.src = 'about:blank';
    } catch {
      /* ignore */
    }
    iframe.remove();
  }
  if (wrapper) {
    wrapper.innerHTML = '';
  }
}

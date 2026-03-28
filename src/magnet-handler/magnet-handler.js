import browser from 'webextension-polyfill';

(async () => {
  const statusEl = document.getElementById('status');
  const magnetUrlEl = document.getElementById('magnet-url');
  const closeMsgEl = document.getElementById('close-msg');

  const params = new URLSearchParams(window.location.search);
  const magnet = params.get('uri');

  if (!magnet || !magnet.startsWith('magnet:')) {
    statusEl.textContent = 'No valid magnet link found.';
    statusEl.className = 'status error';
    return;
  }

  magnetUrlEl.textContent = magnet.length > 120 ? magnet.substring(0, 120) + '...' : magnet;
  magnetUrlEl.style.display = 'block';

  try {
    const response = await browser.runtime.sendMessage({
      type: 'ADD_MAGNET',
      magnet: magnet,
    });

    if (response?.success) {
      statusEl.textContent = 'Magnet link added to TorBox!';
      statusEl.className = 'status success';
      closeMsgEl.style.display = 'block';
      setTimeout(() => window.close(), 2000);
    } else {
      statusEl.textContent = response?.error || 'Failed to add magnet link.';
      statusEl.className = 'status error';
    }
  } catch (err) {
    statusEl.textContent = 'Error: Could not connect to TorBox extension.';
    statusEl.className = 'status error';
  }
})();

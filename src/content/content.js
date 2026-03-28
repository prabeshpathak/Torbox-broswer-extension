const B = typeof browser !== 'undefined' ? browser : chrome;

let lastRightClickedLink = null;
let slotsAvailable = null; // null = not checked yet

document.addEventListener('contextmenu', (e) => {
  const anchor = e.target.closest('a[href]');
  if (anchor && anchor.href.startsWith('magnet:')) {
    lastRightClickedLink = anchor.href;
  } else {
    lastRightClickedLink = null;
  }
});

// Check slot availability once on load
async function checkSlotStatus() {
  try {
    const res = await B.runtime.sendMessage({ type: 'CHECK_SLOTS' });
    slotsAvailable = res;
  } catch {
    slotsAvailable = null;
  }
  scanForMagnetLinks();
}

function scanForMagnetLinks() {
  const links = document.querySelectorAll('a[href^="magnet:"]');
  links.forEach((link) => {
    if (link.dataset.torboxInjected) return;
    link.dataset.torboxInjected = 'true';

    const btn = document.createElement('button');

    const exceeded = slotsAvailable && !slotsAvailable.available;

    if (exceeded) {
      btn.textContent = 'Slots full';
      btn.title = `Active: ${slotsAvailable.active}/${slotsAvailable.max} slots used`;
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 2px 8px;
        background: none;
        color: #ef4444;
        border: 1px solid #ef4444;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        cursor: default;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        vertical-align: middle;
        line-height: 1.4;
        opacity: 0.85;
      `;
    } else {
      btn.textContent = '+ TorBox';
      btn.title = slotsAvailable ? `${slotsAvailable.active}/${slotsAvailable.max} slots used` : 'Add to TorBox';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 2px 8px;
        background: #04BF8A;
        color: #12141B;
        border: none;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        vertical-align: middle;
        line-height: 1.4;
      `;

      btn.addEventListener('mouseenter', () => { btn.style.background = '#03a87a'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#04BF8A'; });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        btn.textContent = '...';
        btn.disabled = true;

        try {
          const response = await B.runtime.sendMessage({
            type: 'ADD_MAGNET',
            magnet: link.href,
          });

          if (response?.success) {
            btn.textContent = 'Added!';
            btn.style.background = '#04BF8A';
          } else {
            btn.textContent = response?.error || 'Error';
            btn.style.background = '#ef4444';
          }
        } catch {
          btn.textContent = 'Error';
          btn.style.background = '#ef4444';
        }

        setTimeout(() => {
          btn.textContent = '+ TorBox';
          btn.style.background = '#04BF8A';
          btn.disabled = false;
        }, 3000);
      });
    }

    link.parentNode.insertBefore(btn, link.nextSibling);
  });
}

checkSlotStatus();

// Intercept magnet link clicks — send to TorBox instead of opening torrent client
document.addEventListener('click', (e) => {
  const anchor = e.target.closest('a[href^="magnet:"]');
  if (!anchor) return;

  e.preventDefault();
  e.stopPropagation();

  // Show a small toast notification on the page
  showToast('Sending to TorBox...');

  B.runtime.sendMessage({
    type: 'ADD_MAGNET',
    magnet: anchor.href,
  }).then((response) => {
    if (response?.success) {
      showToast('Added to TorBox!', 'success');
    } else {
      showToast(response?.error || 'Failed to add', 'error');
    }
  }).catch(() => {
    showToast('Error connecting to TorBox', 'error');
  });
}, true);

function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.getElementById('torbox-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'torbox-toast';
  const bg = type === 'success' ? '#04BF8A' : type === 'error' ? '#ef4444' : '#1A1D26';
  const color = type === 'info' ? '#e0e0e0' : '#fff';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    background: ${bg};
    color: ${color};
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.3s;
    opacity: 1;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

const observer = new MutationObserver(() => scanForMagnetLinks());
observer.observe(document.body, { childList: true, subtree: true });

B.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_MAGNET_LINK') {
    sendResponse({ magnet: lastRightClickedLink });
  } else if (message.type === 'GET_SELECTION') {
    sendResponse({ text: window.getSelection()?.toString() || '' });
  }
});

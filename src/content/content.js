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

// Inject a page-world script to detect JS-triggered magnet links
// (e.g. window.location = 'magnet:...' or location.href = 'magnet:...')
const injectedScript = document.createElement('script');
injectedScript.textContent = `(function() {
  // Intercept window.location.href setter
  const origDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
  if (origDescriptor && origDescriptor.set) {
    Object.defineProperty(Location.prototype, 'href', {
      get: origDescriptor.get,
      set: function(val) {
        if (typeof val === 'string' && val.startsWith('magnet:')) {
          window.dispatchEvent(new CustomEvent('__torbox_magnet', { detail: val }));
        }
        return origDescriptor.set.call(this, val);
      },
      configurable: true,
      enumerable: true,
    });
  }

  // Intercept window.location assign
  const origAssign = Location.prototype.assign;
  Location.prototype.assign = function(url) {
    if (typeof url === 'string' && url.startsWith('magnet:')) {
      window.dispatchEvent(new CustomEvent('__torbox_magnet', { detail: url }));
    }
    return origAssign.call(this, url);
  };

  // Intercept window.open for magnet links
  const origOpen = window.open;
  window.open = function(url) {
    if (typeof url === 'string' && url.startsWith('magnet:')) {
      window.dispatchEvent(new CustomEvent('__torbox_magnet', { detail: url }));
    }
    return origOpen.apply(this, arguments);
  };

  // Catch click events on elements that trigger magnet links via JS
  document.addEventListener('click', function(e) {
    const anchor = e.target.closest('a[href^="magnet:"]');
    if (anchor) {
      window.dispatchEvent(new CustomEvent('__torbox_magnet', { detail: anchor.href }));
    }
  }, true);
})();`;
(document.head || document.documentElement).appendChild(injectedScript);
injectedScript.remove();

// Listen for magnet links detected by the injected page-world script
window.addEventListener('__torbox_magnet', (e) => {
  const magnet = e.detail;
  if (!magnet || !magnet.startsWith('magnet:')) return;

  // Send to TorBox in the background (don't block — let native handler proceed too)
  B.runtime.sendMessage({ type: 'ADD_MAGNET', magnet }).catch(() => {});
});

const observer = new MutationObserver(() => scanForMagnetLinks());
observer.observe(document.body, { childList: true, subtree: true });

B.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_MAGNET_LINK') {
    sendResponse({ magnet: lastRightClickedLink });
  } else if (message.type === 'GET_SELECTION') {
    sendResponse({ text: window.getSelection()?.toString() || '' });
  }
});

import browser from 'webextension-polyfill';

const API_BASE = 'https://api.torbox.app/v1/api';

// Badge update — polls API and sets active download count on icon
async function updateBadge() {
  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;
  if (!apiKey) {
    setBadge('');
    return;
  }

  try {
    const results = await Promise.all([
      fetch(`${API_BASE}/torrents/mylist?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/usenet/mylist?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/webdl/mylist?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
    ]);

    let active = 0;
    for (const res of results) {
      const items = Array.isArray(res?.data) ? res.data : [];
      for (const item of items) {
        if (item.download_speed > 0) { active++; continue; }
        if (item.download_state) {
          const s = item.download_state.toLowerCase();
          if (s.includes('download') || s.includes('check') || s.includes('meta')) {
            active++;
          }
        }
      }
    }

    setBadge(active > 0 ? String(active) : '');
  } catch {
    // Silently fail
  }
}

function setBadge(text) {
  const action = browser.action || browser.browserAction;
  if (action?.setBadgeText) action.setBadgeText({ text });
  if (action?.setBadgeBackgroundColor) action.setBadgeBackgroundColor({ color: '#04BF8A' });
}

// Create context menu + start badge polling on install
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'add-magnet-to-torbox',
    title: 'Add to TorBox',
    contexts: ['link'],
  });

  // Poll badge every 30 seconds
  browser.alarms.create('update-badge', { periodInMinutes: 0.5 });

  updateBadge();
  console.log('TorBox Extension installed!');
});

// Also start alarm on browser startup
browser.runtime.onStartup?.addListener(() => {
  browser.alarms.create('update-badge', { periodInMinutes: 0.5 });
  updateBadge();
});

// Handle alarm
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'update-badge') {
    updateBadge();
  }
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'add-magnet-to-torbox') return;

  let magnet = info.linkUrl;

  if (!magnet || !magnet.startsWith('magnet:')) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        type: 'GET_MAGNET_LINK',
      });
      magnet = response?.magnet;
    } catch (err) {
      // Content script might not be loaded
    }
  }

  if (!magnet || !magnet.startsWith('magnet:')) {
    notify('TorBox', 'Not a magnet link.');
    return;
  }

  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;

  if (!apiKey) {
    notify('TorBox', 'Please log in first. Click the extension icon to set your API key.');
    return;
  }

  try {
    const form = new FormData();
    form.append('magnet', magnet);

    const res = await fetch(`${API_BASE}/torrents/createtorrent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const json = await res.json();

    if (json.success) {
      notify('TorBox', json.detail || 'Torrent added successfully');
      updateBadge();
    } else {
      notify('TorBox - Error', json.detail || json.error || 'Failed to add torrent');
    }
  } catch (err) {
    notify('TorBox - Error', 'Network error. Could not reach TorBox API.');
  }
});

function notify(title, message) {
  if (browser.notifications) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title,
      message,
    });
  } else {
    console.log(`[${title}] ${message}`);
  }
}

// Handle messages from popup and content scripts
browser.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'UPDATE_BADGE':
      updateBadge();
      return Promise.resolve({ ok: true });
    case 'CHECK_SLOTS':
      return checkSlots();
    case 'ADD_MAGNET':
      return addMagnet(message.magnet);
    case 'GET_PAGE_DATA':
      return Promise.resolve({ status: 'ok' });
  }
});

// Base active torrent slots per plan
const PLAN_SLOTS = { 0: 1, 1: 2, 2: 5, 3: 10 };

async function checkSlots() {
  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;
  if (!apiKey) return { available: false, reason: 'Not logged in' };

  try {
    const [userRes, torrentsRes] = await Promise.all([
      fetch(`${API_BASE}/user/me?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/torrents/mylist?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
    ]);

    const user = userRes?.data;
    if (!user) return { available: false, reason: 'Error' };

    const baseSlots = PLAN_SLOTS[user.plan] || 1;
    const extraSlots = user.additional_concurrent_slots || 0;
    const maxSlots = baseSlots + extraSlots;

    const torrents = Array.isArray(torrentsRes?.data) ? torrentsRes.data : [];
    const activeCount = torrents.filter((t) => {
      if (t.download_speed > 0) return true;
      if (t.download_state) {
        const s = t.download_state.toLowerCase();
        return s.includes('download') || s.includes('check') || s.includes('meta');
      }
      return false;
    }).length;

    return { available: activeCount < maxSlots, active: activeCount, max: maxSlots };
  } catch {
    return { available: false, reason: 'Error' };
  }
}

async function addMagnet(magnet) {
  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;
  if (!apiKey) return { success: false, error: 'Not logged in' };

  try {
    const form = new FormData();
    form.append('magnet', magnet);
    const res = await fetch(`${API_BASE}/torrents/createtorrent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const json = await res.json();
    if (json.success) {
      updateBadge();
      return { success: true };
    }
    return { success: false, error: json.detail || 'Failed' };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

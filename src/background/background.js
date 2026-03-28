import browser from 'webextension-polyfill';

const DEFAULT_API_VERSION = 'v1';

async function getApiBase() {
  const data = await browser.storage.local.get('apiVersion');
  const version = data.apiVersion || DEFAULT_API_VERSION;
  return `https://api.torbox.app/${version}/api`;
}

// Legacy constant for synchronous contexts (badge polling, etc.)
const API_BASE = `https://api.torbox.app/${DEFAULT_API_VERSION}/api`;

// Download queue — processes downloads sequentially to prevent race conditions
class DownloadQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      }
    }
    this.processing = false;
  }
}

const downloadQueue = new DownloadQueue();

// Debounce helper for context menu clicks
let lastContextClickTime = 0;
const DEBOUNCE_MS = 300;

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

// Classify a link URL into a download type
function classifyLink(url) {
  if (!url) return null;
  if (url.startsWith('magnet:')) return 'magnet';
  if (/\.nzb(\.gz)?$/i.test(url)) return 'nzb';
  if (url.startsWith('http://') || url.startsWith('https://')) return 'web';
  return null;
}

// Create context menu + start badge polling on install
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'download-with-torbox',
    title: 'Download with TorBox',
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

// Handle context menu clicks (debounced + queued)
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'download-with-torbox') return;

  // Debounce rapid clicks
  const now = Date.now();
  if (now - lastContextClickTime < DEBOUNCE_MS) return;
  lastContextClickTime = now;

  let url = info.linkUrl;

  // Try to get magnet from content script if link isn't directly usable
  if (!url || !classifyLink(url)) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        type: 'GET_MAGNET_LINK',
      });
      if (response?.magnet) url = response.magnet;
    } catch (err) {
      // Content script might not be loaded
    }
  }

  const linkType = classifyLink(url);
  if (!linkType) {
    notify('TorBox', 'Invalid link type. Supported: magnet, NZB, and web (HTTP/HTTPS) links.');
    return;
  }

  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;

  if (!apiKey) {
    notify('TorBox', 'Please log in first. Click the extension icon to set your API key.');
    return;
  }

  // Queue the download to prevent race conditions from rapid clicks
  downloadQueue.enqueue(async () => {
    let endpoint, formField, successMsg;
    switch (linkType) {
      case 'magnet':
        endpoint = 'torrents/createtorrent';
        formField = 'magnet';
        successMsg = 'Torrent added successfully';
        break;
      case 'nzb':
        endpoint = 'usenet/createusenetdownload';
        formField = 'link';
        successMsg = 'NZB download added successfully';
        break;
      case 'web':
        endpoint = 'webdl/createwebdownload';
        formField = 'link';
        successMsg = 'Web download added successfully';
        break;
    }

    const form = new FormData();
    form.append(formField, url);

    const apiBase = await getApiBase();
    const res = await fetch(`${apiBase}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const json = await res.json();

    if (json.success) {
      notify('TorBox', json.detail || successMsg);
      updateBadge();
    } else {
      notify('TorBox - Error', json.detail || json.error || 'Failed to add download');
    }
  }).catch(() => {
    notify('TorBox - Error', 'Network error. Could not reach TorBox API.');
  });
});

let lastNotificationId = null;

function notify(title, message) {
  if (browser.notifications) {
    // Clear previous notification to avoid spam
    if (lastNotificationId) {
      browser.notifications.clear(lastNotificationId).catch(() => {});
    }
    const id = `torbox-${Date.now()}`;
    lastNotificationId = id;
    browser.notifications.create(id, {
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
    case 'ADD_LINK':
      return addLink(message.url);
    case 'APPLY_REFERRAL':
      return applyReferral();
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
    const apiBase = await getApiBase();
    const [userRes, torrentsRes] = await Promise.all([
      fetch(`${apiBase}/user/me?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`${apiBase}/torrents/mylist?_t=${Date.now()}`, {
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
    const apiBase = await getApiBase();
    const form = new FormData();
    form.append('magnet', magnet);
    const res = await fetch(`${apiBase}/torrents/createtorrent`, {
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

const REFERRAL_CODE = 'aa4271de-919a-4259-aab1-ed6436b1b18d';

async function applyReferral() {
  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;
  if (!apiKey) return { success: false, error: 'Not logged in' };

  try {
    const apiBase = await getApiBase();
    const res = await fetch(`${apiBase}/user/addreferral?referral=${REFERRAL_CODE}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    return { success: json.success };
  } catch {
    return { success: false, error: 'Failed to apply referral' };
  }
}

async function addLink(url) {
  const data = await browser.storage.local.get('apiKey');
  const apiKey = data.apiKey;
  if (!apiKey) return { success: false, error: 'Not logged in' };

  const linkType = classifyLink(url);
  if (!linkType) return { success: false, error: 'Invalid link type' };

  let endpoint, formField;
  switch (linkType) {
    case 'magnet':
      return addMagnet(url);
    case 'nzb':
      endpoint = 'usenet/createusenetdownload';
      formField = 'link';
      break;
    case 'web':
      endpoint = 'webdl/createwebdownload';
      formField = 'link';
      break;
  }

  try {
    const apiBase = await getApiBase();
    const form = new FormData();
    form.append(formField, url);
    const res = await fetch(`${apiBase}/${endpoint}`, {
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

import { storage } from './storage';

const BASE_URL = 'https://api.torbox.app/v1/api';

async function getApiKey() {
  const data = await storage.get('apiKey');
  return data.apiKey || null;
}

async function request(endpoint, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key set');

  // Add cache-busting param to prevent stale responses
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${endpoint}${separator}_t=${Date.now()}`;

  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.detail || json.error || 'API request failed');
  }
  return json.data;
}

export const api = {
  getApiKey,

  async setApiKey(key) {
    await storage.set({ apiKey: key });
  },

  async clearApiKey() {
    await storage.remove('apiKey');
  },

  async validateKey(key) {
    const res = await fetch(`${BASE_URL}/user/me`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.detail || 'Invalid API key');
    }
    return json.data;
  },

  async getUser() {
    return request('/user/me?settings=true');
  },

  async getTorrents() {
    return request('/torrents/mylist');
  },

  async getUsenetDownloads() {
    return request('/usenet/mylist');
  },

  async getWebDownloads() {
    return request('/webdl/mylist');
  },
};

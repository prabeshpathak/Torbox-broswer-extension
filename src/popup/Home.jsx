import { useState, useEffect, useCallback } from 'react';
import { messaging } from '../utils/storage';
import { api } from '../utils/api';

const REFERRAL_CODE = '40b86eb0-e7c5-42d1-9c87-ab912dedd5c9';

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      if (Array.isArray(val[k])) return val[k];
    }
  }
  return [];
}

const PLAN_NAMES = {
  0: 'Free',
  1: 'Essential',
  2: 'Standard',
  3: 'Pro',
};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatEta(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// TorBox download_state can be a string or absent
// Known string states from the API
const STATE_MAP = {
  'downloading': { label: 'Downloading', cls: 'status-downloading' },
  'uploading': { label: 'Seeding', cls: 'status-seeding' },
  'seeding': { label: 'Seeding', cls: 'status-seeding' },
  'stalled (no seeds)': { label: 'Stalled', cls: 'status-stalled' },
  'stalled': { label: 'Stalled', cls: 'status-stalled' },
  'completed': { label: 'Completed', cls: 'status-complete' },
  'cached': { label: 'Cached', cls: 'status-complete' },
  'paused': { label: 'Paused', cls: 'status-stalled' },
  'error': { label: 'Error', cls: 'status-stalled' },
  'magnet error': { label: 'Magnet Error', cls: 'status-stalled' },
};

function getStatusInfo(item) {
  if (item.download_state != null) {
    const raw = String(item.download_state);
    const s = raw.toLowerCase();

    // Exact match first
    if (STATE_MAP[s]) return STATE_MAP[s];

    // Partial match
    if (s.includes('check'))    return { label: 'Checking',          cls: 'status-checking' };
    if (s.includes('download')) return { label: 'Downloading',       cls: 'status-downloading' };
    if (s.includes('upload') || s.includes('seed')) return { label: 'Seeding', cls: 'status-seeding' };
    if (s.includes('stall'))    return { label: 'Stalled',           cls: 'status-stalled' };
    if (s.includes('complet') || s.includes('done') || s.includes('cached')) return { label: 'Completed', cls: 'status-complete' };
    if (s.includes('queue'))    return { label: 'Queued',            cls: 'status-waiting' };
    if (s.includes('pause'))    return { label: 'Paused',            cls: 'status-stalled' };
    if (s.includes('meta'))     return { label: 'Getting metadata',  cls: 'status-checking' };
    if (s.includes('error'))    return { label: 'Error',             cls: 'status-stalled' };

    // Show raw state
    return { label: raw.charAt(0).toUpperCase() + raw.slice(1), cls: 'status-waiting' };
  }

  const pct = item.progress != null ? Math.round(item.progress * 100) : null;
  if (pct === 100 || item.download_finished) return { label: 'Completed', cls: 'status-complete' };
  if (item.download_speed > 0) return { label: 'Downloading', cls: 'status-downloading' };
  if (item.upload_speed > 0) return { label: 'Seeding', cls: 'status-seeding' };
  if (pct != null && pct > 0) return { label: 'Stalled', cls: 'status-stalled' };
  return { label: 'Waiting', cls: 'status-waiting' };
}

function DownloadItem({ item, tab, onStop, onCopyLink }) {
  const [stopping, setStopping] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const status = getStatusInfo(item);
  const pct = item.progress != null ? Math.round(item.progress * 100) : null;
  const isActive = item.download_speed > 0 || item.upload_speed > 0;
  const isComplete = pct === 100 || item.download_finished;

  async function handleCopy() {
    setCopying(true);
    await onCopyLink(item, tab);
    setCopying(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    setStopping(true);
    await onStop(item, tab);
  }

  return (
    <div className={`download-item ${isActive ? 'active' : ''}`}>
      <div className="download-top">
        <div className="download-name" title={item.name}>{item.name}</div>
        <span className={`download-status ${status.cls}`}>{status.label}</span>
      </div>

      {isActive && (
        <div className="download-speeds">
          {item.download_speed > 0 && (
            <span className="speed-down">&#9660; {formatBytes(item.download_speed)}/s</span>
          )}
          {item.upload_speed > 0 && (
            <span className="speed-up">&#9650; {formatBytes(item.upload_speed)}/s</span>
          )}
          {item.eta > 0 && (
            <span className="speed-eta">ETA {formatEta(item.eta)}</span>
          )}
        </div>
      )}

      <div className="download-meta">
        <span className="download-size">{formatBytes(item.size)}</span>
        {item.seeds != null && (
          <span className="download-peers">S:{item.seeds} P:{item.peers || 0}</span>
        )}
        {item.ratio != null && item.ratio > 0 && (
          <span className="download-ratio">R:{item.ratio.toFixed(2)}</span>
        )}
        {pct != null && pct < 100 && (
          <span className="download-pct">{pct}%</span>
        )}
      </div>

      {pct != null && pct < 100 && (
        <div className="progress-bar">
          <div
            className={`progress-fill ${isActive ? 'animated' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="download-actions">
        {isComplete && (
          <button className="action-btn link-btn" onClick={handleCopy} disabled={copying} title="Copy download link">
            {copying ? '...' : copied ? 'Copied!' : '\uD83D\uDD17 Link'}
          </button>
        )}
        <button className="action-btn stop-btn" onClick={handleDelete} disabled={stopping} title="Delete">
          {stopping ? '...' : '\uD83D\uDDD1 Delete'}
        </button>
      </div>
    </div>
  );
}

function QueuedItem({ item, onStart, onDelete }) {
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleStart() {
    setStarting(true);
    await onStart(item);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(item);
  }

  return (
    <div className="download-item">
      <div className="download-top">
        <div className="download-name" title={item.name}>{item.name}</div>
        <span className="download-status status-waiting">Queued</span>
      </div>
      <div className="download-meta">
        <span className="download-size">{formatBytes(item.size)}</span>
      </div>
      <div className="download-actions">
        <button className="action-btn start-btn" onClick={handleStart} disabled={starting} title="Start download">
          {starting ? '...' : '\u25B6 Start'}
        </button>
        <button className="action-btn stop-btn" onClick={handleDelete} disabled={deleting} title="Delete">
          {deleting ? '...' : '\uD83D\uDDD1 Delete'}
        </button>
      </div>
    </div>
  );
}

export default function Home({ user, onLogout }) {
  const [tab, setTab] = useState('torrents');
  const [torrents, setTorrents] = useState([]);
  const [usenet, setUsenet] = useState([]);
  const [webDl, setWebDl] = useState([]);
  const [queued, setQueued] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [magnet, setMagnet] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [referralCopied, setReferralCopied] = useState(false);

  const handleReferral = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(REFERRAL_CODE);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
      window.open(`https://torbox.app/subscription?referral=${REFERRAL_CODE}`, '_blank');
    } catch { /* ignore */ }
  }, []);

  async function fetchDownloads() {
    const key = await api.getApiKey();
    const headers = { Authorization: `Bearer ${key}` };
    const [t, u, w, q] = await Promise.all([
      fetch(`https://api.torbox.app/v1/api/torrents/mylist?_t=${Date.now()}`, {
        headers, cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`https://api.torbox.app/v1/api/usenet/mylist?_t=${Date.now()}`, {
        headers, cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`https://api.torbox.app/v1/api/webdl/mylist?_t=${Date.now()}`, {
        headers, cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
      fetch(`https://api.torbox.app/v1/api/queued/getqueued?bypass_cache=true&_t=${Date.now()}`, {
        headers, cache: 'no-store',
      }).then((r) => r.json()).catch(() => null),
    ]);

    setTorrents(toArray(t?.data));
    setUsenet(toArray(u?.data));
    setWebDl(toArray(w?.data));
    setQueued(toArray(q?.data));
    setLoading(false);
    setError('');
    updateBadge();
  }

  useEffect(() => {
    fetchDownloads().catch(() => {
      setError('Failed to load');
      setLoading(false);
    });
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { await fetchDownloads(); } catch { setError('Failed to load'); }
    setRefreshing(false);
  }

  function updateBadge() {
    messaging.sendToBackground({ type: 'UPDATE_BADGE' }).catch(() => {});
  }

  async function handleStartQueued(item) {
    const key = await api.getApiKey();
    try {
      await fetch('https://api.torbox.app/v1/api/queued/controlqueued', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queued_id: item.id, operation: 'start' }),
      });
      await fetchDownloads();
    } catch { /* ignore */ }
  }

  async function handleDeleteQueued(item) {
    const key = await api.getApiKey();
    try {
      await fetch('https://api.torbox.app/v1/api/queued/controlqueued', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queued_id: item.id, operation: 'delete' }),
      });
      await fetchDownloads();
    } catch { /* ignore */ }
  }

  async function handleStop(item, currentTab) {
    const key = await api.getApiKey();
    const endpoint = currentTab === 'usenet' ? 'usenet/controlusenetdownload'
      : currentTab === 'webDl' ? 'webdl/controlwebdownload'
      : 'torrents/controltorrent';
    const idField = currentTab === 'usenet' ? 'usenet_id'
      : currentTab === 'webDl' ? 'web_id'
      : 'torrent_id';
    try {
      await fetch(`https://api.torbox.app/v1/api/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [idField]: item.id, operation: 'delete' }),
      });
      await fetchDownloads();
    } catch { /* ignore */ }
  }

  async function handleCopyLink(item, currentTab) {
    const key = await api.getApiKey();
    const endpoint = currentTab === 'usenet' ? 'usenet/requestdl'
      : currentTab === 'webDl' ? 'webdl/requestdl'
      : 'torrents/requestdl';
    const idParam = currentTab === 'usenet' ? 'usenet_id'
      : currentTab === 'webDl' ? 'web_id'
      : 'torrent_id';
    try {
      const res = await fetch(
        `https://api.torbox.app/v1/api/${endpoint}?token=${key}&${idParam}=${item.id}&file_id=0`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (json.success && json.data) {
        await navigator.clipboard.writeText(json.data);
      }
    } catch { /* ignore */ }
  }

  async function handleAddTorrent(e) {
    e.preventDefault();
    if (!magnet.trim()) return;
    setAdding(true);
    setAddMsg('');
    try {
      const key = await api.getApiKey();
      const form = new FormData();
      form.append('magnet', magnet.trim());
      const res = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      const json = await res.json();
      if (json.success) {
        setAddMsg(json.detail || 'Torrent added!');
        setMagnet('');
        await fetchDownloads();
        setTimeout(() => { setAddMsg(''); setShowAdd(false); }, 2000);
      } else {
        setAddMsg(json.detail || 'Failed to add torrent');
      }
    } catch {
      setAddMsg('Network error');
    }
    setAdding(false);
  }

  const planName = PLAN_NAMES[user?.plan] || 'Unknown';
  const currentList =
    tab === 'torrents' ? torrents : tab === 'usenet' ? usenet : tab === 'queued' ? queued : webDl;

  const sortedList = tab === 'queued' ? [...currentList] : [...currentList].sort((a, b) => {
    const aActive = (a.download_speed || 0) + (a.upload_speed || 0);
    const bActive = (b.download_speed || 0) + (b.upload_speed || 0);
    if (aActive > 0 && bActive === 0) return -1;
    if (bActive > 0 && aActive === 0) return 1;
    return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
  });

  const activeCount = currentList.filter(
    (i) => (i.download_speed || 0) > 0
  ).length;

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="header-top">
          <div className="header-logo">
            <img src="/icons/logo.svg" alt="TorBox" />
            <h1>TorBox</h1>
          </div>
          <div className="header-actions">
            <button className="icon-btn referral-btn" onClick={handleReferral} title={referralCopied ? 'Copied!' : 'Support TorBox (referral)'}>
              {referralCopied ? '\u2705' : '\u2764'}
            </button>
            <button className="icon-btn add-btn" onClick={() => setShowAdd(!showAdd)} title="Add Torrent">
              &#43;
            </button>
            <button
              className={`icon-btn ${refreshing ? 'spinning' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh"
            >
              &#8635;
            </button>
            <button className="icon-btn logout-btn" onClick={onLogout} title="Logout">
              &#10005;
            </button>
          </div>
        </div>
        <div className="user-info">
          <span className="user-email">{user?.email}</span>
          <span className={`user-plan plan-${user?.plan || 0}`}>{planName}</span>
        </div>
        <div className="user-stats">
          <div className="stat">
            <span className="stat-value">{formatBytes(user?.total_bytes_downloaded)}</span>
            <span className="stat-label">Downloaded</span>
          </div>
          <div className="stat">
            <span className="stat-value">{user?.torrents_downloaded || 0}</span>
            <span className="stat-label">Torrents</span>
          </div>
          <div className="stat">
            <span className="stat-value">{user?.web_downloads_downloaded || 0}</span>
            <span className="stat-label">Web DLs</span>
          </div>
        </div>
      </header>

      {showAdd && (
        <form className="add-torrent" onSubmit={handleAddTorrent}>
          <input
            type="text"
            value={magnet}
            onChange={(e) => setMagnet(e.target.value)}
            placeholder="Paste magnet link..."
            className="magnet-input"
            autoFocus
          />
          <button type="submit" className="add-submit" disabled={!magnet.trim() || adding}>
            {adding ? '...' : 'Add'}
          </button>
          {addMsg && <div className={`add-msg ${addMsg.includes('added') || addMsg.includes('Added') ? 'success' : 'fail'}`}>{addMsg}</div>}
        </form>
      )}

      <nav className="tabs">
        <button className={`tab ${tab === 'torrents' ? 'active' : ''}`} onClick={() => setTab('torrents')}>
          Torrents ({torrents.length})
        </button>
        <button className={`tab ${tab === 'usenet' ? 'active' : ''}`} onClick={() => setTab('usenet')}>
          Usenet ({usenet.length})
        </button>
        <button className={`tab ${tab === 'webDl' ? 'active' : ''}`} onClick={() => setTab('webDl')}>
          Web DL ({webDl.length})
        </button>
        <button className={`tab ${tab === 'queued' ? 'active' : ''}`} onClick={() => setTab('queued')}>
          Queued ({queued.length})
        </button>
      </nav>

      {activeCount > 0 && (
        <div className="active-banner">
          {activeCount} active download{activeCount > 1 ? 's' : ''}
          <span className="pulse-dot" />
        </div>
      )}

      <div className="downloads-list">
        {loading ? (
          <div className="loading">Loading downloads...</div>
        ) : error ? (
          <div className="error-text">{error}</div>
        ) : sortedList.length === 0 ? (
          <div className="empty">No {tab === 'webDl' ? 'web downloads' : tab} yet</div>
        ) : (
          sortedList.map((item) =>
            tab === 'queued'
              ? <QueuedItem key={item.id} item={item} onStart={handleStartQueued} onDelete={handleDeleteQueued} />
              : <DownloadItem key={item.id} item={item} tab={tab} onStop={handleStop} onCopyLink={handleCopyLink} />
          )
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';
import { storage } from '../utils/storage';

export default function Options() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [handlerRegistered, setHandlerRegistered] = useState(false);

  useEffect(() => {
    storage.get('apiKey').then((data) => {
      if (data.apiKey) setApiKey(data.apiKey);
    });
  }, []);

  const save = async () => {
    await storage.set({ apiKey: apiKey.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clear = async () => {
    await storage.remove('apiKey');
    setApiKey('');
  };

  const registerMagnetHandler = () => {
    try {
      const handlerUrl = browser.runtime.getURL('magnet-handler.html') + '?uri=%s';
      navigator.registerProtocolHandler('magnet', handlerUrl);
      setHandlerRegistered(true);
      setTimeout(() => setHandlerRegistered(false), 3000);
    } catch {
      setHandlerRegistered(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', fontFamily: 'sans-serif', color: '#e0e0e0', background: '#12141B', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ color: '#04BF8A', marginBottom: 20 }}>TorBox Settings</h1>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#9CA3AF' }}>
        API Key
      </label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Paste your API key..."
        style={{ width: '100%', padding: 10, background: '#1E2129', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e0e0e0', fontSize: 14, marginBottom: 12 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ padding: '10px 20px', background: '#04BF8A', color: '#12141B', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {saved ? 'Saved!' : 'Save'}
        </button>
        <button onClick={clear} style={{ padding: '10px 20px', background: '#1E2129', color: '#9CA3AF', border: '1px solid #2a2f3a', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          Clear
        </button>
      </div>
      <p style={{ marginTop: 16, fontSize: 12, color: '#6B7280' }}>
        Get your API key from <a href="https://torbox.app/settings" target="_blank" rel="noopener noreferrer" style={{ color: '#04BF8A' }}>torbox.app/settings</a>
      </p>

      <hr style={{ border: 'none', borderTop: '1px solid #2a2f3a', margin: '24px 0' }} />
      <h2 style={{ color: '#04BF8A', fontSize: 18, marginBottom: 8 }}>Magnet Link Handler</h2>
      <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>
        Register TorBox as your default magnet link handler. When you click a magnet link, it will be sent directly to TorBox instead of opening a torrent client.
      </p>
      <button onClick={registerMagnetHandler} style={{ padding: '10px 20px', background: handlerRegistered ? '#1E2129' : '#04BF8A', color: handlerRegistered ? '#04BF8A' : '#12141B', border: handlerRegistered ? '1px solid #04BF8A' : 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.2s' }}>
        {handlerRegistered ? 'Registered!' : 'Set TorBox as Magnet Handler'}
      </button>
    </div>
  );
}

import { useState } from 'react';

export default function Login({ onLogin, error }) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setLoading(true);
    await onLogin(apiKey.trim());
    setLoading(false);
  };

  return (
    <div className="login-container">
      <img src="/icons/logo.svg" alt="TorBox" className="login-logo" />
      <div className="login-header">
        <h1>TorBox</h1>
        <p className="login-subtitle">Enter your API key to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your API key..."
          className="api-key-input"
          autoFocus
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={!apiKey.trim() || loading} className="login-btn">
          {loading ? 'Validating...' : 'Login'}
        </button>
      </form>

      <p className="login-help">
        Get your API key from{' '}
        <a
          href="https://torbox.app/settings"
          target="_blank"
          rel="noopener noreferrer"
        >
          torbox.app/settings
        </a>
      </p>
    </div>
  );
}

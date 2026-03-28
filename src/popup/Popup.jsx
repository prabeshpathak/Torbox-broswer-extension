import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import Login from './Login';
import Home from './Home';
import './Popup.css';

export default function Popup() {
  const [loggedIn, setLoggedIn] = useState(null); // null = loading
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getApiKey().then((key) => {
      if (key) {
        loadUser();
      } else {
        setLoggedIn(false);
      }
    });
  }, []);

  const loadUser = async () => {
    try {
      const userData = await api.getUser();
      setUser(userData);
      setLoggedIn(true);
      setError('');
    } catch (err) {
      setError('Session expired. Please log in again.');
      setLoggedIn(false);
      await api.clearApiKey();
    }
  };

  const handleLogin = async (key) => {
    setError('');
    try {
      const userData = await api.validateKey(key);
      await api.setApiKey(key);
      setUser(userData);
      setLoggedIn(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await api.clearApiKey();
    setUser(null);
    setLoggedIn(false);
  };

  if (loggedIn === null) {
    return (
      <div className="popup-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      {loggedIn ? (
        <Home user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} error={error} />
      )}
    </div>
  );
}

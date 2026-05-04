import { useState } from 'react';

import { login, register } from '../api/auth';

function AuthPage({ onLogin }) {

  const [mode, setMode] = useState('login');

  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    setError('');

    setLoading(true);

    let data;
    if (mode === 'login') {
      data = await login(email, password);
    } else {
      data = await register(username, email, password);
    }

    setLoading(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    onLogin(data.token, data.user);
  }

  function switchMode() {
    setMode(prev => prev === 'login' ? 'register' : 'login');
    setError('');
    setUsername('');
    setEmail('');
    setPassword('');
  }


  // ── UI ──
  return (
    <div className="auth-page">

      <div className="auth-card">

        <div className="auth-logo">
          <span className="logo-dot" />
          <span className="app-name">Llama Chat</span>
        </div>

        <h2 className="auth-title">
          {mode === 'login' ? 'Welcome back' : 'Create an account'}
        </h2>

        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Log in to continue your conversations'
            : 'Sign up to start chatting with Llama'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>

          {mode === 'register' && (
            <div className="auth-field">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Choose a username"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="auth-switch-btn" onClick={switchMode}>
            {mode === 'login' ? 'Register' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
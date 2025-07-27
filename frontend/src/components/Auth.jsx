import React, { useState } from 'react';

const Auth = ({ onAuth }) => {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const url = mode === 'login'
        ? 'http://localhost:3001/api/auth/login'
        : 'http://localhost:3001/api/auth/register';
      const body = mode === 'login'
        ? { email, password }
        : { username, email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.token) {
        onAuth(data.token, data.user);
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="auth-container">
      <h2>{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Username"
            value={username}
            required
            onChange={e => setUsername(e.target.value)}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit">{mode === 'login' ? 'Login' : 'Sign Up'}</button>
      </form>
      <div>
        {mode === 'login' ? (
          <span>
            Don't have an account?{' '}
            <button type="button" onClick={() => setMode('signup')}>Sign Up</button>
          </span>
        ) : (
          <span>
            Already have an account?{' '}
            <button type="button" onClick={() => setMode('login')}>Login</button>
          </span>
        )}
      </div>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
};

export default Auth;

import { useState, useEffect } from 'react'
import Music from './components/music'
import Auth from './components/Auth'
import './App.css'

function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);

  // Load token/user from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken) setToken(storedToken);
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  // Save token/user to localStorage on login/signup
  const handleAuth = (t, u) => {
    setToken(t);
    setUser(u);
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  };

  // Logout handler
  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <>
      {!token
        ? <Auth onAuth={handleAuth} />
        : (
          <>
            <button
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 1000,
                padding: '0.5rem 1rem',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer'
              }}
              onClick={handleLogout}
            >
              Logout
            </button>
            <Music token={token} user={user} />
          </>
        )
      }
    </>
  )
}

export default App

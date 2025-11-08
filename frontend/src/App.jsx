import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Music from './components/music';
import Auth from './components/Auth';
import './App.css';
import './index.css';
import Login from './music/login';
import Signup from './music/signup';
import SongManager from './music/songmanager';
import FavoriteSongs from './music/favioute';
import Roommanagement from './music/roommanagement';
import Header from './music/navbar';

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
    <Router>
      <Header/>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login  />} />
        <Route path="/signup" element={<Signup  />} />
        <Route
          path="/songmanager"
          element={
              <SongManager  />
          }
        />
        <Route
          path="/favorite"
          element={
              <FavoriteSongs />
          }
        />
        <Route
          path="/room"
          element={
              <Roommanagement />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

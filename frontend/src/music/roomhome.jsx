import React, { useState } from 'react';
import './roomhome.css';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const API_ROOMS = `${API_BASE_URL}/api/rooms`;

const Home = ({ onJoinRoom }) => {
  const [isCreating, setIsCreating] = useState(false);

  // create form state
  const [createCode, setCreateCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [createIsPrivate, setCreateIsPrivate] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  const [createTheme, setCreateTheme] = useState('default');

  // join form state
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!token) {
      setError('Please log in first');
      return;
    }
    if (!createCode.trim()) {
      setError('Room code is required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_ROOMS}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: createCode.trim(),
          name: createName.trim(),
          isPrivate: createIsPrivate,
          password: createPassword,
          theme: createTheme,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create room');
      }
      setSuccess('Room created successfully! Joining...');
      setTimeout(() => {
        onJoinRoom(createCode.trim());
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!token) {
      setError('Please log in first');
      return;
    }
    if (!joinCode.trim()) {
      setError('Room code is required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_ROOMS}/${joinCode.trim()}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: joinPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join room');
      }
      setSuccess('Room joined successfully! Redirecting...');
      setTimeout(() => {
        onJoinRoom(joinCode.trim());
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const themeOptions = ['default', 'dark', 'light', 'purple', 'blue', 'green'];

  return (
    <div className="room-home-container">
      <div className="room-welcome-section">
        <div className="room-welcome-header">
          <h1 className="room-welcome-title">Welcome to Rooms</h1>
          <p className="room-welcome-subtitle">Create a new room or join an existing one to collaborate</p>
        </div>

        {/* Tab Navigation */}
        <div className="room-tab-nav">
          <button
            className={`room-tab-button ${!isCreating ? 'active' : ''}`}
            onClick={() => {
              setIsCreating(false);
              setError('');
              setSuccess('');
            }}
          >
            Join a Room
          </button>
          <button
            className={`room-tab-button ${isCreating ? 'active' : ''}`}
            onClick={() => {
              setIsCreating(true);
              setError('');
              setSuccess('');
            }}
          >
            Create Room
          </button>
        </div>

        {/* Join Room Form */}
        <div className={`room-form-container ${!isCreating ? 'active' : ''}`}>
          <form onSubmit={handleJoinRoom} className="room-form">
            <div className="room-form-group">
              <label className="room-form-label">
                Room Code
                <span className="room-form-required">*</span>
              </label>
              <input
                type="text"
                className="room-form-input"
                placeholder="Enter the room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                required
                disabled={loading}
              />
              <span className="room-help-text">Ask the room owner for the code</span>
            </div>

            <div className="room-form-group">
              <label className="room-form-label">Password (if required)</label>
              <input
                type="password"
                className="room-form-input"
                placeholder="Enter password if the room is protected"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <span className="room-help-text">Leave empty if no password is set</span>
            </div>

            <button type="submit" className="room-submit-button" disabled={loading}>
              {loading ? 'Joining...' : 'Join Room'}
            </button>
          </form>
        </div>

        {/* Create Room Form */}
        <div className={`room-form-container ${isCreating ? 'active' : ''}`}>
          <form onSubmit={handleCreateRoom} className="room-form">
            <div className="room-form-group">
              <label className="room-form-label">
                Room Code
                <span className="room-form-required">*</span>
              </label>
              <input
                type="text"
                className="room-form-input"
                placeholder="e.g., ROOM-2024"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                required
                disabled={loading}
              />
              <span className="room-help-text">Unique identifier for your room</span>
            </div>

            <div className="room-form-group">
              <label className="room-form-label">Room Name</label>
              <input
                type="text"
                className="room-form-input"
                placeholder="e.g., My Music Session"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={loading}
              />
              <span className="room-help-text">Optional friendly name for your room</span>
            </div>

            <div className="room-form-group">
              <div className="room-checkbox-group">
                <input
                  type="checkbox"
                  id="privateRoom"
                  checked={createIsPrivate}
                  onChange={(e) => setCreateIsPrivate(e.target.checked)}
                  disabled={loading}
                />
                <label htmlFor="privateRoom">Make this a private room</label>
              </div>
              <span className="room-help-text">Private rooms require a password to join</span>
            </div>

            {createIsPrivate && (
              <div className="room-form-group">
                <label className="room-form-label">
                  Password
                  <span className="room-form-required">*</span>
                </label>
                <input
                  type="password"
                  className="room-form-input"
                  placeholder="Enter a secure password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  autoComplete="new-password"
                  required={createIsPrivate}
                  disabled={loading}
                />
                <span className="room-help-text">Share this password with people you want to invite</span>
              </div>
            )}

            <div className="room-form-group">
              <label className="room-form-label">Room Theme</label>
              <div className="room-theme-select">
                {themeOptions.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`room-theme-option ${createTheme === theme ? 'selected' : ''}`}
                    onClick={() => setCreateTheme(theme)}
                    disabled={loading}
                  >
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="room-submit-button" disabled={loading}>
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && <div className="room-error-message">{error}</div>}

        {/* Success Message */}
        {success && <div className="room-success-message">{success}</div>}
      </div>
    </div>
  );
};

export default Home;

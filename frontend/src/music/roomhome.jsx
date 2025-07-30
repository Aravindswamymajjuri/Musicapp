import React, { useState } from 'react';

const API_ROOMS = 'http://localhost:3001/api/rooms';

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
  const token = localStorage.getItem('token');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Please log in first');
      return;
    }
    if (!createCode.trim()) {
      setError('Room code is required');
      return;
    }
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
      // Room created, automatically join
      onJoinRoom(createCode.trim());
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Please log in first');
      return;
    }
    if (!joinCode.trim()) {
      setError('Room code is required');
      return;
    }
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
      onJoinRoom(joinCode.trim());
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: 'auto', padding: 20 }}>
      <h2>Welcome! Create or Join a Room</h2>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setIsCreating(false)} disabled={!isCreating}>
          Join Room
        </button>
        <button onClick={() => setIsCreating(true)} disabled={isCreating} style={{ marginLeft: 10 }}>
          Create Room
        </button>
      </div>

      {isCreating ? (
        <form onSubmit={handleCreateRoom}>
          <div>
            <label>Room Code: *</label><br />
            <input value={createCode} onChange={(e) => setCreateCode(e.target.value)} required />
          </div>
          <div>
            <label>Room Name:</label><br />
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} />
          </div>
          <div>
            <label>
              <input type="checkbox" checked={createIsPrivate} onChange={(e) => setCreateIsPrivate(e.target.checked)} />
              Private Room
            </label>
          </div>
          {createIsPrivate && (
            <div>
              <label>Password:</label><br />
              <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required />
            </div>
          )}
          <div>
            <label>Theme:</label><br />
            <input value={createTheme} onChange={(e) => setCreateTheme(e.target.value)} />
          </div>
          <button type="submit">Create Room</button>
        </form>
      ) : (
        <form onSubmit={handleJoinRoom}>
          <div>
            <label>Room Code:</label><br />
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required />
          </div>
          <div>
            <label>Password (if required):</label><br />
            <input type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
          </div>
          <button type="submit">Join Room</button>
        </form>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default Home;

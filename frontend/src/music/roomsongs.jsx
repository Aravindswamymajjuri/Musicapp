import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Safe environment lookup to avoid ReferenceError in browser
const envFromProcess = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ? process.env.REACT_APP_BACKEND_URL : null;
const envFromImportMeta = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL) : null;
const API_BASE = envFromProcess || envFromImportMeta || 'https://musicapp-7dy9.onrender.com';
const API_ROOMS = `${API_BASE}/api/rooms`;
const API_SONGS = `${API_BASE}/api/songs`;
const SOCKET_URL = API_BASE;

const ROOM_STORAGE_KEY = 'joinedRoomCode'; // NEW: storage key constant

const Room = ({ roomCode, onLeaveRoom, userId }) => {
  const token = localStorage.getItem('token');

  // Room and UI states
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [loadingRoom, setLoadingRoom] = useState(true);

  // All songs from DB for adding to queue or direct play
  const [allSongs, setAllSongs] = useState([]);
  const [allSongsLoading, setAllSongsLoading] = useState(false);
  const [allSongsError, setAllSongsError] = useState('');

  // Playback and queue states
  const [queue, setQueue] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Users and host state
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  const audioRef = useRef();

  // Socket: join room and listen for host playback
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current.on('connect', () => {
      socketRef.current.emit('joinRoom', roomCode);
    });

    socketRef.current.on('playback', (playback) => {
      if (!playback) return;
      // Guests should apply host playback
      if (isHost) return;
      if (playback.currentSong) {
        // playback may contain a lightweight song object
        setCurrentSong(playback.currentSong);
      } else if (playback.currentSongId) {
        const found = allSongs.find(s => s._id === playback.currentSongId);
        setCurrentSong(found || { _id: playback.currentSongId });
      } else {
        setCurrentSong(null);
      }
      if (typeof playback.currentTime === 'number') setCurrentTime(playback.currentTime);
      if (typeof playback.isPlaying === 'boolean') setIsPlaying(playback.isPlaying);
      if (Array.isArray(playback.queue)) {
        const newQ = playback.queue.map(q => (typeof q === 'string' ? (allSongs.find(s => s._id === q) || { _id: q }) : q));
        setQueue(newQ);
      }
    });

    // If server forcibly removes this socket, clear storage and leave room UI
    socketRef.current.on('removed', (info) => {
      try {
        // remove stored joined room code so user doesn't auto-rejoin
        localStorage.removeItem(ROOM_STORAGE_KEY);
      } catch (e) { /* ignore */ }
      try { if (onLeaveRoom) onLeaveRoom(); } catch (e) {}
    });

    return () => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('leaveRoom', roomCode);
        socketRef.current.disconnect();
      }
    };
    // include deps that affect behavior
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost, allSongs]);

  // Fetch room info on mount & poll (avoid loading flicker on every poll)
  useEffect(() => {
    const fetchRoom = async () => {
      setLoadingRoom(true);
      setError('');
      try {
        const res = await fetch(`${API_ROOMS}/${roomCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Room not found');
        }
        const data = await res.json();

        setRoom(data);
        setUsers(data.users || []);
        setCurrentSong(data.currentSong || null);
        setCurrentTime(data.currentTime || 0);
        setIsPlaying(data.isPlaying || false);
        setQueue(data.queue || []);
        setIsHost(data.host?._id === userId);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingRoom(false);
      }
    };

    fetchRoom();
    const interval = setInterval(fetchRoom, 500000); // every 5 seconds
    return () => clearInterval(interval);
  }, [roomCode, token, userId]);

  // Fetch all songs from DB for UI
  useEffect(() => {
    const fetchSongs = async () => {
      setAllSongsLoading(true);
      setAllSongsError('');
      try {
        const res = await fetch(API_SONGS, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch songs: ${res.status}`);
        const data = await res.json();
        setAllSongs(data);
      } catch (err) {
        setAllSongsError(err.message || 'Error fetching songs');
        setAllSongs([]);
      } finally {
        setAllSongsLoading(false);
      }
    };
    fetchSongs();
  }, [token]);

  // Host pushes playback updates every 2 seconds
  useEffect(() => {
    if (!isHost) return;

    const interval = setInterval(async () => {
      if (!room) return;
      try {
        await fetch(`${API_ROOMS}/${roomCode}/playback`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentSongId: currentSong?._id || null,
            currentTime: audioRef.current ? audioRef.current.currentTime : 0,
            isPlaying,
            queue: queue.map(s => s._id),
          }),
        });
      } catch (e) {
        console.error('Failed to update playback:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isHost, currentSong, isPlaying, queue, room, roomCode, token]);

  // Guests sync their audio player to host playback state
  useEffect(() => {
    if (!audioRef.current) return;
    if (isHost) return; // Host controls playback directly

    if (!currentSong) {
      audioRef.current.pause();
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;

    if (audioRef.current.src !== streamUrl) {
      audioRef.current.src = streamUrl;
      audioRef.current.load();
    }

    // Sync playback position with a 1s tolerance
    const audioTime = audioRef.current.currentTime;
    if (Math.abs(audioTime - currentTime) > 1) {
      audioRef.current.currentTime = currentTime;
    }

    if (isPlaying) {
      audioRef.current.play().catch(e => console.log('Playback error', e));
    } else {
      audioRef.current.pause();
    }
  }, [currentSong, currentTime, isPlaying, isHost]);

  // Host toggles play/pause manually
  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // When current song ends, play the next song in the queue
  const handleEnded = () => {
    if (queue.length === 0) {
      setCurrentSong(null);
      setIsPlaying(false);
      return;
    }
    const [, ...rest] = queue;
    setQueue(rest);
    setCurrentSong(queue[0]);
  };

  // Host adds a song to the queue
  const addSongToQueue = (song) => {
    setQueue([...queue, song]);

    // Start playing if no song is currently playing
    if (!currentSong) {
      setCurrentSong(song);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.load();
        audioRef.current.play().catch(() => {});
      }
    }
  };

  // Placeholder for removing users (needs backend support)
  const removeUser = async (userIdToRemove) => {
    if (!isHost) return alert('Only host can remove users');
    if (userIdToRemove === userId) return alert('Host cannot remove themselves');

    try {
      alert('Remove user functionality needs backend API implementation.');
    } catch (e) {
      alert('Failed to remove user: ' + e.message);
    }
  };

  // Update playback current time
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  // Leave wrapper used by the Leave Room button
  const handleLocalLeave = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try { localStorage.removeItem(ROOM_STORAGE_KEY); } catch (err) { /* ignore */ }
    if (onLeaveRoom) onLeaveRoom();
  };

  if (loadingRoom) return <p>Loading room...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!room) return <p>Room not found</p>;

  return (
    <div style={{ maxWidth: 900, margin: 'auto', padding: 20 }}>
      <h2>Room: {room.name || room.code}</h2>
      <p><strong>Code:</strong> {room.code}</p>
      <p><strong>Host:</strong> {room.host?.username || '(unknown)'}</p>

      <button type="button" onClick={handleLocalLeave} style={{ marginBottom: 20 }}>
        Leave Room
      </button>

      <h3>Users in Room ({users.length}):</h3>
      <ul>
        {users.map(u => (
          <li key={u._id}>
            {u.username || u.email}
            {isHost && u._id !== userId && (
              <button
                onClick={() => removeUser(u._id)}
                style={{ marginLeft: 10, color: 'red' }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Current Song:</h3>
      {currentSong ? (
        <div>
          <p><strong>{currentSong.title}</strong> by {currentSong.artist}</p>
          <audio
            ref={audioRef}
            controls
            autoPlay={isPlaying}
            onEnded={handleEnded}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            crossOrigin="anonymous"
          />
          {isHost && (
            <button onClick={togglePlayPause} style={{ marginTop: 10 }}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}
        </div>
      ) : (
        <p>No song is currently playing.</p>
      )}

      {/* Queue display */}
      <h3>Queue ({queue.length} songs):</h3>
      {queue.length === 0 ? (
        <p>The queue is empty.</p>
      ) : (
        <ul>
          {queue.map((s, i) => (
            <li key={s._id}>{i + 1}. {s.title} - {s.artist}</li>
          ))}
        </ul>
      )}

      {/* All songs list with Play and Add to Queue */}
      <h3>All Songs in Database</h3>
      {allSongsLoading && <p>Loading songs...</p>}
      {allSongsError && <p style={{ color: 'red' }}>{allSongsError}</p>}
      {!allSongsLoading && !allSongsError && (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ccc', padding: 10 }}>
          {allSongs.length === 0 ? (
            <p>No songs available.</p>
          ) : (
            allSongs.map(song => (
              <div key={song._id} style={{ marginBottom: 5 }}>
                <strong>{song.title}</strong> by {song.artist}{' '}
                <button
                  onClick={() => {
                    setCurrentSong(song);
                    setIsPlaying(true);
                    setQueue([]); // clear queue when playing manually
                    if (audioRef.current) {
                      audioRef.current.src = `${API_SONGS}/${song._id}/stream`;
                      audioRef.current.load();
                      audioRef.current.play().catch(() => {});
                    }
                  }}
                >
                  Play
                </button>
                {isHost && (
                  <button onClick={() => addSongToQueue(song)} style={{ marginLeft: 10 }}>
                    Add to Queue
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Room;

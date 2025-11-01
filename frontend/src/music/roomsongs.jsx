import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Safe environment lookup to avoid ReferenceError in browser
const envFromProcess = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ? process.env.REACT_APP_BACKEND_URL : null;
const envFromImportMeta = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL) : null;
const API_BASE = envFromProcess || envFromImportMeta || 'http://localhost:3001';
const API_ROOMS = `${API_BASE}/api/rooms`;
const API_SONGS = `${API_BASE}/api/songs`;
const SOCKET_URL = API_BASE;

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

  const audioRef = useRef(null);
  const socketRef = useRef(null);
  const initialLoad = useRef(true);

  // Helper: emit host playback to room immediately
  const emitHostPlayback = (overridePlayback) => {
    if (!socketRef.current || !isHost) return;
    try {
      const payload = overridePlayback || {
        currentSongId: currentSong?._id || null,
        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
        isPlaying,
        queue: queue.map(s => s._id || s),
      };
      socketRef.current.emit('hostPlayback', { roomCode, playback: payload });
    } catch (e) {
      // ignore emit errors
    }
  };

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
    let mounted = true;
    const fetchRoom = async () => {
      if (!mounted) return;
      if (initialLoad.current) setLoadingRoom(true);
      setError('');
      try {
        const res = await fetch(`${API_ROOMS}/${roomCode}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Room not found');
        }
        const data = await res.json();
        setRoom(data);
        setUsers(data.users || []);
        setCurrentSong(data.currentSong || null);
        setCurrentTime(data.currentTime || 0);
        setIsPlaying(!!data.isPlaying);
        setQueue((data.queue || []).map(idOrObj => (typeof idOrObj === 'string' ? { _id: idOrObj } : idOrObj)));
        setIsHost(data.host?._id === userId);
      } catch (err) {
        setError(err.message || 'Failed to load room');
      } finally {
        if (initialLoad.current) {
          setLoadingRoom(false);
          initialLoad.current = false;
        }
      }
    };

    fetchRoom();
    const pollInterval = isHost ? 5000 : 2000;
    const interval = setInterval(fetchRoom, pollInterval);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [roomCode, token, userId, isHost]);

  // Fetch all songs from DB for UI
  useEffect(() => {
    const fetchSongs = async () => {
      setAllSongsLoading(true);
      setAllSongsError('');
      try {
        const res = await fetch(API_SONGS, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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

  // Host pushes playback updates (REST persist) and emits socket for instant guest updates
  useEffect(() => {
    if (!isHost) return;
    const tick = async () => {
      if (!room) return;
      const payload = {
        currentSongId: currentSong?._id || null,
        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
        isPlaying,
        queue: queue.map(s => s._id || s),
      };

      try {
        await fetch(`${API_ROOMS}/${roomCode}/playback`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error('REST playback update failed', e);
      }

      try {
        socketRef.current?.emit('hostPlayback', { roomCode, playback: payload });
      } catch (e) {
        // ignore socket errors
      }
    };

    const interval = setInterval(tick, 2000);
    return () => clearInterval(interval);
  }, [isHost, currentSong, isPlaying, queue, room, roomCode, token]);

  // Guests sync their audio player to host playback state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isHost) return; // host controls local player

    if (!currentSong) {
      audio.pause();
      try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;

    // compare by id to avoid absolute/relative URL differences
    const srcIncludesId = audio.src && String(audio.src).includes(currentSong._id);
    if (!srcIncludesId) {
      audio.src = streamUrl;
      audio.load();
      // set time after canplay
      const onCanPlay = () => {
        if (!Number.isNaN(currentTime) && currentTime > 0 && currentTime < (audio.duration || Infinity)) {
          try { audio.currentTime = currentTime; } catch (e) {}
        }
        if (isPlaying) audio.play().catch(() => {});
        else audio.pause();
        audio.removeEventListener('canplay', onCanPlay);
      };
      audio.addEventListener('canplay', onCanPlay);
      return;
    }

    // same source: adjust time within tolerance and play/pause
    if (!Number.isNaN(currentTime) && Math.abs(audio.currentTime - currentTime) > 1) {
      try { audio.currentTime = currentTime; } catch (e) {}
    }
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [currentSong, currentTime, isPlaying, isHost]);

  // NEW: ensure host's local audio player receives src/time/play when host changes currentSong or toggles playback
  useEffect(() => {
    if (!isHost) return; // only apply for host's local player
    if (!audioRef.current) return;

    if (!currentSong) {
      audioRef.current.pause();
      try { audioRef.current.removeAttribute('src'); audioRef.current.load(); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;
    // compare by id substring to avoid absolute/relative URL mismatches
    const srcIncludesId = audioRef.current.src && String(audioRef.current.src).includes(currentSong._id);
    if (!srcIncludesId) {
      audioRef.current.src = streamUrl;
      audioRef.current.load();
    }

    // apply playback state (play/pause) and keep time in sync if possible
    if (!Number.isNaN(currentTime) && currentTime > 0 && audioRef.current.duration && currentTime < audioRef.current.duration) {
      try { audioRef.current.currentTime = currentTime; } catch (e) {}
    }
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isHost, currentSong, currentTime, isPlaying]);

  // Host adds a song to the queue
  const addSongToQueue = (song) => {
    if (!isHost) return; // guard: only host may modify queue
    setQueue(prev => {
      const newQ = [...prev, song];
      // if nothing is playing, start immediately and emit
      if (!currentSong) {
        setCurrentSong(song);
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.src = `${API_SONGS}/${song._id}/stream`;
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
        }
        // emit immediate playback with the new song and queue
        emitHostPlayback({
          currentSongId: song._id,
          currentSong: { _id: song._id, title: song.title, artist: song.artist },
          currentTime: audioRef.current ? audioRef.current.currentTime : 0,
          isPlaying: true,
          queue: newQ.map(s => s._id || s)
        });
      } else {
        // just emit queue change
        emitHostPlayback({
          currentSongId: currentSong?._id || null,
          currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
          currentTime: audioRef.current ? audioRef.current.currentTime : 0,
          isPlaying,
          queue: newQ.map(s => s._id || s)
        });
      }
      return newQ;
    });
  };

  // Host toggles play/pause manually
  const togglePlayPause = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isHost) return; // guard: only host may toggle
    if (!audioRef.current) return;
    const newPlaying = !isPlaying;
    if (newPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(newPlaying);
    // emit new playback state immediately
    emitHostPlayback({
      currentSongId: currentSong?._id || null,
      currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
      currentTime: audioRef.current ? audioRef.current.currentTime : 0,
      isPlaying: newPlaying,
      queue: queue.map(s => s._id || s),
    });
  };

  // When current song ends, play the next song in the queue
  const handleEnded = () => {
    setQueue(prev => {
      if (prev.length <= 1) {
        setCurrentSong(null);
        setIsPlaying(false);
        // emit stop
        emitHostPlayback({
          currentSongId: null,
          currentSong: null,
          currentTime: 0,
          isPlaying: false,
          queue: []
        });
        return [];
      }
      const [, ...rest] = prev;
      const next = rest[0] || null;
      setCurrentSong(next);
      // emit next-song playback
      emitHostPlayback({
        currentSongId: next ? next._id : null,
        currentSong: next ? { _id: next._id, title: next.title, artist: next.artist } : null,
        currentTime: 0,
        isPlaying: true,
        queue: rest.map(s => s._id || s)
      });
      return rest;
    });
  };

  // Placeholder for removing users (needs backend support)
  const removeUser = async (userIdToRemove) => {
    if (!isHost) return alert('Only host can remove users');
    if (userIdToRemove === userId) return alert('Host cannot remove themselves');
    alert('Remove user functionality needs backend API implementation.');
  };

  // Update playback current time
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  if (loadingRoom) return <p>Loading room...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!room) return <p>Room not found</p>;

  return (
    <div style={{ maxWidth: 900, margin: 'auto', padding: 20 }}>
      <h2>Room: {room.name || room.code}</h2>
      <p><strong>Code:</strong> {room.code}</p>
      <p><strong>Host:</strong> {room.host?.username || '(unknown)'}</p>

      <button type="button" onClick={(e) => { e.preventDefault(); onLeaveRoom(); }} style={{ marginBottom: 20 }}>
        Leave Room
      </button>

      <h3>Users in Room ({users.length}):</h3>
      <ul>
        {users.map(u => (
          <li key={u._id}>
            {u.username || u.email}
            {isHost && u._id !== userId && (
              <button type="button" onClick={() => removeUser(u._id)} style={{ marginLeft: 10, color: 'red' }}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Current Song:</h3>
      {currentSong ? (
        <div>
          <p><strong>{currentSong.title || '(unknown title)'}</strong> by {currentSong.artist || '(unknown)'}</p>
          <audio
            ref={audioRef}
            controls={isHost}                      // show native controls only to host
            autoPlay={isPlaying}
            onEnded={handleEnded}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => { if (isHost) setIsPlaying(true); }}   // guests won't get here because controls hidden
            onPause={() => { if (isHost) setIsPlaying(false); }}
            crossOrigin="anonymous"
            style={{ pointerEvents: isHost ? 'auto' : 'none' }}   // prevent guest interactions
          />
          {isHost && (
            <button type="button" onClick={togglePlayPause} style={{ marginTop: 10 }}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}
          {!isHost && (
            <p style={{ fontSize: 12, color: '#666' }}>Playback controlled by host</p>
          )}
        </div>
      ) : (
        <p>No song is currently playing.</p>
      )}

      <h3>Queue ({queue.length} songs):</h3>
      {queue.length === 0 ? (
        <p>The queue is empty.</p>
      ) : (
        <ul>
          {queue.map((s, i) => (
            <li key={s._id || i}>{i + 1}. {s.title || s._id} - {s.artist || ''}</li>
          ))}
        </ul>
      )}

      <h3>All Songs in Database</h3>
      {allSongsLoading && <p>Loading songs...</p>}
      {allSongsError && <p style={{ color: 'red' }}>{allSongsError}</p>}
      {!allSongsLoading && !allSongsError && (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ccc', padding: 10 }}>
          {allSongs.length === 0 ? (
            <p>No songs available.</p>
          ) : (
            allSongs.map(song => (
              <div key={song._id} style={{ marginBottom: 8 }}>
                <strong>{song.title}</strong> by {song.artist || '(unknown)'}
                <div style={{ marginTop: 6 }}>
                  {isHost ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isHost) return;
                          setCurrentSong(song);
                          setIsPlaying(true);
                          setQueue([]); // clear queue when playing manually
                          if (audioRef.current) {
                            audioRef.current.src = `${API_SONGS}/${song._id}/stream`;
                            audioRef.current.load();
                            audioRef.current.play().catch(() => {});
                          }
                          // emit immediate playback change
                          emitHostPlayback({
                            currentSongId: song._id,
                            currentSong: { _id: song._id, title: song.title, artist: song.artist },
                            currentTime: audioRef.current ? audioRef.current.currentTime : 0,
                            isPlaying: true,
                            queue: []
                          });
                        }}
                      >
                        Play
                      </button>
                      <button type="button" onClick={() => addSongToQueue(song)} style={{ marginLeft: 10 }}>
                        Add to Queue
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled style={{ opacity: 0.6 }}>
                      Host only
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Room;
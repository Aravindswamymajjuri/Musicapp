import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Safe environment lookup to avoid ReferenceError in browser
const envFromProcess = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ? process.env.REACT_APP_BACKEND_URL : null;
const envFromImportMeta = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL) : null;
const API_BASE = envFromProcess || envFromImportMeta || 'https://musicapp-7dy9.onrender.com';
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
      // register this client's userId with the server so host can target this user
      if (userId) socketRef.current.emit('registerUser', userId);
    });

    // Server can force this client to leave the room (host kicked)
    socketRef.current.on('forceLeave', (data) => {
      const { roomCode: kickedFrom } = data || {};
      // if roomCode provided, ensure it matches current room
      if (kickedFrom && kickedFrom !== roomCode) return;
      // clear the stored room flag and navigate out
      try { localStorage.removeItem('joinedRoomCode'); } catch (e) {}
      // optionally show a message then leave
      alert('You have been removed from the room by the host.');
      // call onLeaveRoom provided by parent to update UI
      if (typeof onLeaveRoom === 'function') onLeaveRoom();
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
  }, [roomCode, isHost, allSongs, userId, onLeaveRoom]);

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

        // Instead of bluntly overwriting playback state on every poll,
        // apply server state conservatively so we don't interrupt playback.
        // ...new: applyServerPlayback helper...
        const applyServerPlayback = (server) => {
          // update static room/users info (safe)
          setRoom(server);
          setUsers(server.users || []);
          // update host flag
          setIsHost(!!(server.host && server.host._id === userId));

          // Hosts keep local control — guests should follow host
          if (server.host && server.host._id === userId) {
            // still update queue for host UI, but do not override host playback state
            if (Array.isArray(server.queue)) {
              const serverQueueIds = server.queue.map(q => (typeof q === 'string' ? q : q._id));
              const localQueueIds = queue.map(q => q._id || q);
              if (JSON.stringify(serverQueueIds) !== JSON.stringify(localQueueIds)) {
                const mapped = serverQueueIds.map(id => allSongs.find(s => s._id === id) || { _id: id });
                setQueue(mapped);
              }
            }
            return;
          }

          // Guests: update current song only if different (by id)
          const serverSongId = server.currentSong?._id || server.currentSongId || null;
          const localSongId = currentSong?._id || null;
          if (serverSongId !== localSongId) {
            if (serverSongId) {
              // try to find full object in allSongs
              const found = allSongs.find(s => s._id === serverSongId);
              setCurrentSong(found || (server.currentSong ? server.currentSong : { _id: serverSongId }));
            } else {
              setCurrentSong(null);
            }
          }

          // Sync time only when there's a meaningful drift (>1s)
          const serverTime = typeof server.currentTime === 'number' ? server.currentTime : 0;
          if (audioRef.current) {
            const audioTime = audioRef.current.currentTime || 0;
            if (Math.abs(audioTime - serverTime) > 1) {
              try { audioRef.current.currentTime = serverTime; } catch (e) {}
              setCurrentTime(serverTime);
            }
          } else {
            setCurrentTime(serverTime);
          }

          // Apply play/pause only when it actually changed
          if (typeof server.isPlaying === 'boolean' && server.isPlaying !== isPlaying) {
            setIsPlaying(server.isPlaying);
          }

          // Update queue only when differs
          if (Array.isArray(server.queue)) {
            const serverQueueIds = server.queue.map(q => (typeof q === 'string' ? q : q._id));
            const localQueueIds = queue.map(q => q._id || q);
            if (JSON.stringify(serverQueueIds) !== JSON.stringify(localQueueIds)) {
              const mapped = serverQueueIds.map(id => allSongs.find(s => s._id === id) || { _id: id });
              setQueue(mapped);
            }
          }
        };

        applyServerPlayback(data);

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
  }, [roomCode, token, userId, isHost, queue, currentSong, isPlaying, allSongs]);

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

    // set crossOrigin and preload so metadata and range requests work reliably
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';

    // compare by id to avoid absolute/relative URL differences
    const srcIncludesId = audio.src && String(audio.src).includes(currentSong._id);
    if (!srcIncludesId) {
      audio.src = streamUrl;
      // Wait for canplay/loadedmetadata before adjusting time & play
      const onCanPlay = () => {
        if (!Number.isNaN(currentTime) && typeof audio.duration === 'number' && currentTime > 0 && currentTime < audio.duration) {
          try { audio.currentTime = currentTime; } catch (e) {}
        }
        if (isPlaying) audio.play().catch(() => {});
        else audio.pause();
        audio.removeEventListener('canplay', onCanPlay);
      };
      audio.addEventListener('canplay', onCanPlay);
      // trigger load
      try { audio.load(); } catch (e) {}
      return;
    }

    // same source: adjust time within tolerance and play/pause (but only after metadata is available)
    const trySyncTime = () => {
      if (!Number.isNaN(currentTime) && Math.abs(audio.currentTime - currentTime) > 1) {
        try { audio.currentTime = currentTime; } catch (e) {}
      }
      if (isPlaying) audio.play().catch(() => {});
      else audio.pause();
    };

    if (isNaN(audio.duration) || audio.duration === 0) {
      // wait for metadata then sync
      const onLoadedMeta = () => {
        trySyncTime();
        audio.removeEventListener('loadedmetadata', onLoadedMeta);
      };
      audio.addEventListener('loadedmetadata', onLoadedMeta);
    } else {
      trySyncTime();
    }
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
    if (userIdToRemove === userId) return alert('You cannot remove yourself');
    if (!window.confirm('Remove this user from the room?')) return;
    try {
      const res = await fetch(`${API_ROOMS}/${roomCode}/users`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: userIdToRemove }),
      });
      if (!res.ok) throw new Error('Failed to remove user');
      // optimistic update: remove from users list
      setUsers(prev => prev.filter(u => u._id !== userIdToRemove));
      alert('User removed from the room');
    } catch (e) {
      alert(e.message || 'Error removing user');
    }
  };

  // MAIN render
  if (loadingRoom) return <div>Loading room...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!room) return null; // safety

  return (
    <div className="room">
      {/* ...existing UI ... */}

      <audio
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        onEnded={handleEnded}
        // show controls only to host, but don't use display:none so metadata loads
        controls={isHost}
        style={{ width: isHost ? '100%' : 0, height: isHost ? 'auto' : 1, opacity: isHost ? 1 : 0.001 }}
      />
    </div>
  );

}

export default Room;
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
  const [currentDuration, setCurrentDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Users and host state
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  // allow guests to enable playback (user gesture) so audio.play() won't be blocked
  const [playbackEnabled, setPlaybackEnabled] = useState(false);

  const audioRef = useRef(null);
  // track pending audio src/listener to avoid races
  const audioPendingRef = useRef({ src: null, listener: null });
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

  // NEW: persist playback state to server immediately (so joiners/DB see it)
  const persistPlayback = async (payload) => {
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
      console.error('persistPlayback failed', e);
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
	let backoff = 2000; // initial delay 2s
	const MAX_BACKOFF = 60000; // cap 1 minute
	let timer = null;

	const schedule = (delay) => {
		if (!mounted) return;
		timer = setTimeout(runFetchRoom, delay);
	};

	const runFetchRoom = async () => {
		if (!mounted) return;

		// If offline, increase backoff and reschedule
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			console.warn('Offline - skipping room fetch');
			backoff = Math.min(MAX_BACKOFF, backoff * 2);
			schedule(backoff);
			return;
		}

		if (initialLoad.current) setLoadingRoom(true);
		setError('');
		try {
			const res = await fetch(`${API_ROOMS}/${roomCode}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || `Room fetch failed: ${res.status}`);
			}
			const data = await res.json();

			// Apply server playback conservatively (unchanged logic)
			const applyServerPlayback = (server) => {
				// update static room/users info (safe)
				setRoom(server);
				setUsers(server.users || []);
				setIsHost(!!(server.host && server.host._id === userId));

				// If this client is host, don't override host playback/queue
				if (server.host && server.host._id === userId) return;

				const serverSongId = server.currentSong?._id || server.currentSongId || null;
				const localSongId = currentSong?._id || null;
				if (serverSongId !== localSongId) {
					if (serverSongId) {
						const found = allSongs.find(s => s._id === serverSongId);
						setCurrentSong(found || (server.currentSong ? server.currentSong : { _id: serverSongId }));
					} else {
						setCurrentSong(null);
					}
				}

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

				if (typeof server.isPlaying === 'boolean' && server.isPlaying !== isPlaying) {
					setIsPlaying(server.isPlaying);
				}

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

			// success -> reset backoff for next poll
			backoff = isHost ? 5000 : 2000;
		} catch (err) {
			console.warn('fetchRoom error:', err);
			// Surface user-friendly message (keeps UI recoverable)
			setError(err.message || 'Failed to load room');
			// increase backoff to avoid noisy retries
			backoff = Math.min(MAX_BACKOFF, backoff * 2);
		} finally {
			if (initialLoad.current) {
				setLoadingRoom(false);
				initialLoad.current = false;
			}
			// schedule next poll according to role/backoff
			schedule(backoff);
		}
	};

	// start immediately
	schedule(0);

	return () => {
		mounted = false;
		if (timer) clearTimeout(timer);
	};
	// eslint-disable-next-line react-hooks/exhaustive-deps
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
    let mounted = true;
    let backoff = 2000; // start 2s
    const MAX_BACKOFF = 60000; // 1 minute

    const schedule = (delay) => {
      if (!mounted) return;
      return setTimeout(runTick, delay);
    };

    const runTick = async () => {
      if (!mounted) return;
      if (!room) {
        // if no room yet, retry after short delay
        timer = schedule(2000);
        return;
      }

      // If offline, skip and backoff
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn('Navigator offline - skipping playback persist');
        backoff = Math.min(MAX_BACKOFF, backoff * 2);
        timer = schedule(backoff);
        return;
      }

      const payload = {
        currentSongId: currentSong?._id || null,
        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
        isPlaying,
        queue: queue.map(s => (typeof s === 'string' ? s : (s._id || s))),
      };

      try {
        const res = await fetch(`${API_ROOMS}/${roomCode}/playback`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          // non-2xx response - treat like an error but do not throw raw for network
          console.warn('Playback persist returned', res.status);
        }
        // success -> reset backoff
        backoff = 2000;
      } catch (e) {
        console.warn('REST playback update failed', e);
        // increase backoff on failure
        backoff = Math.min(MAX_BACKOFF, backoff * 2);
      }

      try {
        socketRef.current?.emit('hostPlayback', { roomCode, playback: payload });
      } catch (e) {
        // ignore socket errors
      }

      // schedule next run
      timer = schedule(backoff);
    };

    let timer = schedule(0);
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, currentSong, isPlaying, queue, room, roomCode, token]);

  // Guests sync their audio player to host playback state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isHost) return; // host controls local player

    if (!currentSong) {
      audio.pause();
      try { audio.removeAttribute('src'); audio.load(); setCurrentDuration(0); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;

    // set crossOrigin and preload so metadata and range requests work reliably
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';

    // compare by id to avoid absolute/relative URL differences
    const srcIncludesId = audio.src && String(audio.src).includes(currentSong._id);
    if (!srcIncludesId) {
      // ensure audio element can load even if controls hidden
      audio.style.width = '100%';
      audio.style.height = '1px';
      // delegate src/load/play handling to helper to avoid race conditions
      applyAudioSrc(streamUrl, isPlaying && playbackEnabled);
      return;
    }

    // same source: adjust time within tolerance and play/pause (but only after metadata is available)
    const trySyncTime = () => {
      // ensure duration is set before syncing time
      try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
      if (!Number.isNaN(currentTime) && Math.abs(audio.currentTime - currentTime) > 1) {
        try { audio.currentTime = currentTime; } catch (e) {}
      }
      if (isPlaying) audio.play().catch(() => {});
      else audio.pause();
    };

    if (isNaN(audio.duration) || audio.duration === 0) {
      // wait for metadata then sync
      const onLoadedMeta = () => {
        try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
        trySyncTime();
        audio.removeEventListener('loadedmetadata', onLoadedMeta);
      };
      audio.addEventListener('loadedmetadata', onLoadedMeta);
    } else {
      trySyncTime();
    }
  }, [currentSong, currentTime, isPlaying, isHost, playbackEnabled]);

  // NEW: ensure host's local audio player receives src/time/play when host changes currentSong or toggles playback
  useEffect(() => {
    if (!isHost) return; // only apply for host's local player
    if (!audioRef.current) return;

    if (!currentSong) {
      audioRef.current.pause();
      try { audioRef.current.removeAttribute('src'); audioRef.current.load(); setCurrentDuration(0); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;
    // compare by id substring to avoid absolute/relative URL mismatches
    const srcIncludesId = audioRef.current.src && String(audioRef.current.src).includes(currentSong._id);
    if (!srcIncludesId) {
      applyAudioSrc(streamUrl, isPlaying);
    }

    // set duration when metadata available for host
    const onLoadedMetaHost = () => {
      try { if (typeof audioRef.current.duration === 'number' && !Number.isNaN(audioRef.current.duration)) setCurrentDuration(audioRef.current.duration); } catch (e) {}
      audioRef.current.removeEventListener('loadedmetadata', onLoadedMetaHost);
    };
    audioRef.current.addEventListener('loadedmetadata', onLoadedMetaHost);

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
    console.debug('addSongToQueue', song._id);
    setQueue(prev => {
      const newQ = [...prev, song];
      // if nothing is playing, start immediately and emit
      if (!currentSong) {
        setCurrentSong(song);
        setIsPlaying(true);
        if (audioRef.current) {
          applyAudioSrc(`${API_SONGS}/${song._id}/stream`, true);
        }
        // emit immediate playback with the new song and queue
        const payload = {
          currentSongId: song._id,
          currentSong: { _id: song._id, title: song.title, artist: song.artist },
          currentTime: audioRef.current ? audioRef.current.currentTime : 0,
          isPlaying: true,
          queue: newQ.map(s => s._id || s)
        };
        emitHostPlayback(payload);
        persistPlayback(payload);
      } else {
        // just emit queue change
        const payload = {
          currentSongId: currentSong?._id || null,
          currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
          currentTime: audioRef.current ? audioRef.current.currentTime : 0,
          isPlaying,
          queue: newQ.map(s => s._id || s)
        };
        emitHostPlayback(payload);
        persistPlayback(payload);
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
    console.debug('togglePlayPause ->', newPlaying);
    if (newPlaying) {
      audioRef.current.crossOrigin = 'anonymous';
      audioRef.current.preload = 'metadata';
      // try to play; handle blocked play
      audioRef.current.play().catch((err) => { console.warn('play blocked', err); });
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(newPlaying);
    // emit new playback state immediately
    const payload = {
      currentSongId: currentSong?._id || null,
      currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
      currentTime: audioRef.current ? audioRef.current.currentTime : 0,
      isPlaying: newPlaying,
      queue: queue.map(s => s._id || s),
    };
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // When current song ends, play the next song in the queue
  const handleEnded = () => {
    setQueue(prev => {
      if (prev.length <= 1) {
        setCurrentSong(null);
        setIsPlaying(false);
        // emit stop
        const payload = { currentSongId: null, currentSong: null, currentTime: 0, isPlaying: false, queue: [] };
        emitHostPlayback(payload);
        persistPlayback(payload);
        return [];
      }
      const [, ...rest] = prev;
      const next = rest[0] || null;
      setCurrentSong(next);
      // emit next-song playback (and persist)
      const payload = {
        currentSongId: next ? next._id : null,
        currentSong: next ? { _id: next._id, title: next.title, artist: next.artist } : null,
        currentTime: 0,
        isPlaying: true,
        queue: rest.map(s => s._id || s)
      };
      emitHostPlayback(payload);
      persistPlayback(payload);
      return rest;
    });
  };

  // Update playback current time (used by audio onTimeUpdate)
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
  };

  // Placeholder for removing users (needs backend support)
  const removeUser = async (userIdToRemove) => {
    if (!isHost) return alert('Only host can remove users');
    if (userIdToRemove === userId) return alert('You cannot remove yourself');
    if (!window.confirm('Remove this user from the room?')) return;
    try {
      // Prefer socket-based kick (server will send 'forceLeave' to target client)
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('kickUser', { userId: userIdToRemove, roomCode });
        // optimistic local update so UI reflects removal immediately
        setUsers(prev => prev.filter(u => u._id !== userIdToRemove));
        alert('Removal request sent to server.');
        return;
      }

      // Fallback: attempt REST call if you have an API route for removing users
      const res = await fetch(`${API_ROOMS}/${roomCode}/users`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: userIdToRemove }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to remove user');
      }
      setUsers(prev => prev.filter(u => u._id !== userIdToRemove));
      alert('User removed from the room');
    } catch (e) {
      alert(e.message || 'Error removing user');
    }
  };

  // Helper: resolve a queue entry (id or object) to an object with at least _id/title/artist
  const resolveSongObj = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return allSongs.find(s => s._id === entry) || { _id: entry, title: '(unknown)', artist: '' };
    }
    if (entry._id && (entry.title || entry.artist)) return entry;
    if (entry._id) return allSongs.find(s => s._id === entry._id) || entry;
    return entry;
  };

  // Host: play this song immediately (clear queue and start playing)
  const playNow = (song) => {
    if (!isHost) return;
    setQueue([]);
    setCurrentSong(song);
    setIsPlaying(true);
    if (audioRef.current) {
      applyAudioSrc(`${API_SONGS}/${song._id}/stream`, true);
    }
    const payload = {
      currentSongId: song._id,
      currentSong: { _id: song._id, title: song.title, artist: song.artist },
      currentTime: audioRef.current ? audioRef.current.currentTime : 0,
      isPlaying: true,
      queue: [],
    };
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Helper to set audio src and play only after canplay to avoid races/AbortError
  const applyAudioSrc = (url, shouldPlay = false) => {
    const audio = audioRef.current;
    if (!audio) return;

    // clear current source when no url
    if (!url) {
      try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
      audioPendingRef.current.src = null;
      if (audioPendingRef.current.listener) {
        try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
        audioPendingRef.current.listener = null;
      }
      return;
    }

    // if same source, just play/pause
    if (audio.src && String(audio.src).includes(url)) {
      if (shouldPlay) audio.play().catch(() => {});
      else audio.pause();
      return;
    }

    // remove previous pending listener if any
    if (audioPendingRef.current.listener) {
      try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
      audioPendingRef.current.listener = null;
    }

    audioPendingRef.current.src = url;
    const onCanPlay = () => {
      // ensure this listener is for the current pending src
      if (!audioPendingRef.current.src || !(String(audio.src).includes(audioPendingRef.current.src))) {
        try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
        audioPendingRef.current.listener = null;
        return;
      }
      if (shouldPlay) audio.play().catch(() => {});
      try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
      audioPendingRef.current.listener = null;
    };

    audioPendingRef.current.listener = onCanPlay;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    try {
      audio.removeAttribute('src');
      audio.src = url;
      audio.addEventListener('canplay', onCanPlay);
      audio.load();
    } catch (e) {
      console.warn('applyAudioSrc error', e);
    }
  };

  // MAIN render
  if (loadingRoom) return <div>Loading room...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="room">
      <h2>Room: {room?.name || roomCode}</h2>
      <div className="room-info">
        <div>Host: {room?.host?.username || room?.host?.name || room?.host?.email || 'Unknown'}</div>
        <div>Users: {users.length}</div>
      </div>
      <div className="error">{error}</div>

      <div className="songs">
        <h3>All Songs</h3>
        {allSongsLoading && <div>Loading songs...</div>}
        {allSongsError && <div className="error">{allSongsError}</div>}
        <ul>
          {allSongs.map(song => (
            <li key={song._id}>
              {song.title} - {song.artist}
              {isHost ? (
                <>
                  <button onClick={() => playNow(song)} style={{ marginRight: 8 }}>Play Now</button>
                  <button onClick={() => addSongToQueue(song)}>Add to Queue</button>
                </>
              ) : (
                <button onClick={() => alert('Only host can add or play songs in the room')} disabled style={{ marginLeft: 8, opacity: 0.6 }}>Host only</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="queue">
        <h3>Queue</h3>
        <ul>
          {queue.map((entry, index) => {
            const s = resolveSongObj(entry);
            const idKey = s?._id || index;
            return (
              <li key={idKey}>
                {(s?.title || '(unknown)')} - {(s?.artist || '')}
                {isHost && (
                  <button onClick={() => {
                    setQueue(prev => {
                      const newQ = prev.filter((_, i) => i !== index);
                      const payload = {
                        currentSongId: currentSong?._id || null,
                        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
                        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
                        isPlaying,
                        queue: newQ.map(item => (typeof item === 'string' ? item : (item._id || item)))
                      };
                      emitHostPlayback(payload);
                      persistPlayback(payload);
                      return newQ;
                    });
                  }}>Remove</button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="controls">
        <button onClick={togglePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
        <button onClick={handleEnded}>Next</button>
      </div>

      {isHost && (
        <div className="host-controls">
          <h3>Host Controls</h3>
          <button onClick={() => {
            const newName = prompt('Enter new room name', room.name);
            if (newName && newName !== room.name) {
              fetch(`${API_ROOMS}/${roomCode}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ name: newName }),
              })
                .then(res => res.json())
                .then(data => {
                  setRoom(data);
                  alert('Room name updated');
                })
                .catch(err => alert(err.message || 'Error updating room name'));
            }
          }}>Change Room Name</button>
        </div>
      )}

      <div className="user-list">
        <h3>Users in Room</h3>
        <ul>
          {users.map(u => (
            <li key={u._id}>
              {(u.username || u.name || u.email || u._id)} {u._id === room?.host?._id ? '(Host)' : ''}
              {isHost && u._id !== userId && <button onClick={() => removeUser(u._id)}>Remove</button>}
            </li>
          ))}
        </ul>
      </div>

      {!isHost && currentSong && !playbackEnabled && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              setPlaybackEnabled(true);
              try { audioRef.current?.play().catch(() => {}); } catch (e) {}
            }}
          >
            Enable playback on this device
          </button>
        </div>
      )}

      {currentSong && (
        <div className="playback-info" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 'bold' }}>{currentSong.title} — {currentSong.artist}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div style={{ width: 200, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: currentDuration > 0 ? `${Math.min(100, (currentTime / currentDuration) * 100)}%` : '0%', height: '100%', background: '#007bff' }} />
            </div>
            <div style={{ minWidth: 80, fontSize: 12, color: '#333' }}>
              {formatTime(currentTime)} / {currentDuration ? formatTime(currentDuration) : '--:--'}
            </div>
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        onEnded={handleEnded}
        controls={isHost}
        style={{ width: '100%', height: isHost ? 'auto' : 1, opacity: isHost ? 1 : 0.001 }}
      />
    </div>
  );

}; // close Room component

export default Room;

// Helper: format seconds -> mm:ss
function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '00:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
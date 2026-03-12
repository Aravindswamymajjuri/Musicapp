import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './roomsongs.css';

const API_BASE = import.meta.env.VITE_BACKEND_URL;
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
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Real-time sync states
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(0);
  const [expectedTimeAtSync, setExpectedTimeAtSync] = useState(0);

  // Users and host state
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  // Reconnection overlay state
  const [isReconnecting, setIsReconnecting] = useState(false);

  // allow guests to enable playback (user gesture) so audio.play() won't be blocked
  const [playbackEnabled, setPlaybackEnabled] = useState(false);

  const allSongsRef = useRef(allSongs);
  const isHostRef = useRef(isHost);
  const audioRef = useRef(null);
  const audioPendingRef = useRef({ src: null, listener: null });
  const playedStackRef = useRef([]);
  const socketRef = useRef(null);
  const initialLoad = useRef(true);
  const lastGuestSyncRef = useRef(0); // Track last sync time for guests

  // On mount: load cached room/songs immediately, then refresh in background
  useEffect(() => {
    // Load cached data for instant display
    try {
      const cachedRoom = sessionStorage.getItem(`room_${roomCode}`);
      const cachedSongs = sessionStorage.getItem('rs_songs_v1');
      const savedPosition = sessionStorage.getItem(`room_${roomCode}_position`);
      if (cachedRoom) {
        const parsed = JSON.parse(cachedRoom);
        setRoom(parsed);
        setUsers(parsed.users || []);
        setIsHost(!!(parsed.host && parsed.host._id === userId));
        setCurrentSong(parsed.currentSong || null);
        // Restore saved position if available (more recent than cached room)
        const savedTime = savedPosition ? parseFloat(savedPosition) : null;
        setCurrentTime(savedTime !== null ? savedTime : (parsed.currentTime || 0));
        setIsPlaying(parsed.isPlaying || false);
        setQueue(parsed.queue || []);
        setLoadingRoom(false);
        initialLoad.current = false;
      }
      if (cachedSongs) setAllSongs(JSON.parse(cachedSongs));
    } catch (e) {}
  }, [roomCode, userId]);

  // Persist audio position every 2 seconds (for resume on refresh)
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;
    const interval = setInterval(() => {
      try {
        const pos = audioRef.current.currentTime;
        if (pos > 0) {
          sessionStorage.setItem(`room_${roomCode}_position`, pos.toString());
        }
      } catch (e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [currentSong, roomCode]);

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

			// Cache room data for instant reload
			try { sessionStorage.setItem(`room_${roomCode}`, JSON.stringify(data)); } catch (e) {}

			// Apply server playback with real-time sync
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

				// REAL-TIME SYNC: Calculate expected playback time based on server timestamp
				const now = Date.now();
				const syncTimestamp = server.syncTimestamp || 0;
				const expectedServerTime = server.currentTime || 0;
				
				// Store sync info for guest sync calculations
				if (syncTimestamp > 0) {
					setLastSyncTimestamp(syncTimestamp);
					setExpectedTimeAtSync(expectedServerTime);
				}

				// For guests: calculate expected time based on when server state was recorded
				let targetTime = expectedServerTime;
				if (syncTimestamp > 0 && server.isPlaying) {
					const timeSinceSyncMs = now - syncTimestamp;
					const timeSinceSyncSec = timeSinceSyncMs / 1000;
					// Add elapsed time since the sync was recorded
					targetTime = expectedServerTime + timeSinceSyncSec;
				}

				if (audioRef.current) {
					const audioTime = audioRef.current.currentTime || 0;
					const drift = Math.abs(audioTime - targetTime);
					
					// Only correct MAJOR drift (> 1 second) to avoid constant seeking that breaks audio
					// Small drifts don't affect user experience and cause audio pops/clicks
					if (drift > 1.0) {
						try { 
							audioRef.current.currentTime = targetTime;
							setCurrentTime(targetTime);
							lastGuestSyncRef.current = now;
						} catch (e) {}
					}
				} else {
					setCurrentTime(targetTime);
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

			// success -> reset backoff for next poll (guests poll more frequently for better sync)
			backoff = isHost ? 5000 : 1500; // guests: 1.5s, host: 5s
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
}, [roomCode, token, userId]);

  // Keep allSongs and isHost in sync with refs for socket handlers
  useEffect(() => {
    allSongsRef.current = allSongs;
    isHostRef.current = isHost;
  }, [allSongs, isHost]);

  // Socket: join room and listen for host playback
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    // Optimize reconnection: prefer websocket, reduce timeout
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 5000,
    });

    socketRef.current.on('connect', () => {
      setIsReconnecting(false);
      socketRef.current.emit('joinRoom', roomCode);
      // register this client's userId with the server so host can target this user
      if (userId) socketRef.current.emit('registerUser', userId);
    });

    socketRef.current.on('disconnect', () => {
      setIsReconnecting(true);
    });

    socketRef.current.on('reconnect', () => {
      setIsReconnecting(false);
      // Re-join room after reconnect
      socketRef.current.emit('joinRoom', roomCode);
      if (userId) socketRef.current.emit('registerUser', userId);
    });

    // Server can force this client to leave the room (host kicked)
    socketRef.current.on('forceLeave', (data) => {
      const { roomCode: kickedFrom } = data || {};
      if (kickedFrom && kickedFrom !== roomCode) return;
      try { localStorage.removeItem('joinedRoomCode'); } catch (e) {}
      alert('You have been removed from the room by the host.');
      if (typeof onLeaveRoom === 'function') onLeaveRoom();
    });

    socketRef.current.on('playback', (playback) => {
      if (!playback) return;
      if (isHostRef.current) return;
      
      // Update song
      if (playback.currentSong) {
        setCurrentSong(playback.currentSong);
      } else if (playback.currentSongId) {
        const found = allSongsRef.current.find(s => s._id === playback.currentSongId);
        setCurrentSong(found || { _id: playback.currentSongId });
      } else {
        setCurrentSong(null);
      }

      // REAL-TIME SYNC: Use server timestamp if provided
      const now = Date.now();
      const syncTimestamp = playback.serverTime || Date.now();
      const expectedTime = typeof playback.currentTime === 'number' ? playback.currentTime : 0;
      
      // Store sync reference
      setLastSyncTimestamp(syncTimestamp);
      setExpectedTimeAtSync(expectedTime);

      // Calculate expected time accounting for network latency
      let targetTime = expectedTime;
      if (playback.isPlaying && syncTimestamp) {
        const timeSinceSyncMs = now - syncTimestamp;
        const timeSinceSyncSec = timeSinceSyncMs / 1000;
        targetTime = expectedTime + timeSinceSyncSec;
      }

      // Sync audio if loaded - only correct MAJOR drift to avoid breaking audio
      if (audioRef.current && audioRef.current.src) {
        const audioTime = audioRef.current.currentTime || 0;
        const drift = Math.abs(audioTime - targetTime);
        
        // Only sync if drift is significant (> 1 second) to avoid constant seeking that breaks audio
        if (drift > 1.0) {
          try { 
            audioRef.current.currentTime = targetTime;
            setCurrentTime(targetTime);
            lastGuestSyncRef.current = now;
          } catch (e) {}
        }
      }

      if (typeof playback.isPlaying === 'boolean') setIsPlaying(playback.isPlaying);
      if (Array.isArray(playback.queue)) {
        const newQ = playback.queue.map(q => (typeof q === 'string' ? (allSongsRef.current.find(s => s._id === q) || { _id: q }) : q));
        setQueue(newQ);
      }
    });

    return () => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('leaveRoom', roomCode);
        socketRef.current.disconnect();
      }
    };
    // Don't include allSongs, isHost to prevent infinite loop - use refs instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userId, onLeaveRoom]);

  // Load cached songs and refresh
  useEffect(() => {
    const cached = sessionStorage.getItem('rs_songs_v1');
    if (cached) {
      try { setAllSongs(JSON.parse(cached)); } catch (e) {}
    }
    refreshAllSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAllSongs = async () => {
    setAllSongsLoading(true);
    setAllSongsError('');
    const controller = new AbortController();
    try {
      const res = await fetch(API_SONGS, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to fetch songs: ${res.status}`);
      const data = await res.json();
      setAllSongs(data);
      try { sessionStorage.setItem('rs_songs_v1', JSON.stringify(data)); } catch (e) {}
    } catch (err) {
      console.warn('refreshAllSongs error', err);
      setAllSongsError(err.message || 'Error fetching songs');
    } finally {
      setAllSongsLoading(false);
    }
  };

  const groupedByAlbum = React.useMemo(() => {
    return (allSongs || []).reduce((acc, s) => {
      const a = (s.album || '').trim() || 'Uncategorized';
      (acc[a] = acc[a] || []).push(s);
      return acc;
    }, {});
  }, [allSongs]);

  const [albumExpanded, setAlbumExpanded] = useState({});

  // Host pushes playback updates - FREQUENT for real-time sync
  useEffect(() => {
    if (!isHost) return;
    let mounted = true;
    let backoff = 300; // Fast initial sync: 300ms (was 2000ms)
    const MAX_BACKOFF = 60000;
    let throttleCount = 0; // Throttle REST calls while keeping socket fast

    const schedule = (delay) => {
      if (!mounted) return;
      return setTimeout(runTick, delay);
    };

    const runTick = async () => {
      if (!mounted) return;
      if (!room) {
        backoff = 300;
        timer = schedule(backoff);
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn('Navigator offline - skipping playback persist');
        backoff = Math.min(MAX_BACKOFF, backoff * 2);
        timer = schedule(backoff);
        return;
      }

      const serverTime = Date.now(); // Current server time
      const payload = {
        currentSongId: currentSong?._id || null,
        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
        isPlaying,
        queue: queue.map(s => (typeof s === 'string' ? s : (s._id || s))),
        serverTime, // Include server time for sync calculations
      };

      // Send via Socket.io EVERY update (fast, real-time)
      try {
        socketRef.current?.emit('hostPlayback', { roomCode, playback: { ...payload, serverTime } });
      } catch (e) {
        console.warn('Socket emit error', e);
      }

      // Only send REST update occasionally (every 3rd tick) to save bandwidth
      throttleCount++;
      if (throttleCount >= 3) {
        throttleCount = 0;
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
            console.warn('Playback persist returned', res.status);
          }
        } catch (e) {
          console.warn('REST playback update failed', e);
        }
      }

      // Always use fast sync interval for host
      backoff = 300; // Stay at 300ms for real-time feel
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
      // Clear saved position when no song
      try { sessionStorage.removeItem(`room_${roomCode}_position`); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;

    // set crossOrigin and preload so metadata and range requests work reliably
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';

    // compare by id to avoid absolute/relative URL differences
    const srcIncludesId = audio.src && String(audio.src).includes(currentSong._id);
    if (!srcIncludesId) {
      // Check if we have a saved position for resume
      const savedPos = sessionStorage.getItem(`room_${roomCode}_position`);
      const resumeTime = savedPos ? parseFloat(savedPos) : currentTime;
      // ensure audio element can load even if controls hidden
      audio.style.width = '100%';
      audio.style.height = '1px';
      // delegate src/load/play handling to helper to avoid race conditions
      applyAudioSrc(streamUrl, isPlaying && playbackEnabled, resumeTime);
      return;
    }

    const trySyncTime = () => {
      try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
      if (!Number.isNaN(currentTime) && Math.abs(audio.currentTime - currentTime) > 1) {
        try { audio.currentTime = currentTime; } catch (e) {}
      }
      if (isPlaying) audio.play().catch(() => {});
      else audio.pause();
    };

    if (isNaN(audio.duration) || audio.duration === 0) {
      const onLoadedMeta = () => {
        try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
        trySyncTime();
        audio.removeEventListener('loadedmetadata', onLoadedMeta);
      };
      audio.addEventListener('loadedmetadata', onLoadedMeta);
    } else {
      trySyncTime();
    }
  }, [currentSong, isPlaying, isHost, playbackEnabled]);

  // Guest continuous sync correction - keep correcting drift but less aggressively
  useEffect(() => {
    if (isHost) return;
    if (!audioRef.current) return;
    if (!currentSong || !isPlaying) return;
    
    let mounted = true;
    const interval = setInterval(() => {
      if (!mounted) return;
      const audio = audioRef.current;
      if (!audio || !audio.src) return;
      
      // Calculate expected time based on last sync
      const now = Date.now();
      const expectedServerTime = expectedTimeAtSync || 0;
      let targetTime = expectedServerTime;
      
      if (lastSyncTimestamp > 0 && isPlaying) {
        const timeSinceSyncMs = now - lastSyncTimestamp;
        const timeSinceSyncSec = timeSinceSyncMs / 1000;
        targetTime = expectedServerTime + timeSinceSyncSec;
      }
      
      const audioTime = audio.currentTime || 0;
      const drift = Math.abs(audioTime - targetTime);
      
      // Only correct SIGNIFICANT drift (> 1 second) to avoid constant seeking that breaks audio
      // Smaller drifts are tolerable and won't be noticeable to users
      if (drift > 1.0) {
        try {
          audio.currentTime = targetTime;
          setCurrentTime(targetTime);
        } catch (e) {}
      }
    }, 2000); // Check every 2 seconds instead of 100ms to reduce seeking interruptions
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isHost, currentSong, isPlaying, lastSyncTimestamp, expectedTimeAtSync]);

  // Host's local audio player
  useEffect(() => {
    if (!isHost) return;
    if (!audioRef.current) return;

    if (!currentSong) {
      audioRef.current.pause();
      try { audioRef.current.removeAttribute('src'); audioRef.current.load(); setCurrentDuration(0); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;
    const srcIncludesId = audioRef.current.src && String(audioRef.current.src).includes(currentSong._id);
    if (!srcIncludesId) {
      applyAudioSrc(streamUrl, isPlaying);
    }

    const onLoadedMetaHost = () => {
      try { if (typeof audioRef.current.duration === 'number' && !Number.isNaN(audioRef.current.duration)) setCurrentDuration(audioRef.current.duration); } catch (e) {}
      audioRef.current.removeEventListener('loadedmetadata', onLoadedMetaHost);
    };
    audioRef.current.addEventListener('loadedmetadata', onLoadedMetaHost);

    if (!Number.isNaN(currentTime) && currentTime > 0 && audioRef.current.duration && currentTime < audioRef.current.duration) {
      try { audioRef.current.currentTime = currentTime; } catch (e) {}
    }
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isHost, currentSong, isPlaying]);

  // Helper: emit playback state via socket
  const emitHostPlayback = (payload) => {
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('hostPlayback', { roomCode, playback: payload });
      }
    } catch (e) {
      console.warn('Socket emit error:', e);
    }
  };

  // Helper: persist playback state to server
  const persistPlayback = (payload) => {
    if (!isHost) return;
    try {
      fetch(`${API_ROOMS}/${roomCode}/playback`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      }).catch(e => console.warn('Playback persist error:', e));
    } catch (e) {
      console.warn('Persist playback error:', e);
    }
  };

  // Host adds a song to the queue
  const addSongToQueue = (song) => {
    if (!isHost) return;
    console.debug('addSongToQueue', song._id);
    setQueue(prev => {
      if (currentSong && currentSong._id) {
        playedStackRef.current.push(currentSong);
      }
      const newQ = [...prev, song];
       if (!currentSong) {
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
           queue: newQ.map(s => s._id || s)
         };
         emitHostPlayback(payload);
         persistPlayback(payload);
       } else {
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

  // Host toggles play/pause
  const togglePlayPause = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isHost) return;
    if (!audioRef.current) return;
    const newPlaying = !isPlaying;
    console.debug('togglePlayPause ->', newPlaying);
    if (newPlaying) {
      audioRef.current.crossOrigin = 'anonymous';
      audioRef.current.preload = 'metadata';
      audioRef.current.play().catch((err) => { console.warn('play blocked', err); });
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(newPlaying);
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

  // When current song ends
  const handleEnded = () => {
    if (currentSong && currentSong._id) {
      playedStackRef.current.push(currentSong);
    }
    setQueue(prev => {
      if (prev.length <= 1) {
        setCurrentSong(null);
        setIsPlaying(false);
        const payload = { currentSongId: null, currentSong: null, currentTime: 0, isPlaying: false, queue: [] };
        emitHostPlayback(payload);
        persistPlayback(payload);
        return [];
      }
      const [, ...rest] = prev;
      const next = rest[0] || null;
      setCurrentSong(next);
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

  // Update playback current time
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
  };

  // Update buffered and duration
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onProgress = () => {
      try {
        const buf = audio.buffered;
        if (buf && buf.length > 0) {
          const end = buf.end(buf.length - 1);
          setBufferedEnd(end || 0);
        }
      } catch (e) {
        // ignore
      }
    };

    const onLoadedMeta = () => {
      try {
        if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) {
          setCurrentDuration(audio.duration);
        }
      } catch (e) {}
    };

    audio.addEventListener('progress', onProgress);
    audio.addEventListener('loadedmetadata', onLoadedMeta);

    try { if (audio.duration && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
    onProgress();

    return () => {
      try { audio.removeEventListener('progress', onProgress); } catch (e) {}
      try { audio.removeEventListener('loadedmetadata', onLoadedMeta); } catch (e) {}
      setBufferedEnd(0);
    };
  }, [currentSong, isHost, playbackEnabled]);

  // Remove user
  const removeUser = async (userIdToRemove) => {
    if (!isHost) return alert('Only host can remove users');
    if (userIdToRemove === userId) return alert('You cannot remove yourself');
    if (!window.confirm('Remove this user from the room?')) return;
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('kickUser', { userId: userIdToRemove, roomCode });
        setUsers(prev => prev.filter(u => u._id !== userIdToRemove));
        alert('Removal request sent to server.');
        return;
      }

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

  // Helper: resolve queue entry
  const resolveSongObj = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return allSongs.find(s => s._id === entry) || { _id: entry, title: '(unknown)', artist: '' };
    }
    if (entry._id && (entry.title || entry.artist)) return entry;
    if (entry._id) return allSongs.find(s => s._id === entry._id) || entry;
    return entry;
  };

  // Host: play now
  const playNow = (song) => {
    if (!isHost) return;
    if (currentSong && currentSong._id) {
      playedStackRef.current.push(currentSong);
    }
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

  // tiny prefetch helper to warm connection and start preload
  const prefetchAudio = (url) => {
		try {
			const u = new URL(url);
			const origin = u.origin;
			const pc = document.createElement('link');
			pc.rel = 'preconnect';
			pc.href = origin;
			pc.crossOrigin = '';
			document.head.appendChild(pc);
			setTimeout(() => { try { document.head.removeChild(pc); } catch (e) {} }, 30000);
		} catch (e) {}
		try {
			const pl = document.createElement('link');
			pl.rel = 'preload';
			pl.as = 'audio';
			pl.href = url;
			document.head.appendChild(pl);
			setTimeout(() => { try { document.head.removeChild(pl); } catch (e) {} }, 30000);
		} catch (e) {}
	};

  // Helper to set audio src and play only after canplay to avoid races/AbortError
  function applyAudioSrc(url, shouldPlay = false, startTime = 0) {
    const audio = audioRef.current;
    if (!audio) return;

    // clear when no url requested
    if (!url) {
      try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
      audioPendingRef.current.src = null;
      if (audioPendingRef.current.listener) {
        try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
        audioPendingRef.current.listener = null;
      }
      return;
    }

    // if same source (or contains same identifier), just toggle play/pause
    try {
      if (audio.src && String(audio.src).includes(url)) {
        // If resuming, seek to saved position
        if (startTime > 0 && Math.abs(audio.currentTime - startTime) > 2) {
          try { audio.currentTime = startTime; } catch (e) {}
        }
        if (shouldPlay) audio.play().catch(() => {});
        else audio.pause();
        return;
      }
    } catch (e) { /* ignore */ }

    // remove any previous pending listener
    if (audioPendingRef.current.listener) {
      try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
      audioPendingRef.current.listener = null;
    }

    audioPendingRef.current.src = url;
    const onCanPlay = () => {
      // ensure this listener corresponds to the current pending src
      if (!audioPendingRef.current.src || !(String(audio.src).includes(audioPendingRef.current.src))) {
        try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
        audioPendingRef.current.listener = null;
        return;
      }
      // Seek to resume position before playing
      if (startTime > 0) {
        try { audio.currentTime = startTime; } catch (e) {}
      }
      if (shouldPlay) audio.play().catch(() => {});
      try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
      audioPendingRef.current.listener = null;
    };

    audioPendingRef.current.listener = onCanPlay;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'none';
    try {
      audio.removeAttribute('src');
      audio.src = url;
      audio.addEventListener('canplay', onCanPlay);
      audio.load();
    } catch (e) {
      console.warn('applyAudioSrc error', e);
    }
  }

  // Seek by offset
  const seekBy = (offsetSeconds) => {
    if (!isHost) {
      alert('Only host can seek playback in the room.');
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const duration = audio.duration || currentDuration || 0;
      let t = (audio.currentTime || 0) + offsetSeconds;
      if (t < 0) t = 0;
      if (duration && t > duration) t = duration - 0.1;
      audio.currentTime = t;
      setCurrentTime(t);
      const payload = {
        currentSongId: currentSong?._id || null,
        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
        currentTime: t,
        isPlaying,
        queue: queue.map(s => s._id || s),
      };
      emitHostPlayback(payload);
      persistPlayback(payload);
    } catch (e) {
      console.warn('seekBy error', e);
    }
  };
  
  // Play previous
  const playPrevious = () => {
    if (!isHost) {
      alert('Only host can change tracks in the room.');
      return;
    }
    const prev = playedStackRef.current.pop();
    if (!prev) {
      alert('No previous track in history.');
      return;
    }
    setCurrentSong(prev);
    setIsPlaying(true);
    if (audioRef.current) {
      applyAudioSrc(`${API_SONGS}/${prev._id}/stream`, true);
    }
    const payload = {
      currentSongId: prev._id,
      currentSong: { _id: prev._id, title: prev.title, artist: prev.artist },
      currentTime: 0,
      isPlaying: true,
      queue: queue.map(s => s._id || s),
    };
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Skip next
  const skipNext = () => {
    if (!isHost) { alert('Only host can skip to next track.'); return; }
    handleEnded();
  };
  
  // Render album block
  const renderAlbumBlock = (albumName, list) => {
    const LIMIT = 100;
    const expanded = !!albumExpanded[albumName];
    const visible = expanded ? list : list.slice(0, LIMIT);

    return (
      <div key={albumName} className="album-block">
        <h3>{albumName}</h3>
        <table className="album-table">
          <tbody>
            {visible.map(s => (
              <tr key={s._id}>
                <td>{s.title} - {s.artist}</td>
                <td>
                  {isHost ? (
                    <>
                      <button onClick={() => playNow(s)}>Play Now</button>
                      <button onClick={() => addSongToQueue(s)}>Add to Queue</button>
                    </>
                  ) : (
                    <button onClick={() => alert('Only host can add or play songs')} disabled>Host only</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > LIMIT && (
          <div className="album-show-more">
            <button onClick={() => setAlbumExpanded(prev => ({ ...prev, [albumName]: !prev[albumName] }))}>
              {expanded ? `Show less (${list.length})` : `Show more (${list.length - LIMIT})`}
            </button>
          </div>
        )}
      </div>
    );
  };

  // MAIN render
  if (loadingRoom) return <div className="loading">Loading room...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="room">
      {/* Reconnection overlay */}
      {isReconnecting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: '#fff',
          fontSize: 18,
          fontWeight: 'bold'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>🔄 Reconnecting...</div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>Please wait while we restore your connection</div>
          </div>
        </div>
      )}

      <h2>🎵 {room?.name || roomCode}</h2>
      <div className="room-info">
        <div>
          <strong>Host:</strong> {room?.host?.username || room?.host?.name || room?.host?.email || 'Unknown'}
          {room?.host?._id === userId && ' (You)'}
        </div>
        <div>
          <strong>👥 Users:</strong> {users.length}
        </div>
        <div>
          <strong>Status:</strong> {isHost ? 'Host' : 'Guest'}
        </div>
        <button 
          onClick={async () => {
            if (window.confirm('Are you sure you want to leave this room?')) {
              const token = localStorage.getItem('token');
              try {
                await fetch(`${API_ROOMS}/${roomCode}/leave`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                });
              } catch (err) {
                console.warn('Error leaving room:', err);
              }
              onLeaveRoom();
            }
          }}
        >
          🚪 Leave Room
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {/* Now Playing Section */}
      {currentSong && (
        <div className="playback-info">
          <div>🎶 Now Playing</div>
          <div>{currentSong.title} — {currentSong.artist}</div>
          <div className="playback-progress-container">
            <div className="playback-progress-wrapper">
              <div className="playback-progress-bar">
                <div 
                  className="playback-progress-buffered"
                  style={{
                    width: currentDuration > 0 ? `${Math.min(100, (bufferedEnd / currentDuration) * 100)}%` : '0%'
                  }}
                />
                <div 
                  className="playback-progress-played"
                  style={{
                    width: currentDuration > 0 ? `${Math.min(100, (currentTime / currentDuration) * 100)}%` : '0%'
                  }}
                />
              </div>
              <div className="playback-progress-time">
                {formatTime(currentTime)} / {currentDuration ? formatTime(currentDuration) : '--:--'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Playback Controls */}
      <div className="controls">
        <button onClick={playPrevious} disabled={!isHost} title="Previous Track">
          ⏮️ {isHost ? 'Prev' : 'Prev (Host only)'}
        </button>
        <button onClick={() => seekBy(-10)} disabled={!isHost} title="Rewind 10s">
          ⏪ {isHost ? '10s' : 'Rewind (Host only)'}
        </button>
        <button onClick={togglePlayPause} style={{ minWidth: '100px' }}>
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button onClick={() => seekBy(10)} disabled={!isHost} title="Forward 10s">
          {isHost ? '10s' : 'Forward (Host only)'} ⏩
        </button>
        <button onClick={skipNext} disabled={!isHost} title="Next Track">
          {isHost ? 'Next' : 'Next (Host only)'} ⏭️
        </button>
      </div>

      {!isHost && currentSong && !playbackEnabled && (
        <div className="enable-playback-container">
          <button
            onClick={() => {
              setPlaybackEnabled(true);
              try { audioRef.current?.play().catch(() => {}); } catch (e) {}
            }}
          >
            🔊 Enable Playback on This Device
          </button>
        </div>
      )}

      {/* Queue Section */}
      <div className="queue">
        <h3>📋 Queue ({queue.length} songs)</h3>
        {queue.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No songs in queue</p>
        ) : (
          <ul>
            {queue.map((entry, index) => {
              const s = resolveSongObj(entry);
              const idKey = s?._id || index;
              return (
                <li key={idKey}>
                  <span>{index + 1}. {(s?.title || '(unknown)')} - {(s?.artist || '')}</span>
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
        )}
      </div>

      {/* Songs Section */}
      <div className="songs">
        <h3>🎵 Add Songs {isHost ? '(Host Controls)' : '(View Only)'}</h3>
        {allSongsLoading && <div className="loading">Loading songs...</div>}
        {allSongsError && <div className="error">{allSongsError}</div>}
        
        {Object.keys(groupedByAlbum).length > 0 ? (
          Object.keys(groupedByAlbum).map(albumName => renderAlbumBlock(albumName, groupedByAlbum[albumName]))
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No songs available</div>
        )}
      </div>

      {/* Host Controls */}
      {isHost && (
        <div className="host-controls">
          <h3>⚙️ Host Controls</h3>
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
          }}>📝 Change Room Name</button>
        </div>
      )}

      {/* User List */}
      <div className="user-list">
        <h3>👥 Users in Room ({users.length})</h3>
        <ul>
          {users.map(u => (
            <li key={u._id}>
              <span>
                {(u.username || u.name || u.email || u._id)} 
                {u._id === room?.host?._id && ' (Host)'} 
                {u._id === userId && ' (You)'}
              </span>
              {isHost && u._id !== userId && (
                <button onClick={() => removeUser(u._id)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        onEnded={handleEnded}
        controls={isHost}
        className={isHost ? '' : 'hidden-audio'}
      />
    </div>
  );
};

export default Room;

// Helper: format seconds -> mm:ss
function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '00:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
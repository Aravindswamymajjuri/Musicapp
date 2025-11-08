import React, { useEffect, useState, useRef } from 'react';

// Safe env lookup for backend URL
const envFromProcess = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ? process.env.REACT_APP_BACKEND_URL : null;
const envFromImportMeta = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL) : null;
const API_BASE_URL = envFromProcess || envFromImportMeta || 'http://localhost:3001';
const FAV_BASE = `${API_BASE_URL}/api/favorites`;

const FavoriteSongs = ({ token: propToken, onPlaySong, selectedSongId: propSelected, toggleFavorite: propToggle }) => {
  const [favoriteSongs, setFavoriteSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSongId, setSelectedSongId] = useState(propSelected || null);
  const audioRef = useRef(null);

  // Play state for UI (kept in sync with audio element)
  const [isPlaying, setIsPlaying] = useState(false);
  // playback timing
  const [playTime, setPlayTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);

  // Playback queue & controls
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = none
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [loopMode, setLoopMode] = useState('none'); // 'none' | 'one' | 'all'
  // buffering UI state & timer ref
  const [isBuffering, setIsBuffering] = useState(false);
  const bufferTimerRef = useRef(null);

  // derived queue: support both shapes: [{ song: {...} }, {...song...}]
  const queue = React.useMemo(() => {
    if (!favoriteSongs || favoriteSongs.length === 0) return [];
    if (favoriteSongs[0] && favoriteSongs[0].song) {
      return (favoriteSongs || []).map(f => f.song).filter(Boolean);
    }
    return favoriteSongs.slice();
  }, [favoriteSongs]);

  const [reloadToggle, setReloadToggle] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const token = propToken || localStorage.getItem('token');

  // Fetch favorite songs on mount and when token changes or reloadToggle flips
  useEffect(() => {
    let mounted = true;
    const fetchFavorites = async () => {
      if (!token) { 
        setLoading(false); 
        setFavoriteSongs([]); 
        setError('Not logged in — token missing'); 
        return; 
      }
      setLoading(true);
      setError('');
      setDebugInfo(null);
      try {
        const res = await fetch(FAV_BASE, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // read body (attempt json, fallback to text) for better diagnostics
        let body;
        try { body = await res.json(); } catch (e) { body = await res.text().catch(() => null); }

        if (!res.ok) {
          const msg = (body && (body.error || body.message)) ? (body.error || body.message) : `HTTP ${res.status}`;
          if (mounted) {
            setError(`Failed to fetch favorites: ${msg}`);
            setDebugInfo({ status: res.status, body });
            setFavoriteSongs([]);
          }
          return;
        }

        // If endpoint returns { favorites: [...] } or an array, handle both
        const data = Array.isArray(body) ? body : (body && (body.favorites || body.data || body.items) ? (body.favorites || body.data || body.items) : body);
        if (!data || (Array.isArray(data) && data.length === 0)) {
          if (mounted) {
            setFavoriteSongs([]);
            setError('');
            setDebugInfo({ status: res.status, body });
          }
          return;
        }
        if (mounted) setFavoriteSongs(data);
      } catch (err) {
        if (mounted) {
          setError(err.message || 'Error loading favorites');
          setDebugInfo({ message: String(err) });
          setFavoriteSongs([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchFavorites();
    return () => { mounted = false; };
  }, [token, reloadToggle]);

  // Local toggle favorite (falls back to parent prop if provided)
  const handleToggleFavorite = async (songId) => {
    if (typeof propToggle === 'function') {
      await propToggle(songId);
      setReloadToggle(r => !r);
      return;
    }
    if (!token) return alert('Please log in');
    try {
      const res = await fetch(FAV_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to toggle favorite');
      }
      setReloadToggle(r => !r);
    } catch (e) {
      alert(e.message || 'Error toggling favorite');
    }
  };

  // Ensure audio element exists and attach basic listeners once (use the React-rendered audio)
  useEffect(() => {
    // audioRef.current is assigned after the component mounts (React-rendered <audio>)
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => { setIsPlaying(true); setIsPlayingLocal(true); };
    const onPause = () => { setIsPlaying(false); setIsPlayingLocal(false); };
    const onTimeUpdate = () => { setPlayTime(a.currentTime || 0); };
    const onLoadedMeta = () => { setTrackDuration(isFinite(a.duration) ? a.duration : 0); };

    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('timeupdate', onTimeUpdate);
    a.addEventListener('loadedmetadata', onLoadedMeta);

    return () => {
      try { a.removeEventListener('play', onPlay); } catch (e) {}
      try { a.removeEventListener('pause', onPause); } catch (e) {}
      try { a.removeEventListener('timeupdate', onTimeUpdate); } catch (e) {}
      try { a.removeEventListener('loadedmetadata', onLoadedMeta); } catch (e) {}
    };
    // run once after mount when audioRef is set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NEW: prefetch helper to warm and preload audio stream (uses auth + Range probe)
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

  // NEW: authenticated Range probe to warm connection (best-effort; short timeout)
  const prefetchRange = async (url, size = 65536, timeout = 2500) => {
    if (!url) return;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const headers = {
        Range: `bytes=0-${Math.max(0, size - 1)}`,
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      // Best-effort fetch of first bytes; do not use response body beyond warming
      await fetch(url, { method: 'GET', headers, signal: controller.signal, mode: 'cors', cache: 'no-store' });
    } catch (e) {
      // ignore - this is only to warm the connection
    } finally {
      clearTimeout(id);
    }
  };
 
  // Play a specific index from the favorites queue
  const playIndex = async (index) => {
    if (!queue || index < 0 || index >= queue.length) {
      setCurrentIndex(-1);
      setIsPlayingLocal(false);
      setIsPlaying(false);
      return;
    }
    const song = queue[index];
    const id = song._id || song.id; // support both
    if (!id) return console.warn('Missing song id for playIndex', song);
    const url = `${API_BASE_URL}/api/songs/${id}/stream`;
 
    // optimistic UI update
    setSelectedSongId(id);
    setCurrentIndex(index);
    setIsPlayingLocal(true);
    setIsPlaying(true);
    // show buffering indicator
    setIsBuffering(true);
 
    // warm the connection + ask browser to preload
    try {
      const a = audioRef.current;
      if (a) {
        a.preload = 'auto';
        a.crossOrigin = 'anonymous';
      }
      prefetchAudio(url);
      // Also do an authenticated Range probe (best-effort, short timeout)
      prefetchRange(url).catch(() => {});
    } catch (e) {}
 
    // ensure audio element exists
    if (!audioRef.current) {
      const found = document.querySelector('audio[data-fav-audio]');
      if (found) audioRef.current = found;
      else {
        console.warn('audioRef missing in playIndex - cannot play audio');
        setIsBuffering(false);
        return;
      }
    }
 
    try {
      // set src only when necessary
      if (!audioRef.current.src || !String(audioRef.current.src).includes(id)) {
        try { audioRef.current.pause(); } catch (e) {}
        // remove any previous canplay listener/timeouts
        try { if (audioRef.current._fav_can_play) audioRef.current.removeEventListener('canplay', audioRef.current._fav_can_play); } catch (e) {}
        if (bufferTimerRef.current) { clearTimeout(bufferTimerRef.current); bufferTimerRef.current = null; }

        audioRef.current.src = url;
        // don't await load; browser will stream progressively
      }

      // attach a one-time canplay (or canplaythrough) listener to stop buffering and start playback
      const onCanPlay = () => {
        // only react if this listener is still relevant
        setIsBuffering(false);
        try { audioRef.current.play().catch(() => {}); } catch (e) {}
        try { audioRef.current.removeEventListener('canplay', onCanPlay); } catch (e) {}
        audioRef.current._fav_can_play = null;
        if (bufferTimerRef.current) { clearTimeout(bufferTimerRef.current); bufferTimerRef.current = null; }
      };
      // store reference so we can remove it if replaced
      try {
        audioRef.current._fav_can_play = onCanPlay;
        audioRef.current.addEventListener('canplay', onCanPlay);
      } catch (e) {}

      // safety timeout: if canplay doesn't fire within 10s, stop buffering and show fallback
      bufferTimerRef.current = setTimeout(() => {
        setIsBuffering(false);
        // reflect playback failure in UI (but keep selected)
        setIsPlayingLocal(false);
        setIsPlaying(false);
        try {
          if (audioRef.current && audioRef.current._fav_can_play) {
            audioRef.current.removeEventListener('canplay', audioRef.current._fav_can_play);
            audioRef.current._fav_can_play = null;
          }
        } catch (e) {}
        console.warn('Buffer timeout: could not start playback quickly. Check network/backend.');
      }, 10000);

    } catch (e) {
      console.warn('playIndex error', e);
      setIsPlayingLocal(false);
      setIsPlaying(false);
      setIsBuffering(false);
    }
  };
 
  // Toggle play/pause for local playback (or delegate to parent)
  const handlePlay = (id) => {
    if (typeof onPlaySong === 'function') {
      setSelectedSongId(id);
      onPlaySong(id);
      return;
    }
    const idx = queue.findIndex(s => (s._id || s.id) === id);
    if (idx === -1) {
      // if not found in queue, start from first
      playIndex(0);
      return;
    }
    if (currentIndex === idx) {
      if (isPlayingLocal) {
        audioRef.current?.pause();
        setIsPlayingLocal(false);
        setIsPlaying(false);
      } else {
        // optimistic state flip before attempting play
        setIsPlayingLocal(true);
        setIsPlaying(true);
        audioRef.current?.play().catch((err) => {
          console.warn('Play rejected:', err);
          setIsPlayingLocal(false);
          setIsPlaying(false);
        });
      }
    } else {
      // immediate UI update then play
      setSelectedSongId(queue[idx]?._id || queue[idx]?.id || id);
      setCurrentIndex(idx);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(idx);
    }
  };

  // Advance on ended according to loopMode
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => {
      if (loopMode === 'one') {
        a.currentTime = 0;
        a.play().catch(() => {});
        return;
      }
      const next = currentIndex + 1;
      if (next < queue.length) {
        playIndex(next);
      } else if (loopMode === 'all' && queue.length > 0) {
        playIndex(0);
      } else {
        setIsPlayingLocal(false);
        setCurrentIndex(-1);
        setIsPlaying(false);
      }
    };
    a.addEventListener('ended', onEnded);
    return () => a.removeEventListener('ended', onEnded);
  }, [currentIndex, loopMode, queue]);

  // Seek helper: +/- seconds
  const seekBy = (offsetSeconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const dur = audio.duration || 0;
      let t = (audio.currentTime || 0) + offsetSeconds;
      if (t < 0) t = 0;
      if (dur && t > dur) t = Math.max(0, dur - 0.1);
      audio.currentTime = t;
    } catch (e) {
      console.warn('seekBy error', e);
    }
  };

  // Toggle play/pause helper
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) {
      // if no audio, try to start queue
      if (currentIndex >= 0) {
        // optimistic
        setIsPlayingLocal(true); setIsPlaying(true);
        playIndex(currentIndex);
      } else {
        playAll();
      }
      return;
    }
    if (audio.paused) {
      // optimistic UI first
      setIsPlaying(true);
      setIsPlayingLocal(true);
      audio.play().catch((err) => {
        console.warn('togglePlayPause play rejected', err);
        setIsPlaying(false);
        setIsPlayingLocal(false);
      });
    } else {
      audio.pause();
      setIsPlaying(false);
      setIsPlayingLocal(false);
    }
  };

  // Play next in queue (respect loopMode)
  const handleNext = () => {
    if (!queue || queue.length === 0) return;
    // If nothing is playing, start at first
    if (currentIndex < 0) {
      // immediate UI + play
      setCurrentIndex(0);
      setSelectedSongId(queue[0]._id || queue[0].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(0);
      return;
    }
    const next = currentIndex + 1;
    if (next < queue.length) {
      setCurrentIndex(next);
      setSelectedSongId(queue[next]._id || queue[next].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(next);
    } else if (loopMode === 'all') {
      setCurrentIndex(0);
      setSelectedSongId(queue[0]._id || queue[0].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(0);
    } else {
      // stop playback if end reached and no loop
      try { audioRef.current?.pause(); } catch (e) {}
      setIsPlayingLocal(false);
      setIsPlaying(false);
      setCurrentIndex(-1);
    }
  };
  
  // Play previous in queue (respect loopMode)
  const handlePrev = () => {
    if (!queue || queue.length === 0) return;
    // If nothing is playing, start at last
    if (currentIndex < 0) {
      const idx = queue.length - 1;
      setCurrentIndex(idx);
      setSelectedSongId(queue[idx]._id || queue[idx].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(idx);
      return;
    }
    const prev = currentIndex - 1;
    if (prev >= 0) {
      setCurrentIndex(prev);
      setSelectedSongId(queue[prev]._id || queue[prev].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(prev);
    } else if (loopMode === 'all') {
      const idx = queue.length - 1;
      setCurrentIndex(idx);
      setSelectedSongId(queue[idx]._id || queue[idx].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(idx);
    } else {
      // rewind to start if at first track
      setCurrentIndex(0);
      setSelectedSongId(queue[0]._id || queue[0].id);
      setIsPlayingLocal(true);
      setIsPlaying(true);
      playIndex(0);
    }
  };
  
  // Start playing the whole favorites queue from the beginning
  const playAll = () => {
    if (!queue || queue.length === 0) return;
    playIndex(0);
  };
  
  // Cycle loop mode: none -> all -> one -> none
  const toggleLoopMode = () => {
    setLoopMode(m => (m === 'none' ? 'all' : m === 'all' ? 'one' : 'none'));
  };

  // Render
  if (!token) return (
    <div style={{ padding: 16 }}>
      <p>Please log in to see your favorite songs.</p>
      <button onClick={() => window.location.assign('/login')} style={{ padding: 8, borderRadius: 6 }}>Go to Login</button>
    </div>
  );

  if (loading) return <p>Loading favorite songs...</p>;

  if (error) {
    return (
      <div style={{ marginTop: 20, maxWidth: 1000, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 6px 18px rgba(2,6,23,0.06)' }}>
          <h3 style={{ marginTop: 0 }}>Favorites — Error</h3>
          <p style={{ color: 'red' }}>{error}</p>
          {debugInfo && (
            <pre style={{ background: '#f3f4f6', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          )}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setReloadToggle(r => !r)} style={{ padding: 8, borderRadius: 6, marginRight: 8 }}>Retry</button>
            <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }} style={{ padding: 8, borderRadius: 6 }}>Logout</button>
          </div>
        </div>
      </div>
    );
  }

  if (!favoriteSongs || favoriteSongs.length === 0) {
    return (
      <div style={{ marginTop: 20, maxWidth: 1000, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 6px 18px rgba(2,6,23,0.06)' }}>
          <h2 style={{ marginTop: 0 }}>Your Favorite Songs</h2>
          <p>No favorite songs were found for this account.</p>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setReloadToggle(r => !r)} style={{ padding: 8, borderRadius: 6 }}>Refresh</button>
            <a href="/songmanager" style={{ marginLeft: 12 }}>Upload songs</a>
          </div>
          {debugInfo && (
            <details style={{ marginTop: 12 }}>
              <summary>Debug info</summary>
              <pre style={{ background: '#f3f4f6', padding: 10 }}>{JSON.stringify(debugInfo, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20, maxWidth: 1000, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 6px 18px rgba(2,6,23,0.06)' }}>
        <h2 style={{ marginTop: 0 }}>Your Favorite Songs</h2>

        {/* Playback controls for favorites queue */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button onClick={playAll} style={{ padding: '6px 10px' }}>Play All</button>
          <button onClick={handlePrev} style={{ padding: '6px 10px' }}>Prev</button>
          <button onClick={() => {
            if (!audioRef.current) return;
            if (isPlayingLocal) { audioRef.current.pause(); setIsPlayingLocal(false); setIsPlaying(false); }
            else { audioRef.current.play().catch(() => {}); setIsPlayingLocal(true); setIsPlaying(true); }
          }} style={{ padding: '6px 10px' }}>{isPlayingLocal ? 'Pause' : 'Play'}</button>
          <button onClick={handleNext} style={{ padding: '6px 10px' }}>Next</button>
          {/* Buffering indicator */}
          {isBuffering && <div style={{ marginLeft: 8, color: '#444', fontSize: 13 }}>Buffering…</div>}
          <button onClick={toggleLoopMode} title="Toggle loop mode" style={{ padding: '6px 10px' }}>
            Loop: {loopMode}
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#444' }}>
            {currentIndex >= 0 && queue[currentIndex]
              ? `Now: ${queue[currentIndex].title} — ${formatTime(playTime)} / ${trackDuration ? formatTime(trackDuration) : '--:--'}`
              : 'Not playing'}
          </div>
        </div>

        {/* 10s seek controls when a song is selected/playing */}
        {(selectedSongId || currentIndex >= 0) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <button onClick={() => seekBy(-10)} style={{ padding: '6px 10px' }}>« 10s</button>
            <button onClick={togglePlayPause} style={{ padding: '6px 10px' }}>{isPlaying ? 'Pause' : 'Play'}</button>
            <button onClick={() => seekBy(10)} style={{ padding: '6px 10px' }}>10s »</button>
            <div style={{ marginLeft: 12, color: '#444', fontSize: 13 }}>
              {currentIndex >= 0 && queue[currentIndex] ? `${queue[currentIndex].title} — ${formatTime(playTime)} / ${trackDuration ? formatTime(trackDuration) : '--:--'}` : selectedSongId ? 'Selected' : ''}
            </div>
          </div>
        )}

        {/* Hidden audio element used by local playback */}
        <audio data-fav-audio="1" ref={audioRef} style={{ display: 'none' }} crossOrigin="anonymous" preload="metadata" />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Title</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Artist</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Album</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Duration (s)</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {favoriteSongs.map(fav => {
                const song = fav.song;
                if (!song) return null; // Defensive check
                return (
                  <tr key={fav._id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{song.title}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{song.artist}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{song.album}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{song.duration}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                      <button
                        onClick={() => handlePlay(song._id)}
                        style={{
                          marginRight: 8,
                          padding: '6px 12px',
                          backgroundColor: selectedSongId === song._id ? '#007bff' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        {selectedSongId === song._id && isPlayingLocal ? 'Playing' : 'Play'}
                      </button>

                      <button
                        onClick={() => handleToggleFavorite(song._id)}
                        aria-label="Remove from favorites"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'red',
                          fontSize: 20,
                          verticalAlign: 'middle',
                        }}
                      >
                        ❤️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Helper: format seconds -> mm:ss
function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '00:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default FavoriteSongs;
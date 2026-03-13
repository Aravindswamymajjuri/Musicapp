import React, { useEffect, useState, useRef } from 'react';
import './favioute.css';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
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
    <div className="favorites-container">
      <div className="favorites-empty">
        <div className="favorites-empty-icon">🔐</div>
        <div className="favorites-empty-title">Sign In Required</div>
        <div className="favorites-empty-text">Please log in to view your favorite songs</div>
        <button 
          className="control-btn" 
          onClick={() => window.location.assign('/login')}
          style={{ marginTop: '1rem' }}
        >
          Go to Login
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="favorites-container">
      <div className="favorites-loading">
        <div className="loading-spinner"></div>
        <p>Loading your favorite songs...</p>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="favorites-container">
        <div className="favorites-error">
          {error}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button 
            className="control-btn" 
            onClick={() => setReloadToggle(r => !r)}
          >
            Retry
          </button>
          <button 
            className="control-btn" 
            onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
          >
            Logout
          </button>
        </div>
        {debugInfo && (
          <details style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '0.5rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: '600', color: '#6366f1' }}>Debug Info</summary>
            <pre style={{ marginTop: '0.5rem', fontSize: '0.8rem', overflow: 'auto' }}>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (!favoriteSongs || favoriteSongs.length === 0) {
    return (
      <div className="favorites-container">
        <div className="favorites-header">
          <h1 className="favorites-title">Your Favorite Songs</h1>
        </div>
        <div className="favorites-empty">
          <div className="favorites-empty-icon">❤️</div>
          <div className="favorites-empty-title">No Favorites Yet</div>
          <div className="favorites-empty-text">Start adding songs to your favorites to see them here</div>
          <button 
            className="control-btn" 
            onClick={() => window.location.assign('/songs')}
            style={{ marginTop: '1rem' }}
          >
            Browse Songs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="favorites-container">
      {/* Header */}
      <div className="favorites-header">
        <h1 className="favorites-title">Your Favorite Songs</h1>
        <div className="favorites-status">{favoriteSongs.length} songs</div>
      </div>

      {/* Playback Controls */}
      <div className="favorites-controls">
        <div className="control-buttons">
          <button className="control-btn" onClick={playAll} title="Play all favorites">
            ▶ Play All
          </button>
          <button className="control-btn" onClick={handlePrev} title="Previous song">
            ⏮ Prev
          </button>
          <button 
            className="control-btn" 
            onClick={() => {
              if (!audioRef.current) return;
              if (isPlayingLocal) { 
                audioRef.current.pause(); 
                setIsPlayingLocal(false); 
                setIsPlaying(false); 
              } else { 
                audioRef.current.play().catch(() => {}); 
                setIsPlayingLocal(true); 
                setIsPlaying(true); 
              }
            }}
            title={isPlayingLocal ? 'Pause' : 'Play'}
          >
            {isPlayingLocal ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="control-btn" onClick={handleNext} title="Next song">
            ⏭ Next
          </button>
          <button 
            className="control-btn" 
            onClick={toggleLoopMode} 
            title="Toggle loop mode"
            style={{ opacity: loopMode !== 'none' ? 1 : 0.7 }}
          >
            🔁 Loop: {loopMode}
          </button>
        </div>
        <div className="loop-status">
          {isBuffering ? '↻ Buffering...' : currentIndex >= 0 && queue[currentIndex]
            ? `Now: ${queue[currentIndex].title}`
            : 'Not playing'}
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio 
        data-fav-audio="1" 
        ref={audioRef} 
        style={{ display: 'none' }} 
        crossOrigin="anonymous" 
        preload="metadata" 
      />

      {/* Table/List */}
      <div className="favorites-table-wrapper">
        <div className="favorites-table-header">
          <div style={{ textAlign: 'center' }}>#</div>
          <div>Title & Artist</div>
          <div style={{ textAlign: 'right' }}>Duration</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>
        <div className="favorites-table-body">
          {favoriteSongs.map((fav, idx) => {
            const song = fav.song || fav;
            if (!song) return null;
            const isCurrentlyPlaying = currentIndex === idx && isPlayingLocal;
            
            return (
              <React.Fragment key={fav._id || song._id}>
                <div className={`favorite-song-row ${isCurrentlyPlaying ? 'active' : ''} ${currentIndex === idx ? 'has-player' : ''}`}>
                  <div className="song-index">{idx + 1}</div>
                  <div className="song-info">
                    <div className="song-title">{song.title}</div>
                    <div className="song-artist">{song.artist}</div>
                  </div>
                  <div className="song-duration">{song.duration}s</div>
                  <div className="song-actions">
                    <button 
                      className="action-btn play" 
                      onClick={() => handlePlay(song._id)}
                      title="Play this song"
                    >
                      {isCurrentlyPlaying ? '⏸' : '▶'}
                    </button>
                    <button
                      className="action-btn favorite"
                      onClick={() => handleToggleFavorite(song._id)}
                      title="Remove from favorites"
                    >
                      ❤️
                    </button>
                  </div>
                </div>

                {/* Player Controls Row for Current Song */}
                {isCurrentlyPlaying && (
                  <div className="playback-info-row">
                    <div className="playback-progress-wrapper">
                      <div 
                        className="playback-progress-bar"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const percent = (e.clientX - rect.left) / rect.width;
                          if (audioRef.current && trackDuration) {
                            audioRef.current.currentTime = percent * trackDuration;
                          }
                        }}
                      >
                        <div 
                          className="playback-progress-buffered"
                          style={{ width: `${(playTime / trackDuration) * 100}%` }}
                        />
                        <div 
                          className="playback-progress-played"
                          style={{ width: `${(playTime / trackDuration) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="playback-controls-row">
                      <button 
                        className="seek-btn"
                        onClick={() => seekBy(-10)}
                        title="Seek backward 10 seconds"
                      >
                        « 10s
                      </button>
                      <button 
                        className="play-pause-btn"
                        onClick={togglePlayPause}
                      >
                        {isPlaying ? '⏸ Pause' : '▶ Play'}
                      </button>
                      <button 
                        className="seek-btn"
                        onClick={() => seekBy(10)}
                        title="Seek forward 10 seconds"
                      >
                        10s »
                      </button>
                      <span className="timing-display">
                        {formatTime(playTime)} / {formatTime(trackDuration)}
                      </span>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
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
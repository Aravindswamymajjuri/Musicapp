// import React, { useState, useEffect } from 'react';
import React, { useState, useEffect, useRef } from 'react';
import FavoriteSongs from './favioute'; // Adjust path if needed

// Safe env lookup for backend URL (REACT_APP_BACKEND_URL from frontend/.env)
const envFromProcess = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ? process.env.REACT_APP_BACKEND_URL : null;
const envFromImportMeta = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL) : null;
const API_BASE_URL = envFromProcess || envFromImportMeta || 'http://localhost:3001';
const API_SONGS = `${API_BASE_URL}/api/songs`;
const FAV_BASE = `${API_BASE_URL}/api/favorites`;

const SongManager = () => {
  // NEW: ref for the audio element so we can control load/play immediately
  const audioRef = useRef(null);

  // Upload form states
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [duration, setDuration] = useState('');
  const [folder, setFolder] = useState('');
  const [bitrate, setBitrate] = useState('');
  const [format, setFormat] = useState('');
  const [albumArt, setAlbumArt] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');

  // Song list and UI states
  const [songs, setSongs] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Playback states
  const [selectedSongId, setSelectedSongId] = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);

  // Favorites: array of favorite objects including { _id, song: { ... } }
  const [favorites, setFavorites] = useState([]);

  const token = localStorage.getItem('token');

  // On mount, check server, fetch songs and favorites
  useEffect(() => {
    checkServerStatus();
    fetchSongs();
    fetchFavorites();
  }, []);

  // Server health check
  const checkServerStatus = async () => {
    try {
      const res = await fetch(`${API_SONGS}/health`);
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data.dbConnection === 'connected' ? 'ready' : 'not-ready');
      } else {
        setServerStatus('error');
      }
    } catch {
      setServerStatus('offline');
    }
  };

  // Fetch all user songs
  const fetchSongs = async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await fetch(API_SONGS, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch songs: ${res.status}`);
      const data = await res.json();
      setSongs(data);
    } catch (err) {
      setListError(err.message || 'Unable to load songs');
    } finally {
      setListLoading(false);
    }
  };

  // Fetch favorites with songs populated
  const fetchFavorites = async () => {
    try {
      const res = await fetch(FAV_BASE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch favorites');
      const data = await res.json();
      setFavorites(data);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  // Check if a song is favorited
  const isFavorited = (songId) => {
    return favorites.some(fav => fav.song && fav.song._id === songId);
  };

  // Toggle favorite status by calling the backend toggle endpoint
  const toggleFavorite = async (songId) => {
    if (!token) return alert('Please log in');

    try {
      const res = await fetch(FAV_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to toggle favorite');
      }
      // Refresh favorites and songs to reflect changes
      await fetchFavorites();
      await fetchSongs();
    } catch (err) {
      alert(err.message);
    }
  };

  // Upload handlers
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      setFormat(ext);
      if (selectedFile.type.startsWith('audio/')) {
        const audio = new Audio();
        audio.onloadedmetadata = () => setDuration(Math.round(audio.duration));
        audio.src = URL.createObjectURL(selectedFile);
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError('');
    setSuccess('');

    if (serverStatus !== 'ready') {
      setUploadError('Server is not ready. Please try again soon.');
      await checkServerStatus();
      return;
    }
    if (!file) { setUploadError('Please select a file.'); return; }
    if (!title || !artist || !album || !duration) {
      setUploadError('Fill in all required fields.');
      return;
    }
    if (!token) { setUploadError('Log in first.'); return; }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());
    formData.append('artist', artist.trim());
    formData.append('album', album.trim());
    formData.append('duration', duration.toString());
    if (folder.trim()) formData.append('folder', folder.trim());
    if (bitrate.trim()) formData.append('bitrate', bitrate.trim());
    if (format.trim()) formData.append('format', format.trim());
    if (albumArt.trim()) formData.append('albumArt', albumArt.trim());

    setUploadLoading(true);
    try {
      const response = await fetch(`${API_SONGS}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP: ${response.status}`);

      setSuccess('Song uploaded!');
      setFile(null); setTitle(''); setArtist(''); setAlbum(''); setDuration('');
      setFolder(''); setBitrate(''); setFormat(''); setAlbumArt('');
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      await fetchSongs(); // Refresh list
    } catch (err) {
      setUploadError(err.message || 'Upload error.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Delete a song
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this song?')) {
      return;
    }
    setDeletingId(id);
    setListError('');
    try {
      const res = await fetch(`${API_SONGS}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Failed to delete song: ${res.status}`);
      }
      setSongs((prev) => prev.filter((song) => song._id !== id));
      // If deleted song is playing, stop audio
      if (selectedSongId === id) {
        setSelectedSongId(null);
        if (audioSrc && String(audioSrc).startsWith('blob:')) {
          URL.revokeObjectURL(audioSrc);
        }
        setAudioSrc(null);
      }
      // Refresh favorites (in case deleted song was favorited)
      await fetchFavorites();
    } catch (err) {
      setListError(err.message || 'Error deleting song');
    } finally {
      setDeletingId(null);
    }
  };

  // Play a song by streaming buffered audio with auth headers
  const handlePlaySong = async (id) => {
    if (selectedSongId === id) {
      // Stop playback if clicking current song
      setSelectedSongId(null);
      // only revoke if we previously created a blob URL
      if (audioSrc && String(audioSrc).startsWith('blob:')) {
        URL.revokeObjectURL(audioSrc);
      }
      setAudioSrc(null);
      return;
    }

    // Select the song and set the audio src to the streaming endpoint.
    // Browser will stream and use Range requests; faster than waiting for full blob.
    setSelectedSongId(id);
    if (audioSrc && String(audioSrc).startsWith('blob:')) {
      URL.revokeObjectURL(audioSrc);
    }
    // Use the direct stream endpoint - server supports Range and streaming.
    // Also call load/play on the audio element via effect below for faster startup.
    setAudioSrc(`${API_SONGS}/${id}/stream`);
  };

  // When audioSrc changes, apply it immediately to the audio element and attempt to play.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioSrc) {
      // stop and clear source
      try { audio.pause(); } catch (e) {}
      audio.removeAttribute('src');
      try { audio.load(); } catch (e) {}
      return;
    }

    // Set src, load and play. This starts streaming quickly and allows Range requests.
    try {
      if (audio.src !== audioSrc) {
        audio.src = audioSrc;
      }
      // preload metadata/auto to allow quick start
      audio.preload = 'auto';
      // ensure crossOrigin so CORS headers are respected for streaming responses
      audio.crossOrigin = 'anonymous';
      audio.load();
      // try to play (may be blocked by autoplay policies; caller interactions will allow)
      audio.play().catch(() => { /* ignore play errors; user interaction may be needed */ });
    } catch (e) {
      console.error('Audio element error applying src:', e);
    }
  }, [audioSrc]);

  // Cleanup blob URLs on unmount or when changing audioSrc
  useEffect(() => {
    return () => {
      if (audioSrc && String(audioSrc).startsWith('blob:')) {
        URL.revokeObjectURL(audioSrc);
      }
    };
  }, [audioSrc]);

  // UI helpers for status color and text
  const getStatusColor = () => {
    switch (serverStatus) {
      case 'ready': return 'green';
      case 'not-ready': return 'orange';
      case 'error': return 'red';
      case 'offline': return 'red';
      default: return 'gray';
    }
  };

  const getStatusText = () => {
    switch (serverStatus) {
      case 'ready': return 'Server Ready';
      case 'not-ready': return 'Server Starting...';
      case 'error': return 'Server Error';
      case 'offline': return 'Server Offline';
      default: return 'Checking...';
    }
  };

  if (!token) return (
    <div style={{ margin: '80px auto', maxWidth: 400, textAlign: 'center' }}>
      <h2>Please log in to use the Song Manager.</h2>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: 'auto', padding: 20 }}>
      <h2>Upload a New Song</h2>

      <div style={{
        padding: 10, marginBottom: 20, backgroundColor: '#f5f5f5',
        borderRadius: 5, border: `2px solid ${getStatusColor()}`
      }}>
        <span style={{ color: getStatusColor(), fontWeight: 'bold' }}>Status: {getStatusText()}</span>
        {serverStatus !== 'ready' && (
          <button
            onClick={checkServerStatus}
            style={{ marginLeft: 10, padding: '5px 10px', fontSize: '12px' }}
          >
            Retry
          </button>
        )}
      </div>

      {uploadError && <p style={{ color: 'red', padding: 10, backgroundColor: '#ffebee' }}>{uploadError}</p>}
      {success && <p style={{ color: 'green', padding: 10, backgroundColor: '#e8f5e8' }}>{success}</p>}

      <form onSubmit={handleUpload}>
        <div style={{ marginBottom: 15 }}>
          <label><strong>Song File (MP3, WAV, etc):</strong></label><br />
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            required
            style={{ width: '100%', padding: 8 }}
          />
          {file && <small style={{ color: 'gray' }}>Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</small>}
        </div>

        <div style={{ marginBottom: 15 }}>
          <label><strong>Title:</strong></label><br />
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
            style={{ width: '100%', padding: 8 }} placeholder="Song title" />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label><strong>Artist:</strong></label><br />
          <input type="text" value={artist} onChange={e => setArtist(e.target.value)} required
            style={{ width: '100%', padding: 8 }} placeholder="Artist name" />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label><strong>Album:</strong></label><br />
          <input type="text" value={album} onChange={e => setAlbum(e.target.value)} required
            style={{ width: '100%', padding: 8 }} placeholder="Album name" />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label><strong>Duration (seconds):</strong></label><br />
          <input type="number" min="0" value={duration} onChange={e => setDuration(e.target.value)} required
            style={{ width: '100%', padding: 8 }} placeholder="Duration in seconds" />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Folder (optional):</label><br />
          <input type="text" value={folder} onChange={e => setFolder(e.target.value)}
            style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Bitrate (optional):</label><br />
          <input type="text" value={bitrate} onChange={e => setBitrate(e.target.value)}
            style={{ width: '100%', padding: 8 }} placeholder="e.g., 320kbps" />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Format:</label><br />
          <input type="text" value={format} onChange={e => setFormat(e.target.value)}
            style={{ width: '100%', padding: 8 }} placeholder="e.g., mp3, wav" />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label>Album Art URL (optional):</label><br />
          <input type="text" value={albumArt} onChange={e => setAlbumArt(e.target.value)}
            style={{ width: '100%', padding: 8 }} placeholder="http://..." />
        </div>

        <button
          type="submit"
          disabled={uploadLoading || serverStatus !== 'ready'}
          style={{
            width: '100%',
            padding: 12,
            backgroundColor: uploadLoading || serverStatus !== 'ready' ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none', borderRadius: 5, fontSize: 16,
            cursor: uploadLoading || serverStatus !== 'ready' ? 'not-allowed' : 'pointer'
          }}
        >
          {uploadLoading ? 'Uploading...' : 'Upload Song'}
        </button>
      </form>

      {/* Audio player for selected song */}
      <div style={{ marginTop: 20 }}>
        <audio
          ref={audioRef}
          controls
          preload="auto"
          crossOrigin="anonymous"
        >
          Your browser does not support the audio element.
        </audio>
      </div>

      {/* Songs List */}
      <h2 style={{ marginTop: 50 }}>Your Uploaded Songs</h2>
      {listError && <p style={{ color: 'red' }}>{listError}</p>}
      {listLoading && <p>Loading songs...</p>}
      {!listLoading && songs.length === 0 && <p>No songs found. Upload some songs first!</p>}
      {!listLoading && songs.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Title</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Artist</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Album</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Duration (s)</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Folder</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {songs.map(({ _id, title, artist, album, duration, folder }) => (
              <tr key={_id}>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{title}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{artist}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{album}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{duration}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{folder}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                  <button
                    onClick={() => handlePlaySong(_id)}
                    style={{
                      marginRight: 8,
                      padding: '6px 12px',
                      backgroundColor: selectedSongId === _id ? '#007bff' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {selectedSongId === _id ? 'Playing' : 'Play'}
                  </button>

                  <button
                    onClick={() => toggleFavorite(_id)}
                    aria-label={isFavorited(_id) ? 'Remove from favorites' : 'Add to favorites'}
                    style={{
                      marginRight: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: isFavorited(_id) ? 'red' : 'gray',
                      fontSize: 20,
                      verticalAlign: 'middle',
                    }}
                  >
                    {isFavorited(_id) ? '❤️' : '🤍'}
                  </button>

                  <button
                    onClick={() => handleDelete(_id)}
                    disabled={deletingId === _id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: deletingId === _id ? '#ccc' : '#d9534f',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: deletingId === _id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {deletingId === _id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Favorite Songs Component */}
      <FavoriteSongs
        token={token}
        onPlaySong={handlePlaySong}
        selectedSongId={selectedSongId}
        toggleFavorite={toggleFavorite}
      />
    </div>
  );
};

export default SongManager;
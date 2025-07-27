// App.js - Main React Application
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, Users, Settings, Upload, Music, Heart, Clock, Moon, Sun } from 'lucide-react';
import '../components/music.css'; // Assuming you have a CSS file for styling

const App = ({ token, user }) => {
  const [currentSong, setCurrentSong] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState('none'); // 'none', 'one', 'all'
  const [darkMode, setDarkMode] = useState(false);
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [roomUsers, setRoomUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [activeTab, setActiveTab] = useState('library');
  const [favorites, setFavorites] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFields, setUploadFields] = useState({
    title: '',
    artist: '',
    album: '',
    duration: ''
  });
  const [favoritesList, setFavoritesList] = useState([]);
  const [deviceSongs, setDeviceSongs] = useState([]);
  const [deviceAccessError, setDeviceAccessError] = useState('');
  const [deviceFileInputRef] = useState(() => React.createRef());

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io('http://localhost:3001');
    
    socketRef.current.on('room-joined', (data) => {
      setRoom(data.room);
      setRoomUsers(data.users);
      setIsHost(data.isHost);
    });
    
    socketRef.current.on('room-users-updated', (users) => {
      setRoomUsers(users);
    });
    
    socketRef.current.on('sync-playback', (data) => {
      if (!isHost) {
        setCurrentSong(data.song);
        setCurrentTime(data.currentTime);
        setIsPlaying(data.isPlaying);
        if (audioRef.current) {
          audioRef.current.currentTime = data.currentTime;
          if (data.isPlaying) {
            audioRef.current.play();
          } else {
            audioRef.current.pause();
          }
        }
      }
    });
    
    return () => socketRef.current.disconnect();
  }, [isHost]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => handleNext();

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentSong]);

  // Fetch songs from backend
  const fetchSongs = async () => {
    if (!token) return;
    try {
      const res = await fetch('http://localhost:3001/api/songs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const songs = await res.json();
      if (!Array.isArray(songs)) {
        setPlaylist([]);
        return;
      }
      setPlaylist(songs.map(song => ({
        id: song._id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        url: `http://localhost:3001/api/songs/${song._id}/stream`
      })));
    } catch (err) {
      console.error("Failed to fetch songs", err);
      setPlaylist([]);
    }
  };

  // Fetch favorites from backend
  const fetchFavorites = async () => {
    if (!token) return;
    try {
      const res = await fetch('http://localhost:3001/api/favorites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const favs = await res.json();
      if (!Array.isArray(favs)) {
        setFavoritesList([]);
        return;
      }
      setFavoritesList(favs.map(fav => ({
        id: fav.song._id,
        title: fav.song.title,
        artist: fav.song.artist,
        album: fav.song.album,
        duration: fav.song.duration,
        url: `http://localhost:3001/api/songs/${fav.song._id}/stream`
      })));
    } catch (err) {
      setFavoritesList([]);
    }
  };

  // On mount, fetch songs (and optionally prompt for token)
  //   useEffect(() => {
  //     // For demo: prompt for token if not set
  //     if (!token) {
  //       const t = window.prompt("Enter JWT token for backend API:");
  //       setToken(t || "");
  //     }
  //   }, []);

  useEffect(() => {
    if (token) {
      fetchSongs();
      fetchFavorites();
    }
  }, [token]);

  // File upload handler (upload to backend)
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    for (const file of files) {
      if (file.type.startsWith('audio/')) {
        const formData = new FormData();
        formData.append('song', file);
        formData.append('title', file.name.replace(/\.[^/.]+$/, ""));
        formData.append('artist', 'Unknown Artist'); // provide default
        formData.append('album', 'Unknown Album');   // provide default
        formData.append('duration', 0);              // provide default
        try {
          await fetch('http://localhost:3001/api/songs/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          });
        } catch (err) {
          console.error("Upload failed", err);
        }
      }
    }
    // Refresh songs after upload
    fetchSongs();
  };

  // Show upload modal when user selects a file
  const handleFileInputChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setUploadFile(file);
      setUploadFields({
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: '',
        album: '',
        duration: ''
      });
      setUploadModalOpen(true);
    }
  };

  // Handle upload form submit
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('song', uploadFile);
    formData.append('title', uploadFields.title);
    formData.append('artist', uploadFields.artist);
    formData.append('album', uploadFields.album);
    formData.append('duration', uploadFields.duration || 0);
    try {
      await fetch('http://localhost:3001/api/songs/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadFields({ title: '', artist: '', album: '', duration: '' });
      fetchSongs();
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  // Add/remove favorite
  const toggleFavorite = async (song) => {
    if (!token) return;
    try {
      await fetch('http://localhost:3001/api/favorites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ songId: song.id })
      });
      fetchFavorites();
    } catch (err) {
      // handle error
    }
  };

  // Playback controls
  const togglePlay = () => {
    if (!currentSong) return;
    
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    
    if (newIsPlaying) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: currentSong,
        currentTime: audioRef.current.currentTime,
        isPlaying: newIsPlaying
      });
    }
  };

  const handleNext = () => {
    if (!playlist.length) return;
    
    const currentIndex = playlist.findIndex(song => song.id === currentSong?.id);
    let nextIndex;
    
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = (currentIndex + 1) % playlist.length;
    }
    
    const nextSong = playlist[nextIndex];
    setCurrentSong(nextSong);
    setRecentlyPlayed(prev => [nextSong, ...prev.slice(0, 9)]);
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: nextSong,
        currentTime: 0,
        isPlaying: true
      });
    }
  };

  const handlePrevious = () => {
    if (!playlist.length) return;
    
    const currentIndex = playlist.findIndex(song => song.id === currentSong?.id);
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    const prevSong = playlist[prevIndex];
    setCurrentSong(prevSong);
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: prevSong,
        currentTime: 0,
        isPlaying: true
      });
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    setCurrentTime(newTime);
    audioRef.current.currentTime = newTime;
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: currentSong,
        currentTime: newTime,
        isPlaying: isPlaying
      });
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Track recently played songs
  useEffect(() => {
    if (currentSong) {
      setRecentlyPlayed(prev => {
        const exists = prev.find(s => s.id === currentSong.id);
        if (exists) return prev;
        return [currentSong, ...prev.filter(s => s.id !== currentSong.id).slice(0, 9)];
      });
    }
  }, [currentSong]);

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    socketRef.current.emit('create-room', {
      code,
      user: user || { id: Date.now(), name: 'Anonymous' }
    });
  };

  const joinRoom = () => {
    if (!roomCode) return;
    socketRef.current.emit('join-room', {
      code: roomCode,
      user: user || { id: Date.now(), name: 'Anonymous' }
    });
  };

  const leaveRoom = () => {
    socketRef.current.emit('leave-room', { code: room.code });
    setRoom(null);
    setRoomUsers([]);
    setIsHost(false);
  };

  // Persist activeTab in localStorage
  useEffect(() => {
    const storedTab = localStorage.getItem('activeTab');
    if (storedTab) setActiveTab(storedTab);
  }, []);
  
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Device songs: ask permission and read files
  const handleDeviceSongs = async () => {
    setDeviceAccessError('');
    // Try File System Access API
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const songs = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file' && entry.name.match(/\.(mp3|wav|ogg|flac)$/i)) {
            const file = await entry.getFile();
            songs.push({
              id: file.name + file.size + file.lastModified,
              title: file.name.replace(/\.[^/.]+$/, ""),
              artist: 'Device',
              album: 'Downloads',
              duration: 0,
              url: URL.createObjectURL(file),
              file
            });
          }
        }
        setDeviceSongs(songs);
      } catch (err) {
        setDeviceAccessError('Permission denied or no access to device files.');
        setDeviceSongs([]);
      }
    } else {
      // Fallback: ask user to select files
      deviceFileInputRef.current.click();
    }
  };

  const handleDeviceFileInput = (event) => {
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('audio/'));
    const songs = files.map(file => ({
      id: file.name + file.size + file.lastModified,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: 'Device',
      album: 'Downloads',
      duration: 0,
      url: URL.createObjectURL(file),
      file
    }));
    setDeviceSongs(songs);
  };

  // Persist deviceSongs metadata in localStorage (no file/url)
  useEffect(() => {
    if (deviceSongs.length > 0) {
      localStorage.setItem('deviceSongs', JSON.stringify(deviceSongs.map(song => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration
      }))));
    }
  }, [deviceSongs]);

  // Restore deviceSongs metadata on mount (no file/url)
  useEffect(() => {
    const storedDeviceSongs = localStorage.getItem('deviceSongs');
    if (storedDeviceSongs) {
      try {
        const songs = JSON.parse(storedDeviceSongs);
        setDeviceSongs(songs);
      } catch (err) {
        setDeviceSongs([]);
      }
    }
  }, []);

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <audio ref={audioRef} src={currentSong?.url} volume={volume} />
      
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      
      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="upload-modal">
          <form className="upload-form" onSubmit={handleUploadSubmit}>
            <h3>Upload Song</h3>
            <label>
              Title:
              <input
                type="text"
                value={uploadFields.title}
                onChange={e => setUploadFields(f => ({ ...f, title: e.target.value }))}
                required
              />
            </label>
            <label>
              Artist:
              <input
                type="text"
                value={uploadFields.artist}
                onChange={e => setUploadFields(f => ({ ...f, artist: e.target.value }))}
                required
              />
            </label>
            <label>
              Album:
              <input
                type="text"
                value={uploadFields.album}
                onChange={e => setUploadFields(f => ({ ...f, album: e.target.value }))}
                required
              />
            </label>
            <label>
              Duration (seconds):
              <input
                type="number"
                value={uploadFields.duration}
                onChange={e => setUploadFields(f => ({ ...f, duration: e.target.value }))}
                min="0"
                required
              />
            </label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit">Upload</button>
              <button type="button" onClick={() => setUploadModalOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      {/* Header */}
      <header className="header">
        <div className="logo">
          <Music className="logo-icon" />
          <h1>MusicSync</h1>
        </div>
        <div className="header-controls">
          <button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={() => fileInputRef.current.click()}>
            <Upload size={20} />
          </button>
          <button onClick={handleDeviceSongs}>
            <Music size={20} />
            Device Songs
          </button>
          <input
            ref={deviceFileInputRef}
            type="file"
            multiple
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleDeviceFileInput}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="nav">
            <button 
              className={activeTab === 'library' ? 'active' : ''}
              onClick={() => setActiveTab('library')}
            >
              <Music size={20} />
              Library
            </button>
            <button 
              className={activeTab === 'favorites' ? 'active' : ''}
              onClick={() => setActiveTab('favorites')}
            >
              <Heart size={20} />
              Favorites
            </button>
            <button 
              className={activeTab === 'recent' ? 'active' : ''}
              onClick={() => setActiveTab('recent')}
            >
              <Clock size={20} />
              Recent
            </button>
            <button 
              className={activeTab === 'rooms' ? 'active' : ''}
              onClick={() => setActiveTab('rooms')}
            >
              <Users size={20} />
              Rooms
            </button>
            <button
              className={activeTab === 'device' ? 'active' : ''}
              onClick={() => setActiveTab('device')}
            >
              <Music size={20} />
              Device Songs
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="content">
          {activeTab === 'library' && (
            <div className="library">
              <h2>My Library</h2>
              {playlist.length === 0 ? (
                <div className="empty-state">
                  <Music size={48} />
                  <p>No songs in your library</p>
                  <button onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                    Upload Songs
                  </button>
                </div>
              ) : (
                <div className="song-list">
                  {playlist.map(song => (
                    <div 
                      key={song.id} 
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => setCurrentSong(song)}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                      </div>
                      <div className="song-actions">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(song);
                          }}
                          className={favoritesList.some(fav => fav.id === song.id) ? 'favorite' : ''}
                        >
                          <Heart size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'favorites' && (
            <div className="favorites">
              <h2>Favorites</h2>
              <div className="song-list">
                {favoritesList.length === 0 ? (
                  <div className="empty-state">
                    <Heart size={48} />
                    <p>No favorite songs yet</p>
                  </div>
                ) : (
                  favoritesList.map(song => (
                    <div 
                      key={song.id} 
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => setCurrentSong(song)}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'recent' && (
            <div className="recent">
              <h2>Recently Played</h2>
              <div className="song-list">
                {recentlyPlayed.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={48} />
                    <p>No songs played recently</p>
                  </div>
                ) : (
                  recentlyPlayed.map(song => (
                    <div 
                      key={song.id} 
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => setCurrentSong(song)}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="rooms">
              <h2>Rooms</h2>
              {!room ? (
                <div className="room-controls">
                  <button onClick={createRoom} className="create-room-btn">
                    Create Room
                  </button>
                  <div className="join-room">
                    <input
                      type="text"
                      placeholder="Enter room code"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                    />
                    <button onClick={joinRoom}>Join</button>
                  </div>
                </div>
              ) : (
                <div className="room-info">
                  <h3>Room: {room.code}</h3>
                  <p>Users ({roomUsers.length}):</p>
                  <ul>
                    {roomUsers.map(user => (
                      <li key={user.id}>
                        {user.name} {user.isHost ? '(Host)' : ''}
                      </li>
                    ))}
                  </ul>
                  <button onClick={leaveRoom}>Leave Room</button>
                  {/* Show playlist in room */}
                  <div style={{ marginTop: '2rem' }}>
                    <h4>Room Playlist</h4>
                    <div className="song-list">
                      {[...playlist, ...deviceSongs].map(song => (
                        <div
                          key={song.id}
                          className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                          onClick={() => {
                            if (song.url) {
                              setCurrentSong(song);
                              // Sync playback for room (only for backend songs)
                              if (isHost && room && playlist.find(s => s.id === song.id)) {
                                socketRef.current.emit('sync-playback', {
                                  roomCode: room.code,
                                  song: song,
                                  currentTime: 0,
                                  isPlaying: true
                                });
                              }
                            }
                          }}
                          style={{ opacity: song.url ? 1 : 0.5, pointerEvents: song.url ? 'auto' : 'none' }}
                        >
                          <div className="song-info">
                            <h3>{song.title}</h3>
                            <p>{song.artist} • {song.album}</p>
                            {!song.url && <span style={{ color: '#ef4444', fontSize: '0.9em' }}>File access required for playback</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'device' && (
            <div className="device-songs">
              <h2>Device Songs</h2>
              {deviceAccessError && <div className="auth-error">{deviceAccessError}</div>}
              {deviceSongs.length === 0 ? (
                <div className="empty-state">
                  <Music size={48} />
                  <p>No device songs found. Click "Device Songs" above to grant access.</p>
                </div>
              ) : (
                <div className="song-list">
                  {deviceSongs.map(song => (
                    <div
                      key={song.id}
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => song.url ? setCurrentSong(song) : null}
                      style={{ opacity: song.url ? 1 : 0.5, pointerEvents: song.url ? 'auto' : 'none' }}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                        {!song.url && <span style={{ color: '#ef4444', fontSize: '0.9em' }}>File access required for playback</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Player */}
      {currentSong && (
        <div className="player">
          <div className="player-info">
            <h3>{currentSong.title}</h3>
            <p>{currentSong.artist}</p>
          </div>
          
          <div className="player-controls">
            <button onClick={handlePrevious}>
              <SkipBack size={20} />
            </button>
            <button onClick={togglePlay} className="play-btn">
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={handleNext}>
              <SkipForward size={20} />
            </button>
          </div>
          
          <div className="player-progress">
            <span>{formatTime(currentTime)}</span>
            <div className="progress-bar" onClick={handleSeek}>
              <div 
                className="progress-fill" 
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
          
          <div className="player-extra">
            <button 
              onClick={() => setShuffle(!shuffle)}
              className={shuffle ? 'active' : ''}
            >
              <Shuffle size={20} />
            </button>
            <button 
              onClick={() => setLoop(loop === 'none' ? 'all' : loop === 'all' ? 'one' : 'none')}
              className={loop !== 'none' ? 'active' : ''}
            >
              <Repeat size={20} />
            </button>
            <div className="volume-control">
              <Volume2 size={20} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
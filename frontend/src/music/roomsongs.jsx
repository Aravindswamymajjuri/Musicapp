import React, { useState, useEffect, useRef } from 'react';

const API_ROOMS = 'http://localhost:3001/api/rooms';
const API_SONGS = 'http://localhost:3001/api/songs';

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

  // Fetch room info on mount & poll every 5 seconds
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

  if (loadingRoom) return <p>Loading room...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!room) return <p>Room not found</p>;

  return (
    <div style={{ maxWidth: 900, margin: 'auto', padding: 20 }}>
      <h2>Room: {room.name || room.code}</h2>
      <p><strong>Code:</strong> {room.code}</p>
      <p><strong>Host:</strong> {room.host?.username || '(unknown)'}</p>

      <button onClick={onLeaveRoom} style={{ marginBottom: 20 }}>Leave Room</button>

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

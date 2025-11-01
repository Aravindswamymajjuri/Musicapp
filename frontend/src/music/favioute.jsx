import React, { useEffect, useState } from 'react';

const FAV_BASE = 'https://musicapp-7dy9.onrender.com/api/favorites';
// const FAV_BASE = 'http://localhost:3001/api/favorites';

const FavoriteSongs = ({ token, onPlaySong, selectedSongId, toggleFavorite }) => {
  const [favoriteSongs, setFavoriteSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  console.log('FavoriteSongs component token:', token);

  // Fetch favorite songs on mount and when token changes or favorites are toggled
  useEffect(() => {
    const fetchFavorites = async () => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(FAV_BASE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch favorite songs');
        const data = await res.json();
        setFavoriteSongs(data);
      } catch (err) {
        setError(err.message || 'Error loading favorites');
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [token]);

  if (!token) return <p>Please log in to see your favorite songs.</p>;

  if (loading) return <p>Loading favorite songs...</p>;

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  if (favoriteSongs.length === 0) return <p>You have no favorite songs yet.</p>;

  return (
    <div style={{ marginTop: 50 }}>
      <h2>Your Favorite Songs</h2>
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
                    onClick={() => onPlaySong(song._id)}
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
                    {selectedSongId === song._id ? 'Playing' : 'Play'}
                  </button>

                  <button
                    onClick={() => toggleFavorite(song._id)}
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
  );
};

export default FavoriteSongs;

import React, { useState, useEffect } from 'react';
import Home from './roomhome';
import Room from './roomsongs';
import './roomsongs.css';

const ROOM_STORAGE_KEY = 'joinedRoomCode';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const API_ROOMS = `${API_BASE_URL}/api/rooms`;

const getUserIdFromToken = (token) => {
  // Try to decode JWT payload safely in the browser to extract common id fields.
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(decodeURIComponent(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')));
    return payload.id || payload._id || payload.sub || payload.userId || null;
  } catch (e) {
    return null;
  }
};

const Roommanagement = () => {
  const [joinedRoomCode, setJoinedRoomCode] = useState(() => {
    // Only load saved room if user is still logged in
    const token = localStorage.getItem('token');
    if (!token) {
      // User logged out - clear the saved room
      localStorage.removeItem(ROOM_STORAGE_KEY);
      return null;
    }
    return localStorage.getItem(ROOM_STORAGE_KEY) || null;
  });
  
  const [userId, setUserId] = useState(() => getUserIdFromToken(localStorage.getItem('token')));

  useEffect(() => {
    // Update stored room
    if (joinedRoomCode) localStorage.setItem(ROOM_STORAGE_KEY, joinedRoomCode);
    else localStorage.removeItem(ROOM_STORAGE_KEY);
  }, [joinedRoomCode]);

  useEffect(() => {
    // If token changes elsewhere, try to keep userId in sync
    const handler = () => setUserId(getUserIdFromToken(localStorage.getItem('token')));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const handleJoinRoom = (code) => {
    setJoinedRoomCode(code);
  };

  const handleLeaveRoom = async () => {
    if (!joinedRoomCode) return;
    
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_ROOMS}/${joinedRoomCode}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('Leave room error:', data.error);
      }
    } catch (err) {
      console.warn('Failed to notify server of room leave:', err);
    }
    
    // Clear the room locally regardless of server response
    setJoinedRoomCode(null);
  };

  return (
    <div>
      {!joinedRoomCode ? (
        <Home onJoinRoom={handleJoinRoom} />
      ) : (
        <Room
          roomCode={joinedRoomCode}
          onLeaveRoom={handleLeaveRoom}
          userId={userId}
        />
      )}
    </div>
  );
};

export default Roommanagement;
import React, { useState, useEffect } from 'react';
import Home from './roomhome';
import Room from './roomsongs';

const ROOM_STORAGE_KEY = 'joinedRoomCode';

const Roommanagement = () => {
  const [joinedRoomCode, setJoinedRoomCode] = useState(() => {
    return localStorage.getItem(ROOM_STORAGE_KEY) || null;
  });
  const [userId, setUserId] = useState(null); // Set this properly based on auth

  useEffect(() => {
    if (joinedRoomCode) {
      localStorage.setItem(ROOM_STORAGE_KEY, joinedRoomCode);
    } else {
      localStorage.removeItem(ROOM_STORAGE_KEY);
    }
  }, [joinedRoomCode]);

  const handleJoinRoom = (code) => {
    setJoinedRoomCode(code);
  };

	const handleLeaveRoom = () => {
		// ensure the stored joined room key is removed when leaving
		localStorage.removeItem(ROOM_STORAGE_KEY);
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

import React, { useState, useEffect } from 'react';
import Home from './roomhome';
import Room from './roomsongs';

const ROOM_STORAGE_KEY = 'joinedRoomCode';

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
		return localStorage.getItem(ROOM_STORAGE_KEY) || null;
	});
	// NEW: initialize userId by decoding token so Room can detect host
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

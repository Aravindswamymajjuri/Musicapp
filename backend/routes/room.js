const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Room = require('../models/roomschema'); // Adjust path as needed
const User = require('../models/userschema'); // For user validation
const Song = require('../models/songschema'); // For song validation
const authenticateToken = require('../middleware/auth'); // Your JWT middleware
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { code, name, isPrivate, password, theme } = req.body;

    // Check that the room code is unique
    const existingRoom = await Room.findOne({ code });
    if (existingRoom) {
      return res.status(409).json({ error: 'Room code already exists' });
    }

    // Create new room with host as current user and user added to users array
    const newRoom = new Room({
      code,
      name: name || '',
      host: req.user.id,
      isPrivate: isPrivate || false,
      password: password || null,
      currentSong: null,
      currentTime: 0,
      isPlaying: false,
      queue: [],
      users: [req.user.id],
      theme: theme || 'default'
    });

    await newRoom.save();

    res.status(201).json(newRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;

    const room = await Room.findOne({ code })
      .populate('host', 'username email')
      .populate('users', 'username email')
      .populate('currentSong');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    // If room is private, optional: require password, add logic here if needed

    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/:code/join', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;
    const { password } = req.body; // Password for private rooms (optional)

    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // If private, verify password
    if (room.isPrivate) {
      if (!password || password !== room.password) {
        return res.status(401).json({ error: 'Invalid or missing room password' });
      }
    }

    // Check if user already joined
    if (room.users.some(id => id.toString() === userId.toString())) {
      return res.status(400).json({ error: 'User already in the room' });
    }

    // Add user to room
    room.users.push(userId);
    await room.save();

    // Populate the users info for response
    await room.populate('users', 'username email');

    res.json({ message: 'Joined room successfully', users: room.users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/:code/leave', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;

    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(400).json({ error: 'User not in the room' });
    }

    // Remove user from users array
    room.users = room.users.filter(id => id.toString() !== userId.toString());

    // If the user is the host, assign new host if users remain
    if (room.host.toString() === userId) {
      if (room.users.length > 0) {
        room.host = room.users[0];
      } else {
        // No users left, delete room
        await room.deleteOne();
        return res.json({ message: 'Room deleted because no users remain' });
      }
    }

    await room.save();

    await room.populate('users', 'username email');

    res.json({ message: 'Left room successfully', users: room.users, host: room.host });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.put('/:code/playback', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;
    // Destructure playback details from req.body
    const { currentSongId, currentTime, isPlaying, queue } = req.body;

    // Validate room
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Optional: Only host can update playback
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can update playback' });
    }

    // Validate currentSongId if provided
    if (currentSongId) {
      try {
        const songExists = await Song.findById(currentSongId);
        if (songExists) {
          room.currentSong = currentSongId;
        }
      } catch (e) {
        console.warn('Song validation error:', e.message);
        // Continue even if song doesn't exist - might be deleted
      }
    } else {
      room.currentSong = null;
    }

    if (typeof currentTime === 'number') room.currentTime = Math.max(0, currentTime);
    if (typeof isPlaying === 'boolean') room.isPlaying = isPlaying;
    if (Array.isArray(queue)) {
      // Convert queue items to valid ObjectIds if they're strings
      room.queue = queue.filter(q => q).map(q => {
        const id = typeof q === 'string' ? q : (q._id || q);
        try {
          return id;
        } catch (e) {
          return null;
        }
      }).filter(q => q);
    }

    // Add server-side timestamp for real-time sync
    room.syncTimestamp = Date.now();
    room.lastSyncAt = new Date();

    await room.save();

    // Build response with room data and sync info
    const response = {
      _id: room._id,
      code: room.code,
      name: room.name,
      host: room.host,
      isPrivate: room.isPrivate,
      currentSong: room.currentSong,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      queue: room.queue,
      users: room.users,
      createdAt: room.createdAt,
      theme: room.theme,
      syncTimestamp: room.syncTimestamp,
      serverTime: Date.now(),
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Update room details (name, theme, etc.)
router.put('/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;
    const { name, theme } = req.body;

    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can update room details
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can update room details' });
    }

    if (typeof name === 'string') room.name = name;
    if (typeof theme === 'string') room.theme = theme;

    await room.save();

    const updatedRoom = await Room.findById(room._id)
      .populate('host', 'username email')
      .populate('users', 'username email')
      .populate('currentSong');

    res.json(updatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a user from the room
router.delete('/:code/users', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;
    const { userId: userIdToRemove } = req.body;

    if (!userIdToRemove) {
      return res.status(400).json({ error: 'userId required in request body' });
    }

    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can remove users
    if (room.host.toString() !== userId) {
      return res.status(403).json({ error: 'Only host can remove users' });
    }

    // Cannot remove yourself
    if (userIdToRemove === userId) {
      return res.status(400).json({ error: 'Cannot remove yourself, use leave endpoint' });
    }

    if (!room.users.some(id => id.toString() === userIdToRemove)) {
      return res.status(400).json({ error: 'User not in the room' });
    }

    room.users = room.users.filter(id => id.toString() !== userIdToRemove);
    await room.save();

    await room.populate('users', 'username email');

    res.json({ message: 'User removed from the room', users: room.users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete room (only host)
router.delete('/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;

    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can delete the room
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can delete the room' });
    }

    await room.deleteOne();

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;

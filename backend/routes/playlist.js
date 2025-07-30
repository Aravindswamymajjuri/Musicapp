const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Playlist = require('../models/playlistschema');  // Adjust path as needed
const Song = require('../models/songschema');          // For validation of songs
const authenticateToken = require('../middleware/auth');  // Your auth middleware

// Create a Playlist
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, songs = [], isPublic = false } = req.body;

    // Optional: Validate song IDs
    if (!Array.isArray(songs)) {
      return res.status(400).json({ error: 'Songs should be an array of song IDs' });
    }
    for (const songId of songs) {
      if (!mongoose.Types.ObjectId.isValid(songId)) {
        return res.status(400).json({ error: `Invalid song ID: ${songId}` });
      }
      const songExists = await Song.findById(songId);
      if (!songExists) {
        return res.status(404).json({ error: `Song not found for ID: ${songId}` });
      }
    }

    const playlist = new Playlist({
      name,
      description,
      owner: req.user.id,
      songs,
      isPublic
    });

    await playlist.save();
    res.status(201).json(playlist);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all playlists owned by current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const playlists = await Playlist.find({ owner: req.user.id })
      .populate('songs')
      .sort({ updatedAt: -1 });
    res.json(playlists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a playlist by ID (only if owner or public)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }

    const playlist = await Playlist.findById(id).populate('songs').populate('owner', 'username email');

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (!playlist.isPublic && playlist.owner._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(playlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a playlist by ID (only owner)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    if (playlist.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Validate songs if present
    if (updates.songs) {
      if (!Array.isArray(updates.songs)) {
        return res.status(400).json({ error: 'Songs should be an array of song IDs' });
      }
      for (const songId of updates.songs) {
        if (!mongoose.Types.ObjectId.isValid(songId)) {
          return res.status(400).json({ error: `Invalid song ID: ${songId}` });
        }
        const songExists = await Song.findById(songId);
        if (!songExists) {
          return res.status(404).json({ error: `Song not found for ID: ${songId}` });
        }
      }
    }

    updates.updatedAt = new Date();

    const updatedPlaylist = await Playlist.findByIdAndUpdate(id, updates, { new: true })
      .populate('songs');

    res.json(updatedPlaylist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a playlist by ID (only owner)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (playlist.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await playlist.deleteOne();
    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

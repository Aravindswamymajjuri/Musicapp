const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Favorite = require('../models/faviourtschema'); // Adjust path as needed
const authenticateToken = require('../middleware/auth');

// Add a song to favorites (toggle)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { songId } = req.body;

    if (!songId || !mongoose.Types.ObjectId.isValid(songId)) {
      return res.status(400).json({ error: 'Valid songId is required' });
    }

    // Check if already favorited
    let favorite = await Favorite.findOne({ user: req.user.id, song: songId });

    if (favorite) {
      // Remove from favorites (toggle off)
      await Favorite.deleteOne({ _id: favorite._id });
      return res.json({ message: 'Removed from favorites' });
    } else {
      // Add to favorites
      favorite = new Favorite({
        user: req.user.id,
        song: songId
      });
      await favorite.save();
      return res.status(201).json({ message: 'Added to favorites', favorite });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all favorite songs of the logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user.id })
      .populate('song')
      .sort({ addedAt: -1 });

    res.json(favorites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a favorite by favorite ID (optional)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid favorite ID' });
    }

    const favorite = await Favorite.findById(id);
    if (!favorite) return res.status(404).json({ error: 'Favorite not found' });

    if (favorite.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await favorite.deleteOne();
    res.json({ message: 'Favorite removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if a specific song is favorited by the user (optional)
router.get('/check/:songId', authenticateToken, async (req, res) => {
  try {
    const { songId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(songId)) {
      return res.status(400).json({ error: 'Invalid song ID' });
    }

    const favorite = await Favorite.findOne({ user: req.user.id, song: songId });

    res.json({ favorited: !!favorite });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

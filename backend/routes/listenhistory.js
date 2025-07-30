const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ListeningHistory = require('../models/listenhistoryschema'); // Adjust path as needed
const authenticateToken = require('../middleware/auth');

// Create a new Listening History record
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { song, duration, room } = req.body;

    if (!song || typeof duration !== 'number') {
      return res.status(400).json({ error: 'Song ID and duration are required' });
    }

    // Optional: Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(song)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }
    if (room && !mongoose.Types.ObjectId.isValid(room)) {
      return res.status(400).json({ error: 'Invalid Room ID' });
    }

    const newHistory = new ListeningHistory({
      user: req.user.id,
      song,
      duration,
      room: room || null,
      playedAt: new Date() // or default from schema
    });

    await newHistory.save();
    res.status(201).json(newHistory);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all listening history of logged in user (most recent first)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const histories = await ListeningHistory.find({ user: req.user.id })
      .populate('song')
      .populate('room', 'code name') // optional fields to populate for Room
      .sort({ playedAt: -1 });

    res.json(histories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific listening history record by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'Invalid ListeningHistory ID' });

    const history = await ListeningHistory.findById(id)
      .populate('song')
      .populate('room', 'code name');

    if (!history) return res.status(404).json({ error: 'Listening history not found' });

    // Ensure user owns this record
    if (history.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a listening history record by ID
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: 'Invalid ListeningHistory ID' });

    const history = await ListeningHistory.findById(id);
    if (!history) return res.status(404).json({ error: 'Listening history not found' });

    if (history.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await history.deleteOne();
    res.json({ message: 'Listening history record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Optional: Clear all listening history for current user
router.delete('/', authenticateToken, async (req, res) => {
  try {
    await ListeningHistory.deleteMany({ user: req.user.id });
    res.json({ message: 'Cleared all listening history records' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

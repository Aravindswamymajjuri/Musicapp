const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Room code to join
  name: { type: String },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPrivate: { type: Boolean, default: false },
  password: { type: String },
  currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
  currentTime: { type: Number, default: 0 }, // playback time in seconds
  isPlaying: { type: Boolean, default: false },
  queue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }], // list of song IDs
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  theme: { type: String, default: 'default' }
});

module.exports = mongoose.model('Room', roomSchema);

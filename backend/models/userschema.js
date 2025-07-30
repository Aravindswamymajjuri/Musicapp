const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  totalListeningTime: { type: Number, default: 0 },
  roomsCreated: { type: Number, default: 0 },
  roomsJoined: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  artist: {
    type: String,
    required: true
  },
  album: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true // Duration in seconds
  },
  originalName: {
    type: String,
    required: true // Original file name
  },
  fileSize: {
    type: Number,
    required: true // In bytes
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  playCount: {
    type: Number,
    default: 0
  },
  folder: {
    type: String, // Optional: logical folder/category
    default: 'default'
  },
  // Embedded file data instead of GridFS reference
  fileData: {
    data: {
      type: String, // Base64 encoded file data
      required: true
    },
    contentType: {
      type: String, // MIME type (e.g., 'audio/mpeg', 'audio/wav')
      required: true
    }
  },
  metadata: {
    bitrate: String,
    format: String,
    albumArt: String
  }
});

// Index for better query performance
songSchema.index({ uploadedBy: 1, uploadedAt: -1 });
songSchema.index({ title: 'text', artist: 'text', album: 'text' }); // For text search

// Virtual to get file data size (useful for monitoring)
songSchema.virtual('fileDataSize').get(function() {
  return this.fileData && this.fileData.data ? this.fileData.data.length : 0;
});

// Method to get file data as buffer (useful for streaming)
songSchema.methods.getFileBuffer = function() {
  if (!this.fileData || !this.fileData.data) {
    return null;
  }
  return Buffer.from(this.fileData.data, 'base64');
};

// Static method to find songs without file data (for cleanup)
songSchema.statics.findCorrupted = function() {
  return this.find({
    $or: [
      { 'fileData.data': { $exists: false } },
      { 'fileData.data': '' },
      { 'fileData.contentType': { $exists: false } }
    ]
  });
};

module.exports = mongoose.model('Song', songSchema);
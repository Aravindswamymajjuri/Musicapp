const express = require('express');
const router = express.Router();
const Song = require('../models/songschema');
const authenticateToken = require('../middleware/auth');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('File filter - MIME type:', file.mimetype);
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// Upload song route with base64 storage
router.post('/upload', authenticateToken, (req, res) => {
  console.log('Upload request received');
  
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Upload middleware error:', err);
      
      if (err instanceof multer.MulterError) {
        switch (err.code) {
          case 'LIMIT_FILE_SIZE':
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
          case 'LIMIT_FILE_COUNT':
            return res.status(400).json({ error: 'Too many files.' });
          case 'LIMIT_UNEXPECTED_FILE':
            return res.status(400).json({ error: 'Unexpected file field.' });
          default:
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
      }
      
      return res.status(400).json({ error: err.message });
    }

    try {
      console.log('File upload successful:', req.file ? 'Yes' : 'No');
      
      if (!req.file || !req.file.buffer) {
        return res.status(500).json({ error: 'File upload failed. Please try again.' });
      }

      console.log('Uploaded file info:', {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // Extract song metadata from request body
      const { title, artist, album, duration, folder, bitrate, format, albumArt } = req.body;

      console.log('Song metadata:', { title, artist, album, duration });

      // Basic validation
      if (!title || !artist || !album || !duration) {
        return res.status(400).json({ 
          error: 'Missing required song information (title, artist, album, duration)' 
        });
      }

      // Convert file buffer to base64
      const fileBase64 = req.file.buffer.toString('base64');

      // Create the song document with embedded file data
      const songData = {
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        duration: parseInt(duration),
        originalName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.user.id,
        folder: folder ? folder.trim() : 'default',
        // Store file data and metadata
        fileData: {
          data: fileBase64,
          contentType: req.file.mimetype
        },
        metadata: {
          bitrate: bitrate || '',
          format: format || path.extname(req.file.originalname).substring(1),
          albumArt: albumArt || ''
        }
      };

      console.log('Creating song document with file size:', req.file.size);

      const song = new Song(songData);
      await song.save();

      console.log('Song saved successfully:', song._id);

      res.status(201).json({ 
        message: 'Song uploaded successfully', 
        song: {
          _id: song._id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          duration: song.duration,
          folder: song.folder,
          fileSize: song.fileSize,
          uploadedAt: song.uploadedAt
        }
      });

    } catch (error) {
      console.error('Song creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    dbConnection: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    storageType: 'base64_embedded'
  });
});

// Get all songs uploaded by current user (without file data)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const songs = await Song.find({ uploadedBy: req.user.id })
      .select('-fileData') // Exclude file data from list
      .sort({ uploadedAt: -1 });
    
    res.json(songs);
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get details of a single song by ID (without file data)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findById(id).select('-fileData');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check ownership
    if (song.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(song);

  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream song file
router.get('/:id/stream', async (req, res) => {
  const songId = req.params?.id;
  if (!songId) {
    return res.status(400).json({ error: 'Missing song id in request params' });
  }

  if (!mongoose.Types.ObjectId.isValid(songId)) {
    return res.status(400).json({ error: 'Invalid Song ID' });
  }

  try {
    // Select the embedded fileData (if present) and minimal metadata
    const song = await Song.findById(songId).select('fileData filePath metadata originalName fileSize uploadedBy');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // If file data is embedded as base64, stream from buffer (support Range)
    if (song.fileData?.data) {
      const contentType = song.fileData.contentType || song.metadata?.format || 'audio/mpeg';
      const fileBuffer = Buffer.from(song.fileData.data, 'base64');
      const total = fileBuffer.length;
      const range = req.headers.range;

      // Ensure CORS headers are present on streaming responses
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
      res.setHeader('Accept-Ranges', 'bytes');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

        if (isNaN(start) || isNaN(end) || start > end || start >= total) {
          res.set('Content-Range', `bytes */${total}`);
          return res.status(416).end();
        }

        const chunk = fileBuffer.slice(start, end + 1);
        res.status(206).set({
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': contentType
        });
        return res.end(chunk);
      } else {
        res.status(200).set({
          'Content-Length': total,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        });
        return res.end(fileBuffer);
      }
    }

    // Fallback: if you store files on disk/path, stream from filesystem
    const filePath = song.filePath || (song.file && song.file.path) || song.path || song.url;
    if (filePath) {
      // Ensure CORS headers for filesystem streaming as well
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
      res.setHeader('Accept-Ranges', 'bytes');
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        console.error('Stream error: filePath exists in record but not on disk', filePath);
        return res.status(404).json({ error: 'Audio file not found on server' });
      }
      const stat = fs.statSync(filePath);
      const total = stat.size;
      const range = req.headers.range;
      const contentType = song.fileData?.contentType || 'audio/mpeg';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        if (start >= total || end >= total) {
          return res.status(416).set('Content-Range', `bytes */${total}`).end();
        }
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': (end - start) + 1,
          'Content-Type': contentType
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': contentType
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    console.error('Stream error: no fileData or filePath available for song', songId);
    return res.status(404).json({ error: 'Audio file not available for this song' });

  } catch (err) {
    console.error('Stream error:', err);
    return res.status(500).json({ error: 'Internal Server Error while streaming audio' });
  }
});

// Delete a song by ID
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    if (song.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this song' });
    }

    // Delete song document (file data is embedded, so it's deleted too)
    await Song.deleteOne({ _id: id });
    console.log('Song document and file data deleted');

    res.json({ message: 'Song deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Increment play count
router.post('/:id/play', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findByIdAndUpdate(
      id,
      { $inc: { playCount: 1 } },
      { new: true, select: '-fileData' }
    );

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json({ 
      message: "Play count incremented", 
      playCount: song.playCount 
    });

  } catch (error) {
    console.error('Play count error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get song file size and info (useful for debugging)
router.get('/:id/info', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findById(id).select('title artist fileSize fileData.contentType originalName uploadedBy');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check ownership
    if (song.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      title: song.title,
      artist: song.artist,
      originalName: song.originalName,
      fileSize: song.fileSize,
      contentType: song.fileData?.contentType,
      hasFileData: !!song.fileData?.data
    });

  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
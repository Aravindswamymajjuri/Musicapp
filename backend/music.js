// server.js - Main Node.js Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/musicsync', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  totalListeningTime: { type: Number, default: 0 },
  roomsCreated: { type: Number, default: 0 },
  roomsJoined: { type: Number, default: 0 }
});

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  album: { type: String, required: true },
  duration: { type: Number, required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
  playCount: { type: Number, default: 0 },
  metadata: {
    bitrate: String,
    format: String,
    albumArt: String
  }
});

const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: String,
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPrivate: { type: Boolean, default: false },
  password: String,
  currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
  currentTime: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  queue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  theme: { type: String, default: 'default' }
});

const listeningHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
  playedAt: { type: Date, default: Date.now },
  duration: { type: Number, required: true }, // How long the song was played
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' }
});

const favoriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
  addedAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Song = mongoose.model('Song', songSchema);
const Playlist = mongoose.model('Playlist', playlistSchema);
const Room = mongoose.model('Room', roomSchema);
const ListeningHistory = mongoose.model('ListeningHistory', listeningHistorySchema);
const Favorite = mongoose.model('Favorite', favoriteSchema);

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Song Routes
app.post('/api/songs/upload', authenticateToken, upload.single('song'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, artist, album, duration } = req.body;

    const song = new Song({
      title: title || req.file.originalname.replace(/\.[^/.]+$/, ""),
      artist: artist || 'Unknown Artist',
      album: album || 'Unknown Album',
      duration: parseFloat(duration) || 0,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      uploadedBy: req.user.id
    });

    await song.save();
    res.json(song);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/songs', authenticateToken, async (req, res) => {
  try {
    const songs = await Song.find({ uploadedBy: req.user.id })
      .sort({ uploadedAt: -1 });
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/songs/:id/stream', async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const filePath = path.join(__dirname, 'uploads', song.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }

    // Update play count
    await Song.findByIdAndUpdate(req.params.id, { $inc: { playCount: 1 } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Playlist Routes
app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description, songs, isPublic } = req.body;

    const playlist = new Playlist({
      name,
      description,
      owner: req.user.id,
      songs: songs || [],
      isPublic: isPublic || false
    });

    await playlist.save();
    res.json(playlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const playlists = await Playlist.find({ owner: req.user.id })
      .populate('songs')
      .sort({ updatedAt: -1 });
    res.json(playlists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Favorites Routes
app.post('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const { songId } = req.body;

    const existingFavorite = await Favorite.findOne({
      user: req.user.id,
      song: songId
    });

    if (existingFavorite) {
      await Favorite.deleteOne({ _id: existingFavorite._id });
      res.json({ message: 'Removed from favorites' });
    } else {
      const favorite = new Favorite({
        user: req.user.id,
        song: songId
      });
      await favorite.save();
      res.json({ message: 'Added to favorites' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user.id })
      .populate('song')
      .sort({ addedAt: -1 });
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics Routes
app.get('/api/analytics', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    const listeningHistory = await ListeningHistory.find({ user: req.user.id })
      .populate('song')
      .sort({ playedAt: -1 })
      .limit(10);

    const topSongs = await ListeningHistory.aggregate([
      { $match: { user: mongoose.Types.ObjectId(req.user.id) } },
      { $group: { _id: '$song', playCount: { $sum: 1 }, totalDuration: { $sum: '$duration' } } },
      { $sort: { playCount: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'songs', localField: '_id', foreignField: '_id', as: 'song' } },
      { $unwind: '$song' }
    ]);

    res.json({
      totalListeningTime: user.totalListeningTime,
      roomsCreated: user.roomsCreated,
      roomsJoined: user.roomsJoined,
      recentlyPlayed: listeningHistory,
      topSongs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO Connection Handling
const activeRooms = new Map();
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', async (data) => {
    try {
      const { code, user } = data;
      
      // Create room in database
      const room = new Room({
        code,
        host: user.id,
        users: [user.id]
      });
      await room.save();

      // Update user stats
      await User.findByIdAndUpdate(user.id, { $inc: { roomsCreated: 1 } });

      // Join socket room
      socket.join(code);
      userSockets.set(socket.id, { userId: user.id, roomCode: code });

      // Store room state
      activeRooms.set(code, {
        host: user.id,
        users: [{ ...user, socketId: socket.id, isHost: true }],
        currentSong: null,
        currentTime: 0,
        isPlaying: false,
        queue: []
      });

      socket.emit('room-joined', {
        room: { code },
        users: activeRooms.get(code).users,
        isHost: true
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('join-room', async (data) => {
    try {
      const { code, user } = data;
      
      // Check if room exists
      const room = await Room.findOne({ code });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Update user stats
      await User.findByIdAndUpdate(user.id, { $inc: { roomsJoined: 1 } });

      // Join socket room
      socket.join(code);
      userSockets.set(socket.id, { userId: user.id, roomCode: code });

      // Update room state
      const roomState = activeRooms.get(code);
      if (roomState) {
        roomState.users.push({ ...user, socketId: socket.id, isHost: false });
        
        // Update database
        await Room.findOneAndUpdate(
          { code },
          { $addToSet: { users: user.id } }
        );

        // Notify all users in room
        io.to(code).emit('room-users-updated', roomState.users);
        
        socket.emit('room-joined', {
          room: { code },
          users: roomState.users,
          isHost: false
        });

        // Sync current playback state
        if (roomState.currentSong) {
          socket.emit('sync-playback', {
            song: roomState.currentSong,
            currentTime: roomState.currentTime,
            isPlaying: roomState.isPlaying
          });
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('leave-room', async (data) => {
    try {
      const { code } = data;
      const userInfo = userSockets.get(socket.id);
      
      if (userInfo) {
        socket.leave(code);
        
        const roomState = activeRooms.get(code);
        if (roomState) {
          roomState.users = roomState.users.filter(u => u.socketId !== socket.id);
          
          // Update database
          await Room.findOneAndUpdate(
            { code },
            { $pull: { users: userInfo.userId } }
          );

          // If host left, assign new host or delete room
          if (roomState.host === userInfo.userId) {
            if (roomState.users.length > 0) {
              roomState.host = roomState.users[0].id;
              roomState.users[0].isHost = true;
              await Room.findOneAndUpdate(
                { code },
                { host: roomState.host }
              );
            } else {
              // Delete room if no users left
              await Room.deleteOne({ code });
              activeRooms.delete(code);
            }
          }

          // Notify remaining users
          if (roomState.users.length > 0) {
            io.to(code).emit('room-users-updated', roomState.users);
          }
        }
        
        userSockets.delete(socket.id);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('sync-playback', async (data) => {
    try {
      const { roomCode, song, currentTime, isPlaying } = data;
      const userInfo = userSockets.get(socket.id);
      
      if (userInfo) {
        const roomState = activeRooms.get(roomCode);
        if (roomState && roomState.host === userInfo.userId) {
          // Update room state
          roomState.currentSong = song;
          roomState.currentTime = currentTime;
          roomState.isPlaying = isPlaying;
          
          // Update database
          await Room.findOneAndUpdate(
            { code: roomCode },
            {
              currentSong: song?._id,
              currentTime,
              isPlaying
            }
          );

          // Broadcast to all users in room except sender
          socket.to(roomCode).emit('sync-playback', {
            song,
            currentTime,
            isPlaying
          });

          // Record listening history
          if (song && isPlaying) {
            roomState.users.forEach(async (user) => {
              const history = new ListeningHistory({
                user: user.id,
                song: song._id,
                duration: 0, // Will be updated when song ends
                room: roomCode
              });
              await history.save();
            });
          }
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const userInfo = userSockets.get(socket.id);
    if (userInfo) {
      // Handle room cleanup
      socket.emit('leave-room', { code: userInfo.roomCode });
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
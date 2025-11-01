// require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'], credentials: true }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection and GridFS setup
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://aravindswamymajjuri143:xCuKYeBVOQyv0QdL@projects.m06dc.mongodb.net/?retryWrites=true&w=majority&appName=Projects';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
const conn = mongoose.connection;

let gfs;
let gridfsBucket;

conn.once('open', () => {
  gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'songs' });
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('songs');
  console.log('MongoDB connected and GridFS initialized');
});

// Multer-GridFS-Storage for uploads
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => ({
    filename: Date.now() + '-' + file.originalname,
    bucketName: 'songs'
  }),
  options: { useNewUrlParser: true, useUnifiedTopology: true }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files are allowed!'), false);
  }
});

// Import routers
const authRoutes = require('./routes/auth');
const songsRoutes = require('./routes/songs');
const playlistsRoutes = require('./routes/playlist');
const roomsRoutes = require('./routes/room');
const listeningHistoryRoutes = require('./routes/listenhistory'); // fixed filename
const favoritesRoutes = require('./routes/faviourt'); // fixed filename

// Mount routers: Each router handles its own paths
app.use('/api/auth', authRoutes);
app.use('/api/songs', songsRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/listening-history', listeningHistoryRoutes);
app.use('/api/favorites', favoritesRoutes);

// Socket.IO event handling - add your logic here
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // join room; accept either a string roomCode or an object { roomCode, userId }
  socket.on('joinRoom', (payload) => {
    try {
      const roomCode = typeof payload === 'string' ? payload : payload?.roomCode;
      const userId = typeof payload === 'object' ? payload?.userId : undefined;
      if (!roomCode) return;
      if (userId) socket.data.userId = userId;
      socket.join(roomCode);
      console.log(`Socket ${socket.id} joined room ${roomCode} (userId=${socket.data.userId || 'unknown'})`);
    } catch (e) {
      console.error('joinRoom error:', e);
    }
  });

  socket.on('leaveRoom', (roomCode) => {
    if (!roomCode) return;
    socket.leave(roomCode);
    console.log(`Socket ${socket.id} left room ${roomCode}`);
  });

  // Host emits hostPlayback -> server broadcasts 'playback' to other members (already implemented)
  socket.on('hostPlayback', (data) => {
    try {
      const { roomCode, playback } = data || {};
      if (!roomCode || !playback) return;
      socket.to(roomCode).emit('playback', playback);
    } catch (e) {
      console.error('Error handling hostPlayback:', e);
    }
  });

  // New: allow host to request removal of a user by userId
  socket.on('removeUser', async (data) => {
    try {
      const { roomCode, userId: targetUserId } = data || {};
      if (!roomCode || !targetUserId) return;

      // Iterate sockets in the room to find the socket with matching stored userId
      const socketIds = await io.in(roomCode).allSockets(); // returns Set
      for (const sid of socketIds) {
        const targetSocket = io.sockets.sockets.get(sid);
        if (targetSocket && targetSocket.data && String(targetSocket.data.userId) === String(targetUserId)) {
          // notify the removed socket and disconnect it
          try {
            targetSocket.emit('removed', { roomCode, reason: 'kicked' });
          } catch (e) {}
          try {
            targetSocket.leave(roomCode);
          } catch (e) {}
          try {
            targetSocket.disconnect(true);
          } catch (e) {}
          console.log(`Removed user socket ${sid} (userId=${targetUserId}) from room ${roomCode}`);
        }
      }

      // Notify remaining clients so they can refresh user list
      io.in(roomCode).emit('userRemoved', { userId: targetUserId });
    } catch (e) {
      console.error('removeUser error:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Export for testing or reuse


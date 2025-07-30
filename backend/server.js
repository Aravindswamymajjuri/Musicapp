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
  // Place your Socket.IO handlers here

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Export for testing or reuse


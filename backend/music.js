// const express = require('express');
// const http = require('http');
// const socketIo = require('socket.io');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const bcrypt = require('bcrypt');
// const jwt = require('jsonwebtoken');
// const multer = require('multer');
// const { GridFsStorage } = require('multer-gridfs-storage');
// const Grid = require('gridfs-stream');
// require('dotenv').config(); // For .env support

// // Init app and server
// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: { origin: '*', methods: '*', credentials: true }
// });

// // Middleware
// app.use(cors());
// app.use(express.json());

// // ======== MongoDB CONNECTION ==========

// const mongoURI = process.env.MONGODB_URI ||
//   'mongodb+srv://aravindswamymajjuri143:xCuKYeBVOQyv0QdL@projects.m06dc.mongodb.net/?retryWrites=true&w=majority&appName=Projects';

// mongoose.connect(mongoURI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// });

// const conn = mongoose.connection;



// // Init GridFS & storage
// let gfs;
// let gridfsBucket;

// conn.once('open', () => {
//   gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'songs' });
//   gfs = Grid(conn.db, mongoose.mongo);
//   gfs.collection('songs');
// });

// // ======== SCHEMAS & MODELS ==========

// const userSchema = new mongoose.Schema({
//   username: { type: String, required: true, unique: true },
//   email:    { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   createdAt: { type: Date, default: Date.now },
//   totalListeningTime: { type: Number, default: 0 },
//   roomsCreated: { type: Number, default: 0 },
//   roomsJoined: { type: Number, default: 0 }
// });

// const songSchema = new mongoose.Schema({
//   title:       { type: String, required: true },
//   artist:      { type: String, required: true },
//   album:       { type: String, required: true },
//   duration:    { type: Number, required: true },
//   originalName:{ type: String, required: true },
//   fileSize:    { type: Number, required: true },
//   uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   uploadedAt:  { type: Date, default: Date.now },
//   playCount:   { type: Number, default: 0 },
//   gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true },  // File reference in GridFS
//   metadata: {
//     bitrate: String,
//     format: String,
//     albumArt: String
//   }
// });

// const playlistSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   description: String,
//   owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
//   isPublic: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });

// const roomSchema = new mongoose.Schema({
//   code: { type: String, required: true, unique: true },
//   name: String,
//   host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   isPrivate: { type: Boolean, default: false },
//   password: String,
//   currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
//   currentTime: { type: Number, default: 0 },
//   isPlaying: { type: Boolean, default: false },
//   queue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
//   users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
//   createdAt: { type: Date, default: Date.now },
//   theme: { type: String, default: 'default' }
// });

// const listeningHistorySchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
//   playedAt: { type: Date, default: Date.now },
//   duration: { type: Number, required: true },
//   room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' }
// });

// const favoriteSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
//   addedAt: { type: Date, default: Date.now }
// });

// const User = mongoose.model('User', userSchema);
// const Song = mongoose.model('Song', songSchema);
// const Playlist = mongoose.model('Playlist', playlistSchema);
// const Room = mongoose.model('Room', roomSchema);
// const ListeningHistory = mongoose.model('ListeningHistory', listeningHistorySchema);
// const Favorite = mongoose.model('Favorite', favoriteSchema);

// // ========= FILE UPLOAD (GridFS Storage) ==========

// const storage = new GridFsStorage({
//   url: mongoURI,
//   file: (req, file) => {
//     if (!file.mimetype.startsWith('audio/')) {
//       return null;
//     }
//     return {
//       filename: Date.now() + '-' + file.originalname,
//       bucketName: 'songs'
//     }
//   },
//   options: { useNewUrlParser: true, useUnifiedTopology: true }
// });
// const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// // ============ JWT AUTH MIDDLEWARE =============

// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];
//   if (!token) return res.status(401).json({ error: 'Access token required' });

//   jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
//     if (err) return res.status(403).json({ error: 'Invalid token' });
//     req.user = user;
//     next();
//   });
// };

// // ============ ROUTES =============

// // -- Registration --
// app.post('/api/auth/register', async (req, res) => {
//   try {
//     const { username, email, password } = req.body;
//     const existingUser = await User.findOne({ $or: [{ email }, { username }] });
//     if (existingUser) {
//       return res.status(400).json({ error: 'User already exists' });
//     }
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const user = new User({ username, email, password: hashedPassword });
//     await user.save();
//     const token = jwt.sign(
//       { id: user._id, username: user.username },
//       process.env.JWT_SECRET || 'your-secret-key',
//       { expiresIn: '7d' }
//     );
//     res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // -- Login --
// app.post('/api/auth/login', async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email });
//     if (!user || !await bcrypt.compare(password, user.password)) {
//       return res.status(400).json({ error: 'Invalid credentials' });
//     }
//     const token = jwt.sign(
//       { id: user._id, username: user.username },
//       process.env.JWT_SECRET || 'your-secret-key',
//       { expiresIn: '7d' }
//     );
//     res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // ========== SONG ROUTES ==========

// // --- UPLOAD SONG (to MONGODB via GridFS) ---
// app.post('/api/songs/upload', authenticateToken, upload.single('song'), async (req, res) => {
//   try {
//     // Defensive: handle Multer/GridFS errors (wrong file, too big, etc)
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded or bad file type. Only audio files are allowed.' });
//     }

//     const { title, artist, album, duration } = req.body;

//     const song = new Song({
//       title: title || req.file.originalname.replace(/\.[^/.]+$/, ""),
//       artist: artist || 'Unknown Artist',
//       album: album || 'Unknown Album',
//       duration: parseFloat(duration) || 0,
//       originalName: req.file.originalname,
//       fileSize: req.file.size,
//       uploadedBy: req.user.id,
//       gridFsId: req.file.id // <- GridFS file _id reference
//     });

//     await song.save();
//     res.json(song);

//   } catch (error) {
//     // If multer error from fileFilter/FileSize
//     if (error instanceof multer.MulterError || error.message === 'Only audio files are allowed!') {
//       return res.status(400).json({ error: error.message });
//     }
//     res.status(500).json({ error: error.message });
//   }
// });


// // -- GET ALL SONGS (by this user) --
// app.get('/api/songs', authenticateToken, async (req, res) => {
//   try {
//     const songs = await Song.find({ uploadedBy: req.user.id })
//       .sort({ uploadedAt: -1 });
//     res.json(songs);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // --- STREAM SONG (from MongoDB / GridFS) ---
// app.get('/api/songs/:id/stream', async (req, res) => {
//   try {
//     const song = await Song.findById(req.params.id);
//     if (!song || !song.gridFsId) {
//       return res.status(404).json({ error: 'Song not found' });
//     }
//     const _id = typeof song.gridFsId === 'string' ? new mongoose.Types.ObjectId(song.gridFsId) : song.gridFsId;
//     const file = await gfs.files.findOne({ _id });
//     if (!file) return res.status(404).json({ error: 'Audio file not found in database' });

//     res.set('Content-Type', file.contentType || 'audio/mpeg');
//     res.set('Content-Length', file.length);
//     // Support range requests for seeking (which is nice for audio)
//     const range = req.headers.range;
//     if (range) {
//       const parts = range.replace(/bytes=/, "").split("-");
//       const start = parseInt(parts[0], 10);
//       const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
//       const chunkSize = (end - start) + 1;
//       res.writeHead(206, {
//         'Content-Range': `bytes ${start}-${end}/${file.length}`,
//         'Accept-Ranges': 'bytes',
//         'Content-Length': chunkSize,
//         'Content-Type': file.contentType || 'audio/mpeg',
//       });
//       gridfsBucket.openDownloadStream(_id, { start, end: end + 1 }).pipe(res);
//     } else {
//       res.writeHead(200, {
//         'Content-Length': file.length,
//         'Content-Type': file.contentType || 'audio/mpeg',
//       });
//       gridfsBucket.openDownloadStream(_id).pipe(res);
//     }

//     // Update play count
//     await Song.findByIdAndUpdate(req.params.id, { $inc: { playCount: 1 } });

//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // -- PLAYLISTS (as in your code) --

// app.post('/api/playlists', authenticateToken, async (req, res) => {
//   try {
//     const { name, description, songs, isPublic } = req.body;
//     const playlist = new Playlist({
//       name,
//       description,
//       owner: req.user.id,
//       songs: songs || [],
//       isPublic: isPublic || false
//     });
//     await playlist.save();
//     res.json(playlist);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get('/api/playlists', authenticateToken, async (req, res) => {
//   try {
//     const playlists = await Playlist.find({ owner: req.user.id })
//       .populate('songs').sort({ updatedAt: -1 });
//     res.json(playlists);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // -- FAVORITES --

// app.post('/api/favorites', authenticateToken, async (req, res) => {
//   try {
//     const { songId } = req.body;
//     const existingFavorite = await Favorite.findOne({
//       user: req.user.id, song: songId
//     });
//     if (existingFavorite) {
//       await Favorite.deleteOne({ _id: existingFavorite._id });
//       res.json({ message: 'Removed from favorites' });
//     } else {
//       const favorite = new Favorite({ user: req.user.id, song: songId });
//       await favorite.save();
//       res.json({ message: 'Added to favorites' });
//     }
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get('/api/favorites', authenticateToken, async (req, res) => {
//   try {
//     const favorites = await Favorite.find({ user: req.user.id })
//       .populate('song').sort({ addedAt: -1 });
//     res.json(favorites);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // -- ANALYTICS --
// app.get('/api/analytics', authenticateToken, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id);
//     const listeningHistory = await ListeningHistory.find({ user: req.user.id })
//       .populate('song').sort({ playedAt: -1 }).limit(10);
//     const topSongs = await ListeningHistory.aggregate([
//       { $match: { user: mongoose.Types.ObjectId(req.user.id) } },
//       { $group: { _id: '$song', playCount: { $sum: 1 }, totalDuration: { $sum: '$duration' } } },
//       { $sort: { playCount: -1 } },
//       { $limit: 10 },
//       { $lookup: { from: 'songs', localField: '_id', foreignField: '_id', as: 'song' } },
//       { $unwind: '$song' }
//     ]);
//     res.json({
//       totalListeningTime: user.totalListeningTime,
//       roomsCreated: user.roomsCreated,
//       roomsJoined: user.roomsJoined,
//       recentlyPlayed: listeningHistory,
//       topSongs
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // ======= SOCKET.IO (keep your code as before) =======
// // (not repeated here for space, but your previous code works unchanged!)

// const activeRooms = new Map();
// const userSockets = new Map();
// io.on('connection', (socket) => {
//   // ... (your room code, unchanged)
//   //   see previous code, it's still valid with this file backend change.
// });

// // ============= START SERVER =============

// const PORT = process.env.PORT || 3001;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

// module.exports = { app, server, io };


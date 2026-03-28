# 🎵 MusicApp

A full-stack real-time music streaming and social collaboration platform built with modern web technologies.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## 📌 Overview

MusicApp is a comprehensive music streaming application that combines social features with real-time collaboration. Users can upload, stream, and manage music while enjoying features like playlists, favorites, and collaborative rooms where multiple users can interact in real-time.

The application demonstrates modern full-stack development practices including JWT authentication, real-time WebSocket communication, file management with GridFS, and responsive UI design.

## ✨ Features

### User Management
- **User Authentication**: Secure registration and login with JWT tokens
- **Password Security**: Bcrypt hashing for password protection
- **User Profiles**: Personalized user accounts with session management

### Music Management
- **Upload Music**: Stream music files directly to MongoDB using GridFS
- **Music Library**: Browse and search through available songs
- **Song Metadata**: Track artists, titles, and other metadata

### Playlist & Organization
- **Create Playlists**: Organize songs into custom playlists
- **Manage Playlists**: Add, remove, and reorder songs within playlists
- **Favorite Songs**: Mark favorite tracks for quick access

### Social & Real-time Features
- **Rooms**: Create or join collaborative rooms for group listening
- **Real-time Collaboration**: Socket.io powered instant updates
- **Listen History**: Track the songs you've played
- **Room Management**: Manage room settings and members

### User Experience
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Modern UI**: Built with React for optimal interactivity
- **Real-time Updates**: Live synchronization across clients using Socket.io

## 🛠 Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 5.1
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time Communication**: Socket.io
- **File Storage**: MongoDB GridFS
- **File Upload**: Multer with GridFS Storage
- **Password Hashing**: Bcrypt
- **Environment**: Dotenv for configuration

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v7
- **Real-time**: Socket.io Client
- **Icons**: Lucide React
- **Linting**: ESLint

## 📁 Project Structure

```
Musicapp/
├── backend/
│   ├── routes/
│   │   ├── auth.js           # User authentication endpoints
│   │   ├── songs.js          # Music CRUD operations
│   │   ├── playlist.js       # Playlist management
│   │   ├── faviourt.js       # Favorite songs management
│   │   ├── listenhistory.js  # Listen history tracking
│   │   └── room.js           # Room collaboration features
│   ├── models/
│   │   ├── userschema.js     # User data model
│   │   ├── songschema.js     # Song data model
│   │   ├── playlistschema.js # Playlist data model
│   │   ├── faviourtschema.js # Favorites data model
│   │   ├── listenhistoryschema.js # History data model
│   │   └── roomschema.js     # Room data model
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── server.js             # Express server setup
│   ├── music.js              # Music business logic
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth.jsx      # Authentication component
│   │   │   └── music.jsx     # Music player component
│   │   ├── music/            # Music feature modules
│   │   │   ├── favioute.jsx  # Favorites feature
│   │   │   ├── login.jsx     # Login page
│   │   │   ├── signup.jsx    # Signup page
│   │   │   ├── navbar.jsx    # Navigation bar
│   │   │   ├── roomhome.jsx  # Room home page
│   │   │   ├── roomsongs.jsx # Room songs management
│   │   │   ├── roommanagement.jsx # Room settings
│   │   │   └── songmanager.jsx    # Song management
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
└── LICENSE
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (Atlas or local)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Musicapp
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   ```
   Create a `.env` file:
   ```
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   ```
   Start the server:
   ```bash
   npm start
   ```

3. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

The application will be available at `http://localhost:5173` (Vite default) with the backend running on your configured port.

## 📡 API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login

### Songs
- `GET /songs` - Get all songs
- `POST /songs/upload` - Upload a new song
- `GET /songs/:id` - Get song details
- `DELETE /songs/:id` - Delete a song

### Playlists
- `GET /playlist` - Get user playlists
- `POST /playlist` - Create playlist
- `PUT /playlist/:id` - Update playlist
- `DELETE /playlist/:id` - Delete playlist
- `POST /playlist/:id/songs` - Add song to playlist

### Favorites
- `GET /faviourt` - Get favorite songs
- `POST /faviourt/:songId` - Add to favorites
- `DELETE /faviourt/:songId` - Remove from favorites

### Listen History
- `GET /listenhistory` - Get play history
- `POST /listenhistory/:songId` - Record play

### Rooms
- `GET /room` - Get all rooms
- `POST /room` - Create room
- `PUT /room/:id` - Update room
- `DELETE /room/:id` - Delete room
- `POST /room/:id/join` - Join room

## 🏗 Architecture

### Authentication Flow
1. User registers/logs in via Auth endpoints
2. Server returns JWT token
3. Token stored in client (localStorage/sessionStorage)
4. Token sent in Authorization header for protected routes
5. Middleware validates token on each request

### Real-time Communication
- Socket.io establishes WebSocket connection
- User actions broadcast to connected clients in rooms
- Live updates for playlist changes, room activity, and user presence

### File Management
- Songs uploaded via Multer middleware
- Files stored in MongoDB GridFS bucket
- Efficient streaming of large audio files
- GridFS handles chunking and retrieval

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

**Author**: Aravind  
**Status**: Active Development

*Built with ❤️ using modern web technologies*
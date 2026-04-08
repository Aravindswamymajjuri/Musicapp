import { useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  AlertCircle,
} from 'lucide-react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { MusicService } from '../services/MusicService';
import SongList from './SongList';
import './OfflineMusicPlayer.css';

/**
 * Offline Music Player Component
 *
 * Features:
 * - Fetch and display songs from device storage
 * - Play, pause, next, previous controls
 * - Current song display with progress tracking
 * - Song list with click-to-play functionality
 * - Loading and error states
 * - Empty state handling
 *
 * Permission Handling:
 * - Requests READ_MEDIA_AUDIO permission on first load
 * - Gracefully handles permission denial
 */
const OfflineMusicPlayer = () => {
  const player = useAudioPlayer();

  /**
   * Fetch songs on component mount
   * Request necessary permissions before fetching
   */
  useEffect(() => {
    const initializeSongs = async () => {
      player.setLoading(true);
      player.setError(null);

      try {
        // Request permission
        const permissionGranted =
          await MusicService.requestMusicPermission();

        if (!permissionGranted) {
          player.setError(
            'Permission denied. Please allow access to read audio files.'
          );
          player.setLoading(false);
          return;
        }

        // Fetch songs from device
        const songs = await MusicService.fetchSongs();

        if (songs.length === 0) {
          player.setError('No songs found on device');
        } else {
          player.setSongs(songs);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        player.setError(err.message || 'Failed to load songs');
      } finally {
        player.setLoading(false);
      }
    };

    initializeSongs();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Music className="w-8 h-8 text-purple-500" />
          <h1 className="text-3xl md:text-4xl font-bold">Music Player</h1>
        </div>
        <p className="text-gray-400">
          {player.songs.length > 0
            ? `${player.songs.length} songs available`
            : 'Offline mode'}
        </p>
      </div>

      {/* Loading State */}
      {player.loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-gray-400">Loading your music library...</p>
        </div>
      )}

      {/* Error State */}
      {player.error && !player.loading && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold mb-1">Error</h3>
            <p className="text-sm text-gray-200">{player.error}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!player.loading && player.songs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Player Controls and Now Playing */}
          <div className="lg:col-span-1 order-2 lg:order-1">
            <PlayerCard player={player} />
          </div>

          {/* Song List */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <SongList
              songs={player.songs}
              currentIndex={player.currentIndex}
              isPlaying={player.isPlaying}
              onSongClick={player.playSong}
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {!player.loading && player.songs.length === 0 && !player.error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Music className="w-16 h-16 text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No songs found</h3>
          <p className="text-gray-400 max-w-md">
            Add some music files to your device to get started. Your music
            library will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Player Card Component
 * Displays current song info and playback controls
 */
const PlayerCard = ({ player }) => {
  const { currentSong } = player;

  if (!currentSong && player.songs.length > 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 sticky top-4">
        <p className="text-gray-400 text-center">Select a song to play</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 sticky top-4 space-y-6">
      {/* Album Art Placeholder */}
      <div className="w-full aspect-square bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
        <Music className="w-20 h-20 text-white opacity-50" />
      </div>

      {/* Song Info */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold truncate">{currentSong?.title}</h2>
        <p className="text-sm text-gray-400 truncate">{currentSong?.artist}</p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <ProgressBar
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seek}
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>{MusicService.formatTime(player.currentTime)}</span>
          <span>{MusicService.formatTime(player.duration)}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={player.handlePrevious}
          className="p-2 hover:bg-gray-700 rounded-full transition hover:scale-110 active:scale-95"
          title="Previous song"
        >
          <SkipBack className="w-6 h-6" />
        </button>

        <button
          onClick={player.togglePlayPause}
          className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-full p-4 transition hover:scale-105 active:scale-95 flex items-center justify-center"
          title={player.isPlaying ? 'Pause' : 'Play'}
        >
          {player.isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-1" />
          )}
        </button>

        <button
          onClick={player.handleNext}
          className="p-2 hover:bg-gray-700 rounded-full transition hover:scale-110 active:scale-95"
          title="Next song"
        >
          <SkipForward className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

/**
 * Progress Bar Component
 * Shows current playback position and allows seeking
 */
const ProgressBar = ({ currentTime, duration, onSeek }) => {
  const percentage = duration ? (currentTime / duration) * 100 : 0;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  return (
    <div
      onClick={handleClick}
      className="w-full h-1 bg-gray-700 rounded-full cursor-pointer hover:h-2 transition-all group"
    >
      <div
        className="h-full bg-purple-500 rounded-full transition-all group-hover:bg-purple-400"
        style={{ width: `${percentage}%` }}
      ></div>
    </div>
  );
};

export default OfflineMusicPlayer;

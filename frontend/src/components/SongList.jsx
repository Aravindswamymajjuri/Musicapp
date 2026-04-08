import { Play, Music } from 'lucide-react';
import { MusicService } from '../services/MusicService';
import './SongList.css';

/**
 * SongList Component
 *
 * Displays a scrollable list of songs with:
 * - Song title and artist
 * - Duration
 * - Play button
 * - Visual indicator for currently playing song
 * - Click to play functionality
 */
const SongList = ({
  songs,
  currentIndex,
  isPlaying,
  onSongClick,
}) => {
  if (!songs || songs.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <Music className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No songs available</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700 sticky top-0 bg-gray-800/95 backdrop-blur">
        <h2 className="text-lg font-semibold">Playlist</h2>
        <p className="text-sm text-gray-400">{songs.length} songs</p>
      </div>

      {/* Song List */}
      <div className="song-list max-h-96 overflow-y-auto lg:max-h-96">
        {songs.map((song, index) => (
          <SongItem
            key={song.id}
            song={song}
            index={index}
            isCurrentSong={index === currentIndex}
            isPlaying={isPlaying && index === currentIndex}
            onPlay={() => onSongClick(index)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * SongItem Component
 * Individual song row with play button and metadata
 */
const SongItem = ({
  song,
  index,
  isCurrentSong,
  isPlaying,
  onPlay,
}) => {
  return (
    <div
      className={`px-6 py-4 border-b border-gray-700/50 flex items-center gap-4 cursor-pointer transition hover:bg-gray-700/50 ${
        isCurrentSong ? 'bg-gray-700 now-playing' : ''
      }`}
      onClick={onPlay}
    >
      {/* Song Number / Playing Indicator */}
      <div className="w-8 text-right flex-shrink-0">
        {isCurrentSong && isPlaying ? (
          <div className="w-6 h-6 mx-auto">
            <PlayingAnimation />
          </div>
        ) : (
          <span className="text-sm text-gray-500">{index + 1}</span>
        )}
      </div>

      {/* Song Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-white truncate">{song.title}</h3>
        <p className="text-sm text-gray-400 truncate">{song.artist}</p>
      </div>

      {/* Duration */}
      <div className="text-sm text-gray-400 flex-shrink-0">
        {song.formattedDuration}
      </div>

      {/* Play Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition hover:scale-110 active:scale-95 flex-shrink-0"
        title="Play song"
      >
        <Play className="w-5 h-5 ml-0.5" />
      </button>
    </div>
  );
};

/**
 * Animated loader for currently playing song
 */
const PlayingAnimation = () => {
  return (
    <svg
      className="w-full h-full text-purple-400"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <g opacity="0.8">
        <rect
          x="4"
          y="6"
          width="2"
          height="12"
          className="animate-pulse"
          style={{ animationDelay: '0s' }}
        />
        <rect
          x="10"
          y="4"
          width="2"
          height="14"
          className="animate-pulse"
          style={{ animationDelay: '0.1s' }}
        />
        <rect
          x="16"
          y="8"
          width="2"
          height="8"
          className="animate-pulse"
          style={{ animationDelay: '0.2s' }}
        />
      </g>
    </svg>
  );
};

export default SongList;

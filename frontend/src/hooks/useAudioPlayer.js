import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook to manage audio player state and controls
 * Handles play, pause, next, previous, and playback tracking
 */
export const useAudioPlayer = () => {
  const audioRef = useRef(new Audio());
  const [songs, setSongs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentSong = songs[currentIndex] || null;

  /**
   * Initialize audio element with event listeners
   */
  useEffect(() => {
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      handleNext();
    };

    const handleError = (e) => {
      console.error('Audio error:', e);
      setError('Failed to load audio file');
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  /**
   * Play audio from a specific path
   */
  const playAudio = useCallback((path) => {
    const audio = audioRef.current;
    audio.src = `file://${path}`;
    audio.play().catch((err) => {
      console.error('Play error:', err);
      setError('Failed to play audio');
    });
    setIsPlaying(true);
    setError(null);
  }, []);

  /**
   * Toggle play/pause
   */
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!currentSong) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.src) {
        audio.play().catch((err) => {
          console.error('Play error:', err);
          setError('Failed to play audio');
        });
      } else {
        playAudio(currentSong.path);
      }
      setIsPlaying(true);
      setError(null);
    }
  }, [isPlaying, currentSong, playAudio]);

  /**
   * Play next song
   */
  const handleNext = useCallback(() => {
    if (songs.length === 0) return;
    const nextIndex = (currentIndex + 1) % songs.length;
    setCurrentIndex(nextIndex);
    setCurrentTime(0);
    setIsPlaying(true);
    playAudio(songs[nextIndex].path);
  }, [currentIndex, songs, playAudio]);

  /**
   * Play previous song
   */
  const handlePrevious = useCallback(() => {
    if (songs.length === 0) return;
    const prevIndex = currentIndex === 0 ? songs.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    setCurrentTime(0);
    setIsPlaying(true);
    playAudio(songs[prevIndex].path);
  }, [currentIndex, songs, playAudio]);

  /**
   * Play a specific song by index
   */
  const playSong = useCallback(
    (index) => {
      if (index >= 0 && index < songs.length) {
        setCurrentIndex(index);
        setCurrentTime(0);
        playAudio(songs[index].path);
        setIsPlaying(true);
      }
    },
    [songs, playAudio]
  );

  /**
   * Seek to a specific time
   */
  const seek = useCallback((time) => {
    const audio = audioRef.current;
    audio.currentTime = Math.min(time, duration);
    setCurrentTime(audio.currentTime);
  }, [duration]);

  /**
   * Stop playback and reset
   */
  const stop = useCallback(() => {
    const audio = audioRef.current;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      audioRef.current.pause();
    };
  }, []);

  return {
    // State
    songs,
    setSongs,
    currentSong,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    currentTime,
    duration,
    loading,
    setLoading,
    error,
    setError,

    // Controls
    togglePlayPause,
    handleNext,
    handlePrevious,
    playSong,
    playAudio,
    seek,
    stop,
  };
};

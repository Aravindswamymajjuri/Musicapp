import { registerPlugin } from '@capacitor/core';

/**
 * Register the MediaStore Capacitor plugin
 * This allows us to call native Android code from React
 */
const MediaStore = registerPlugin('MediaStore');

/**
 * Service to handle fetching songs from device storage
 * Integrates with the native MediaStorePlugin for Android
 */
export class MusicService {
  /**
   * Fetch all audio files from device storage
   * Requires READ_MEDIA_AUDIO permission on Android 13+
   *
   * @returns {Promise<Array>} Array of song objects with title, artist, path, duration
   */
  static async fetchSongs() {
    try {
      const result = await MediaStore.getSongs();
      
      // Filter out invalid entries and sort by title
      const songs = (result.songs || [])
        .filter((song) => song.path && song.title && song.duration > 0)
        .map((song) => ({
          ...song,
          id: `${song.path}-${song.duration}`, // Unique ID based on path and duration
          formattedDuration: MusicService.formatDuration(song.duration),
        }))
        .sort((a, b) => a.title.localeCompare(b.title));

      return songs;
    } catch (error) {
      console.error('Error fetching songs:', error);
      throw new Error('Failed to fetch songs from device');
    }
  }

  /**
   * Format duration from milliseconds to MM:SS format
   *
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration (e.g., "3:45")
   */
  static formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format time from seconds to MM:SS format
   *
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time (e.g., "2:15")
   */
  static formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Request READ_MEDIA_AUDIO permission on Android 13+
   * On older versions, READ_EXTERNAL_STORAGE is declared in manifest
   *
   * @returns {Promise<boolean>} True if permission is granted
   */
  static async requestMusicPermission() {
    try {
      const { permissions } = await import('@capacitor/core');
      const androidPermissions = await permissions.query({
        name: 'READ_MEDIA_AUDIO',
      });

      if (androidPermissions.state === 'granted') {
        return true;
      }

      if (androidPermissions.state === 'prompt-with-rationale') {
        const result = await permissions.requestPermissions({
          permissions: ['READ_MEDIA_AUDIO'],
        });
        return result.permissions[0].state === 'granted';
      }

      return false;
    } catch (error) {
      console.warn('Permission handling error:', error);
      // If permission API is not available, assume granted (permission is in manifest)
      return true;
    }
  }
}

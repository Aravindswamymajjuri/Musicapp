import React, { useState, useEffect, useRef } from 'react';
import './songmanager.css';

// Safe env lookup for backend URL
const envFromProcess = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ? process.env.REACT_APP_BACKEND_URL : null;
const envFromImportMeta = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL) : null;
const API_BASE_URL = envFromProcess || envFromImportMeta || 'https://musicapp-7dy9.onrender.com';
const API_SONGS = `${API_BASE_URL}/api/songs`;
const FAV_BASE = `${API_BASE_URL}/api/favorites`;

const SongManager = () => {
	const audioRef = useRef(null);

	// Modal state
	const [showUploadModal, setShowUploadModal] = useState(false);

	// Upload form states
	const [files, setFiles] = useState([]);
	const [title, setTitle] = useState('');
	const [artist, setArtist] = useState('');
	const [album, setAlbum] = useState('');
	const [duration, setDuration] = useState('');
	const [folder, setFolder] = useState('');
	const [bitrate, setBitrate] = useState('');
	const [format, setFormat] = useState('');
	const [albumArt, setAlbumArt] = useState('');
	const [uploadError, setUploadError] = useState('');
	const [success, setSuccess] = useState('');
	const [uploadLoading, setUploadLoading] = useState(false);
	const [serverStatus, setServerStatus] = useState('checking');

	// Song list and UI states
	const [songs, setSongs] = useState([]);
	const [listLoading, setListLoading] = useState(true);
	const [listError, setListError] = useState('');
	const [deletingId, setDeletingId] = useState(null);

	// Playback states
	const [selectedSongId, setSelectedSongId] = useState(null);
	const [audioSrc, setAudioSrc] = useState(null);
	const [playTime, setPlayTime] = useState(0);
	const [bufferedEnd, setBufferedEnd] = useState(0);
	const [streamDuration, setStreamDuration] = useState(0);
	// track whether audio is playing (for Play/Pause button)
	const [isPlaying, setIsPlaying] = useState(false);
	// buffering UI state & timer
	const [isBuffering, setIsBuffering] = useState(false);
	const bufferTimerRef = useRef(null);

	// Favorites
	const [favorites, setFavorites] = useState([]);

	// Albums
	const [albums, setAlbums] = useState([]);
	const [selectedAlbum, setSelectedAlbum] = useState('All Albums');
	const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);
	const [newAlbumName, setNewAlbumName] = useState('');

	// NEW: map of albumName -> boolean (show all rows)
	const [albumExpanded, setAlbumExpanded] = useState({});

	const token = localStorage.getItem('token');

	// On mount, check server, fetch songs and favorites
	useEffect(() => {
		checkServerStatus();
		// Load cached content quickly, then refresh in background
		const cachedSongs = sessionStorage.getItem('sm_songs_v1');
		const cachedFavs = sessionStorage.getItem('sm_favs_v1');
		try {
			if (cachedSongs) setSongs(JSON.parse(cachedSongs));
			if (cachedFavs) setFavorites(JSON.parse(cachedFavs));
		} catch (e) { /* ignore parse errors */ }
		// Run background refresh
		refreshSongsAndFavorites();
	}, []);

	// Fetch songs & favorites in parallel with abort and cache results
	const refreshSongsAndFavorites = async () => {
		const controller = new AbortController();
		const signal = controller.signal;
		setListLoading(true);
		setListError('');
		try {
			const [songsRes, favRes] = await Promise.all([
				fetch(API_SONGS, { headers: { Authorization: `Bearer ${token}` }, signal }),
				fetch(FAV_BASE, { headers: { Authorization: `Bearer ${token}` }, signal })
			].map(p => p.catch(err => err)));

			// handle songs response
			if (songsRes && songsRes.ok) {
				const songsData = await songsRes.json();
				setSongs(songsData);
				try { sessionStorage.setItem('sm_songs_v1', JSON.stringify(songsData)); } catch (e) {}

				// build albums list
				const albumSet = new Set();
				(songsData || []).forEach(s => {
					const a = (s.album || '').trim() || 'Uncategorized';
					albumSet.add(a);
				});
				const albumsArr = ['All Albums', ...Array.from(albumSet)];
				setAlbums(albumsArr);
				if (!albumsArr.includes(selectedAlbum)) setSelectedAlbum('All Albums');
			} else {
				// if network error object returned, throw
				if (songsRes && songsRes instanceof Error) throw songsRes;
				// else keep existing cached list and optionally show error
			}

			// handle favorites response
			if (favRes && favRes.ok) {
				const favData = await favRes.json();
				setFavorites(favData);
				try { sessionStorage.setItem('sm_favs_v1', JSON.stringify(favData)); } catch (e) {}
			} else {
				if (favRes && favRes instanceof Error) console.warn('fav fetch error', favRes);
			}
		} catch (err) {
			console.warn('refreshSongsAndFavorites error', err);
			setListError(err.message || 'Unable to load songs');
		} finally {
			setListLoading(false);
		}
	};

	const checkServerStatus = async () => {
		try {
			const res = await fetch(`${API_SONGS}/health`);
			if (res.ok) {
				const data = await res.json();
				setServerStatus(data.dbConnection === 'connected' ? 'ready' : 'not-ready');
			} else {
				setServerStatus('error');
			}
		} catch {
			setServerStatus('offline');
		}
	};

	const fetchSongs = async () => {
		setListLoading(true);
		setListError('');
		try {
			const res = await fetch(API_SONGS, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) throw new Error(`Failed to fetch songs: ${res.status}`);
			const data = await res.json();
			setSongs(data);

			const albumSet = new Set();
			(data || []).forEach(s => {
				const a = (s.album || '').trim() || 'Uncategorized';
				albumSet.add(a);
			});
			const albumsArr = ['All Albums', ...Array.from(albumSet)];
			setAlbums(albumsArr);
			if (!albumsArr.includes(selectedAlbum)) {
				setSelectedAlbum('All Albums');
			}
		} catch (err) {
			setListError(err.message || 'Unable to load songs');
		} finally {
			setListLoading(false);
		}
	};

	const fetchFavorites = async () => {
		try {
			const res = await fetch(FAV_BASE, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) throw new Error('Failed to fetch favorites');
			const data = await res.json();
			setFavorites(data);
		} catch (error) {
			console.error('Error fetching favorites:', error);
		}
	};

	const isFavorited = (songId) => {
		return favorites.some(fav => fav.song && fav.song._id === songId);
	};

	const toggleFavorite = async (songId) => {
		if (!token) return alert('Please log in');

		try {
			const res = await fetch(FAV_BASE, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ songId }),
			});
			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || 'Failed to toggle favorite');
			}
			await fetchFavorites();
			await fetchSongs();
		} catch (err) {
			alert(err.message);
		}
	};

	const handleFileChange = (e) => {
		const selected = Array.from(e.target.files || []);
		setFiles(selected);
		if (selected.length > 0) {
			const first = selected[0];
			const ext = first.name.split('.').pop().toLowerCase();
			setFormat(ext);
			if (!title) {
				const name = first.name.replace(/\.[^/.]+$/, '');
				setTitle(name);
			}
			if (first.type && first.type.startsWith && first.type.startsWith('audio/')) {
				const audio = new Audio();
				audio.onloadedmetadata = () => setDuration(Math.round(audio.duration));
				audio.src = URL.createObjectURL(first);
			}
		} else {
			setFormat('');
		}
	};

	const handleUpload = async (e) => {
		e.preventDefault();
		setUploadError('');
		setSuccess('');

		const albumToSubmit = showNewAlbumInput ? (newAlbumName.trim() || 'Uncategorized') : (album.trim() || 'Uncategorized');

		if (serverStatus !== 'ready') {
			setUploadError('Server is not ready. Please try again soon.');
			await checkServerStatus();
			return;
		}
		if (!files || files.length === 0) {
			setUploadError('Please select one or more files.');
			return;
		}
		if (!artist || !album || !duration) {
			setUploadError('Fill in required fields (artist, album, duration).');
			return;
		}
		if (!token) {
			setUploadError('Log in first.');
			return;
		}

		setUploadLoading(true);
		let anyError = null;
		try {
			for (const f of files) {
				const formData = new FormData();
				formData.append('file', f);
				const titleForFile = title && title.trim() ? title.trim() : f.name.replace(/\.[^/.]+$/, '');
				formData.append('title', titleForFile);
				formData.append('artist', artist.trim());
				formData.append('album', albumToSubmit);
				formData.append('duration', duration.toString());
				if (folder.trim()) formData.append('folder', folder.trim());
				if (bitrate.trim()) formData.append('bitrate', bitrate.trim());
				if (format.trim()) formData.append('format', format.trim());
				if (albumArt.trim()) formData.append('albumArt', albumArt.trim());

				const response = await fetch(`${API_SONGS}/upload`, {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}` },
					body: formData,
				});
				const data = await response.json().catch(() => ({}));
				if (!response.ok) {
					anyError = data.error || `Failed to upload ${f.name}: ${response.status}`;
					throw new Error(anyError);
				}
			}

			setSuccess('All files uploaded!');
			setFiles([]);
			setTitle('');
			setArtist('');
			setAlbum('');
			setDuration('');
			setFolder('');
			setBitrate('');
			setFormat('');
			setAlbumArt('');
			const fileInput = document.querySelector('input[type="file"]');
			if (fileInput) fileInput.value = '';
			await fetchSongs();
			
			// Close modal after successful upload
			setTimeout(() => {
				setShowUploadModal(false);
				setSuccess('');
			}, 2000);
		} catch (err) {
			setUploadError(err.message || anyError || 'Upload error.');
		} finally {
			setUploadLoading(false);
		}
	};

	const handleDelete = async (id) => {
		if (!window.confirm('Are you sure you want to delete this song?')) {
			return;
		}
		setDeletingId(id);
		setListError('');
		try {
			const res = await fetch(`${API_SONGS}/${id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || `Failed to delete song: ${res.status}`);
			}
			setSongs((prev) => prev.filter((song) => song._id !== id));
			if (selectedSongId === id) {
				setSelectedSongId(null);
				if (audioSrc && String(audioSrc).startsWith('blob:')) {
					URL.revokeObjectURL(audioSrc);
				}
				setAudioSrc(null);
			}
			await fetchFavorites();
		} catch (err) {
			setListError(err.message || 'Error deleting song');
		} finally {
			setDeletingId(null);
		}
	};

	const handlePlaySong = async (id) => {
		if (selectedSongId === id) {
			setSelectedSongId(null);
			if (audioSrc && String(audioSrc).startsWith('blob:')) {
				URL.revokeObjectURL(audioSrc);
			}
			setAudioSrc(null);
			setPlayTime(0);
			setBufferedEnd(0);
			setStreamDuration(0);
			return;
		}

		setSelectedSongId(id);
		if (audioSrc && String(audioSrc).startsWith('blob:')) {
			URL.revokeObjectURL(audioSrc);
		}
		// NEW: warm connection + instruct browser to preload
		const streamUrl = `${API_SONGS}/${id}/stream`;
		try {
			const a = audioRef.current;
			if (a) {
				a.preload = 'auto';
				a.crossOrigin = 'anonymous';
			}
			prefetchAudio(streamUrl);
			// Also do authenticated Range probe
			prefetchRange(streamUrl).catch(() => {});
		} catch (e) {}
		// set the src (audio effect will handle load/play)
		setAudioSrc(streamUrl);
		setPlayTime(0);
		setBufferedEnd(0);
		setStreamDuration(0);
	};

	// NEW: small helper to preconnect + preload audio stream
	const prefetchAudio = (url) => {
		try {
			const u = new URL(url);
			const origin = u.origin;
			const pc = document.createElement('link');
			pc.rel = 'preconnect';
			pc.href = origin;
			pc.crossOrigin = '';
			document.head.appendChild(pc);
			setTimeout(() => { try { document.head.removeChild(pc); } catch (e) {} }, 30000);
		} catch (e) {}
		try {
			const pl = document.createElement('link');
			pl.rel = 'preload';
			pl.as = 'audio';
			pl.href = url;
			document.head.appendChild(pl);
			setTimeout(() => { try { document.head.removeChild(pl); } catch (e) {} }, 30000);
		} catch (e) {}
	};

	// NEW: authenticated Range probe to warm connection
	const prefetchRange = async (url, size = 65536, timeout = 2500) => {
		if (!url) return;
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeout);
		try {
			const headers = { Range: `bytes=0-${Math.max(0, size - 1)}` };
			if (token) headers.Authorization = `Bearer ${token}`;
			await fetch(url, { method: 'GET', headers, signal: controller.signal, mode: 'cors', cache: 'no-store' });
		} catch (e) {
			// ignore - best effort
		} finally {
			clearTimeout(id);
		}
	};

	// When audioSrc changes, apply it immediately to the audio element and attempt to play.
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		// remove old listeners to avoid duplicates
		const onTimeUpdate = () => setPlayTime(audio.currentTime || 0);
		const onProgress = () => {
			try {
				const buf = audio.buffered;
				if (buf && buf.length > 0) {
					const end = buf.end(buf.length - 1);
					setBufferedEnd(end || 0);
				}
			} catch (e) {}
		};
		const onLoadedMeta = () => {
			setStreamDuration(isFinite(audio.duration) ? audio.duration : 0);
		};
		const onPlay = () => setIsPlaying(true);
		const onPause = () => setIsPlaying(false);

		// attach listeners
		audio.removeEventListener('timeupdate', onTimeUpdate);
		audio.removeEventListener('progress', onProgress);
		audio.removeEventListener('loadedmetadata', onLoadedMeta);
		audio.removeEventListener('play', onPlay);
		audio.removeEventListener('pause', onPause);
		audio.addEventListener('timeupdate', onTimeUpdate);
		audio.addEventListener('progress', onProgress);
		audio.addEventListener('loadedmetadata', onLoadedMeta);
		audio.addEventListener('play', onPlay);
		audio.addEventListener('pause', onPause);

		if (!audioSrc) {
			// stop and clear source
			try { audio.pause(); } catch (e) {}
			audio.removeAttribute('src');
			try { audio.load(); } catch (e) {}
			// clear progress
			setPlayTime(0); setBufferedEnd(0); setStreamDuration(0);
			setIsPlaying(false);
			setIsBuffering(false);
			return;
		}

		// show buffering indicator
		setIsBuffering(true);

		// Set src, load and play. This starts streaming quickly and allows Range requests.
		try {
			// remove any previous canplay listener
			try { if (audio._sm_canplay) audio.removeEventListener('canplay', audio._sm_canplay); } catch (e) {}
			if (bufferTimerRef.current) { clearTimeout(bufferTimerRef.current); bufferTimerRef.current = null; }

			if (audio.src !== audioSrc) {
				audio.src = audioSrc;
			}
			audio.preload = 'auto';
			audio.crossOrigin = 'anonymous';
			audio.load();
			audio.play().then(() => {
				setIsPlaying(true);
			}).catch(() => { /* ignore play errors */ });

			// attach one-time canplay listener to start playback ASAP
			const onCanPlay = () => {
				setIsBuffering(false);
				audio.play().then(() => setIsPlaying(true)).catch(() => {});
				try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
				audio._sm_canplay = null;
				if (bufferTimerRef.current) { clearTimeout(bufferTimerRef.current); bufferTimerRef.current = null; }
			};
			audio._sm_canplay = onCanPlay;
			audio.addEventListener('canplay', onCanPlay);

			// safety timeout: if canplay doesn't fire within 10s, stop buffering
			bufferTimerRef.current = setTimeout(() => {
				setIsBuffering(false);
				setIsPlaying(false);
				try { if (audio._sm_canplay) { audio.removeEventListener('canplay', audio._sm_canplay); audio._sm_canplay = null; } } catch (e) {}
				console.warn('Buffer timeout: could not start playback quickly. Check network/backend.');
			}, 10000);
		} catch (e) {
			console.error('Audio element error applying src:', e);
			setIsBuffering(false);
		}

		// cleanup handlers on effect re-run
		return () => {
			try {
				audio.removeEventListener('timeupdate', onTimeUpdate);
				audio.removeEventListener('progress', onProgress);
				audio.removeEventListener('loadedmetadata', onLoadedMeta);
				audio.removeEventListener('play', onPlay);
				audio.removeEventListener('pause', onPause);
			} catch (e) {}
		};
	}, [audioSrc]);

	useEffect(() => {
		return () => {
			if (audioSrc && String(audioSrc).startsWith('blob:')) {
				URL.revokeObjectURL(audioSrc);
			}
		};
	}, [audioSrc]);

	// Seek by offset seconds for SongManager (hostless local control)
	const seekBy = (offsetSeconds) => {
		const audio = audioRef.current;
		if (!audio) return;
		try {
			const duration = audio.duration || streamDuration || 0;
			let t = (audio.currentTime || 0) + offsetSeconds;
			if (t < 0) t = 0;
			if (duration && t > duration) t = Math.max(0, duration - 0.1);
			audio.currentTime = t;
			setPlayTime(t);
		} catch (e) {
			console.warn('seekBy error', e);
		}
	};
	
	// Toggle play/pause for SongManager
	const togglePlayPause = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) {
			audio.play().catch(() => {});
			setIsPlaying(true);
		} else {
			audio.pause();
			setIsPlaying(false);
		}
	};

	const getStatusColor = () => {
		switch (serverStatus) {
			case 'ready':
				return 'green';
			case 'not-ready':
				return 'orange';
			case 'error':
				return 'red';
			case 'offline':
				return 'red';
			default:
				return 'gray';
		}
	};

	const getStatusText = () => {
		switch (serverStatus) {
			case 'ready':
				return 'Server Ready';
			case 'not-ready':
				return 'Server Starting...';
			case 'error':
				return 'Server Error';
			case 'offline':
				return 'Server Offline';
			default:
				return 'Checking...';
		}
	};

	const renderSongsTable = (songList) => {
		if (!songList || songList.length === 0) return null;
		return (
			<table className="songs-table">
				<thead>
					<tr>
						<th>Title</th>
						<th>Artist</th>
						<th>Album</th>
						<th>Duration (s)</th>
						<th>Folder</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{songList.map(({ _id, title, artist, album, duration, folder }) => {
						const dur = streamDuration || duration || 0;
						const playedPct = dur > 0 ? Math.min(100, (playTime / dur) * 100) : 0;
						const bufferedPct = dur > 0 ? Math.min(100, (bufferedEnd / dur) * 100) : 0;

						return (
							<tr key={_id}>
								<td>{title}</td>
								<td>{artist}</td>
								<td>{album}</td>
								<td>{duration}</td>
								<td>{folder}</td>
								<td>
									<div className="action-buttons">
										<button
											onClick={() => handlePlaySong(_id)}
											className={`play-button ${selectedSongId === _id ? 'playing' : 'not-playing'}`}
										>
											{selectedSongId === _id ? 'Playing' : 'Play'}
										</button>

										<button
											onClick={() => toggleFavorite(_id)}
											aria-label={isFavorited(_id) ? 'Remove from favorites' : 'Add to favorites'}
											className={`favorite-button ${isFavorited(_id) ? 'favorited' : 'not-favorited'}`}
										>
											{isFavorited(_id) ? '❤️' : '🤍'}
										</button>

										<button
											onClick={() => handleDelete(_id)}
											disabled={deletingId === _id}
											className="delete-button"
										>
											{deletingId === _id ? 'Deleting...' : 'Delete'}
										</button>
									</div>

									{selectedSongId === _id && (
										<div className="progress-container">
											<div className="progress-bar">
												<div className="progress-buffered" style={{ width: `${bufferedPct}%` }} />
												<div className="progress-played" style={{ width: `${playedPct}%` }} />
											</div>
											<div className="progress-text">
												Loaded: {Math.round(bufferedPct)}% — {Math.round(playTime)}s / {Math.round(dur)}s
											</div>
										</div>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		);
	};

	// Small helper to render album groups with virtualization-like behavior (show limited rows initially)
	const renderAlbumGroup = (albumName, list) => {
		const LIMIT = 100; // initial rows per album
		const expanded = !!albumExpanded[albumName];
		const visible = expanded ? list : list.slice(0, LIMIT);

		return (
			<div key={albumName} style={{ marginTop: 18 }}>
				<h3 style={{ marginBottom: 8 }}>{albumName}</h3>
				{renderSongsTable(visible)}
				{list.length > LIMIT && (
					<div style={{ marginTop: 8 }}>
						<button
							onClick={() => setAlbumExpanded(prev => ({ ...prev, [albumName]: !prev[albumName] }))}
							style={{ padding: '6px 10px' }}
						>
							{expanded ? `Show less (${list.length})` : `Show more (${list.length - LIMIT})`}
						</button>
					</div>
				)}
			</div>
		);
	};

	// Prepare songs content to render (avoid IIFE inside JSX which caused blank page)
	const songsContent = (() => {
		// While loading, show loading indicator
		if (listLoading) {
			return <p>Loading songs...</p>;
		}

		// If no songs at all
		if (!songs || songs.length === 0) {
			return <p>No songs found. Upload some songs first!</p>;
		}

		// PREVIOUS: favorites were excluded here which hid favorited songs from the main list.
		// Updated: do NOT exclude favorites — show uploaded songs regardless of favorite status.
		const favIds = new Set((favorites || []).map(f => f.song && f.song._id).filter(Boolean));
		// Keep favorites info (favIds) for UI decorations, but do not exclude them from the main list.
		const filtered = songs.filter(s => {
			const a = (s.album || '').trim() || 'Uncategorized';
			if (selectedAlbum && selectedAlbum !== 'All Albums') return a === selectedAlbum;
			return true;
		});

		if (filtered.length === 0) {
			return <p>No songs found for the selected album.</p>;
		}

		// If viewing all albums, group by album and render a table per album
		if (selectedAlbum === 'All Albums') {
			const byAlbum = filtered.reduce((acc, s) => {
				const a = (s.album || '').trim() || 'Uncategorized';
				(acc[a] = acc[a] || []).push(s);
				return acc;
			}, {});
			return (
				<div>
					{Object.keys(byAlbum).map(albumName => (
						<div key={albumName} style={{ marginTop: 18 }}>
							<h3 style={{ marginBottom: 8 }}>{albumName}</h3>
							{renderSongsTable(byAlbum[albumName])}
						</div>
					))}
				</div>
			);
		}

		// else show single table (album filter applied)
		return renderSongsTable(filtered);
	})();

	if (!token) {
		return (
			<div className="not-logged-in">
				<h2>Please log in to use the Song Manager.</h2>
			</div>
		);
	}

	return (
		<div className="song-manager-container">
			<div className="page-header">
				<h2 className="page-title">Song Manager</h2>
				<button className="upload-button" onClick={() => setShowUploadModal(true)}>
					Upload a Song
				</button>
			</div>

			{/* Upload Modal */}
			{showUploadModal && (
				<div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h2 className="modal-title">Upload a New Song</h2>
							<button className="close-button" onClick={() => setShowUploadModal(false)}>
								×
							</button>
						</div>

						<div className={`status-box ${serverStatus}`}>
							<span className={`status-text ${serverStatus}`}>
								Status: {getStatusText()}
							</span>
							{serverStatus !== 'ready' && (
								<button className="retry-button" onClick={checkServerStatus}>
									Retry
								</button>
							)}
						</div>

						{uploadError && <p className="alert alert-error">{uploadError}</p>}
						{success && <p className="alert alert-success">{success}</p>}

						<form onSubmit={handleUpload} className="upload-form">
							<div className="form-group">
								<label className="form-label">Song Files (select one or many):</label>
								<input
									type="file"
									accept="audio/*"
									onChange={handleFileChange}
									multiple
									className="form-input"
								/>
								{files && files.length > 0 && (
									<small className="file-info">
										Selected: {files.map(f => f.name).join(', ')} (
										{(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB total)
									</small>
								)}
							</div>

							<div className="form-group">
								<label className="form-label">Title:</label>
								<input
									type="text"
									value={title}
									onChange={e => setTitle(e.target.value)}
									required
									className="form-input"
									placeholder="Song title"
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Artist:</label>
								<input
									type="text"
									value={artist}
									onChange={e => setArtist(e.target.value)}
									required
									className="form-input"
									placeholder="Artist name"
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Album:</label>
								<select
									value={showNewAlbumInput ? '__new__' : (album || '')}
									onChange={(e) => {
										const v = e.target.value;
										if (v === '__new__') {
											setShowNewAlbumInput(true);
											setNewAlbumName('');
											setAlbum('');
										} else {
											setShowNewAlbumInput(false);
											setAlbum(v);
										}
									}}
									className="form-select"
								>
									<option value="">-- Select album (or choose Create new) --</option>
									{albums.map(a => a !== 'All Albums' && <option key={a} value={a}>{a}</option>)}
									<option value="__new__">+ Create new album...</option>
								</select>
								{showNewAlbumInput && (
									<div className="new-album-input">
										<input
											type="text"
											value={newAlbumName}
											onChange={e => setNewAlbumName(e.target.value)}
											placeholder="New album name"
											className="form-input"
										/>
										<button
											type="button"
											onClick={() => {
												if (newAlbumName.trim()) {
													setAlbum(newAlbumName.trim());
													setShowNewAlbumInput(false);
												}
											}}
											className="new-album-button"
										>
											Use this album
										</button>
									</div>
								)}
							</div>

							<div className="form-group">
								<label className="form-label">Duration (seconds):</label>
								<input
									type="number"
									min="0"
									value={duration}
									onChange={e => setDuration(e.target.value)}
									required
									className="form-input"
									placeholder="Duration in seconds"
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Folder (optional):</label>
								<input
									type="text"
									value={folder}
									onChange={e => setFolder(e.target.value)}
									className="form-input"
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Bitrate (optional):</label>
								<input
									type="text"
									value={bitrate}
									onChange={e => setBitrate(e.target.value)}
									className="form-input"
									placeholder="e.g., 320kbps"
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Format:</label>
								<input
									type="text"
									value={format}
									onChange={e => setFormat(e.target.value)}
									className="form-input"
									placeholder="e.g., mp3, wav"
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Album Art URL (optional):</label>
								<input
									type="text"
									value={albumArt}
									onChange={e => setAlbumArt(e.target.value)}
									className="form-input"
									placeholder="http://..."
								/>
							</div>

							<button
								type="submit"
								disabled={uploadLoading || serverStatus !== 'ready'}
								className="submit-button"
							>
								{uploadLoading ? 'Uploading...' : 'Upload Song'}
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Album Filter */}
			{albums && albums.length > 1 && (
				<div className="album-filter">
					<strong className="filter-label">Albums:</strong>
					{albums.map(a => (
						<button
							key={a}
							onClick={() => setSelectedAlbum(a)}
							className={`album-button ${selectedAlbum === a ? 'active' : ''}`}
						>
							{a}
						</button>
					))}
				</div>
			)}

			{/* Songs List */}
			<div className="songs-section">
				<h2 className="songs-title">
					{selectedAlbum === 'All Albums' ? 'Your Uploaded Songs' : `Album: ${selectedAlbum}`}
				</h2>
				{listError && <p className="error-message">{listError}</p>}
				{songsContent}
			</div>

			{/* Inline player controls for current selection */}
			{selectedSongId && (
				<div className="inline-player" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
					<button onClick={() => seekBy(-10)} className="seek-button">« 10s</button>
					<button onClick={togglePlayPause} className="playpause-button">{isPlaying ? 'Pause' : 'Play'}</button>
					<button onClick={() => seekBy(10)} className="seek-button">10s »</button>
					{isBuffering && <div style={{ marginLeft: 8, color: '#444', fontSize: 13 }}>Buffering…</div>}
					<span style={{ marginLeft: 12, color: '#444', fontSize: 13 }}>{Math.round(playTime)}s / {streamDuration ? Math.round(streamDuration) + 's' : '--:--'}</span>
				</div>
			)}

			{/* Hidden Audio Element */}
			<div className="hidden-audio">
				<audio ref={audioRef} controls />
			</div>

			{/* Favorites Footer */}
			<div className="favorites-footer">View your favorites on the Favorites page.</div>
		</div>
	);
};

export default SongManager;
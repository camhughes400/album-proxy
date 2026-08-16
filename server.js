app.get('/search', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const rawQuery = req.query.q ? req.query.q.trim() : '';
    let searchQuery = '';

    // Convert artist_name queries directly into exact artist searches
    if (rawQuery.startsWith('artist_name:')) {
      const cleanArtist = rawQuery.replace('artist_name:', '').trim();
      searchQuery = `artist:"${cleanArtist}"`;
    } else if (rawQuery.startsWith('artist_id:')) {
      const cleanArtistId = rawQuery.replace('artist_id:', '').trim();
      searchQuery = `artist:"${cleanArtistId}"`;
    } else {
      searchQuery = rawQuery !== '' ? rawQuery : 'a';
    }

    const randomOffset = Math.floor(Math.random() * 5);
    const spotifyResponse = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=20&offset=${randomOffset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const tracks = spotifyResponse.data?.tracks?.items || [];

    const safeTracks = tracks.filter(track => 
      track.explicit === false && 
      isCleanText(track.name) && 
      isCleanText(track.album?.name) &&
      isCleanText(track.artists[0]?.name)
    );

    if (safeTracks.length === 0) {
      return res.json({ success: false, results: [] });
    }

    const chosenTrack = safeTracks[Math.floor(Math.random() * safeTracks.length)];
    const coverUrl = chosenTrack.album?.images[0]?.url;

    let pixelData = [];
    if (coverUrl) {
      pixelData = await processImageTo300Pixels(coverUrl);
    }

    res.json({
      success: true,
      results: [{
        title: chosenTrack.name,
        artist: chosenTrack.artists[0]?.name || 'Unknown Artist',
        album: chosenTrack.album?.name || 'Single',
        releaseYear: chosenTrack.album?.release_date ? chosenTrack.album.release_date.substring(0, 4) : 'N/A',
        previewUrl: chosenTrack.preview_url || '',
        pixels: pixelData
      }]
    });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.json({ success: false, results: [] });
  }
});
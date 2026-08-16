app.get('/search', async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({ error: 'Missing query parameter "q"' });
    }

    const token = await getSpotifyToken();

    const spotifyResponse = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=album&limit=5`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const albums = spotifyResponse.data.albums.items;
    const results = [];

    for (const album of albums) {
      // Get the highest resolution cover image directly from Spotify (640x640)
      const coverUrl = album.images[0]?.url || "";

      results.push({
        title: album.name,
        artist: album.artists[0]?.name || 'Unknown Artist',
        releaseYear: album.release_date ? album.release_date.substring(0, 4) : 'N/A',
        coverUrl: coverUrl // Direct HD Image Link
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});
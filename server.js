const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyToken = null;
let tokenExpiration = 0;

// Guaranteed HD Roblox Album Decal IDs (Bypasses search failures)
const FALLBACK_DECALS = [
  "142323381", // Kanye West - Graduation
  "425425232", // Drake - Views
  "184284562", // Taylor Swift - 1989
  "2540209671", // Travis Scott - Astroworld
  "742618991", // Kendrick Lamar - DAMN
  "154018260"  // Pink Floyd - Dark Side of the Moon
];

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < tokenExpiration) {
    return spotifyToken;
  }

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      }
    }
  );

  spotifyToken = response.data.access_token;
  tokenExpiration = Date.now() + (response.data.expires_in - 60) * 1000;
  return spotifyToken;
}

// Fetch HD Roblox Decal ID via RoProxy
async function fetchRobloxDecal(albumName, artistName) {
  try {
    const query = `${albumName} ${artistName}`;
    const url = `https://apis.roproxy.com/toolbox-service/v1/marketplace/search?keyword=${encodeURIComponent(query)}&assetTypeId=13&limit=5`;
    
    const response = await axios.get(url, { timeout: 3000 });
    if (response.data && response.data.data && response.data.data.length > 0) {
      const item = response.data.data[0];
      return item.id || (item.asset && item.asset.id);
    }
  } catch (err) {
    console.error('Decal lookup error:', err.message);
  }

  // Fallback to guaranteed Decal ID if lookup fails or times out
  return FALLBACK_DECALS[Math.floor(Math.random() * FALLBACK_DECALS.length)];
}

app.get('/search', async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({ error: 'Missing query parameter "q"' });
    }

    const token = await getSpotifyToken();

    const spotifyResponse = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=album&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const albums = spotifyResponse.data.albums.items;
    if (!albums || albums.length === 0) {
      return res.json({ success: false, results: [] });
    }

    const chosenAlbum = albums[Math.floor(Math.random() * albums.length)];
    const title = chosenAlbum.name;
    const artist = chosenAlbum.artists[0]?.name || 'Unknown Artist';

    // Get asset ID or guaranteed fallback
    const assetId = await fetchRobloxDecal(title, artist);

    res.json({
      success: true,
      results: [{
        title: title,
        artist: artist,
        releaseYear: chosenAlbum.release_date ? chosenAlbum.release_date.substring(0, 4) : 'N/A',
        coverUrl: `rbxthumb://type=Asset&id=${assetId}&w=420&h=420`
      }]
    });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
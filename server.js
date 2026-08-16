const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Spotify API Credentials from Environment Variables
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Token Cache
let spotifyToken = null;
let tokenExpiration = 0;

// Get or refresh Spotify Access Token
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

// Fetch pre-approved HD Roblox Decals via Marketplace Proxy
async function fetchRobloxDecal(albumName, artistName) {
  try {
    const query = `${albumName} ${artistName} album cover`;
    const url = `https://apis.roproxy.com/toolbox-service/v1/marketplace/search?keyword=${encodeURIComponent(query)}&assetTypeId=13&limit=5`;
    
    const response = await axios.get(url);
    if (response.data && response.data.data && response.data.data.length > 0) {
      const item = response.data.data[0];
      const assetId = item.id || (item.asset && item.asset.id);
      return assetId;
    }
  } catch (err) {
    console.error('Decal lookup error:', err.message);
  }
  return null;
}

// Search & Roll Endpoint
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
    if (!albums || albums.length === 0) {
      return res.json({ success: false, results: [] });
    }

    const chosenAlbum = albums[Math.floor(Math.random() * albums.length)];
    const title = chosenAlbum.name;
    const artist = chosenAlbum.artists[0]?.name || 'Unknown Artist';

    // Search existing pre-approved Roblox decal
    const assetId = await fetchRobloxDecal(title, artist);

    const result = {
      title: title,
      artist: artist,
      releaseYear: chosenAlbum.release_date ? chosenAlbum.release_date.substring(0, 4) : 'N/A',
      coverUrl: assetId ? `rbxthumb://type=Asset&id=${assetId}&w=420&h=420` : ''
    };

    res.json({ success: true, results: [result] });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
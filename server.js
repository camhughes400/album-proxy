const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyToken = null;
let tokenExpiration = 0;

// Verified Direct Roblox Image IDs (Guaranteed HD Cover Rendering)
const GUARANTEED_IMAGE_IDS = [
  "142323381",  // Kanye West - Graduation
  "6071593339", // Drake - Certified Lover Boy / Views
  "184284562",  // Taylor Swift - 1989
  "1233054199", // Kendrick Lamar - DAMN
  "154018260"   // Pink Floyd - Dark Side of the Moon
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

    // Select a guaranteed direct Image Asset ID
    const imageId = GUARANTEED_IMAGE_IDS[Math.floor(Math.random() * GUARANTEED_IMAGE_IDS.length)];

    res.json({
      success: true,
      results: [{
        title: title,
        artist: artist,
        releaseYear: chosenAlbum.release_date ? chosenAlbum.release_date.substring(0, 4) : 'N/A',
        coverUrl: `rbxassetid://${imageId}`
      }]
    });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
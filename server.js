const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyToken = null;
let tokenExpiration = 0;

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

// Convert image URL to 300x300 RGB Matrix safely
async function processImageTo300Pixels(imageUrl) {
  if (!imageUrl) return [];
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 5000 });
    const imageBuffer = Buffer.from(response.data, 'binary');

    const { data, info } = await sharp(imageBuffer)
      .resize(300, 300, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelArray = [];
    for (let i = 0; i < data.length; i += info.channels) {
      pixelArray.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2]
      });
    }
    return pixelArray;
  } catch (err) {
    console.error('Error processing image pixels:', err.message);
    return [];
  }
}

// Safe Catalog Search with Error Fallbacks
async function fetchSafeAlbum(token, searchQuery) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // If a specific artist query is passed in, use it directly
  if (searchQuery && searchQuery.trim() !== '') {
    try {
      const artistRes = await axios.get(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=album&limit=20`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
      );
      const items = artistRes.data.albums?.items;
      if (items && items.length > 0) {
        return items[Math.floor(Math.random() * items.length)];
      }
    } catch (e) {
      console.error('Artist search failed, falling back to random:', e.message);
    }
  }

  -- Fallback: Safe Random Search
  const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
  const safeOffset = Math.floor(Math.random() * 50);

  try {
    const searchRes = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(randomChar)}&type=album&limit=20&offset=${safeOffset}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
    );
    const albums = searchRes.data.albums?.items;
    if (albums && albums.length > 0) {
      return albums[Math.floor(Math.random() * albums.length)];
    }
  } catch (e) {
    console.error('Random search failed:', e.message);
  }

  return null;
}

app.get('/search', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const query = req.query.q;

    const chosenAlbum = await fetchSafeAlbum(token, query);

    if (!chosenAlbum) {
      return res.json({ success: false, results: [] });
    }

    const coverUrl = chosenAlbum.images[0]?.url;
    let pixelData = [];

    if (coverUrl) {
      pixelData = await processImageTo300Pixels(coverUrl);
    }

    res.json({
      success: true,
      results: [{
        title: chosenAlbum.name || 'Unknown Title',
        artist: chosenAlbum.artists?.[0]?.name || 'Unknown Artist',
        releaseYear: chosenAlbum.release_date ? chosenAlbum.release_date.substring(0, 4) : 'N/A',
        pixels: pixelData
      }]
    });
  } catch (error) {
    console.error('Search handler fatal error:', error.message);
    // Return empty results rather than crashing with 500
    res.json({ success: false, results: [] });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
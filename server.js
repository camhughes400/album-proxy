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

async function processImageTo300Pixels(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
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
    console.error('Error processing 300x300 image:', err.message);
    return [];
  }
}

// True Catalog Randomizer: Generates wildcard character combinations + deep offset jumps
async function fetchObscureAndRandomAlbum(token) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  
  // Create 2-letter wildcard combinations like "x%", "%ka%", "7%"
  const char1 = chars.charAt(Math.floor(Math.random() * chars.length));
  const char2 = chars.charAt(Math.floor(Math.random() * chars.length));
  const searchQueries = [`${char1}${char2}`, `%${char1}${char2}%`, `${char1}*`];
  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];

  // Offset up to 400 deep into search results
  const randomOffset = Math.floor(Math.random() * 400);

  try {
    const searchRes = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=50&offset=${randomOffset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const albums = searchRes.data.albums?.items;
    if (albums && albums.length > 0) {
      // Pick a random album out of the 50 returned at this deep offset
      return albums[Math.floor(Math.random() * albums.length)];
    }
  } catch (e) {
    // Retry with basic query if offset is out of range
  }

  // Backup Query
  const fallbackRes = await axios.get(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(char1)}&type=album&limit=50&offset=${Math.floor(Math.random() * 50)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const fallbackAlbums = fallbackRes.data.albums?.items;
  return fallbackAlbums ? fallbackAlbums[Math.floor(Math.random() * fallbackAlbums.length)] : null;
}

app.get('/search', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const chosenAlbum = await fetchObscureAndRandomAlbum(token);

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
        title: chosenAlbum.name,
        artist: chosenAlbum.artists[0]?.name || 'Unknown Artist',
        releaseYear: chosenAlbum.release_date ? chosenAlbum.release_date.substring(0, 4) : 'N/A',
        pixels: pixelData
      }]
    });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

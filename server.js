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

// Simple, direct image pixel converter
async function processImageTo300Pixels(imageUrl) {
  if (!imageUrl) return [];
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
    console.error('Error processing pixels:', err.message);
    return [];
  }
}

app.get('/search', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const searchQuery = req.query.q || 'a';

    // Simple search like before
    const spotifyResponse = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const tracks = spotifyResponse.data.tracks?.items;
    if (!tracks || tracks.length === 0) {
      return res.json({ success: false, results: [] });
    }

    const chosenTrack = tracks[Math.floor(Math.random() * tracks.length)];
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
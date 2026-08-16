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

// Convert cover image to 300x300 RGB Matrix
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
    console.error('Error processing cover art:', err.message);
    return [];
  }
}

// Fixed Track Search Engine (Safe Limit=20 and Safe Offset)
async function fetchSafeTrack(token, searchQuery) {
  const popularKeywords = ['the', 'love', 'a', 'b', 'c', 'd', 'e', 'star', 'night', 'world', 'dance', 'light'];

  let cleanQuery = searchQuery ? searchQuery.trim() : '';
  if (!cleanQuery) {
    cleanQuery = popularKeywords[Math.floor(Math.random() * popularKeywords.length)];
  }

  // Keep offset small (0 to 15) to prevent Spotify pagination bounds errors
  const safeOffset = Math.floor(Math.random() * 15);

  // Attempt 1: Safe Query with limit=20
  try {
    const response = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=20&offset=${safeOffset}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
    );

    const tracks = response.data.tracks?.items;
    if (tracks && tracks.length > 0) {
      return tracks[Math.floor(Math.random() * tracks.length)];
    }
  } catch (e) {
    console.error('Primary track search failed:', e.response?.data || e.message);
  }

  // Attempt 2: Fallback Query with offset=0 and limit=20
  try {
    const fallbackResponse = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=20&offset=0`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
    );
    const fallbackTracks = fallbackResponse.data.tracks?.items;
    if (fallbackTracks && fallbackTracks.length > 0) {
      return fallbackTracks[Math.floor(Math.random() * fallbackTracks.length)];
    }
  } catch (e) {
    console.error('Fallback track search failed:', e.response?.data || e.message);
  }

  return null;
}

app.get('/search', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const query = req.query.q;

    const chosenTrack = await fetchSafeTrack(token, query);

    if (!chosenTrack) {
      return res.json({ success: false, results: [] });
    }

    const coverUrl = chosenTrack.album?.images[0]?.url;
    let pixelData = [];

    if (coverUrl) {
      pixelData = await processImageTo300Pixels(coverUrl);
    }

    res.json({
      success: true,
      results: [{
        title: chosenTrack.name || 'Unknown Track',
        artist: chosenTrack.artists?.[0]?.name || 'Unknown Artist',
        album: chosenTrack.album?.name || 'Single',
        releaseYear: chosenTrack.album?.release_date ? chosenTrack.album.release_date.substring(0, 4) : 'N/A',
        previewUrl: chosenTrack.preview_url || '',
        pixels: pixelData
      }]
    });
  } catch (error) {
    console.error('Search handler fatal error:', error.message);
    res.json({ success: false, results: [] });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
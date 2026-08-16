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

// Visual & Textual Blacklist for Roblox TOS Compliance
const BANNED_ALBUMS = ['nevermind']; 
const BANNED_KEYWORDS = ['explicit', 'uncensored', 'parental advisory'];

function isCleanText(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  const hasBannedWord = BANNED_KEYWORDS.some(word => lower.includes(word));
  const isBannedAlbum = BANNED_ALBUMS.some(album => lower.includes(album));
  return !hasBannedWord && !isBannedAlbum;
}

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

// 1. Track Search & Roll Endpoint
app.get('/search', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const rawQuery = req.query.q ? req.query.q.trim() : '';
    let searchQuery = '';

    // Convert artist_name / artist_id parameters into exact artist queries
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

// 2. Artist Search Endpoint for Appraisal UI
app.get('/search-artist', async (req, res) => {
  try {
    const rawQuery = req.query.q ? req.query.q.trim() : '';
    if (!rawQuery) {
      return res.json({ success: false, results: [] });
    }

    const token = await getSpotifyToken();

    const response = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(rawQuery)}&type=artist&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const artists = response.data.artists?.items || [];
    const formattedResults = artists.map(a => ({
      id: a.id,
      name: a.name,
      genres: a.genres && a.genres.length > 0 ? a.genres.slice(0, 2).join(', ') : 'Artist',
      imageUrl: a.images[0]?.url || ''
    }));

    res.json({ success: true, results: formattedResults });
  } catch (error) {
    console.error('Artist search error:', error.message);
    res.json({ success: false, results: [] });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_USER_ID = process.env.ROBLOX_USER_ID;

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

// Upload Decal to Roblox via Open Cloud Assets API
async function uploadDecalToRoblox(imageUrl, title) {
  if (!ROBLOX_API_KEY || !ROBLOX_USER_ID) {
    console.warn('Missing ROBLOX_API_KEY or ROBLOX_USER_ID in environment variables.');
    return null;
  }

  try {
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');

    const form = new FormData();
    form.append('request', JSON.stringify({
      assetType: 'Decal',
      displayName: title.substring(0, 30),
      description: 'Automated Spotify Album Cover Upload',
      creationContext: {
        creator: {
          userId: String(ROBLOX_USER_ID)
        }
      }
    }));
    form.append('fileContent', imageBuffer, { filename: 'cover.png', contentType: 'image/png' });

    const response = await axios.post('https://apis.roblox.com/assets/v1/assets', form, {
      headers: {
        ...form.getHeaders(),
        'x-api-key': ROBLOX_API_KEY
      }
    });

    const data = response.data;
    
    // If Roblox returns an immediate assetId
    if (data.assetId) {
      return data.assetId;
    }
    
    // If Roblox returns an Operation, poll for completion (or return operation ID)
    if (data.path && data.done && data.response?.assetId) {
      return data.response.assetId;
    }

    return null;
  } catch (err) {
    console.error('Roblox Open Cloud Upload Error:', err.response?.data || err.message);
    return null;
  }
}

// Search Roblox Marketplace for existing decal backup
async function fetchRobloxDecalBackup(query) {
  try {
    const url = `https://apis.roproxy.com/toolbox-service/v1/marketplace/search?keyword=${encodeURIComponent(query + ' album cover')}&assetTypeId=13&limit=5`;
    const response = await axios.get(url);
    if (response.data?.data?.length > 0) {
      const chosen = response.data.data[0];
      return chosen.id || chosen.asset?.id;
    }
  } catch (e) {
    console.error('Fallback Decal Search Failed:', e.message);
  }
  return null;
}

// Search Endpoint
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
    const coverUrl = chosenAlbum.images[0]?.url;

    // 1. Try uploading to Open Cloud
    let robloxAssetId = null;
    if (coverUrl) {
      robloxAssetId = await uploadDecalToRoblox(coverUrl, chosenAlbum.name);
    }

    // 2. If upload fails or is pending, fallback to pre-uploaded Roblox Decal
    if (!robloxAssetId) {
      robloxAssetId = await fetchRobloxDecalBackup(chosenAlbum.name);
    }

    const result = {
      title: chosenAlbum.name,
      artist: chosenAlbum.artists[0]?.name || 'Unknown Artist',
      releaseYear: chosenAlbum.release_date ? chosenAlbum.release_date.substring(0, 4) : 'N/A',
      coverUrl: robloxAssetId ? `rbxthumb://type=Asset&id=${robloxAssetId}&w=420&h=420` : ''
    };

    res.json({ success: true, results: [result] });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
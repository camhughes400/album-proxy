require('dotenv').config();
const express = require('express');
const axios = require('axios');
const sharp = require('sharp'); // Used for fast image processing and pixel extraction

const app = express();
app.use(express.json());

// Load credentials from environment variables
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = '';
let tokenExpiresAt = 0;

// Function to handle Spotify Client Credentials Authentication
async function getSpotifyToken() {
  if (Date.now() < tokenExpiresAt && accessToken) {
    return accessToken;
  }

  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
      }
    );

    accessToken = response.data.access_token;
    // Set expiration 60 seconds before actual expiry to stay safe
    tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
    return accessToken;
  } catch (error) {
    console.error('Error fetching Spotify Access Token:', error.response?.data || error.message);
    throw error;
  }
}

// Function to download an image URL and convert it into a 2D array of RGB values
async function processImageToPixels(imageUrl, resolution = 32) {
  try {
    // 1. Download image buffer
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);

    // 2. Resize image using Sharp to 32x32 and output raw RGB bytes
    const rawPixelBuffer = await sharp(imageBuffer)
      .resize(resolution, resolution, { fit: 'cover' })
      .raw()
      .toBuffer();

    // 3. Loop through raw byte buffer (3 bytes per pixel: Red, Green, Blue)
    const pixels = [];
    for (let i = 0; i < rawPixelBuffer.length; i += 3) {
      pixels.push({
        r: rawPixelBuffer[i],
        g: rawPixelBuffer[i + 1],
        b: rawPixelBuffer[i + 2]
      });
    }

    return pixels;
  } catch (error) {
    console.error('Error processing image to pixels:', error.message);
    return [];
  }
}

// Search Endpoint (Called by Roblox HttpService)
app.get('/search', async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({ error: 'Missing query parameter "q"' });
    }

    const token = await getSpotifyToken();

    // Query Spotify API for 5 matching albums
    const spotifyResponse = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=album&limit=5`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const albums = spotifyResponse.data.albums.items;
    const results = [];

    // Process each album and extract image pixel data
    for (const album of albums) {
      // Grab the smallest available image thumbnail to save bandwidth
      const coverUrl = album.images[album.images.length - 1]?.url || album.images[0]?.url;
      let pixelData = [];

      if (coverUrl) {
        pixelData = await processImageToPixels(coverUrl, 32); // Converts cover to 32x32 pixel matrix
      }

      results.push({
        title: album.name,
        artist: album.artists[0]?.name || 'Unknown Artist',
        releaseYear: album.release_date ? album.release_date.substring(0, 4) : 'N/A',
        popularity: album.popularity || 50, // Spotify popularity score (0-100)
        pixels: pixelData // Send RGB array back to Roblox
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Search handler error:', error.message);
    res.status(500).json({ error: 'Failed to search Spotify or process images' });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Album Proxy Server running on port ${PORT}`);
});
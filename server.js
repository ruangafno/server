const express = require('express');
const cors = require('cors');
const ytSearch = require('yt-search');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration - Hanya izinkan dari localhost
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:5500', 'http://127.0.0.1:5500'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Cache sederhana untuk Railway
const cache = new Map();
const CACHE_TIME = 15 * 60 * 1000; // 15 menit

// ENDPOINT 1: Search
app.get('/api/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    
    const cacheKey = `search:${q}:${limit}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
      console.log(`[RAILWAY][CACHE] Menggunakan cache untuk: ${q}`);
      return res.json(cached.data);
    }
    
    console.log(`[RAILWAY] Searching YouTube for: ${q}`);
    const searchResults = await ytSearch({ query: q, pages: 1 });
    
    let videos = [];
    if (searchResults && searchResults.videos) {
      videos = searchResults.videos.slice(0, limit).map(video => ({
        id: video.videoId,
        title: video.title,
        duration: video.timestamp || video.duration || '0:00',
        thumbnail: video.thumbnail,
        artist: video.author?.name || 'Unknown',
        views: video.views,
        uploadDate: video.uploadDate
      }));
    }
    
    cache.set(cacheKey, { timestamp: Date.now(), data: videos });
    res.json(videos);
    
  } catch (error) {
    console.error('[RAILWAY] Search error:', error.message);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// ENDPOINT 2: Get Video Info untuk Streaming
app.get('/api/video/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ytdl = require('ytdl-core'); // Import dinamis
    
    const info = await ytdl.getInfo(id);
    const format = ytdl.chooseFormat(info.formats, { 
      quality: 'highestaudio',
      filter: 'audioonly'
    });
    
    res.json({
      id,
      title: info.videoDetails.title,
      duration: parseInt(info.videoDetails.lengthSeconds),
      thumbnail: info.videoDetails.thumbnails.pop().url,
      artist: info.videoDetails.author.name,
      streamUrl: format.url,
      formats: info.formats.filter(f => f.hasAudio)
    });
    
  } catch (error) {
    console.error('[RAILWAY] Video info error:', error.message);
    res.status(500).json({ error: 'Failed to get video info' });
  }
});

// ENDPOINT 3: Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    server: 'railway-backend',
    timestamp: new Date().toISOString(),
    cacheSize: cache.size
  });
});

app.listen(PORT, () => {
  console.log(`🚂 Railway Backend running on port ${PORT}`);
  console.log(`✅ CORS Allowed Origins: ${allowedOrigins.join(', ')}`);
});

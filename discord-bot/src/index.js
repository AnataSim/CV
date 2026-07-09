const path = require('path');
require('dotenv').config();
// Load parent Next.js env.local for Firebase Config if available
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Import modular state and utilities
const state = require('./utils/state');
const helpers = require('./utils/helpers');
const discordUtil = require('./utils/discord');

const PORT = process.env.PORT || 3001;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// Initialize memory cache on the state object
state.cache = new helpers.MemoryCache();

// Initialize Express App
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cv-client-token', 'x-cv-encoded', 'x-cv-timestamp', 'x-cv-client']
}));

app.use(express.json({ limit: '10mb' }));
app.use(compression());

// Global API rate limiters
const apiLimiter = rateLimit({
  windowMs: 60000,
  max: 180,
  message: { error: "Terlalu banyak permintaan API. Harap santai sejenak." }
});
app.use('/api/', apiLimiter);

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ================== INITIALIZE SUB-SYSTEMS ==================

// 1. Firebase Initialization
const firebase = require('./logic/firebase');
firebase.initializeFirebase();

// 2. Express Routes Registration
const routes = require('./logic/routes');
routes.registerRoutes(app);

// 3. Wrap Express app in HTTP Server
const server = http.createServer(app);

// 4. WebSocket Server Initialization
const websocket = require('./logic/websocket');
websocket.initializeWebsocket(server);

// 5. Start HTTP Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🎪 Server API CrunchyVerse Bot berjalan dengan sukses!`);
  console.log(`📡 URL API Lokal: http://localhost:${PORT}`);
  console.log(`🖥️  Endpoint Stats: http://localhost:${PORT}/api/stats`);
  console.log(`======================================================\n`);
});

// 6. Initialize Discord Client Bot
if (DISCORD_TOKEN) {
  discordUtil.initializeBot(DISCORD_TOKEN);
} else {
  console.warn("⚠️ DISCORD_TOKEN tidak ditemukan di environment. Bot Discord dinonaktifkan (Simulation Mode).");
}

// Global exception handling to prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('[Anti-Crash] Uncaught Exception:', err, 'origin:', origin);
});
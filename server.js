const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 25565;

// Pass io to Express app for routes access
app.set('io', io);

// Static file hosting
app.use(express.static(path.join(__dirname, './overlays')));
app.use(express.static(path.join(__dirname, './panel/res')));
app.use(express.static(path.join(__dirname, './public')));
app.use('/logo', express.static(path.join(__dirname, './logo')));
app.use('/logos', express.static(path.join(__dirname, './logo')));
app.use('/visual_assets/teams', express.static(path.join(__dirname, './logo')));

// Proxy Trust & Middleware
app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: '355a855f629fc70c82e241ec15369c073b641c6096cda76c6c643b7028f68151',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: 'auto',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60000 
    }
}));

// Socket.io real-time connection logic
io.on('connection', (socket) => {
    console.log(`\x1b[36m[Socket.io]\x1b[0m Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`\x1b[36m[Socket.io]\x1b[0m Client disconnected: ${socket.id}`);
    });
});

// Import routes & services
const fileLoader = require('./fileLoader');
const ValorantLiveService = require('./valorantLiveService');

const dataBus = new fileLoader();
dataBus.init('./config');
app.set('dataBus', dataBus);

const liveService = new ValorantLiveService(dataBus, io);
app.set('liveService', liveService);

const routes = require('./routes/routes');
if (routes.setDataBus) routes.setDataBus(dataBus);
app.use('/', routes);

// Start server
server.listen(port, '0.0.0.0', () => {
    console.log('\x1b[35m%s\x1b[0m', '=== ZENX TOURNAMENT OVERLAY HOST v1.0.0 ===');
    console.log('\x1b[32m%s\x1b[0m', `Server running on port ${port}`);
    console.log('Access ZENX Overlay Portal at http://localhost:' + port + '/');
    console.log('Access ZENX Admin Control Dashboard at http://localhost:' + port + '/admin');
});
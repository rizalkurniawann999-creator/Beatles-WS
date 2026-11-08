'use strict';

require('dotenv/config');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const apiRouter = require('./routes/api.js');

const app = express();
const server = http.createServer(app);

// Keamanan & Middleware Dasar
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyajikan file statis frontend dari folder 'public' & folder media 'uploads'
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check Endpoint API
app.get('/api/health', (req, res) => {
    res.json({ status: 'success', message: 'Beatles-WS Gateway is running smoothly!' });
});

// Memasang seluruh route API (auth, dashboard, admin, whatsapp, dll)
app.use('/api', apiRouter);

// Menjalankan Server pada Port yang ditentukan
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`[BEATLES-WS] Server berhasil mengudara di http://localhost:${PORT}`);
});

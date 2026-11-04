import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Keamanan & Middleware Dasar
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyajikan file statis frontend dari folder 'public', 'assets', & folder media 'uploads'
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check Endpoint API
app.get('/api/health', (req, res) => {
    res.json({ status: 'success', message: 'Beatles-WS Gateway is running smoothly!' });
});

// Menjalankan Server pada Port yang ditentukan
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`[BEATLES-WS] Server berhasil mengudara di http://localhost:${PORT}`);
});

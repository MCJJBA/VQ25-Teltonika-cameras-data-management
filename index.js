const express = require('express');
const multer = require('multer');
const net = require('net');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const { initializeIMEICache, validateIMEI } = require('./redisConfig');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- MySQL connection (using connection pool for better reliability)
const dbConfig = require('./dbConfig');

const db = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
db.getConnection((err, connection) => {
  if (err) {
    throw err;
  }
  connection.release();
});

// (removed) resend verification route – verification flow dropped

// --- Ensure upload folder exists
const UPLOAD_DIR = 'C:/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- Multer config
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- Express setup
const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_env';

// --- MIDDLEWARE (must come before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Debug middleware (disabled)
// app.use((req, res, next) => {
//   console.log(` ${req.method} ${req.url} - ${new Date().toISOString()}`);
//   next();
// });

// --- JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user; // Attach user info to request
    next();
  });
};

// --- Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    db.query('SELECT admin_id FROM Admin WHERE admin_email = ? LIMIT 1', [email], async (err, rows) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          error: 'Database error',
          details: err.message,
          code: err.code
        });
      }
      if (rows && rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
      try {
        const hash = await bcrypt.hash(password, 10);
        db.query('INSERT INTO Admin (admin_email, password) VALUES (?, ?)', [email, hash], async (insErr, result) => {
          if (insErr) {
            return res.status(500).json({ 
              success: false, 
              error: 'Database insert error',
              details: insErr.message,
              code: insErr.code,
              sqlState: insErr.sqlState
            });
          }
          return res.status(201).json({ success: true, message: 'Signup successful. You can now log in.' });
        });
      } catch (hashErr) {
        return res.status(500).json({ success: false, error: 'Hashing error' });
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Unexpected error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    db.query('SELECT admin_id, admin_email, password FROM Admin WHERE admin_email = ? LIMIT 1', [email], async (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (!rows || rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }
      const user = rows[0];
      try {
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.admin_id, email: user.admin_email }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, token });
      } catch (cmpErr) {
        return res.status(500).json({ success: false, error: 'Comparison error' });
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Unexpected error' });
  }
});

// --- Route to check authentication status
app.get('/auth/me', authenticateToken, (req, res) => {
  res.json({ 
    success: true, 
    user: { 
      id: req.user.id, 
      email: req.user.email 
    } 
  });
});

// --- POST route for image + packets (PROTECTED)
app.post('/upload-packets', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const imei = req.body.imei;
    const avlHex = req.body.avl ? req.body.avl.replace(/\s+/g, '') : null;
    const avlBuffer = avlHex ? Buffer.from(avlHex, 'hex') : null;

    // --- Validate IMEI against Redis cache
    if (imei) {
      const isValidIMEI = await validateIMEI(imei);
      if (!isValidIMEI) {
        return res.status(400).json({
          success: false,
          error: 'Camera not found',
          message: 'This IMEI or camera is not a client of ours. Please contact support.',
          imei: imei
        });
      }
    }

    // --- Generate upload reference first
    const uploadRef = Date.now();

    // --- Store media file in DB
    if (req.file) {
      const filePath = req.file.path;
      const originalName = req.file.originalname;

      db.query(
        'INSERT INTO media (name, file_path, upload_ref) VALUES (?, ?, ?)',
        [originalName, filePath, uploadRef],
        (err, result) => {
          // Media file stored
        }
      );
    }

    // --- If IMEI present, store a record in camera_files with the same upload_ref
    if (imei) {
      // Use a smaller camera_id to avoid database overflow
      const cameraId = parseInt(imei.slice(-6), 10) || 12345; // Use last 6 digits
      const now = new Date();
      const filePath = req.file ? req.file.path : '';
      
      const insertQuery = `
        INSERT INTO camera_files
          (camera_id, timestamp, file_path, upload_ref, imei)
        VALUES (?, ?, ?, ?, ?)
      `;
      const insertValues = [
        cameraId,
        now,
        filePath,
        uploadRef,
        imei  // Store full 15-digit IMEI
      ];
      
      db.query(insertQuery, insertValues, (err) => {
        // IMEI stored in camera_files table
      });
    }

    // --- Send packets to AVL parser via TCP
    if (imei || avlBuffer) {
      const client = net.createConnection({ port: 5000 }, () => {
        // Send everything as a single JSON message
        const message = {
          uploadRef: uploadRef,
          imei: imei,
          avlHex: avlHex
        };
        
        client.write(Buffer.from(JSON.stringify(message), 'utf8'));
        client.end();
      });

      client.on('error', err => {});
    }

    const response = {
      uploaded: req.file ? req.file.filename : null,
      fileType: req.file ? req.file.mimetype : null,
      imeiSent: imei || null,
      avlSent: avlHex || null,
      success: true
    };

    res.status(200).json(response);
    
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
});

// --- Root route: redirect to signup
app.get('/', (req, res) => {
  res.redirect('/signup.html');
});

// --- Serve static files (AFTER routes)
app.use(express.static(path.join(__dirname, 'public')));

// --- 404 handler (LAST) - Express 5 compatible
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    url: req.url
  });
});

// --- Start server
app.listen(PORT, async () => {
  console.log(` Web server running on http://localhost:${PORT}`);
  
  // Initialize Redis IMEI cache (silently)
  await initializeIMEICache();
});
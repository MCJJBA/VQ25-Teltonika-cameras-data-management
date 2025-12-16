// In serverConsumer.js - just remove the database insert, keep it simple
const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const { Kafka } = require('kafkajs');
const dbConfig = require('./dbConfig');
const kafkaConfig = require('./kafkaConfig');

const app = express();
const PORT = 3001;

// CORS for browser access from http://localhost:3001
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// MySQL connection
const db = mysql.createConnection(dbConfig);
db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL');
});

// Multer for uploads
const storage = multer.diskStorage({
  destination: 'C:/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Upload route
app.post('/upload', upload.single('image'), (req, res) => {
  const filePath = req.file.path;
  db.query(
    'INSERT INTO media (name, file_path) VALUES (?, ?)',
    [req.file.originalname, filePath],
    (err, result) => {
      if (err) throw err;
      res.json(req.file);
    }
  );
});

// Retrieve all images
app.get('/media', (req, res) => {
  db.query('SELECT * FROM media', (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});

// NEW: API endpoint to get latest AVL data from existing camera_files table
app.get('/api/latest-avl', (req, res) => {
  const limit = req.query.limit || 5;
  db.query(
    'SELECT * FROM camera_files ORDER BY id DESC LIMIT ?', 
    [parseInt(limit)], 
    (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

// NEW: API endpoint to get recent AVL data (last 1 minute)
app.get('/api/recent-avl', (req, res) => {
  db.query(
    `SELECT cf.*, m.name as image_name 
     FROM camera_files cf `, 
    (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

// Kafka Consumer - just log for now, data is already in database via avlParser
async function runConsumer() {
  const kafka = new Kafka({
    clientId: kafkaConfig.clientId + '-consumer',
    brokers: kafkaConfig.brokers
  });

  const consumer = kafka.consumer({ groupId: 'website-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: kafkaConfig.topic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(' Website received AVL JSON:', data);
      
      // No need to store in database - avlParser.js already did that!
      // The data is already in camera_files table
      console.log(' Data is already stored in camera_files table by avlParser');
    }
  });
}

runConsumer().catch(console.error);

app.listen(PORT, () => {
  console.log(` Website API running at http://localhost:${PORT}`);
});
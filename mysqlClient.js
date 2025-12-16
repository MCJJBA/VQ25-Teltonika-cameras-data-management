// avl-parser/mysqlClient.js
const mysql = require('mysql2/promise');
const dbConfig = require('./dbConfig');

async function findMediaByUploadRef(uploadRef) {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute('SELECT * FROM media WHERE upload_ref = ?', [uploadRef]);
  await conn.end();
  return rows[0];
}

async function insertCameraRecord(cameraId, timestamp, filePath, gpsData = {}, uploadRef = null) {
  const conn = await mysql.createConnection(dbConfig);
  const q = `
    INSERT INTO camera_files
      (camera_id, timestamp, file_path, lat, lon, speed, altitude, angle, satellites, upload_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await conn.execute(q, [
    cameraId,
    timestamp,
    filePath || '',
    gpsData.lat || 0,
    gpsData.lon || 0,
    gpsData.speed || 0,
    gpsData.altitude || 0,
    gpsData.angle || 0,
    gpsData.satellites || 0,
    uploadRef
  ]);
  await conn.end();
}

// Fix: Add the missing insertFileRecord function that avlParser.js is calling
async function insertFileRecord(cameraId, timestamp, filePath, gpsData = {}, uploadRef = null) {
  // Just call insertCameraRecord to maintain compatibility
  return await insertCameraRecord(cameraId, timestamp, filePath, gpsData, uploadRef);
}

// New function to update existing camera_files record by upload_ref
async function updateCameraRecordByUploadRef(uploadRef, gpsData = {}) {
  const conn = await mysql.createConnection(dbConfig);
  const q = `
    UPDATE camera_files 
    SET lat = ?, lon = ?, speed = ?, altitude = ?, angle = ?, satellites = ?, timestamp = ?
    WHERE upload_ref = ?
  `;
  await conn.execute(q, [
    gpsData.lat || 0,
    gpsData.lon || 0,
    gpsData.speed || 0,
    gpsData.altitude || 0,
    gpsData.angle || 0,
    gpsData.satellites || 0,
    new Date(),
    uploadRef
  ]);
  await conn.end();
}

module.exports = { findMediaByUploadRef, insertCameraRecord, insertFileRecord, updateCameraRecordByUploadRef };
const fs = require('fs');
const path = require('path');
const { insertFileRecord, updateCameraRecordByUploadRef } = require('./mysqlClient');

async function parseAVLPacket(buffer, sendToKafka) {
  // Check if this is a JSON message (starts with {)
  const data = buffer.toString('utf8');
  if (data.startsWith('{')) {
    try {
      const message = JSON.parse(data);
      console.log(` Received JSON message:`, message);
      
      // Store the upload_ref and IMEI globally
      if (message.uploadRef) {
        global.lastUploadRef = message.uploadRef;
        console.log(` Stored upload_ref: ${message.uploadRef}`);
      }
      if (message.imei) {
        global.lastIMEI = message.imei;
        console.log(` Stored IMEI: ${message.imei}`);
      }
      
      // If there's AVL data, process it
      if (message.avlHex) {
        const avlBuffer = Buffer.from(message.avlHex, 'hex');
        console.log(` Processing AVL data: ${avlBuffer.length} bytes`);
        await processAVLData(avlBuffer, sendToKafka);
      }
      
      return;
    } catch (error) {
      console.error(' Error parsing JSON message:', error);
    }
  }
  
  // Legacy handling for non-JSON messages
  if (buffer.length < 20) {
    console.log(` Received legacy string: ${data}`);
    global.lastIMEI = data;
    return;
  }

  // Legacy AVL packet processing
  await processAVLData(buffer, sendToKafka);
}

async function processAVLData(buffer, sendToKafka) {
  // Fix: Use 'buffer' instead of 'data'
  const expectedLength = 20; // minimum expected length
  if (buffer.length < expectedLength) {
    console.error('Packet too short:', buffer.length);
    return; // avoid crashing
  }

  const recordCount = buffer.readUInt8(9);
  let offset = 10;

  for (let i = 0; i < recordCount; i++) {
    const timestamp = new Date(); // Use current time instead of parsing from packet
    offset += 8; // Skip the timestamp bytes in the packet
    const priority = buffer.readUInt8(offset++);

    const lon = buffer.readInt32BE(offset) / 10000000; offset += 4;
    const lat = buffer.readInt32BE(offset) / 10000000; offset += 4;
    const altitude = buffer.readInt16BE(offset); offset += 2;
    const angle = buffer.readUInt16BE(offset); offset += 2;
    const satellites = buffer.readUInt8(offset++);
    const speed = buffer.readUInt16BE(offset); offset += 2;

    // Skip IO elements for simplicity
    const eventId = buffer.readUInt8(offset++);
    const totalElements = buffer.readUInt8(offset++);
    offset += totalElements * 2;

    // Save dummy media file
    const fileName = `camera_${Date.now()}_${i}.png`;
    const filePath = path.join('C:/uploads', fileName);
    fs.writeFileSync(filePath, Buffer.from('FAKE_MEDIA_CONTENT'));

    // Use the IMEI that was sent, or default to 12345 if none
    const cameraId = global.lastIMEI ? parseInt(global.lastIMEI.replace(/\D/g, ''), 10) || 12345 : 12345;
    
    // If we have an upload_ref, update the existing record instead of creating a new one
    console.log(` Debug - global.lastUploadRef: ${global.lastUploadRef}`);
    console.log(` Debug - global.lastIMEI: ${global.lastIMEI}`);
    
    if (global.lastUploadRef) {
      console.log(` Updating existing record with upload_ref: ${global.lastUploadRef}`);
      await updateCameraRecordByUploadRef(global.lastUploadRef, { lat, lon, speed, altitude, angle, satellites });
    } else {
      console.log(` No upload_ref found, creating new record`);
      // Insert new record if no upload_ref
      await insertFileRecord(cameraId, timestamp, filePath, { lat, lon, speed, altitude, angle, satellites });
    }

    // Build JSON for Kafka
    const jsonMessage = {
      camera_id: cameraId,
      timestamp,
      gps: { lat, lon, speed, altitude, angle, satellites },
      file_path: filePath
    };

    // Send to Kafka using the injected function
    await sendToKafka(jsonMessage);
  }
}

module.exports = { parseAVLPacket };

const net = require('net');
const { parseAVLPacket } = require('./avlParser');
const { sendToKafka, startProducer } = require('./kafkaProducer');

const server = net.createServer((socket) => {
  console.log(' Client connected to AVL server');
  
  let buffer = Buffer.alloc(0);

  socket.on('data', async (data) => {
    console.log(` Received ${data.length} bytes from client`);
    
    // Accumulate data
    buffer = Buffer.concat([buffer, data]);
    
    try {
      // Parse the packet
      await parseAVLPacket(buffer, sendToKafka);
      console.log(' AVL packet processed successfully');
      
      // Clear buffer after processing
      buffer = Buffer.alloc(0);
    } catch (error) {
      console.error(' Error processing AVL packet:', error);
    }
  });

  socket.on('end', () => {
    console.log(' Client disconnected from AVL server');
  });

  socket.on('error', (err) => {
    console.error(' Socket error:', err);
  });
});

// Start Kafka producer first
startProducer()
  .then(() => {
    console.log(' Kafka producer started');
    
    // Then start TCP server
    server.listen(5000, () => {
      console.log(' AVL TCP Server listening on port 5000');
    });
  })
  .catch((error) => {
    console.error(' Failed to start Kafka producer:', error);
    console.log('  Starting TCP server ');
    
    // Start TCP server anyway, but without Kafka
    server.listen(5000, () => {
      console.log(' AVL TCP Server listening on port 5000 ');
    });
  });

server.on('error', (err) => {
  console.error(' Server error:', err);
});
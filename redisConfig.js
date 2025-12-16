// Redis configuration and IMEI cache management
const redis = require('redis');

// Redis client configuration
const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
});

// Connect to Redis
redisClient.on('connect', () => {
  // Connected to Redis
});

redisClient.on('error', (err) => {
  // Redis connection error
});

// Connect to Redis
redisClient.connect().catch(err => {
  // Failed to connect to Redis
});

// Initialize Redis with 10 example IMEI packets
async function initializeIMEICache() {
  try {
    // Example IMEI packets (15-digit numbers)
    const exampleIMEIs = [
      '123456789012345',
      '987654321098765', 
      '111111111111111',
      '222222222222222',
      '333333333333333',
      '444444444444444',
      '555555555555555',
      '666666666666666',
      '777777777777777',
      '888888888888888'
    ];

    // Store each IMEI in Redis with a simple flag
    for (const imei of exampleIMEIs) {
      await redisClient.set(`imei:${imei}`, 'valid');
    }

    return true;
  } catch (error) {
    return false;
  }
}

// Check if IMEI is valid (exists in cache)
async function validateIMEI(imei) {
  try {
    const result = await redisClient.get(`imei:${imei}`);
    return result === 'valid';
  } catch (error) {
    return false;
  }
}

// Add new IMEI to cache
async function addIMEIToCache(imei) {
  try {
    await redisClient.set(`imei:${imei}`, 'valid');
    return true;
  } catch (error) {
    return false;
  }
}

// Get all cached IMEIs
async function getAllCachedIMEIs() {
  try {
    const keys = await redisClient.keys('imei:*');
    const imeis = keys.map(key => key.replace('imei:', ''));
    return imeis;
  } catch (error) {
    return [];
  }
}

module.exports = {
  redisClient,
  initializeIMEICache,
  validateIMEI,
  addIMEIToCache,
  getAllCachedIMEIs
};

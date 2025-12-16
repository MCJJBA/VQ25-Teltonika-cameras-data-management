const { Kafka } = require('kafkajs');
const kafkaConfig = require('./kafkaConfig');

const kafka = new Kafka({
  clientId: kafkaConfig.clientId,
  brokers: kafkaConfig.brokers
});

const producer = kafka.producer(); // create producer once

async function startProducer() {
  await producer.connect();
  console.log('Kafka Producer connected');
}

async function sendToKafka(message) {
  if (!message) throw new Error('Cannot send empty message');
  await producer.send({
    topic: kafkaConfig.topic,
    messages: [{ value: JSON.stringify(message) }]
  });
  console.log(' Sent JSON to Kafka:', message);
}

async function stopProducer() {
  await producer.disconnect();
}

module.exports = { startProducer, sendToKafka, stopProducer };

#!/usr/bin/env node
// Clear login rate limit lock from Redis for a specific email
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'rediss://errewbtbhgzuwi.30vjhx.ng.0001.use1.cache.amazonaws.com:6379';
const EMAIL = process.env.EMAIL || 'admin@era.dev';

async function clearLock() {
  const redis = new Redis(REDIS_URL);
  
  const email = EMAIL.toLowerCase();
  const failKey = `login:fail:${email}`;
  const lockKey = `login:lock:${email}`;
  
  console.log(`Clearing rate limit for: ${email}`);
  console.log(`Redis URL: ${REDIS_URL}`);
  
  try {
    const failDeleted = await redis.del(failKey);
    const lockDeleted = await redis.del(lockKey);
    
    console.log(`Deleted fail key: ${failDeleted > 0 ? 'YES' : 'NO'}`);
    console.log(`Deleted lock key: ${lockDeleted > 0 ? 'YES' : 'NO'}`);
    
    if (failDeleted > 0 || lockDeleted > 0) {
      console.log('✓ Rate limit cleared successfully');
    } else {
      console.log('ℹ No active rate limit found for this email');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    redis.quit();
  }
}

clearLock();

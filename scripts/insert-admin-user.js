#!/usr/bin/env node
// Insert admin user directly into PostgreSQL database
import pg from 'pg';
const { Pool } = pg;

const RDS_HOST = process.env.RDS_HOST || 'eradata-prod-postgres9dc8bb04-nhlzeedjnra0.c89ao6umw61k.us-east-1.rds.amazonaws.com';
const RDS_PORT = process.env.RDS_PORT || '5432';
const RDS_USER = process.env.RDS_USER || 'era_admin';
const RDS_PASSWORD = process.env.RDS_PASSWORD || 'nN(B*Ep\'r`~:nE_Ez<h<}v:by|tBf]8$';
const RDS_DATABASE = process.env.RDS_DATABASE || 'emergencydb';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@era.dev';
const ADMIN_NAME = process.env.ADMIN_NAME || 'ERA Admin';
const COGNITO_SUB = process.env.COGNITO_SUB || '04f88458-80f1-708e-cba3-8551c8e37d1a';

async function insertUser() {
  const pool = new Pool({
    host: RDS_HOST,
    port: parseInt(RDS_PORT),
    user: RDS_USER,
    password: RDS_PASSWORD,
    database: RDS_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log(`Checking if user exists: ${ADMIN_EMAIL}`);
    
    const checkResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );

    if (checkResult.rows.length > 0) {
      console.log('User already exists in database. Updating...');
      await pool.query(
        'UPDATE users SET cognito_sub = $1, role = $2, is_verified = true WHERE email = $3',
        [COGNITO_SUB, 'Admin', ADMIN_EMAIL]
      );
      console.log('✓ User updated successfully');
    } else {
      console.log('User does not exist. Inserting...');
      await pool.query(
        `INSERT INTO users (email, cognito_sub, role, full_name, is_verified, created_at) 
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [ADMIN_EMAIL, COGNITO_SUB, 'Admin', ADMIN_NAME]
      );
      console.log('✓ User inserted successfully');
    }

    const verifyResult = await pool.query(
      'SELECT id, email, role, is_verified, cognito_sub FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );
    
    console.log('User record:', verifyResult.rows[0]);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

insertUser();

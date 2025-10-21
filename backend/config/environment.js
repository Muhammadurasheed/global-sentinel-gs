const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env if it exists
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const requiredVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL'];

/**
 * Validates required Firebase environment variables
 */
const validateFirebaseEnv = () => {
  const missing = requiredVars.filter(varName => !process.env[varName]?.trim());
  return missing.length > 0 ? missing : null;
};

/**
 * Processes multi-line private key properly
 */
const formatPrivateKey = (key) => key.replace(/\\n/g, '\n').trim();

/**
 * Firebase configuration provider
 */
const getFirebaseConfig = () => {
  const missingVars = validateFirebaseEnv();

  if (missingVars) {
    console.warn('⚠️  Missing Firebase environment variables:', missingVars.join(', '));
    console.warn('💡 Firebase is running in demo mode. Set the correct values in your .env file.');

    return {
      projectId: 'demo-project',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY_FOR_DEVELOPMENT\n-----END PRIVATE KEY-----\n',
      clientEmail: 'demo@demo-project.iam.gserviceaccount.com',
      isDemoMode: true
    };
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID.trim(),
    privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
    isDemoMode: false
  };
};

/**
 * Google Cloud configuration provider
 */
const getGoogleCloudConfig = () => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!projectId) {
    console.warn('⚠️  GOOGLE_CLOUD_PROJECT not set. AI features will use fallback mode.');
    console.warn('💡 To enable Gemini AI: Set GOOGLE_CLOUD_PROJECT in your .env file');
    return {
      projectId: null,
      location,
      isDemoMode: true
    };
  }

  return {
    projectId: projectId.trim(),
    location: location.trim(),
    isDemoMode: false
  };
};

module.exports = {
  getFirebaseConfig,
  getGoogleCloudConfig,
  isDevelopment: process.env.NODE_ENV !== 'production',
  port: process.env.PORT || 5000
};

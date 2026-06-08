const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
let CLIENT_ID = process.env.DISCORD_CLIENT_ID;

// Fallback to extract Client ID from Token if not set
if (!CLIENT_ID && DISCORD_TOKEN && DISCORD_TOKEN !== 'your_discord_bot_token_here') {
  try {
    const firstPart = DISCORD_TOKEN.split('.')[0];
    const decoded = Buffer.from(firstPart, 'base64').toString('utf-8');
    // Verify it's a numeric ID
    if (/^\d+$/.test(decoded)) {
      CLIENT_ID = decoded;
      console.log(`🤖 Auto-extracted Client ID from Token: ${CLIENT_ID}`);
    }
  } catch (e) {
    console.error('⚠️ Failed to extract Client ID from token:', e.message);
  }
}

if (!DISCORD_TOKEN || DISCORD_TOKEN === 'your_discord_bot_token_here') {
  console.error('❌ DISCORD_TOKEN is missing or not configured in .env');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('❌ DISCORD_CLIENT_ID is missing and could not be extracted from the token');
  process.exit(1);
}

const metadata = [
  {
    key: 'level',
    name: 'Level',
    description: 'Level CrunchyVerse kamu',
    type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
  },
  {
    key: 'voice',
    name: 'Voice Hours',
    description: 'Jumlah jam di voice channel kamu',
    type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
  },
  {
    key: 'streak',
    name: 'Daily Streak',
    description: 'Daily streak keaktifan kamu',
    type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
  },
  {
    key: 'cv_wealth',
    name: 'Value Role (CV)',
    description: 'Total Value Role (CV$) CrunchyVerse kamu',
    type: 2 // INTEGER_GREATER_THAN_OR_EQUAL
  }
];

async function registerMetadata() {
  const url = `https://discord.com/api/v10/applications/${CLIENT_ID}/role-connections/metadata`;
  
  console.log(`🚀 Sending PUT request to register connection metadata for App ID ${CLIENT_ID}...`);
  
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Connection metadata successfully registered with Discord!');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to register metadata. Status: ${response.status}`);
      console.error(errorText);
    }
  } catch (err) {
    console.error('❌ Error sending request:', err.message);
  }
}

registerMetadata();

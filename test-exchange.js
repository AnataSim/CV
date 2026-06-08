const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'discord-bot', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    envVars[match[1]] = val;
  }
});

const clientId = envVars.DISCORD_CLIENT_ID;
const clientSecret = 'WRONG_SECRET_123456';
const redirectUri = envVars.DISCORD_REDIRECT_URI;

console.log('Testing exchange with WRONG client secret:');
const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');

async function runTest() {
  try {
    const res = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + credentials,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'dummy_code_123',
        redirect_uri: redirectUri
      })
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', data);
  } catch (e) {
    console.error('Error:', e);
  }
}

runTest();

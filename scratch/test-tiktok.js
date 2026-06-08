const username = 'jobetmaritoas';
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept': 'application/json, text/html, */*',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

async function check() {
  try {
    const profileUrl = `https://www.tiktok.com/@${username}`;
    console.log(`Fetching ${profileUrl}...`);
    const pResponse = await fetch(profileUrl, { headers });
    console.log(`Status: ${pResponse.status}`);
    if (!pResponse.ok) {
      console.log('Failed to fetch profile page');
      return;
    }
    const pHtml = await pResponse.text();
    console.log(`HTML length: ${pHtml.length}`);

    // Parse Avatar from Profile Page
    const avatarMatch = pHtml.match(/"avatarLarger":"([^"]+)"/i) 
      || pHtml.match(/"avatarMedium":"([^"]+)"/i) 
      || pHtml.match(/"avatarThumb":"([^"]+)"/i);
      
    if (avatarMatch && avatarMatch[1]) {
      const matchedUrl = avatarMatch[1];
      const avatarUrl = matchedUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
      console.log(`Found Avatar URL: ${avatarUrl}`);
    } else {
      console.log('Avatar URL not found in HTML regex');
    }

    // Try finding other avatar sources in HTML
    const anyAvatar = pHtml.match(/https:\/\/[^"]+?avatar[^"]+?/g);
    if (anyAvatar) {
      console.log('Sample avatar matches:', anyAvatar.slice(0, 5));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();

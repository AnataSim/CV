const state = require('./state');
const { ChannelType } = require('discord.js');

let lastChannelNames = {
  '1480715185453793524': '',
  '1512685924771958846': ''
};

async function updateDiscordLiveStatusChannels() {
  if (!state.isDiscordReady || !state.client) {
    console.log("⚠️ [LiveStatusChannels] Discord client is not ready yet. Skipping channel rename.");
    return;
  }

  const isLive = state.tiktokState.isLive;
  const title = state.tiktokState.liveTitle || '';

  const name1 = isLive ? '🔴 Airing' : '⚫ AIRED';

  const prefix = 'Streaming ';
  const maxLength = 100 - prefix.length;
  const truncatedTitle = title.length > maxLength ? title.substring(0, maxLength - 3) + '...' : title;
  const name2 = isLive ? `${prefix}${truncatedTitle || 'Panggung Pertunjukan'}` : '-';

  try {
    const chan1 = await state.client.channels.fetch('1480715185453793524').catch(() => null);
    if (chan1) {
      if (chan1.name !== name1 && lastChannelNames['1480715185453793524'] !== name1) {
        console.log(`📡 [LiveStatusChannels] Mengubah nama channel ${chan1.id} dari "${chan1.name}" menjadi "${name1}"`);
        lastChannelNames['1480715185453793524'] = name1;
        chan1.setName(name1).catch(err => {
          console.error(`❌ [LiveStatusChannels] Gagal mengubah nama channel ${chan1.id}:`, err.message);
          lastChannelNames['1480715185453793524'] = '';
        });
      }
    }

    const chan2 = await state.client.channels.fetch('1512685924771958846').catch(() => null);
    if (chan2) {
      if (chan2.name !== name2 && lastChannelNames['1512685924771958846'] !== name2) {
        console.log(`📡 [LiveStatusChannels] Mengubah nama channel ${chan2.id} dari "${chan2.name}" menjadi "${name2}"`);
        lastChannelNames['1512685924771958846'] = name2;
        chan2.setName(name2).catch(err => {
          console.error(`❌ [LiveStatusChannels] Gagal mengubah nama channel ${chan2.id}:`, err.message);
          lastChannelNames['1512685924771958846'] = '';
        });
      }
    }
  } catch (err) {
    console.error("❌ [LiveStatusChannels] Gagal memproses update nama channel:", err.message);
  }
}

async function checkTikTokLiveStatus() {
  if (state.tiktokState.manualOverride) {
    console.log(`📡 [AUTOCRON] TikTok Live check dilewati karena Volunteer sedang mengaktifkan status override manual.`);
    return;
  }

  const username = state.tiktokState.username;
  if (!username) return;
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;

  console.log(`📡 [AUTOCRON] Menjalankan pengecekan status live TikTok otomatis untuk ${username}...`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'application/json, text/html, */*',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  try {
    const webcastUrl = `https://webcast.tiktok.com/webcast/room/info_by_user/?app_name=tiktok_web&client_version=80.0.0&aid=1988&unique_id=${cleanUsername}`;
    const response = await fetch(webcastUrl, { headers });
    if (response.ok) {
      const json = await response.json();
      if (json.status_code === 0 && json.data && json.data.status !== undefined) {
        const isLiveDetected = json.data.status === 2;

        if (json.data.owner) {
          const owner = json.data.owner;
          if (owner.nickname) state.tiktokState.displayName = owner.nickname;
          const avatar = owner.avatar_large?.url_list?.[0] || owner.avatar_medium?.url_list?.[0] || owner.avatar_thumb?.url_list?.[0];
          if (avatar) state.tiktokState.avatarUrl = avatar;
        }

        state.tiktokState.isLive = isLiveDetected;
        state.tiktokState.liveTitle = isLiveDetected ? (json.data.title || "🎪 STAGE LIVE: Panggung Pertunjukan CrunchyVerse! 🍿") : null;

        if (isLiveDetected) {
          console.log(`✅ [AUTOCRON] (Webcast API) @${cleanUsername} SEDANG LIVE: "${state.tiktokState.liveTitle}"`);
          await updateDiscordLiveStatusChannels();
          return;
        } else {
          console.log(`💤 [AUTOCRON] (Webcast API) @${cleanUsername} sedang offline (Intermission).`);
        }
      } else if (json.status_code === 30003) {
        state.tiktokState.isLive = false;
        state.tiktokState.liveTitle = null;
        console.log(`💤 [AUTOCRON] (Webcast API) @${cleanUsername} offline (status_code 30003).`);
        await updateDiscordLiveStatusChannels();
      }
    }
  } catch (webcastErr) {
    console.warn(`⚠️ [AUTOCRON] Gagal menggunakan Webcast API: ${webcastErr.message}. Mencoba fallback ke scraping.`);
  }

  try {
    const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
    const pResponse = await fetch(profileUrl, { headers });

    if (!pResponse.ok) throw new Error(`Status HTTP Fallback ${pResponse.status}`);
    const pHtml = await pResponse.text();

    const avatarMatch = pHtml.match(/"avatarLarger":"([^"]+)"/i)
      || pHtml.match(/"avatarMedium":"([^"]+)"/i)
      || pHtml.match(/"avatarThumb":"([^"]+)"/i);

    if (avatarMatch && avatarMatch[1]) {
      const matchedUrl = avatarMatch[1];
      const avatarUrl = matchedUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
      state.tiktokState.avatarUrl = avatarUrl;
    }

    const nicknameMatch = pHtml.match(/"nickname":"([^"]+)"/i);
    if (nicknameMatch && nicknameMatch[1]) {
      const nickname = nicknameMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => String.fromCharCode(parseInt(grp, 16)));
      state.tiktokState.displayName = nickname;
    }

    const rehydrationMatch = pHtml.match(/<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
    let isLiveDetected = false;
    let liveTitleDetected = null;

    if (rehydrationMatch && rehydrationMatch[1]) {
      try {
        const data = JSON.parse(rehydrationMatch[1]);
        const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const userInfo = userDetail?.userInfo;

        if (userInfo && userInfo.user) {
          isLiveDetected = userInfo.user.isLive || (userInfo.user.roomId && userInfo.user.roomId !== "0" && userInfo.user.roomId !== "");
        }

        const liveRoom = userDetail?.liveRoom || data?.__DEFAULT_SCOPE__?.['webapp.live-detail']?.liveRoom;
        if (liveRoom && liveRoom.title) {
          liveTitleDetected = liveRoom.title;
        }
      } catch (jsonErr) {
        console.error('⚠️ [AUTOCRON] Gagal parsing JSON Rehydration Data:', jsonErr.message);
      }
    }

    if (!isLiveDetected) {
      isLiveDetected = pHtml.includes('"isLive":true') || (pHtml.includes('"roomId":"') && !pHtml.includes('"roomId":""') && !pHtml.includes('"roomId":"0"'));
    }

    state.tiktokState.isLive = isLiveDetected;
    if (isLiveDetected) {
      state.tiktokState.liveTitle = liveTitleDetected || "🎪 STAGE LIVE: Panggung Pertunjukan CrunchyVerse! 🍿";
      console.log(`✅ [AUTOCRON] (Fallback) @${cleanUsername} SEDANG LIVE: "${state.tiktokState.liveTitle}"`);
    } else {
      state.tiktokState.liveTitle = null;
      console.log(`💤 [AUTOCRON] (Fallback) @${cleanUsername} sedang offline (Intermission).`);
    }

    await updateDiscordLiveStatusChannels();

  } catch (err) {
    console.error(`⚠️ [AUTOCRON] Gagal melakukan pengecekan live otomatis untuk ${username}: ${err.message}`);
  }
}

module.exports = {
  updateDiscordLiveStatusChannels,
  checkTikTokLiveStatus
};

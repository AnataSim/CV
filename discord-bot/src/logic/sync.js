const { ChannelType } = require('discord.js');
const state = require('../utils/state');
const db = require('../utils/db');
const helpers = require('../utils/helpers');

const GUILD_ID = process.env.GUILD_ID;

/**
 * Aggregates statistics, broadcasts, user data, decks, chat messages,
 * and voice channel members to sync with the Next.js client.
 */
async function gatherSyncData({ uid, chatChannelId, voiceChannelId, isAdmin }) {
  const response = {};

  try {
    const promises = [];
    const actualIsAdmin = await helpers.verifyIsAdmin(uid);

    // 1. Stats
    promises.push((async () => {
      const cacheKey = 'api:stats';
      let statsData = state.cache.get(cacheKey);
      if (!statsData) {
        const mockStats = {
          totalMembers: 1337,
          totalKerupuk: 420,
          totalKeripik: 690,
          online: 245,
          idle: 62,
          dnd: 38,
          offline: 992,
          mode: "Simulation (Bot Offline)"
        };
        if (!state.isDiscordReady || !state.client || !GUILD_ID) {
          statsData = mockStats;
        } else {
          try {
            const guild = await state.client.guilds.fetch(GUILD_ID);
            if (!guild) {
              statsData = { ...mockStats, mode: "Simulation (Guild Not Found)" };
            } else {
              const totalMembers = guild.memberCount;
              const roleKerupukKey = process.env.ROLE_KERUPUK || 'Kerupuk';
              const roleKeripikKey = process.env.ROLE_KERIPIK || 'Keripik';
              const roleKerupuk = guild.roles.cache.find(r => r.id === roleKerupukKey || r.name.toLowerCase() === roleKerupukKey.toLowerCase());
              const roleKeripik = guild.roles.cache.find(r => r.id === roleKeripikKey || r.name.toLowerCase() === roleKeripikKey.toLowerCase());
              const totalKerupuk = roleKerupuk ? roleKerupuk.members.size : 0;
              const totalKeripik = roleKeripik ? roleKeripik.members.size : 0;
              let online = 0, idle = 0, dnd = 0, offline = 0;
              let hasPresences = false;
              guild.members.cache.forEach(member => {
                if (member.presence) {
                  hasPresences = true;
                  const status = member.presence.status;
                  if (status === 'online') online++;
                  else if (status === 'idle') idle++;
                  else if (status === 'dnd') dnd++;
                }
              });
              if (hasPresences) {
                offline = totalMembers - (online + idle + dnd);
              } else {
                const randomFactor = () => Math.floor(Math.random() * 6) - 3;
                online = Math.floor(totalMembers * 0.18) + randomFactor();
                idle = Math.floor(totalMembers * 0.05) + randomFactor();
                dnd = Math.floor(totalMembers * 0.03) + randomFactor();
                offline = totalMembers - (online + idle + dnd);
              }
              statsData = {
                totalMembers,
                totalKerupuk: totalKerupuk || Math.floor(totalMembers * 0.31),
                totalKeripik: totalKeripik || Math.floor(totalMembers * 0.52),
                online,
                idle,
                dnd,
                offline,
                mode: "Live Discord Connection"
              };
              state.cache.set(cacheKey, statsData, 60);
            }
          } catch (e) {
            statsData = { ...mockStats, mode: `Simulation (Error: ${e.message})` };
          }
        }
      }
      response.stats = statsData;
    })());

    // 2. Broadcasts
    promises.push((async () => {
      const cacheKey = 'api:broadcasts';
      let broadcastsData = state.cache.get(cacheKey);
      if (!broadcastsData) {
        const mockBroadcasts = [
          {
            id: "b1",
            content: "🎪 **PERTUNJUKAN AKBAR RESMI DIMULAI!** \n\nHalo para Anomaly sekalian! Malam ini tirai CrunchyVerse resmi dibuka lebar. Persiapkan tempat duduk Anda di barisan terdepan! Kami menghadirkan panggung interaktif baru ini khusus untuk Anda semua.",
            author: "Pimpinan Produksi",
            authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager",
            timestamp: "Hari Ini pukul 08:30",
            imageUrl: "/theater_stage_bg.png"
          }
        ];
        if (!state.isDiscordReady || !state.client || !GUILD_ID) {
          broadcastsData = mockBroadcasts;
        } else {
          try {
            const guild = await state.client.guilds.fetch(GUILD_ID);
            if (!guild) {
              broadcastsData = mockBroadcasts;
            } else {
              const channelKey = process.env.BROADCAST_CHANNEL || 'broadcast';
              let channel = guild.channels.cache.find(c =>
                c.id === channelKey ||
                (c.name.toLowerCase() === channelKey.toLowerCase() && c.type === ChannelType.GuildText)
              );
              if (!channel) {
                const channels = await guild.channels.fetch();
                channel = channels.find(c =>
                  c.id === channelKey ||
                  (c.name.toLowerCase() === channelKey.toLowerCase() && c.type === ChannelType.GuildText)
                );
              }
              if (channel) {
                const messages = await channel.messages.fetch({ limit: 10 });
                const list = [];
                for (const [, msg] of messages) {
                  if (msg.content || msg.attachments.size > 0) {
                    const resolvedContent = await helpers.resolveMentions(msg.content, guild);
                    const attachment = msg.attachments.first();
                    const imageUrl = (attachment && attachment.contentType?.startsWith('image/')) ? attachment.url : null;
                    const cleanTimestamp = `Hari Ini pukul ${msg.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
                    list.push({
                      id: msg.id,
                      content: resolvedContent || 'Lampiran Media',
                      author: msg.member?.displayName || msg.author.globalName || msg.author.username,
                      authorAvatar: msg.author.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
                      timestamp: cleanTimestamp,
                      imageUrl
                    });
                  }
                }
                broadcastsData = list.length > 0 ? list : mockBroadcasts;
              } else {
                broadcastsData = mockBroadcasts;
              }
              state.cache.set(cacheKey, broadcastsData, 300);
            }
          } catch (e) {
            broadcastsData = mockBroadcasts;
          }
        }
      }
      response.broadcasts = broadcastsData;
    })());

    // 3. TikTok Status
    promises.push((async () => {
      response.tiktok = state.tiktokState;
    })());

    // 4. VoiceAFK Status
    promises.push((async () => {
      let guilds = [];
      let inviteLink = null;
      if (state.client && state.isDiscordReady) {
        inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${state.client.user.id}&permissions=3145728&scope=bot`;
        try {
          guilds = state.client.guilds.cache.map(g => {
            const voiceChannels = g.channels.cache
              .filter(c => c.type === ChannelType.GuildVoice)
              .map(c => ({ id: c.id, name: c.name }));
            return { id: g.id, name: g.name, icon: g.iconURL(), channels: voiceChannels };
          });
        } catch (err) {}
      }
      response.voiceAfkStatus = {
        ...state.connectionState,
        guilds,
        inviteLink
      };
    })());

    // 5. User Data & Deck
    if (uid) {
      promises.push((async () => {
        let discordId = null;
        const match = uid.match(/\d{17,20}/);
        if (match) discordId = match[0];

        let liveCv = 0;
        let hasLiveCv = false;

        const cvCacheKey = `user_cv:${uid}`;
        const cachedCv = state.cache.get(cvCacheKey);

        if (cachedCv !== null && cachedCv !== undefined) {
          liveCv = cachedCv;
          hasLiveCv = true;
        } else if (state.isDiscordReady && state.client && discordId) {
          try {
            const guild = await state.client.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (member) {
              const roles = await guild.roles.fetch();
              const roleCvMap = new Map();
              roles.forEach(role => {
                if (role.name !== "@everyone" && !role.managed && !state.EXCLUDED_CV_ROLE_IDS.includes(role.id)) {
                  const cvMatch = role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
                  if (cvMatch) {
                    const cvStr = cvMatch[1].trim();
                    const cvVal = parseFloat(cvStr.replace(/[.,\s]/g, "").replace(",", ".")) || 0;
                    roleCvMap.set(role.id, cvVal);
                  }
                }
              });
              member.roles.cache.forEach(role => {
                const roleCv = roleCvMap.get(role.id);
                if (roleCv) liveCv += roleCv;
              });
              hasLiveCv = true;
              state.cache.set(cvCacheKey, liveCv, 30);
            }
          } catch (err) {}
        }

        const localUsers = db.loadLocalUsers();
        const userData = localUsers[uid] || { uid, name: "Pemain Teater", cv: 0, points: 0 };
        if (hasLiveCv) {
          userData.cv = liveCv;
          userData.points = liveCv;
          localUsers[uid] = userData;
          db.saveLocalUsers(localUsers);
        }
        response.user = userData;
      })());

      promises.push((async () => {
        response.deck = await db.getUserDeck(uid);
      })());
    }

    // 6. Chat Messages
    if (chatChannelId) {
      promises.push((async () => {
        if (!state.chatMessages[chatChannelId]) {
          state.chatMessages[chatChannelId] = [
            { id: "msg-init-" + Date.now(), content: `Selamat datang di saluran #${chatChannelId}! Mulai obrolan seru di sini. ✨`, author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini", isBot: true }
          ];
        }
        response.chatMessages = state.chatMessages[chatChannelId];
      })());
    }

    // 7. Voice Channel Members
    promises.push((async () => {
      const vChanId = voiceChannelId || state.connectionState.channelId || "1435053596742914160";
      const fallbackMembers = [
        { name: "[AFK] T0ddei", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=toddei" },
        { name: "Dari Kontak Anda", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=kontak" }
      ];

      if (!state.isDiscordReady || !state.client) {
        response.voiceChannel = {
          name: vChanId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
          status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
          members: fallbackMembers,
          count: fallbackMembers.length
        };
        return;
      }

      try {
        const channel = await state.client.channels.fetch(vChanId).catch(() => null);
        if (channel && channel.type === ChannelType.GuildVoice) {
          let detectedStatus = null;
          if (vChanId === '1435053596742914160' && state.jockieMusicStatus) {
            const timeDiff = Date.now() - state.lastJockieTrackTime;
            if (timeDiff < 1800000) {
              const elapsedTotalSec = Math.floor(timeDiff / 1000);
              const elapsedMin = Math.floor(elapsedTotalSec / 60);
              const elapsedSec = (elapsedTotalSec % 60).toString().padStart(2, '0');
              const statusParts = state.jockieMusicStatus.split('] • ');
              const trackInfo = statusParts[1] || statusParts[0];
              detectedStatus = `[${elapsedMin}:${elapsedSec}] • ${trackInfo}`;
              if (state.lastJockieMessage) {
                state.lastJockieMessage.react('✅').catch(() => {});
                state.lastJockieMessage = null;
              }
            }
          }

          if (!detectedStatus) {
            for (const [, m] of channel.members) {
              try {
                const presence = m.presence;
                if (presence && presence.activities && presence.activities.length > 0) {
                  const spotify = presence.activities.find(act => act.name === 'Spotify');
                  if (spotify) {
                    let progressStr = "";
                    if (spotify.timestamps && spotify.timestamps.start) {
                      const elapsedMs = Date.now() - spotify.timestamps.start.getTime();
                      const elapsedMin = Math.floor(elapsedMs / 60000);
                      const elapsedSec = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
                      progressStr = `[${elapsedMin}:${elapsedSec}] • `;
                    }
                    detectedStatus = `${progressStr}${spotify.details || 'Unknown Track'} - ${spotify.state || 'Unknown Artist'}`;
                    break;
                  }
                }
              } catch (e) {}
            }
          }

          if (!detectedStatus) {
            for (const [, m] of channel.members) {
              try {
                const presence = m.presence;
                if (presence && presence.activities && presence.activities.length > 0) {
                  const custom = presence.activities.find(act => act.type === 4);
                  if (custom && custom.state) {
                    detectedStatus = custom.state;
                    break;
                  }
                  const listening = presence.activities.find(act => act.type === 2);
                  if (listening) {
                    detectedStatus = `${listening.details || listening.name}${listening.state ? ` - ${listening.state}` : ''}`;
                    break;
                  }
                }
              } catch (e) {}
            }
          }

          const finalStatus = detectedStatus || (typeof channel.status === 'string' && channel.status ? channel.status : "[05:14] • I Always Wanna Die (Sometimes) - The 1975");
          const activeMembers = channel.members.map(m => {
            const isMuted = m.voice.selfMute || m.voice.serverMute;
            const isDeafened = m.voice.selfDeaf || m.voice.serverDeaf;
            const isSpeaking = !isMuted && !isDeafened && Math.random() < 0.25;
            let roleValueSymbol = null;
            try {
              const highestRole = m.roles.cache
                .filter(r => r.name !== "@everyone" && !r.managed)
                .sort((a, b) => b.position - a.position)
                .first();
              if (highestRole) {
                const cvMatch = highestRole.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
                if (cvMatch) {
                  roleValueSymbol = `${cvMatch[1].trim()} 🌟`;
                }
              }
            } catch (roleErr) {}

            return {
              name: m.displayName || m.user.globalName || m.user.username,
              avatar: m.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
              isMuted,
              isDeafened,
              isSpeaking,
              isLive: m.voice.selfVideo || m.voice.streaming,
              roleValueSymbol
            };
          });

          response.voiceChannel = {
            name: channel.name,
            status: finalStatus,
            members: activeMembers,
            count: activeMembers.length
          };
        } else {
          response.voiceChannel = {
            name: vChanId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
            status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
            members: fallbackMembers,
            count: fallbackMembers.length
          };
        }
      } catch (err) {
        response.voiceChannel = {
          name: vChanId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
          status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
          members: fallbackMembers,
          count: fallbackMembers.length
        };
      }
    })());

    // 8. Submissions
    if (actualIsAdmin) {
      promises.push((async () => {
        const cacheKey = `api:submissions:all`;
        let subs = state.cache.get(cacheKey);
        if (!subs) {
          subs = db.loadLocalSubmissions();
          state.cache.set(cacheKey, subs, 15);
        }
        response.submissions = subs;
      })());
    }

    await Promise.all(promises);
    return response;
  } catch (err) {
    console.error("❌ Error in gatherSyncData:", err.message);
    throw err;
  }
}

module.exports = {
  gatherSyncData
};

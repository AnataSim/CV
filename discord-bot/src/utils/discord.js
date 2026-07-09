const {
  Client,
  GatewayIntentBits,
  ActivityType,
  ChannelType,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const state = require('./state');
const db = require('./db');
const helpers = require('./helpers');
const voice = require('./voice');
const selfbot = require('./selfbot');
const tiktok = require('./tiktok');
const rank = require('./rank');

const HONEYPOT_CHANNEL_ID = process.env.HONEYPOT_CHANNEL_ID || '1523714312940552252';
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID || '1523839216004632686';
const GUILD_ID = process.env.GUILD_ID;
const SIM_DISCORD_ID = process.env.SIM_DISCORD_ID || '661135501226672129';
const GHOST_USER_TOKEN = process.env.GHOST_USER_TOKEN || null;

async function updatePlayerProgressRoles(member, userId) {
  try {
    const allSubs = db.loadLocalSubmissions();
    const activeQuests = db.loadLocalQuests();

    const userApprovedSubs = allSubs.filter(s =>
      s.userId === userId &&
      s.status === 'approved' &&
      activeQuests.some(q => q.id === s.questId)
    );
    const completedCount = userApprovedSubs.length;
    console.log(`📊 [Progress Roles] User ${userId} has completed ${completedCount} active quests.`);

    const PROGRESS_ROLES = {
      1: '1512826550041444505',
      2: '1512827213182144624',
      3: '1512827370858483862',
      4: '1512828393178009704',
      5: '1512828816073035787'
    };

    if (member && member.roles) {
      for (const [count, rId] of Object.entries(PROGRESS_ROLES)) {
        if (Number(count) !== completedCount) {
          if (member.roles.cache.has(rId)) {
            await member.roles.remove(rId).catch(err => console.warn(`Gagal remove role ${rId}:`, err.message));
          }
        }
      }

      const targetProgressRoleId = PROGRESS_ROLES[Math.min(5, completedCount)];
      if (completedCount >= 1 && targetProgressRoleId) {
        if (!member.roles.cache.has(targetProgressRoleId)) {
          await member.roles.add(targetProgressRoleId).catch(err => console.error(`Gagal add progress role:`, err.message));
        }
      }

      if (completedCount >= 5) {
        const completers = [];
        const userIdsWithSubs = Array.from(new Set(allSubs.map(s => s.userId)));

        userIdsWithSubs.forEach(uId => {
          const uSubs = allSubs.filter(s => s.userId === uId && s.status === 'approved' && activeQuests.some(q => q.id === s.questId));
          if (uSubs.length >= 5) {
            uSubs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const completionTime = new Date(uSubs[4].createdAt).getTime();
            completers.push({ userId: uId, time: completionTime });
          }
        });

        completers.sort((a, b) => a.time - b.time);
        const rankIndex = completers.findIndex(c => c.userId === userId);

        let targetSerialRoleId = '';
        let targetSerialName = '';

        if (rankIndex === 0) {
          targetSerialRoleId = '1505846686155804792';
          targetSerialName = 'Serial #1 — Crescent Eclipse';
        } else if (rankIndex === 1) {
          targetSerialRoleId = '1513143066427658310';
          targetSerialName = 'Serial #2';
        } else if (rankIndex === 2) {
          targetSerialRoleId = '1513143264986005645';
          targetSerialName = 'Serial #3';
        } else {
          targetSerialRoleId = '1513143545433686026';
          targetSerialName = 'Last Chapter';
        }

        if (targetSerialRoleId && !member.roles.cache.has(targetSerialRoleId)) {
          await member.roles.add(targetSerialRoleId).catch(err => console.error(`Gagal add serial role:`, err.message));
          console.log(`🏆 [Serial Role] User ${userId} mendapat role ${targetSerialName} (Rank ${rankIndex + 1})`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error di updatePlayerProgressRoles:", err.message);
  }
}

function initializeBot(token) {
  try {
    state.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });

    state.client.on('ready', () => {
      console.log(`✅ Bot berhasil login sebagai ${state.client.user.tag}!`);
      state.isDiscordReady = true;

      state.connectionState.isBotLoggedIn = true;
      state.connectionState.botUsername = state.client.user.tag;
      state.connectionState.botAvatar = state.client.user.displayAvatarURL();
      state.connectionState.status = state.connectionState.isConnectedToVoice ? 'connected_voice' : 'ready';
      voice.addVoiceAfkLog(`Bot VoiceAFK terintegrasi dengan CrunchyVerse (${state.client.user.tag})`, 'success');

      const savedVoiceConfig = db.loadVoiceAfkConfig();
      if (savedVoiceConfig && savedVoiceConfig.isConnected && savedVoiceConfig.guildId && savedVoiceConfig.channelId) {
        voice.addVoiceAfkLog(`Mendeteksi konfigurasi voice tersimpan untuk server ${savedVoiceConfig.guildId}, channel ${savedVoiceConfig.channelId}. Mencoba menghubungkan otomatis...`, 'info');
        voice.connectToVoiceChannel(savedVoiceConfig.guildId, savedVoiceConfig.channelId).catch(err => {
          voice.addVoiceAfkLog(`Gagal menghubungkan otomatis ke voice channel: ${err.message}`, 'error');
        });
      }

      state.client.user.setPresence({
        activities: [{ name: 'CrunchyVerse Stage 🎪', type: ActivityType.Watching }],
        status: 'online',
      });

      tiktok.updateDiscordLiveStatusChannels();

      if (GUILD_ID) {
        state.client.guilds.fetch(GUILD_ID)
          .then(async (guild) => {
            console.log(`🎪 Terhubung ke server: ${guild.name}`);
            try {
              await guild.members.fetch();
              console.log('👥 Mengisi cache member berhasil.');
              setTimeout(rank.autoRankRoleCheck, 5000);
            } catch (err) {
              console.log('⚠️ Gagal mengisi cache member (mungkin intents "Server Members" di Discord Developer Portal belum diaktifkan).');
              setTimeout(rank.autoRankRoleCheck, 5000);
            }

            console.log(`⏰ [AutoRank] Menjadwalkan pengecekan otomatis setiap ${rank.RANK_AUTO_CHECK_INTERVAL_MS / 60000} menit.`);
            setInterval(rank.autoRankRoleCheck, rank.RANK_AUTO_CHECK_INTERVAL_MS);
          })
          .catch(err => {
            console.error(`❌ Gagal terhubung ke Guild ID ${GUILD_ID}: ${err.message}`);
          });
      }

      const VOICE_WATCHDOG_INTERVAL_MS = 3 * 60 * 1000;
      setInterval(async () => {
        const savedCfg = db.loadVoiceAfkConfig();
        if (savedCfg && savedCfg.isConnected && savedCfg.guildId && savedCfg.channelId) {
          if (!state.connectionState.isConnectedToVoice) {
            voice.addVoiceAfkLog(`[Watchdog] Main bot terputus. Mencoba reconnect ke channel ${savedCfg.channelId}...`, 'warning');
            try {
              await voice.connectToVoiceChannel(savedCfg.guildId, savedCfg.channelId);
              voice.addVoiceAfkLog(`[Watchdog] ✅ Berhasil reconnect main bot ke voice channel ${savedCfg.channelId}!`, 'success');
            } catch (err) {
              voice.addVoiceAfkLog(`[Watchdog] ❌ Gagal reconnect main bot: ${err.message}. Mencoba lagi dalam 3 menit.`, 'error');
            }
          }
        }

        const ghostCfg = db.loadGhostConfig();
        if (ghostCfg && ghostCfg.isEnabled && ghostCfg.guildId && ghostCfg.channelId) {
          if (GHOST_USER_TOKEN && (!state.ghostManager || !state.ghostManager.isReady)) {
            console.log('[Watchdog Ghost] Ghost manager tidak ready/terputus. Mencoba inisialisasi/reconnect...');
            try {
              if (!state.ghostManager) {
                state.ghostManager = new selfbot.SelfbotManager(GHOST_USER_TOKEN);
              }
              await state.ghostManager.connect();
              console.log('[Watchdog Ghost] ✅ Berhasil mengkoneksikan kembali ghost manager ke Gateway.');
            } catch (err) {
              console.error('[Watchdog Ghost] ❌ Gagal inisialisasi/reconnect ghost manager:', err.message);
            }
          }

          if (state.ghostManager && state.ghostManager.isReady) {
            let isGhostInVoice = false;
            try {
              const guild = state.client.guilds.cache.get(ghostCfg.guildId);
              const ghostMember = guild?.members.cache.get(SIM_DISCORD_ID) || await guild?.members.fetch(SIM_DISCORD_ID).catch(() => null);
              isGhostInVoice = ghostMember?.voice?.channelId === ghostCfg.channelId;
            } catch (e) {
              console.warn('[Watchdog Ghost] Gagal cek status voice ghost:', e.message);
            }

            if (!isGhostInVoice) {
              console.log(`[Watchdog Ghost] Akun ghost terdeteksi keluar dari channel ${ghostCfg.channelId}. Mencoba menyambung kembali...`);
              try {
                await state.ghostManager.joinVoice(ghostCfg.guildId, ghostCfg.channelId);
                if (ghostCfg.nickname) {
                  await new Promise(r => setTimeout(r, 1500));
                  await state.ghostManager.setNickname(ghostCfg.guildId, ghostCfg.nickname).catch(() => {});
                }
                console.log('[Watchdog Ghost] ✅ Berhasil reconnect akun ghost ke voice channel!');
                await selfbot.updateGhostControlMessageStatus(true).catch(() => {});
              } catch (err) {
                console.error('[Watchdog Ghost] ❌ Gagal reconnect akun ghost:', err.message);
              }
            }
          }
        }
      }, VOICE_WATCHDOG_INTERVAL_MS);
      console.log('⏰ [VoiceWatchdog] Auto-reconnect watchdog aktif (interval: 3 menit).');

      (async () => {
        try {
          const trapChannel = await state.client.channels.fetch(HONEYPOT_CHANNEL_ID).catch(() => null);
          if (trapChannel && trapChannel.isTextBased()) {
            const messages = await trapChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const hasWarning = messages && messages.some(m => m.author.id === state.client.user.id && m.embeds.length > 0);
            if (!hasWarning) {
              const warningEmbed = new EmbedBuilder()
                .setTitle('🚨 WARNING / PERINGATAN KERAS 🚨')
                .setDescription(
                  '**DILARANG BERINTERAKSI DI SALURAN INI!**\n\n' +
                  'Saluran ini merupakan saluran jebakan keamanan (honeypot) untuk mendeteksi akun spambot/hacker.\n\n' +
                  '⚠️ **Mengirimkan interaksi apapun (teks, gambar, emoji, sticker, file, dll.) di saluran ini akan mengakibatkan akun Anda DI-BAN SECARA OTOMATIS dan semua pesan Anda dihapus seolah-olah Anda tidak pernah berada di sini.**\n\n' +
                  'Silakan gunakan saluran interaksi resmi lainnya untuk mengobrol. Terima kasih atas pengertian Anda.'
                )
                .setColor('#ff3e3e')
                .setThumbnail(state.client.user.displayAvatarURL())
                .setTimestamp();
              await trapChannel.send({ embeds: [warningEmbed] });
              console.log('✅ [Honeypot] Warning embed dikirim ke honeypot channel.');
            }
          }
        } catch (err) {
          console.error('❌ [Honeypot] Gagal inisialisasi warning embed:', err.message);
        }
      })();
    });

    if (GHOST_USER_TOKEN) {
      setTimeout(async () => {
        try {
          state.ghostManager = new selfbot.SelfbotManager(GHOST_USER_TOKEN);
          await state.ghostManager.connect();
          console.log('[KRPK-0421] Ghost SelfbotManager berhasil terhubung ke Gateway.');
          await selfbot.sendOrUpdateGhostControlMessage();
        } catch (err) {
          console.error('[KRPK-0421] Gagal inisialisasi ghost manager:', err.message);
        }
      }, 8000);
    } else {
      console.log('[KRPK-0421] GHOST_USER_TOKEN tidak ditemukan di .env. Ghost Mode dinonaktifkan.');
    }

    state.client.on('error', (err) => {
      console.error(`❌ Error pada klien Discord: ${err.message}`);
    });

    // ===== SECURITY HONEYPOT SYSTEM =====
    state.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      if (message.channel.id === HONEYPOT_CHANNEL_ID) {
        try {
          await message.delete().catch(err => {
            console.error("❌ [Honeypot] Gagal menghapus pesan:", err.message);
          });

          const guild = message.guild;
          let banSuccess = false;
          let banError = null;

          // Send DM notice to user BEFORE banning them (so they are still in the server and the DM succeeds)
          try {
            const banDmEmbed = new EmbedBuilder()
              .setTitle('🚨 PEMBERITAHUAN BAN OTOMATIS 🚨')
              .setDescription(
                `Halo ${message.author.username},\n\n` +
                `Akun Anda telah di-ban secara otomatis dari server **CrunchyVerse** karena berinteraksi atau mengirim pesan di channel keamanan (**honeypot**).\n\n` +
                `Jika akun Anda baru saja diretas atau ini merupakan ketidaksengajaan, silakan hubungi Administrator/Moderator server untuk mengajukan unban.`
              )
              .setColor('#ff3e3e')
              .setTimestamp();
            await message.author.send({ embeds: [banDmEmbed] });
            console.log(`✉️ [Honeypot] DM notifikasi ban berhasil dikirim ke ${message.author.tag}`);
          } catch (dmErr) {
            console.warn(`⚠️ [Honeypot] Gagal mengirim DM ban ke ${message.author.tag}: ${dmErr.message}`);
          }

          try {
            await guild.members.ban(message.author.id, {
              deleteMessageSeconds: 604800,
              reason: '🚨 SECURITY TRAP: Sent message in honeypot channel (1523714312940552252)'
            });
            banSuccess = true;
          } catch (err) {
            banError = err.message;
            console.error(`❌ [Honeypot] Gagal membanned user ${message.author.id}:`, err.message);
          }

          const logChannel = await state.client.channels.fetch(BAN_LOG_CHANNEL_ID).catch(() => null);
          if (logChannel && logChannel.isTextBased()) {
            const logEmbed = new EmbedBuilder()
              .setTitle('🛡️ Honeypot Trap Triggered')
              .setDescription(`Tindakan keamanan otomatis telah dieksekusi terhadap user berikut karena berinteraksi di channel <#${HONEYPOT_CHANNEL_ID}>.`)
              .addFields(
                { name: '👤 User', value: `${message.author} (${message.author.tag})`, inline: true },
                { name: '🆔 ID User', value: `\`${message.author.id}\``, inline: true },
                { name: '⚡ Status Ban', value: banSuccess ? '🟢 Berhasil Di-ban' : `🔴 Gagal Di-ban (${banError})`, inline: true },
                { name: '💬 Isi Pesan', value: message.content ? `\`\`\`\n${message.content.slice(0, 1000)}\n\`\`\`` : '*Pesan tidak mengandung teks (mungkin berupa attachment/embed/image)*' }
              )
              .setColor(banSuccess ? 0xff3e3e : 0xe74c3c)
              .setTimestamp()
              .setThumbnail(message.author.displayAvatarURL({ dynamic: true }) || null);

            const components = [];
            if (banSuccess) {
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`krpk_honeypot_unban_${message.author.id}`)
                  .setLabel('Unban + Reason')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('🔓')
              );
              components.push(row);
            }

            await logChannel.send({ embeds: [logEmbed], components }).catch(err => {
              console.error("❌ [Honeypot] Gagal mengirim pesan log ban:", err.message);
            });
          }
        } catch (err) {
          console.error("❌ [Honeypot] Fatal error during honeypot execution:", err.message);
        }
      }
    });

    // ===== KRPK-0422: Widget Configuration Setup Button Command =====
    state.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.content.startsWith('!widget')) return;

      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${state.client.user.id}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20role_connections.write%20sdk.social_layer`;

      const embed = new EmbedBuilder()
        .setTitle('🎪 CrunchyVerse Board Profile Widget 🎪')
        .setDescription(
          'Tampilkan Level, Voice Hours, Streak, and Kekayaan Teater (CV$) Anda secara live langsung di profil Discord Anda (di bawah tab **Board**, Widget v2)!\n\n' +
          '**Langkah-langkah Setup:**\n' +
          '1️⃣ **Otorisasi Widget:** Klik tombol **Otorisasi Stats Widget** 🔗 di bawah → izinkan Sparxie membaca & update stats Anda.\n' +
          '2️⃣ **Pasang Widget:** Klik tombol **Dapatkan Script Pasang Widget** 📋 → salin script yang dikirim bot lewat DM, lalu buka [discord.com/app](https://discord.com/app) di browser, tekan `Ctrl+Shift+I`, buka tab **Console**, tempel script, dan tekan Enter.\n' +
          '3️⃣ **Sinkronisasikan Angka Stats:** Jalankan perintah PowerShell ini di komputer Anda untuk memicu sinkronisasi stats terbaru secara instan:\n' +
          '```powershell\n' +
          `Invoke-RestMethod -Uri "https://crunchyverse-backend.onrender.com/api/widget/sync" -Method Post -ContentType "application/json" -Body '{"userId":"${message.author.id}"}'\n` +
          '```\n' +
          '4️⃣ **Reload Discord:** Tekan `Ctrl+R` pada aplikasi Discord Anda, buka profil Anda, dan cek tab **Board**!'
        )
        .setColor('#D4AF37')
        .setThumbnail(state.client.user.displayAvatarURL());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Otorisasi Stats Widget')
          .setStyle(ButtonStyle.Link)
          .setURL(oauthUrl)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setCustomId('krpk_widget_script')
          .setLabel('Dapatkan Script Pasang Widget')
          .setStyle(ButtonStyle.Success)
          .setEmoji('📋')
      );

      await message.reply({ embeds: [embed], components: [row] });
    });

    // ===== ADMIN COMMAND: Purge messages from a specific user =====
    state.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.content.startsWith('!purgeuser')) return;

      const hasModRole = message.member?.roles.cache.has('1403364896242139187');
      const isServerAdmin = message.member?.permissions.has('Administrator');
      if (!hasModRole && !isServerAdmin) {
        return message.reply('🚫 **Akses Ditolak.** Perintah ini hanya untuk Moderator Server (dengan role Mod Server).');
      }

      const args = message.content.split(/\s+/);
      const targetUserId = args[1]?.replace(/[<@!>]/g, '');

      if (!targetUserId) {
        return message.reply('⚠️ **Format Salah.** Gunakan: `!purgeuser <UserId/Mention>`');
      }

      const statusMsg = await message.channel.send(`⏳ **Memulai pembersihan pesan untuk user ID:** \`${targetUserId}\` di channel ini...`);

      try {
        let deletedCount = 0;
        let fetched;
        let beforeId = message.id;
        let iteration = 0;

        do {
          fetched = await message.channel.messages.fetch({ limit: 100, before: beforeId });
          if (fetched.size === 0) break;

          const userMessages = fetched.filter(m => m.author.id === targetUserId);
          if (userMessages.size > 0) {
            const now = Date.now();
            const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
            const bulkDeletable = [];
            const manualDelete = [];

            userMessages.forEach(m => {
              if (m.createdTimestamp > fourteenDaysAgo) {
                bulkDeletable.push(m);
              } else {
                manualDelete.push(m);
              }
            });

            if (bulkDeletable.length > 0) {
              await message.channel.bulkDelete(bulkDeletable, true);
              deletedCount += bulkDeletable.length;
            }

            if (manualDelete.length > 0) {
              for (const m of manualDelete.slice(0, 20)) {
                await m.delete().catch(() => {});
                deletedCount++;
                await new Promise(r => setTimeout(r, 500));
              }
            }
          }

          beforeId = fetched.lastKey();
          iteration++;
        } while (fetched.size > 0 && iteration < 3);

        await statusMsg.edit(`🧹 **Selesai!** Berhasil menghapus **${deletedCount}** pesan dari user <@${targetUserId}> di channel ini.`);
      } catch (err) {
        console.error("❌ [PurgeUser] Gagal melakukan purge:", err.message);
        await statusMsg.edit(`❌ **Gagal melakukan pembersihan:** ${err.message}`);
      }
    });

    // ===== SPEECH-TO-TEXT COMMANDS: 'stt on / 'stt off =====
    state.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      const content = message.content.trim();
      if (content === "'stt on") {
        const guildId = message.guildId;
        if (!guildId) return;

        // Check if API key is configured
        if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
          return message.reply('⚠️ **Error:** `GEMINI_API_KEY`, `GROQ_API_KEY`, atau `OPENAI_API_KEY` tidak ditemukan di environment (`.env`). Harap tambahkan salah satu API key untuk menggunakan fitur Speech-to-Text!');
        }

        // Set state to enabled
        state.connectionState.sttEnabled = true;

        const { getVoiceConnection, joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
        const connection = getVoiceConnection(guildId);

        if (connection) {
          const guild = state.client.guilds.cache.get(guildId);
          if (guild) {
            const channelId = connection.joinConfig.channelId;
            
            // Rejoin with selfDeaf: false to start receiving audio
            const newConn = joinVoiceChannel({
              channelId: channelId,
              guildId: guildId,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: false,
              selfMute: false
            });

            const loadingMsg = await message.reply('⏳ **Menghubungkan ulang suara untuk memulai pendengaran...**');

            entersState(newConn, VoiceConnectionStatus.Ready, 5000)
              .then(() => {
                const { startSttListening, stopSttListening } = require('./voice-stt');
                stopSttListening(newConn, guildId); // Clear old listeners first
                startSttListening(newConn, guildId, channelId);
                loadingMsg.edit(`🎙️ **Speech-to-Text diaktifkan!** Bot sekarang mendengarkan suara di voice channel <#${channelId}> dan akan menuliskan transkrip di voice chat.`);
              })
              .catch(err => {
                console.error("❌ [STT] Gagal menunggu status Ready saat mengaktifkan STT:", err.message);
                const { startSttListening, stopSttListening } = require('./voice-stt');
                stopSttListening(newConn, guildId); // Clear old listeners first
                startSttListening(newConn, guildId, channelId);
                loadingMsg.edit(`🎙️ **Speech-to-Text diaktifkan (Fallback)!** Bot bergabung ke voice channel <#${channelId}> dan mencoba mendengarkan.`);
              });
            return;
          }
        } else {
          // If bot is not connected, try connecting to the user's voice channel
          const memberVoiceChannel = message.member?.voice?.channel;
          if (memberVoiceChannel) {
            try {
              const loadingMsg = await message.reply('⏳ **Menghubungkan ke voice channel Anda...**');
              await voice.connectToVoiceChannel(guildId, memberVoiceChannel.id);
              return loadingMsg.edit(`🎙️ **Speech-to-Text diaktifkan!** Bot bergabung ke voice channel <#${memberVoiceChannel.id}> dan mendengarkan.`);
            } catch (err) {
              return message.reply(`❌ **Gagal bergabung ke voice channel:** ${err.message}`);
            }
          } else {
            return message.reply('⚠️ **Error:** Anda harus berada di voice channel terlebih dahulu agar bot bisa bergabung dan mendengarkan!');
          }
        }
      }

      if (content === "'stt off") {
        const guildId = message.guildId;
        if (!guildId) return;

        state.connectionState.sttEnabled = false;

        const { getVoiceConnection, joinVoiceChannel } = require('@discordjs/voice');
        const connection = getVoiceConnection(guildId);

        if (connection) {
          const { stopSttListening } = require('./voice-stt');
          stopSttListening(connection, guildId);

          const guild = state.client.guilds.cache.get(guildId);
          if (guild) {
            joinVoiceChannel({
              channelId: connection.joinConfig.channelId,
              guildId: guildId,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: true,
              selfMute: false
            });
          }
          return message.reply('🔇 **Speech-to-Text dinonaktifkan.** Bot tidak lagi mendengarkan suara Anda.');
        } else {
          return message.reply('ℹ️ **Speech-to-Text dinonaktifkan.** Bot saat ini tidak terhubung ke voice channel.');
        }
      }
    });

    // Listen to Jockie Music (Jing Liu) messages to capture playing track
    state.client.on('messageCreate', (message) => {
      if (message.author.id === '411916947773587456') {
        let trackText = null;

        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          const text = embed.description || embed.title || '';
          if (text.includes('Started playing') || text.includes('playing')) {
            trackText = text;
          }
        }

        if (!trackText && message.content && (message.content.includes('Started playing') || message.content.includes('playing'))) {
          trackText = message.content;
        }

        if (trackText) {
          let cleanText = trackText.replace(/\*\*/g, '');
          cleanText = cleanText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
          cleanText = cleanText.replace(/Started playing\s+/i, '').replace(/playing\s+/i, '').trim();
          cleanText = cleanText.replace(/<:spotify:\d+>/g, '').replace(/🟢|💚/g, '').trim();

          const byIndex = cleanText.lastIndexOf(' by ');
          let formattedTrack = cleanText;
          if (byIndex !== -1) {
            const trackName = cleanText.substring(0, byIndex).trim();
            const artistName = cleanText.substring(byIndex + 4).trim();
            formattedTrack = `${trackName} - ${artistName}`;
          }

          state.jockieMusicStatus = `[00:00] • ${formattedTrack}`;
          state.lastJockieTrackTime = Date.now();
          state.lastJockieMessage = message;
          console.log(`🎵 [JockieMusic] Track terdeteksi dari pesan bot (tanpa **): "${state.jockieMusicStatus}"`);
        }
      }
    });

    // Listen to admin approvals via reactions
    state.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;

      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (error) {
          console.error('❌ [Reaction] Gagal mengambil partial reaction:', error.message);
          return;
        }
      }

      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch (error) {
          console.error('❌ [Reaction] Gagal mengambil partial message:', error.message);
          return;
        }
      }

      if (reaction.message.channel.id !== '1512604646328504370') return;

      const emoji = reaction.emoji.name;
      if (emoji !== '✅' && emoji !== '❌') return;

      const messageId = reaction.message.id;
      console.log(`🔔 [Reaction] Menerima reaksi ${emoji} dari @${user.username} pada pesan ID ${messageId}`);

      const localSubs = db.loadLocalSubmissions();
      const subIndex = localSubs.findIndex(s => s.discordMessageId === messageId);

      let submission = null;
      if (subIndex !== -1) {
        submission = localSubs[subIndex];
        console.log(`🎯 [Reaction] Ditemukan submission lokal ID: ${submission.id} untuk pesan: ${messageId}`);
      }

      let dbSuccess = false;
      let submissionFromDb = null;
      let subDocId = null;

      if (state.db) {
        const { collection, query, where, getDocs } = require('firebase/firestore');
        try {
          const q = query(collection(state.db, "submissions"), where("discordMessageId", "==", messageId));
          const querySnapshot = await state.withTimeout(getDocs(q));
          if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            submissionFromDb = docSnap.data();
            subDocId = docSnap.id;
            dbSuccess = true;
          }
        } catch (dbErr) {
          console.warn("⚠️ [Reaction] Gagal query submissions di Firestore:", dbErr.message);
        }
      }

      const mergedSub = submission || submissionFromDb;
      if (!mergedSub) {
        console.log(`⚠️ [Reaction] Tidak ditemukan data submission (lokal maupun Firestore) untuk message ID: ${messageId}`);
        return;
      }

      if (mergedSub.status !== 'pending') {
        console.log(`ℹ️ [Reaction] Submission sudah diproses (status: ${mergedSub.status}).`);
        return;
      }

      const newStatus = emoji === '✅' ? 'approved' : 'rejected';

      if (subIndex !== -1) {
        localSubs[subIndex].status = newStatus;
        db.saveLocalSubmissions(localSubs);
      }

      if (dbSuccess && subDocId) {
        const { doc, updateDoc, deleteDoc } = require('firebase/firestore');
        try {
          const docRef = doc(state.db, "submissions", subDocId);
          if (emoji === '✅') {
            await state.withTimeout(updateDoc(docRef, { status: "approved" }));
          } else {
            await state.withTimeout(deleteDoc(docRef));
          }
        } catch (dbErr) {
          console.warn("⚠️ [Reaction] Gagal update status submission di Firestore:", dbErr.message);
        }
      }

      const points = mergedSub.points || 0;
      const userId = mergedSub.userId;
      const username = mergedSub.username;
      const userEmail = mergedSub.userEmail || "";
      const questId = mergedSub.questId;
      const roleId = mergedSub.roleId;

      if (emoji === '✅') {
        console.log(`✅ [Submission] Approved submission: ${mergedSub.id || subDocId}`);

        if (userId && questId) {
          const decks = db.loadLocalDecks();
          if (decks[userId]) {
            decks[userId].statuses = decks[userId].statuses || {};
            decks[userId].statuses[questId] = "Completed";
            db.saveLocalDecks(decks);
            console.log(`🔥 [Reaction] Updated local user deck card ${questId} status to Completed`);
          }
        }

        if (state.db) {
          const { doc, getDoc, updateDoc } = require('firebase/firestore');
          try {
            const deckRef = doc(state.db, "user_decks", userId);
            const deckDoc = await state.withTimeout(getDoc(deckRef));
            if (deckDoc.exists()) {
              const deckData = deckDoc.data();
              const updatedStatuses = { ...deckData.statuses, [questId]: "Completed" };
              await state.withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
              console.log(`🔥 [Reaction] Updated Firestore user deck card ${questId} status to Completed`);
            }
          } catch (dbErr) {
            console.warn("⚠️ [Reaction] Gagal update deck di Firestore:", dbErr.message);
          }
        }

        try {
          const localUsers = db.loadLocalUsers();
          if (!localUsers[userId]) {
            localUsers[userId] = {
              uid: userId,
              name: username || "Pemain Teater",
              email: userEmail || "",
              role: "Penonton Teater",
              cv: 0,
              points: 0
            };
          }
          const addPoints = Number(points) || 0;
          localUsers[userId].cv = (localUsers[userId].cv || 0) + addPoints;
          localUsers[userId].points = (localUsers[userId].points || 0) + addPoints;
          db.saveLocalUsers(localUsers);
          console.log(`💰 [Points] Lokal: Ditambahkan ${addPoints} poin ke user ${userId}. Total poin baru: ${localUsers[userId].cv}`);
        } catch (localErr) {
          console.error("⚠️ [Reaction] Gagal update poin user secara lokal:", localErr.message);
        }

        if (state.db) {
          const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
          try {
            const userRef = doc(state.db, "users", userId);
            const userDoc = await state.withTimeout(getDoc(userRef));
            let newPoints = points;
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const currentPoints = userData.cv || userData.points || 0;
              newPoints += currentPoints;
              await state.withTimeout(updateDoc(userRef, {
                cv: newPoints,
                points: newPoints
              }));
            } else {
              await state.withTimeout(setDoc(userRef, {
                uid: userId,
                name: username,
                email: userEmail,
                role: "Penonton Teater",
                cv: newPoints,
                points: newPoints
              }));
            }
            console.log(`💰 [Points] Firestore: Ditambahkan ${points} poin ke user ${username}. Total poin baru: ${newPoints}`);
          } catch (dbErr) {
            console.warn("⚠️ [Reaction] Gagal update poin user di Firestore:", dbErr.message);
          }
        }

        let roleAssigned = false;
        let roleName = "";
        try {
          const guild = await state.client.guilds.fetch(GUILD_ID);

          let targetDiscordId = mergedSub.discordId;
          if (!targetDiscordId && state.db) {
            const { doc, getDoc } = require('firebase/firestore');
            try {
              const userDoc = await state.withTimeout(getDoc(doc(state.db, "users", userId)));
              if (userDoc.exists()) {
                targetDiscordId = userDoc.data().discordId;
              }
            } catch (e) { }
          }
          if (!targetDiscordId && userId) {
            const match = userId.match(/\d{17,20}/);
            if (match) {
              targetDiscordId = match[0];
            }
          }

          if (targetDiscordId) {
            console.log(`🎭 [Reaction] Mencari member Discord ID: "${targetDiscordId}"...`);
            const member = await guild.members.fetch(targetDiscordId).catch((fetchErr) => {
              console.error(`❌ [Reaction] Gagal fetch member Discord: ${fetchErr.message}`);
              return null;
            });
            if (member) {
              if (roleId) {
                try {
                  const role = await guild.roles.fetch(roleId);
                  if (role) {
                    roleName = role.name;
                    console.log(`🎭 [Reaction] Mencoba menambahkan role "${roleName}" (ID: ${roleId}) ke member ${member.user.tag}...`);
                    await member.roles.add(roleId).catch((addRoleErr) => {
                      console.error(`❌ [Reaction] Gagal menambahkan role ke member: ${addRoleErr.message}`);
                    });
                    console.log(`🎭 [Reaction] Role ${roleId} (${roleName}) ditambahkan ke member ${member.user.tag}`);
                    roleAssigned = true;
                  }
                } catch (roleErr) {
                  console.error("❌ [Reaction] Gagal fetch/add quest role:", roleErr.message);
                }
              }

              await updatePlayerProgressRoles(member, userId);
            } else {
              console.warn(`⚠️ [Reaction] Member ${targetDiscordId} tidak ditemukan di Guild.`);
            }
          }
        } catch (roleErr) {
          console.error("❌ [Reaction] Gagal memproses role Discord:", roleErr.message);
        }

        try {
          await reaction.message.reply(`` +
            `✅ **Bukti Disetujui oleh @${user.username}**! Poin **+${points}** telah ditambahkan ke akun **${username}**` +
            `${roleAssigned ? ` dan role Discord **${roleName || roleId}** telah diberikan.` : '.'}`
          );
        } catch (replyErr) {
          console.error("❌ Gagal membalas pesan di Discord:", replyErr.message);
        }
      } else if (emoji === '❌') {
        console.log(`❌ [Submission] Rejected submission: ${mergedSub.id || subDocId}`);

        if (userId && questId) {
          const decks = db.loadLocalDecks();
          if (decks[userId]) {
            decks[userId].statuses = decks[userId].statuses || {};
            decks[userId].statuses[questId] = "Denied";
            db.saveLocalDecks(decks);
            console.log(`🔥 [Reaction] Updated local user deck card ${questId} status to Denied`);
          }
        }

        if (state.db) {
          const { doc, getDoc, updateDoc } = require('firebase/firestore');
          try {
            const deckRef = doc(state.db, "user_decks", userId);
            const deckDoc = await state.withTimeout(getDoc(deckRef));
            if (deckDoc.exists()) {
              const deckData = deckDoc.data();
              const updatedStatuses = { ...deckData.statuses, [questId]: "Denied" };
              await state.withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
              console.log(`🔥 [Reaction] Updated Firestore user deck card ${questId} status to Denied`);
            }
          } catch (dbErr) {
            console.warn("⚠️ [Reaction] Gagal update deck di Firestore:", dbErr.message);
          }
        }

        try {
          await reaction.message.reply(`❌ **Bukti Ditolak oleh @${user.username}**! Data submission telah ditolak. Sesi kartu diset ke status **Denied**.`);
        } catch (replyErr) {
          console.error("❌ Gagal membalas pesan di Discord:", replyErr.message);
        }
      }
    });

    // ===== KRPK-0421: Ghost Mode Button + Widget Script Button Handler =====
    state.client.on('interactionCreate', async (interaction) => {
      if (interaction.isButton() && interaction.customId.startsWith('krpk_honeypot_unban_')) {
        const userId = interaction.customId.replace('krpk_honeypot_unban_', '');
        
        const isAdmin = await helpers.verifyIsAdmin(interaction.user.id);
        if (!isAdmin) {
          return interaction.reply({
            content: '🚫 **Akses Ditolak.** Tombol ini hanya bisa digunakan oleh Administrator/Moderator.',
            ephemeral: true
          });
        }

        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder()
          .setCustomId(`krpk_unban_modal_${userId}`)
          .setTitle('Unban User');

        const reasonInput = new TextInputBuilder()
          .setCustomId('unban_reason')
          .setLabel('Alasan Unban')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Masukkan alasan kenapa user ini di-unban...')
          .setMaxLength(500);

        const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal).catch(err => {
          console.error("Gagal menampilkan modal unban:", err.message);
        });
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('krpk_unban_modal_')) {
        const userId = interaction.customId.replace('krpk_unban_modal_', '');
        const reason = interaction.fields.getTextInputValue('unban_reason');
        
        await interaction.deferReply({ ephemeral: true });

        try {
          await interaction.guild.members.unban(userId, reason);

          let dmSent = false;
          try {
            const user = await state.client.users.fetch(userId);
            if (user) {
              const dmEmbed = new EmbedBuilder()
                .setTitle('🎪 CrunchyVerse Unban Notice 🎪')
                .setDescription(`Halo ${user}, akun Anda telah di-unban dari server **CrunchyVerse** oleh Administrator <@${interaction.user.id}>.`)
                .addFields(
                  { name: 'Alasan Unban', value: reason || 'Tidak ada alasan yang diberikan' }
                )
                .setColor('#2ECC71')
                .setTimestamp();
              await user.send({ content: `${user}, Anda telah di-unban dari server CrunchyVerse.`, embeds: [dmEmbed] });
              dmSent = true;
            }
          } catch (dmErr) {
            console.warn(`Gagal mengirim DM ke user ${userId} saat unban:`, dmErr.message);
          }

          const message = interaction.message;
          if (message && message.embeds.length > 0) {
            const originalEmbed = message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
              .setColor('#2ECC71')
              .addFields(
                { name: '🔓 Status Unban', value: `Di-unban oleh <@${interaction.user.id}>`, inline: true },
                { name: '📝 Alasan Unban', value: reason }
              );

            const disabledRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`krpk_honeypot_unban_disabled`)
                .setLabel('Unbanned')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
                .setEmoji('✅')
            );

            await message.edit({ embeds: [updatedEmbed], components: [disabledRow] }).catch(err => {
              console.error("Gagal mengedit pesan log ban:", err.message);
            });
          }

          await interaction.editReply({
            content: `` +
              `✅ User <@${userId}> berhasil di-unban.` +
              `${dmSent ? ' DM pemberitahuan telah dikirim.' : ' (Gagal mengirimkan DM, kemungkinan DM user ditutup/ditolak).'}`
          });
        } catch (err) {
          console.error(`Gagal melakukan unban untuk user ${userId}:`, err.message);
          await interaction.editReply({
            content: `❌ Gagal melakukan unban: ${err.message}`
          });
        }
        return;
      }

      if (!interaction.isButton()) return;
      if (!['krpk_ghost_enable', 'krpk_ghost_disable', 'krpk_widget_script'].includes(interaction.customId)) return;

      if (interaction.customId === 'krpk_widget_script') {
        const APP_ID = state.client.user.id;
        const script = `let _m=webpackChunkdiscord_app.push([[Symbol()],{},e=>e.c]);webpackChunkdiscord_app.pop();let fbp=(...e)=>{for(let t of Object.values(_m))try{if(!t.exports||t.exports===window)continue;if(e.every(e=>t.exports?.[e]))return t.exports;for(let r in t.exports)if(e.every(e=>t.exports?.[r]?.[e])&&"IntlMessagesProxy"!==t.exports[r][Symbol.toStringTag])return t.exports[r]}catch{}}; let api=fbp("Bo","Cu").Bo; let id=fbp("getCurrentUser").getCurrentUser().id; let cw=(await api.get("/users/"+id+"/profile")).body.widgets||[]; if(cw.map(x=>x.data?.application_id).includes("${APP_ID}")){console.log("✅ Widget sudah terpasang! Tidak ada yang perlu dilakukan.")}else{cw.unshift({data:{type:"application",application_id:"${APP_ID}"}}); await api.put({url:"/users/@me/widgets",body:{widgets:cw}}); console.log("✅ Widget CrunchyVerse berhasil dipasang! Tekan Ctrl+R untuk reload Discord.")}`;

        await interaction.reply({
          ephemeral: true,
          embeds: [
            {
              title: '📋 Script Pasang Widget — Instruksi',
              description:
                '**Cara memasang Widget CrunchyVerse ke profil Board Discord kamu:**\n\n' +
                '1️⃣ Buka **[discord.com/app](https://discord.com/app)** di browser (Chrome/Edge).\n' +
                '2️⃣ Tekan **`Ctrl + Shift + I`** (Windows) or **`Cmd + Option + I`** (Mac) untuk buka DevTools.\n' +
                '3️⃣ Klik tab **Console**.\n' +
                '4️⃣ **Salin script di bawah ini**, tempel di Console, lalu tekan **Enter**.\n' +
                '5️⃣ Setelah muncul ✅ di console, tekan **`Ctrl + R`** untuk reload Discord.\n' +
                '6️⃣ Buka profil kamu dan cek tab **Board**! 🎪\n\n' +
                '> ⚠️ Script ini **hanya** memanggil API resmi Discord dari sesi browser kamu sendiri. Tidak ada token yang dikirim ke server kami.',
              color: 0xD4AF37
            }
          ],
          content: `\`\`\`js\n${script}\n\`\`\``
        });
        return;
      }

      if (interaction.user.id !== SIM_DISCORD_ID) {
        return interaction.reply({
          content: '🚫 **Akses Ditolak.** Menu ini hanya bisa digunakan oleh operator teater.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      if (!state.ghostManager || !state.ghostManager.isReady) {
        return interaction.editReply({ content: '❌ Ghost Mode tidak aktif (GHOST_USER_TOKEN belum diisi di server).' });
      }

      const guildId = GUILD_ID;

      if (interaction.customId === 'krpk_ghost_enable') {
        try {
          let targetChannelId = state.connectionState.channelId;

          if (!targetChannelId && state.client && GUILD_ID) {
            try {
              const guild = state.client.guilds.cache.get(GUILD_ID);
              const botMember = guild?.members.cache.get(state.client.user.id);
              targetChannelId = botMember?.voice?.channelId || null;
              if (targetChannelId) {
                console.log(`[KRPK-0421] Fallback: Sparxie ditemukan di voice channel ${targetChannelId} via guild cache.`);
              }
            } catch (_) {}
          }

          if (!targetChannelId) {
            return interaction.editReply({ content: '❌ Sparxie belum join voice channel manapun. Connect Sparxie ke voice dulu via Control Booth.' });
          }

          let currentNick = await state.ghostManager.getCurrentNickname(guildId);
          let baseNick = (currentNick || 'Sim').replace(/^\[💤\]\s*/u, '').trim();
          const newNick = `[💤] ${baseNick}`;

          await state.ghostManager.joinVoice(guildId, targetChannelId);
          await new Promise(r => setTimeout(r, 1500));
          await state.ghostManager.setNickname(guildId, newNick);

          db.saveGhostConfig({ isEnabled: true, guildId, channelId: targetChannelId, nickname: newNick });

          console.log(`[KRPK-0421] Ghost Mode ENABLED → voice:${targetChannelId}, nick:"${newNick}"`);
          await interaction.editReply({ content: `` +
            `✅ **Ghost Mode ON** — Bergabung ke voice dan nickname diubah ke \`${newNick}\`.`
          });

          await selfbot.updateGhostControlMessageStatus(true);
        } catch (err) {
          console.error('[KRPK-0421] Enable error:', err.message);
          await interaction.editReply({ content: `❌ Gagal enable ghost mode: ${err.message}` });
        }

      } else if (interaction.customId === 'krpk_ghost_disable') {
        try {
          let currentNick = await state.ghostManager.getCurrentNickname(guildId);
          if (currentNick) {
            const restoredNick = currentNick.replace(/^\[💤\]\s*/u, '').trim() || null;
            await state.ghostManager.setNickname(guildId, restoredNick || '');
          }

          await state.ghostManager.leaveVoice();

          db.saveGhostConfig({ isEnabled: false, guildId: null, channelId: null, nickname: null });

          console.log('[KRPK-0421] Ghost Mode DISABLED.');
          await interaction.editReply({ content: '✅ **Ghost Mode OFF** — Keluar dari voice dan nickname dikembalikan.' });

          await selfbot.updateGhostControlMessageStatus(false);
        } catch (err) {
          console.error('[KRPK-0421] Disable error:', err.message);
          await interaction.editReply({ content: `❌ Gagal disable ghost mode: ${err.message}` });
        }
      }
    });

    state.client.login(token).catch(err => {
      console.error(`❌ Login Discord Bot gagal: ${err.message}`);
      state.isDiscordReady = false;
    });

  } catch (err) {
    console.error(`❌ Inisialisasi Bot gagal: ${err.message}`);
    state.isDiscordReady = false;
  }
}

module.exports = {
  updatePlayerProgressRoles,
  initializeBot
};

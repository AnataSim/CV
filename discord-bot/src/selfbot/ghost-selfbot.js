const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

let ghostManager = null;
let ghostControlMessageId = null;

// Shared context object
let ctx = {
  client: null,
  getIsDiscordReady: () => false,
  SIM_DISCORD_ID: '661135501226672129',
  GHOST_CONTROL_CHANNEL_ID: '1513463585605423174',
  GUILD_ID: null,
  connectionState: null,
};

const GHOST_CONFIG_FILE = path.join(__dirname, '../../database/ghost-mode-config.json');

function saveGhostConfig(cfg) {
  try {
    fs.writeFileSync(GHOST_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) { console.error('[KRPK-0421] Gagal simpan ghost config:', e.message); }
}

function loadGhostConfig() {
  try {
    if (fs.existsSync(GHOST_CONFIG_FILE)) return JSON.parse(fs.readFileSync(GHOST_CONFIG_FILE, 'utf8'));
  } catch (e) { return null; }
  return null;
}

class SelfbotManager {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.sessionId = null;
    this.isReady = false;
    this.isConnected = false;
    this.currentGuildId = null;
    this.currentChannelId = null;
    this._reconnectTimer = null;
    this._destroyed = false;
    this._reconnectDelay = 5000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Gateway connect timeout (15s)')), 15000);
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

      this.ws.on('open', () => {
        this._reconnectDelay = 5000;
        console.log('[KRPK-0421] WebSocket Gateway terbuka.');
      });

      this.ws.on('message', (data) => {
        let payload;
        try { payload = JSON.parse(data); } catch { return; }
        const { op, d, s, t } = payload;
        if (s) this.sequence = s;

        if (op === 10) {
          this._startHeartbeat(d.heartbeat_interval);
          this._identify();
        } else if (op === 11) {
          // heartbeat ack
        } else if (op === 0) {
          if (t === 'READY') {
            this.sessionId = d.session_id;
            this.isReady = true;
            console.log(`[KRPK-0421] Ghost user ready: ${d.user.username}#${d.user.discriminator}`);
            clearTimeout(timeout);
            resolve();
            this._autoRestoreVoice();
          }
        } else if (op === 9) {
          console.warn('[KRPK-0421] Invalid session dari Gateway.');
          clearTimeout(timeout);
          reject(new Error('Invalid session'));
        }
      });

      this.ws.on('close', (code) => {
        console.warn(`[KRPK-0421] WebSocket ditutup: code=${code}`);
        this.isReady = false;
        this.isConnected = false;
        this._stopHeartbeat();
        clearTimeout(timeout);
        if (!this._destroyed && code !== 4004) {
          console.log(`[KRPK-0421] Akan reconnect dalam ${this._reconnectDelay / 1000}s...`);
          this._reconnectTimer = setTimeout(() => this._doReconnect(), this._reconnectDelay);
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, 60000);
        } else if (code === 4004) {
          console.error('[KRPK-0421] Koneksi ditolak oleh Discord karena Token tidak valid (code=4004). Auto-reconnect dinonaktifkan.');
        }
      });

      this.ws.on('error', (err) => {
        console.error('[KRPK-0421] WebSocket error:', err.message);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async _doReconnect() {
    if (this._destroyed) return;
    try {
      console.log('[KRPK-0421] Mencoba reconnect ke Gateway...');
      await this.connect();
      console.log('[KRPK-0421] Reconnect berhasil!');
    } catch (err) {
      console.error('[KRPK-0421] Reconnect gagal:', err.message);
    }
  }

  async _autoRestoreVoice() {
    await new Promise(r => setTimeout(r, 2000));
    const cfg = loadGhostConfig();
    if (!cfg || !cfg.isEnabled || !cfg.guildId || !cfg.channelId) return;
    try {
      console.log(`[KRPK-0421] Auto-restore: bergabung kembali ke voice channel ${cfg.channelId}...`);
      await this.joinVoice(cfg.guildId, cfg.channelId);
      if (cfg.nickname) {
        await new Promise(r => setTimeout(r, 1500));
        await this.setNickname(cfg.guildId, cfg.nickname).catch(e =>
          console.warn('[KRPK-0421] Auto-restore nickname gagal:', e.message)
        );
      }
      console.log('[KRPK-0421] Auto-restore voice berhasil!');
      await updateGhostControlMessageStatus(true).catch(() => {});
    } catch (err) {
      console.error('[KRPK-0421] Auto-restore voice gagal:', err.message);
    }
  }

  _identify() {
    this._send({
      op: 2,
      d: {
        token: this.token,
        properties: {
          os: 'linux',
          browser: 'Discord Web',
          device: 'Discord Web'
        },
        intents: 0
      }
    });
  }

  _startHeartbeat(interval) {
    this._stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this._send({ op: 1, d: this.sequence });
    }, interval);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  async joinVoice(guildId, channelId) {
    if (!this.isReady) throw new Error('Ghost user belum ready.');
    this._send({
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: channelId,
        self_mute: true,
        self_deaf: true
      }
    });
    this.currentGuildId = guildId;
    this.currentChannelId = channelId;
    this.isConnected = true;
    console.log(`[KRPK-0421] Ghost user join voice: guild=${guildId}, channel=${channelId}`);
  }

  async leaveVoice() {
    if (!this.isReady || !this.currentGuildId) return;
    this._send({
      op: 4,
      d: {
        guild_id: this.currentGuildId,
        channel_id: null,
        self_mute: false,
        self_deaf: false
      }
    });
    console.log(`[KRPK-0421] Ghost user leave voice dari guild=${this.currentGuildId}`);
    this.currentGuildId = null;
    this.currentChannelId = null;
    this.isConnected = false;
  }

  async setNickname(guildId, nickname) {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/@me`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': this.token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ nick: nickname })
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`setNickname gagal: HTTP ${resp.status} — ${body}`);
    }
    const data = await resp.json();
    console.log(`[KRPK-0421] Nickname diubah ke: "${nickname}"`);
    return data.nick || nickname;
  }

  async getCurrentNickname(guildId) {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/@me`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': this.token,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.nick || null;
  }

  destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isReady = false;
    this.isConnected = false;
    console.log('[KRPK-0421] SelfbotManager dihancurkan.');
  }
}

async function sendOrUpdateGhostControlMessage() {
  if (!ctx.client || !ctx.getIsDiscordReady()) return;
  try {
    const channel = await ctx.client.channels.fetch(ctx.GHOST_CONTROL_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error(`[KRPK-0421] Channel kontrol ${ctx.GHOST_CONTROL_CHANNEL_ID} tidak ditemukan.`);
      return;
    }

    const isGhostOn = ghostManager && ghostManager.isConnected;
    const embed = buildGhostControlEmbed(isGhostOn);
    const row = buildGhostControlRow(isGhostOn);

    const messages = await channel.messages.fetch({ limit: 20 });
    const existingMsg = messages.find(m => m.author.id === ctx.client.user.id && m.components?.length > 0);

    if (existingMsg) {
      await existingMsg.edit({ embeds: [embed], components: [row] });
      ghostControlMessageId = existingMsg.id;
      console.log('[KRPK-0421] Pesan kontrol diperbarui.');
    } else {
      const sent = await channel.send({ embeds: [embed], components: [row] });
      ghostControlMessageId = sent.id;
      console.log('[KRPK-0421] Pesan kontrol baru dikirim:', sent.id);
    }
  } catch (err) {
    console.error('[KRPK-0421] Gagal kirim/update pesan kontrol:', err.message);
  }
}

async function updateGhostControlMessageStatus(isEnabled) {
  if (!ctx.client || !ctx.getIsDiscordReady() || !ghostControlMessageId) return;
  try {
    const channel = await ctx.client.channels.fetch(ctx.GHOST_CONTROL_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(ghostControlMessageId).catch(() => null);
    if (!msg) return;
    const embed = buildGhostControlEmbed(isEnabled);
    const row = buildGhostControlRow(isEnabled);
    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[KRPK-0421] Gagal update status pesan kontrol:', err.message);
  }
}

function buildGhostControlEmbed(isEnabled) {
  return new EmbedBuilder()
    .setTitle('👻 Ghost Mode — KRPK-0421')
    .setColor(isEnabled ? 0x57F287 : 0x5865F2)
    .setDescription(
      isEnabled
        ? '✅ **Ghost Mode sedang AKTIF.**\nAkun ghost sedang berada di voice channel dengan status 💤 AFK.\nTekan **Disable** untuk keluar dan mengembalikan nama.'
        : '💤 **Ghost Mode tidak aktif.**\nTekan **Enable** untuk bergabung ke voice channel yang sama dengan Sparxie dengan nama `[💤] <namamu>`.'
    )
    .addFields(
      { name: 'Status Ghost', value: isEnabled ? '🟢 Online di Voice' : '⚫ Offline', inline: true },
      { name: 'Akses', value: `<@${ctx.SIM_DISCORD_ID}>`, inline: true }
    )
    .setFooter({ text: 'KRPK-0421 • Hanya operator yang bisa menggunakan menu ini' })
    .setTimestamp();
}

function buildGhostControlRow(isEnabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('krpk_ghost_enable')
      .setLabel('✅ Enable Ghost')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isEnabled),
    new ButtonBuilder()
      .setCustomId('krpk_ghost_disable')
      .setLabel('🚫 Disable Ghost')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isEnabled)
  );
}

// Initialization function
function initGhostMode(context) {
  Object.assign(ctx, context);

  // Return helper methods
  return {
    getGhostManager: () => ghostManager,
    setGhostManager: (mgr) => { ghostManager = mgr; },
    getGhostControlMessageId: () => ghostControlMessageId,
    setGhostControlMessageId: (id) => { ghostControlMessageId = id; },
    SelfbotManager,
    sendOrUpdateGhostControlMessage,
    updateGhostControlMessageStatus,
    buildGhostControlEmbed,
    buildGhostControlRow,
    loadGhostConfig,
    saveGhostConfig,
  };
}

module.exports = {
  initGhostMode
};

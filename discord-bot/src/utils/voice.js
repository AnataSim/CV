const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const state = require('./state');
const db = require('./db');

function addVoiceAfkLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, message, type };
  state.connectionState.logs.unshift(logEntry);
  if (state.connectionState.logs.length > 50) {
    state.connectionState.logs.pop();
  }
  console.log(`[VoiceAFK ${type.toUpperCase()}] ${timestamp} - ${message}`);
}

async function connectToVoiceChannel(guildId, channelId) {
  if (!state.client || !state.isDiscordReady) {
    throw new Error('Klien Discord belum siap.');
  }

  state.connectionState.status = 'connecting_voice';
  addVoiceAfkLog(`Menghubungkan ke Voice Channel: Server ${guildId}, Channel ${channelId}...`, 'info');

  const guild = state.client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild ${guildId} tidak ditemukan.`);
  }

  const voiceConnection = joinVoiceChannel({
    channelId: channelId,
    guildId: guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: !state.connectionState.sttEnabled,
    selfMute: false
  });

  voiceConnection.on(VoiceConnectionStatus.Ready, () => {
    state.connectionState.isConnectedToVoice = true;
    state.connectionState.guildId = guildId;
    state.connectionState.channelId = channelId;
    state.connectionState.status = 'connected_voice';
    addVoiceAfkLog(`Bot berhasil masuk ke voice channel ${channelId} dan stay 24/7!`, 'success');
    db.saveVoiceAfkConfig({ guildId, channelId, isConnected: true });

    // Start listening for STT if enabled
    if (state.connectionState.sttEnabled) {
      try {
        const { startSttListening } = require('./voice-stt');
        startSttListening(voiceConnection, guildId, channelId);
      } catch (err) {
        console.error('❌ [Voice] Gagal memulai STT listening:', err.message);
      }
    }
  });

  voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      addVoiceAfkLog('Koneksi terputus secara tidak terduga, mencoba menyambung kembali...', 'warning');
      await Promise.race([
        entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5000),
        entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch (error) {
      state.connectionState.isConnectedToVoice = false;
      state.connectionState.status = 'ready';
      addVoiceAfkLog(`Bot terputus dari voice channel. Watchdog akan mencoba reconnect otomatis dalam 3 menit...`, 'warning');
      db.saveVoiceAfkConfig({ guildId, channelId, isConnected: true });
      try {
        voiceConnection.destroy();
      } catch (e) { }
    }
  });

  try {
    await entersState(voiceConnection, VoiceConnectionStatus.Ready, 5000);
  } catch (err) {
    console.warn(`⚠️ [VoiceAFK] entersState Ready timed out/aborted: ${err.message}. Mengabaikan error koneksi UDP untuk mode AFK.`);
    state.connectionState.isConnectedToVoice = true;
    state.connectionState.guildId = guildId;
    state.connectionState.channelId = channelId;
    state.connectionState.status = 'connected_voice';
    db.saveVoiceAfkConfig({ guildId, channelId, isConnected: true });

    // Start listening for STT if enabled (Fallback)
    if (state.connectionState.sttEnabled) {
      try {
        const { startSttListening } = require('./voice-stt');
        startSttListening(voiceConnection, guildId, channelId);
      } catch (sttErr) {
        console.error('❌ [Voice Fallback] Gagal memulai STT listening:', sttErr.message);
      }
    }
  }
  return state.connectionState;
}

module.exports = {
  addVoiceAfkLog,
  connectToVoiceChannel
};

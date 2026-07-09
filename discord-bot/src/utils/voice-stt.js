const { EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const state = require('./state');

// Keep track of active speaking listeners and user audio subscriptions
const activeListeners = new Map(); // guildId -> speakingListenerFunction
const activeSubscriptions = new Map(); // userId -> { opusStream, decoder }

/**
 * Generates a 44-byte WAV header for standard PCM audio.
 */
function getWavHeader(audioLength, sampleRate = 48000, channels = 2, bitsPerSample = 16) {
  const buffer = Buffer.alloc(44);
  /* RIFF identifier */
  buffer.write('RIFF', 0);
  /* file length */
  buffer.writeUInt32LE(36 + audioLength, 4);
  /* RIFF type */
  buffer.write('WAVE', 8);
  /* format chunk identifier */
  buffer.write('fmt ', 12);
  /* format chunk length */
  buffer.writeUInt32LE(16, 16);
  /* sample format (raw) */
  buffer.writeUInt16LE(1, 20);
  /* channel count */
  buffer.writeUInt16LE(channels, 22);
  /* sample rate */
  buffer.writeUInt32LE(sampleRate, 24);
  /* byte rate (sample rate * block align) */
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  /* block align (channel count * bytes per sample) */
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  /* bits per sample */
  buffer.writeUInt16LE(bitsPerSample, 34);
  /* data chunk identifier */
  buffer.write('data', 36);
  /* data chunk length */
  buffer.writeUInt32LE(audioLength, 40);
  return buffer;
}

/**
 * Transcribes raw PCM audio buffer using Gemini API, Groq's free API, or OpenAI's Whisper API.
 * Automatically falls back to the next configured provider if one fails or gets rate-limited.
 */
async function transcribeAudioBuffer(pcmBuffer) {
  const providers = [];

  // Provider 1: Gemini (Free tier, 15 RPM)
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: 'Gemini',
      transcribe: async (wavBuffer) => {
        const base64Data = wavBuffer.toString('base64');
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: 'audio/wav',
                      data: base64Data
                    }
                  },
                  {
                    text: 'Transkripsikan audio ini ke dalam teks bahasa Indonesia secara akurat dan tepat. Tuliskan teks hasil transkripsinya saja langsung tanpa tambahan keterangan atau tanda petik apa pun.'
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        const candidateText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        return candidateText || '';
      }
    });
  }

  // Provider 2: Groq (Free tier, 20 RPM)
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: 'Groq',
      transcribe: async (wavBuffer) => {
        const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
        const formData = new FormData();
        const fileBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        formData.append('file', fileBlob, 'speech.wav');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'id');

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        return result.text;
      }
    });
  }

  // Provider 3: OpenAI (Paid tier)
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'OpenAI',
      transcribe: async (wavBuffer) => {
        const endpoint = 'https://api.openai.com/v1/audio/transcriptions';
        const formData = new FormData();
        const fileBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        formData.append('file', fileBlob, 'speech.wav');
        formData.append('model', 'whisper-1');
        formData.append('language', 'id');

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        return result.text;
      }
    });
  }

  if (providers.length === 0) {
    throw new Error('Tidak ada API Key (GEMINI_API_KEY, GROQ_API_KEY, atau OPENAI_API_KEY) yang terkonfigurasi di file .env.');
  }

  // Prepend WAV header to raw PCM
  const wavHeader = getWavHeader(pcmBuffer.length, 48000, 2, 16);
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  // Try each configured provider in order of preference
  let lastError = null;
  for (const provider of providers) {
    try {
      console.log(`[STT] Mencoba transkripsi menggunakan provider: ${provider.name}`);
      const text = await provider.transcribe(wavBuffer);
      return text;
    } catch (err) {
      console.warn(`⚠️ [STT] Provider ${provider.name} gagal atau terlimit: ${err.message}. Mencoba fallback ke provider berikutnya...`);
      lastError = err;
    }
  }

  throw new Error(`Semua provider transkripsi gagal. Error terakhir: ${lastError.message}`);
}

function debugLog(channelId, message) {
  console.log(`[STT Debug] ${message}`);
  if (state.client && state.isDiscordReady) {
    const channel = state.client.channels.cache.get(channelId);
    if (channel && channel.isTextBased()) {
      channel.send(`⚙️ **[STT Debug]** ${message}`).catch(() => {});
    }
  }
}

/**
 * Starts listening to speaking events on the given VoiceConnection.
 */
function startSttListening(connection, guildId, channelId) {
  if (!connection || !connection.receiver) {
    console.warn(`[STT] Connection or receiver not available for guild ${guildId}`);
    return;
  }

  if (activeListeners.has(guildId)) {
    debugLog(channelId, `Speaking listener already active for guild ${guildId}`);
    return;
  }

  const receiver = connection.receiver;

  const speakingListener = (userId) => {
    // Prevent duplicate subscriptions if we're already recording this user
    if (activeSubscriptions.has(userId)) {
      return;
    }

    const guild = state.client?.guilds.cache.get(guildId);
    const member = guild ? guild.members.cache.get(userId) : null;
    
    // Ignore bots and verify user exists in guild
    if (!member || member.user.bot) return;

    const speakerName = member.displayName;
    debugLog(channelId, `🎙️ Mulai merekam suara: **${speakerName}**`);

    // Subscribe to user speaking stream (finishes after 1.5s of silence to group sentences and reduce rate limits)
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1500
      }
    });

    // Decodes Opus to raw 16-bit stereo PCM
    const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
    opusStream.pipe(decoder);

    activeSubscriptions.set(userId, { opusStream, decoder });

    const chunks = [];
    decoder.on('data', (chunk) => {
      chunks.push(chunk);
    });

    decoder.on('end', async () => {
      activeSubscriptions.delete(userId);
      const pcmBuffer = Buffer.concat(chunks);
      debugLog(channelId, `🛑 Selesai merekam **${speakerName}**. Ukuran audio: ${pcmBuffer.length} bytes`);

      // Skip if audio is less than 0.5 seconds
      // ByteRate = 48000 * 2 channels * 2 bytes = 192000 bytes/sec
      if (pcmBuffer.length < 192000 * 0.5) {
        debugLog(channelId, `⚠️ Audio **${speakerName}** terlalu pendek (${pcmBuffer.length} bytes), melewati transkripsi.`);
        return;
      }

      try {
        debugLog(channelId, `⏳ Mengirim audio ke API transkripsi...`);
        const text = await transcribeAudioBuffer(pcmBuffer);
        if (text && text.trim().length > 0) {
          const trimmed = text.trim();
          
          // Filter out typical Whisper silence/noise hallucinations
          const lowerText = trimmed.toLowerCase();
          const hallucinations = [
            'thank you', 'thank you for watching', 'you', 'subtitle by',
            'subtitles by', 'terima kasih', 'nonton', 'terima kasih telah menonton'
          ];
          if (hallucinations.some(h => lowerText === h || lowerText.startsWith(h + '.'))) {
            debugLog(channelId, `🧹 Filtered halusinasi: "${trimmed}"`);
            return;
          }

          debugLog(channelId, `✨ Hasil transkripsi: "${trimmed}"`);

          // Save to Firestore under the collection 'live_subtitles' with docId as guildId
          if (state.db) {
            const { doc, setDoc } = require('firebase/firestore');
            setDoc(doc(state.db, "live_subtitles", guildId), {
              speaker: speakerName,
              text: trimmed,
              timestamp: Date.now()
            }).catch(dbErr => {
              console.error("❌ [STT] Gagal menyimpan transkrip ke Firestore:", dbErr.message);
            });
          }

          // Send transcript to the voice channel text chat
          const voiceChannel = state.client?.channels.cache.get(channelId);
          if (voiceChannel && voiceChannel.isTextBased()) {
            await voiceChannel.send(`🗣️ **${speakerName}**: ${trimmed}`);
          }
        } else {
          debugLog(channelId, `📝 Hasil transkripsi kosong.`);
        }
      } catch (err) {
        debugLog(channelId, `❌ Gagal transkripsi: ${err.message}`);
      }
    });

    decoder.on('error', (err) => {
      debugLog(channelId, `❌ Decoder error untuk ${speakerName}: ${err.message}`);
      activeSubscriptions.delete(userId);
    });

    opusStream.on('error', (err) => {
      debugLog(channelId, `❌ Opus stream error untuk ${speakerName}: ${err.message}`);
      activeSubscriptions.delete(userId);
    });
  };

  receiver.speaking.on('start', speakingListener);
  activeListeners.set(guildId, speakingListener);
  debugLog(channelId, `✅ Memasang listener suara di channel ini. Silakan mulai berbicara!`);
}

/**
 * Stops listening to speaking events and destroys active streams.
 */
function stopSttListening(connection, guildId) {
  const speakingListener = activeListeners.get(guildId);
  if (speakingListener) {
    if (connection && connection.receiver && connection.receiver.speaking) {
      try {
        connection.receiver.speaking.off('start', speakingListener);
      } catch (e) {}
    }
    activeListeners.delete(guildId);
    console.log(`[STT] Deregistered speaking listener for guild ${guildId}`);
  }

  // Clear any ongoing subscriptions
  for (const [userId, sub] of activeSubscriptions.entries()) {
    try {
      sub.opusStream.destroy();
      sub.decoder.destroy();
    } catch (e) {}
    activeSubscriptions.delete(userId);
  }
}

module.exports = {
  startSttListening,
  stopSttListening
};

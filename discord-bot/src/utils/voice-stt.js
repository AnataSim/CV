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
 * Transcribes raw PCM audio buffer using OpenAI's Whisper API.
 */
async function transcribeAudioBuffer(pcmBuffer) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured in .env file.');
  }

  // Prepend WAV header to raw PCM
  const wavHeader = getWavHeader(pcmBuffer.length, 48000, 2, 16);
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  // Create native FormData and Blob for the multipart upload
  const formData = new FormData();
  const fileBlob = new Blob([wavBuffer], { type: 'audio/wav' });
  formData.append('file', fileBlob, 'speech.wav');
  formData.append('model', 'whisper-1');
  formData.append('language', 'id'); // Optimize for Indonesian

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API returned status ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.text;
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
    console.log(`[STT] Speaking listener already active for guild ${guildId}`);
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
    console.log(`[STT] 🎙️ Recording voice stream for user: ${speakerName} (${userId})`);

    // Subscribe to user speaking stream (finishes after 1s of silence)
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000
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
      console.log(`[STT] 🛑 Recording ended for user: ${speakerName}`);

      const pcmBuffer = Buffer.concat(chunks);
      // Skip if audio is less than 0.5 seconds
      // ByteRate = 48000 * 2 channels * 2 bytes = 192000 bytes/sec
      if (pcmBuffer.length < 192000 * 0.5) {
        console.log(`[STT] Audio from ${speakerName} too short (${pcmBuffer.length} bytes), skipping transcription.`);
        return;
      }

      try {
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
            console.log(`[STT] Hallucination filtered for ${speakerName}: "${trimmed}"`);
            return;
          }

          console.log(`[STT] Transcribed ${speakerName}: "${trimmed}"`);

          // Send transcript to the voice channel text chat
          const voiceChannel = state.client?.channels.cache.get(channelId);
          if (voiceChannel && voiceChannel.isTextBased()) {
            await voiceChannel.send(`🗣️ **${speakerName}**: ${trimmed}`);
          }
        }
      } catch (err) {
        console.error(`[STT] Transcription failed for ${speakerName}:`, err.message);
      }
    });

    decoder.on('error', (err) => {
      console.error(`[STT] Decoder error for ${speakerName}:`, err.message);
      activeSubscriptions.delete(userId);
    });

    opusStream.on('error', (err) => {
      console.error(`[STT] Opus stream error for ${speakerName}:`, err.message);
      activeSubscriptions.delete(userId);
    });
  };

  receiver.speaking.on('start', speakingListener);
  activeListeners.set(guildId, speakingListener);
  console.log(`[STT] Registered speaking listener for guild ${guildId}, channel ${channelId}`);
}

/**
 * Stops listening to speaking events and destroys active streams.
 */
function stopSttListening(connection, guildId) {
  const speakingListener = activeListeners.get(guildId);
  if (speakingListener && connection && connection.receiver) {
    connection.receiver.speaking.off('start', speakingListener);
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

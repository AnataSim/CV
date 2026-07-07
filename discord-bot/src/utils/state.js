// Shared state object for CrunchyVerse Discord Bot refactoring
// Node.js caches require() calls, so any file importing this module
// will share the exact same state object reference.

module.exports = {
  client: null,
  isDiscordReady: false,
  db: null,
  cache: null,
  
  // Voice AFK Connection State
  connectionState: {
    isBotLoggedIn: false,
    botUsername: null,
    botAvatar: null,
    isConnectedToVoice: false,
    guildId: null,
    channelId: null,
    status: 'offline',
    sttEnabled: false,
    logs: []
  },

  // TikTok live status
  tiktokState: {
    username: process.env.TIKTOK_USERNAME || "@crunchyverse.live",
    displayName: process.env.TIKTOK_DISPLAY_NAME || "CrunchyVerse Show",
    isLive: false,
    avatarUrl: process.env.TIKTOK_AVATAR_URL || "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok",
    liveTitle: null,
    manualOverride: false
  },

  // Jing Liu Music states
  jockieMusicStatus: null,
  lastJockieTrackTime: 0,
  lastJockieMessage: null,

  // General throttling / tracking variables
  lastVoiceLogTime: 0,
  ghostManager: null,
  ghostControlMessageId: null,

  // Constant arrays & mappings
  EXCLUDED_CV_ROLE_IDS: [
    '1511318299730903170', // leveling rank role
    '1511318492664561755', // streak rank role
    '1511319103938232431', // voice rank role
    '1511319284616265798', // cvWealth rank role
  ],

  chatChannels: [
    { id: "portal", name: "✨ ┇ portal", type: "text", desc: "Portal informasi utama Anomaly CrunchyVerse 🎪" },
    { id: "command", name: "💬 ┇ command", type: "text", desc: "Kanal command bot Sparxie 🤖" },
    { id: "share-meme", name: "🌠 ┇ share-meme", type: "text", desc: "Tempat berbagi meme lucu & gokil 🍿" },
    { id: "talking", name: "💬 ┇ talking", type: "text", desc: "Kanal ngobrol santai sesama Anomaly 🗣️" },
    { id: "share-leak", name: "🔒 ┇ share-leak", type: "text", desc: "Bocoran rahasia & konten eksklusif teater 🤫" },
    { id: "share-info", name: "👁️ ┇ share-info", type: "text", desc: "Informasi dan update terhangat 👁️" },
    { id: "share-garem", name: "🥛 ┇ share-garem", type: "text", desc: "Kanal berbagi garam / gacha pulls 🧂" },
    { id: "stream", name: "‼️ ┇ stream", type: "text", desc: "Notifikasi siaran langsung & live teater 🔴" },
    { id: "voice-afk", name: "📇 : AFK", type: "voice", desc: "Saluran AFK Anomaly 💤" },
    { id: "voice-jtc", name: "➕ ┇ JOIN TO CREATE", type: "voice", desc: "Bergabung untuk membuat saluran suara baru ➕" },
    { id: "voice-studyroom", name: "📇 : STUDY ROOM", type: "voice", desc: "Kanal belajar & diskusi serius 📚" },
    { id: "voice-existence", name: "📊 ┇ Existence: 346", type: "voice", desc: "Saluran statistik keanggotaan real-time 📊" }
  ],

  chatMessages: {
    "portal": [
      { id: "msg-1", content: "Halo para Anomaly! Selamat datang di saluran Portal teater CrunchyVerse. ✨🎪", author: "Pimpinan Produksi", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager", timestamp: "Hari Ini pukul 08:30", isBot: false },
      { id: "msg-2", content: "Jangan lupa untuk nobar seru malam ini di voice chat ya, kita ada event seru!", author: "[HokBen] SALZ", authorAvatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=salz", timestamp: "Hari Ini pukul 09:15", isBot: false }
    ],
    "command": [
      { id: "msg-3", content: "Gunakan perintah `/sparxie` di sini untuk memanggil asisten bot cerdas Sparxie!", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 10:00", isBot: true }
    ],
    "share-meme": [
      { id: "msg-4", content: "Meme garing hari ini dipersembahkan oleh keaktifan anomaly teater! 🍿😂", author: "yae.eva", authorAvatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", timestamp: "Hari Ini pukul 11:15", isBot: false }
    ],
    "talking": [
      { id: "msg-5", content: "Lagi asik nongkrong nih guys, ada rekomendasi lagu bagus buat didengerin pas nobar?", author: "Dari Kontak Anda", authorAvatar: "https://api.dicebear.com/7.x/identicon/svg?seed=kontak", timestamp: "Hari Ini pukul 12:30", isBot: false }
    ],
    "share-leak": [
      { id: "msg-6", content: "Ssst... kabarnya frame Divergent Universe mau ditambahin slide baru yang lebih menantang! 🤫🤐", author: "Sutradara Event", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=director", timestamp: "Hari Ini pukul 13:00", isBot: false }
    ],
    "share-info": [
      { id: "msg-7", content: "Pemberitahuan: Jam operasional panggung utama teater akan diperpanjang selama libur nasional.", author: "Pimpinan Produksi", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager", timestamp: "Hari Ini pukul 14:15", isBot: false }
    ],
    "share-garem": [
      { id: "msg-8", content: "Wih, baru aja dapet rate-up Acheron dalam 10 kali pull! Garam abis! 🧂😭✨", author: "[AFK] T0ddei", authorAvatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=toddei", timestamp: "Hari Ini pukul 15:20", isBot: false }
    ],
    "stream": [
      { id: "msg-9", content: "🔴 Siaran langsung teater CrunchyVerse sedang berlangsung! Tonton keseruannya sekarang!", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 16:00", isBot: true }
    ],
    "voice-afk": [
      { id: "msg-vc-afk-1", content: "Saluran AFK. Tidur nyenyak para Anomaly... 💤💤", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 08:30", isBot: true }
    ],
    "voice-jtc": [
      { id: "msg-vc-jtc-1", content: "Bergabunglah untuk membuat saluran obrolan suara custom secara instan! ➕🎙️", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 08:30", isBot: true }
    ],
    "voice-studyroom": [
      { id: "msg-vc-study-1", content: "Selamat datang di kanal teks saluran suara STUDY ROOM! Sembari diskusi/belajar, kalian bisa ketik-ketik di sini. 🎙️📚", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 08:30", isBot: true },
      { id: "msg-vc-study-2", content: "Lagi nobar dengerin Pastel Ghost nih di voice chat! Seru banget lagunya. 🎵✨", author: "[HokBen] SALZ", authorAvatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=salz", timestamp: "Hari Ini pukul 12:45", isBot: false }
    ],
    "voice-existence": [
      { id: "msg-vc-exist-1", content: "Saluran statistik keanggotaan real-time. Keberadaan Anomaly ke-346 terdeteksi! 📊✨", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 13:00", isBot: true }
    ]
  },

  sparxieQuotes: [
    "Aha! Persamaan Aljabar dari Divergent Universe meramalkan bahwa kamu adalah Anomaly paling garing hari ini! 🍿🎪",
    "Sebagai bot asisten teater, aku menyarankanmu untuk beristirahat sejenak sambil menikmati pop-corn hangat di lobby CrunchyVerse. 🍿✨",
    "Kalkulasi Value Role (CV) milikmu menunjukkan tingkat keaktifan sebesar 100%! Pertahankan panggungmu! 🏆",
    "Apakah kamu tahu? Pimpinan Produksi sedang menyiapkan rahasia panggung tersembunyi. Jangan bilang siapa-siapa ya! 🤫🎪",
    "Weighted Curios hari ini memberikan buff keberuntungan ekstra untukmu! Siap klir Divergent Universe 4.3? 🪐⚡",
    "Gabut ya? Sama, aku juga cuma bot yang disuruh berputar-putar di server CrunchyVerse... Mari bersulang segelas boba! 🧋✨",
    "Tirai teater telah dibuka! Pastikan kamu duduk di barisan paling depan untuk menonton atraksi spektakuler kami! 🎪🎭",
    "Sparxie di sini! Aku baru saja memeriksa status live TikTok Volunteer, dia sangat bersemangat bernyanyi! 🎤👾"
  ],

  withTimeout: (promise, timeoutMs = 8000) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
      )
    ]);
  }
};

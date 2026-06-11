"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Radio, 
  Users, 
  Award, 
  Activity, 
  Wifi, 
  WifiOff, 
  ChevronDown, 
  Tv, 
  MessageSquare, 
  Settings, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Heart,
  UserCheck,
  Lock,
  Unlock,
  Sliders,
  Shield,
  LogOut,
  Ticket,
  Save,
  Plus,
  Terminal,
  User,
  Mic,
  Bookmark,
  Trash2,
  Edit3,
  X,
  Check,
  Send,
  Smile,
  Reply,
  Bot,
  Hash,
  Image,
  Paperclip,
  Pin,
  Home,
  Layers,
  Gamepad2
} from "lucide-react";

// Import Firebase config
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { 
  signOut, 
  onAuthStateChanged
} from "firebase/auth";
import { 
  doc, 
  getDoc,
  setDoc 
} from "firebase/firestore";

// Import modular subcomponents
import LoginModal from "../components/LoginModal";
import ConfigModal from "../components/ConfigModal";
import ControlBooth from "../components/ControlBooth";
import BotStorage from "../components/BotStorage";
import LeaderboardBoard from "../components/LeaderboardBoard";
import QuestGame from "../components/QuestGame";
import TiraiCountdown from "../components/TiraiCountdown";
import { signedFetch } from "../lib/api";

// Interfaces
interface DiscordStats {
  totalMembers: number;      // Total Anomaly
  totalKerupuk: number;      // Total Role Kerupuk
  totalKeripik: number;      // Total Role Keripik
  online: number;
  idle: number;
  dnd: number;
  offline: number;
}

interface BroadcastMessage {
  id: string;
  content: string;
  author: string;
  authorAvatar?: string;
  timestamp: string;
  imageUrl?: string | null;
}

interface TikTokStatus {
  username: string;
  displayName: string;
  isLive: boolean;
  avatarUrl: string;
  liveTitle?: string | null;
  manualOverride: boolean;
}
// Helper to parse and render Discord mentions & bolds into premium UI pills
const renderMessageContent = (content: string) => {
  if (!content) return null;

  return content.split("\n").map((line, lineIdx) => {
    // Regex matching bold (**text**), role mention ([@&Name]), user mention ([@Name]), channel mention ([#Name])
    const regex = /(\*\*(.*?)\*\*|\[@&(.*?)\]|\[@(.*?)\]|\[#(.*?)\])/g;

    if (!regex.test(line)) {
      return <p key={lineIdx} className="mb-1.5 last:mb-0">{line}</p>;
    }

    regex.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(line.substring(lastIndex, matchIndex));
      }

      const fullMatch = match[0];

      if (fullMatch.startsWith("**") && fullMatch.endsWith("**")) {
        const boldText = match[2];
        parts.push(<strong key={matchIndex} className="font-extrabold text-white">{boldText}</strong>);
      } else if (fullMatch.startsWith("[@&") && fullMatch.endsWith("]")) {
        const roleName = match[3];
        parts.push(
          <span key={matchIndex} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/20 text-amber-300 font-extrabold select-all hover:bg-amber-500/25 transition-colors mx-0.5 shadow-sm shadow-amber-950/20 font-sans tracking-wide">
            @{roleName}
          </span>
        );
      } else if (fullMatch.startsWith("[@") && fullMatch.endsWith("]")) {
        const userName = match[4];
        parts.push(
          <span key={matchIndex} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/20 text-blue-300 font-extrabold select-all hover:bg-blue-500/25 transition-colors mx-0.5 shadow-sm shadow-blue-950/20 font-sans tracking-wide">
            @{userName}
          </span>
        );
      } else if (fullMatch.startsWith("[#") && fullMatch.endsWith("]")) {
        const channelName = match[5];
        parts.push(
          <span key={matchIndex} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-neutral-800/60 border border-neutral-700/50 text-neutral-300 font-extrabold select-all hover:bg-neutral-800/80 transition-colors mx-0.5 shadow-sm font-sans tracking-wide">
            #{channelName}
          </span>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }

    return <p key={lineIdx} className="mb-1.5 last:mb-0">{parts}</p>;
  });
};

const isUserAdmin = (role: string | null) => {
  return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
};

const MOCK_VOICE_MEMBERS = [
  { name: "[HokBen] SALZ", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=salz", isLive: true, badgeText: "165 🌟" },
  { name: "[???] \"и@tw|| f@╦w|| K\"", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=natw", badgeText: "192 ..." },
  { name: "[AFK] T0ddei", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=toddei", badgeText: "HKS", roleValueSymbol: "1 🌟" },
  { name: "[AFK] ʞNI7B", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=blink", roleValueSymbol: "1 🌟" },
  { name: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=yae", isMuted: true, roleValueSymbol: "1..." },
  { name: "[Milk] CrunchyWeeb", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=crunchyweeb", isMuted: true },
  { name: "[Sim] Raiid", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=silver", isMuted: true, badgeText: "KRPC", roleValueSymbol: "3 🌟" },
  { name: "Dari Kontak Anda", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=kontak", roleValueSymbol: "190 🌟" },
  { name: "Fuzu's Friend", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=friend", isSpeaking: true },
  { name: "J.R.R. Tolkienii", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=tolkien", isMuted: true, roleValueSymbol: "29 🌟" },
  { name: "Jing Liu", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=jingliu", isDeafened: true },
  { name: "Lofi Girl", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=lofi", isMuted: true, isDeafened: true },
  { name: "Sparxie | ∞ ✨", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", isMuted: true, roleValueSymbol: "∞ ✨" },
  { name: "✨ Alice", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=alice", isMuted: true, isDeafened: true, roleValueSymbol: "1 🌟" }
];

export default function CrunchyVerseStage() {
  function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 1500): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
      )
    ]);
  }
  // Hydration safety mount state
  const [hasMounted, setHasMounted] = useState(false);

  // Navigation & Animation States
  const [activeFrame, setActiveFrame] = useState<string>("stage-welcome");
  const [curtainsOpened, setCurtainsOpened] = useState(false);
  const [isScrollUnlocked, setIsScrollUnlocked] = useState(false);
  const [spotlightPos, setSpotlightPos] = useState({ x: "50%", y: "45%" });
  const [dustParticles, setDustParticles] = useState<Array<{ id: number; left: string; delay: string; duration: string; drift: string; size: number }>>([]);
  
  // Divergent Universe Slide Deck States
  const [activeSlide, setActiveSlide] = useState(0);
  const [isDivergentFullscreen, setIsDivergentFullscreen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Array<number | null>>([null, null, null]);
  const [editingCheckpointSlot, setEditingCheckpointSlot] = useState<number | null>(null);

  // Sparxie Live Chat States
  const [chatChannelsList, setChatChannelsList] = useState<Array<{ id: string; name: string; type: string; desc: string }>>([
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
  ]);
  const [activeChatChannel, setActiveChatChannel] = useState<string>("portal");
  const [pinnedChannels, setPinnedChannels] = useState<string[]>([]);
  const [customChannelId, setCustomChannelId] = useState<string>("");
  const [customChannelType, setCustomChannelType] = useState<"text" | "voice">("text");
  const [discordReplyRef, setDiscordReplyRef] = useState<string>("");
  const [chatMessagesList, setChatMessagesList] = useState<Array<{ id: string; content: string; mediaUrl?: string | null; replyToMsgId?: string | null; author: string; authorAvatar: string; timestamp: string; isBot: boolean }>>([]);
  const [chatInputVal, setChatInputVal] = useState<string>("");
  const [replyingToMsg, setReplyingToMsg] = useState<any>(null);
  const [showEmojiTray, setShowEmojiTray] = useState<boolean>(false);
  const [attachedMediaUrl, setAttachedMediaUrl] = useState<string | null>(null);
  
  // API Integration States
  const [backendUrl, setBackendUrl] = useState<string>(
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001"
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("crunchy_backend_url");
      if (saved) {
        setBackendUrl(saved);
      } else if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        setBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("crunchy_backend_url", backendUrl);
    }
  }, [backendUrl]);
  const [isBotConnected, setIsBotConnected] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleVal, setEditingTitleVal] = useState("");

  // AUTHENTICATION & DATABASE STATES
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Countdown Timer states for Tirai Tantangan
  const [isCountdownActive, setIsCountdownActive] = useState(true);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const TARGET_DATE = new Date("2026-09-01T00:00:00+07:00");
    const checkTime = () => {
      const now = new Date();
      const diff = TARGET_DATE.getTime() - now.getTime();
      
      if (diff <= 0) {
        setIsCountdownActive(false);
      } else {
        setIsCountdownActive(true);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds });
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Auth Modal and sessions are managed by LoginModal

  // Volunteer Control Booth manual overrides
  const [manualOverride, setManualOverride] = useState(false);
  const [isLiveOverride, setIsLiveOverride] = useState(true);
  const [liveTitleOverride, setLiveTitleOverride] = useState("LIVESTREAM OVERRIDE: Nobar Seru & Ngobrol Anomaly! 🎪🍿");

  // Live Data States
  const [stats, setStats] = useState<DiscordStats>({
    totalMembers: 1337,
    totalKerupuk: 420,
    totalKeripik: 690,
    online: 245,
    idle: 62,
    dnd: 38,
    offline: 992
  });

  // Voice Duration state in seconds - initialize with the static server-side/client-side matching base
  // Reference: 2026-06-01 15:51:00 local time correspond to voice duration 5025:00:21 (18090021 seconds)
  const [voiceDuration, setVoiceDuration] = useState(18090021);

  useEffect(() => {
    const referenceWallTime = new Date("2026-06-01T15:51:00+07:00").getTime();
    const referenceVoiceDuration = 18090021; // 5025:00:21 in seconds
    
    // Immediately calculate and update on client-mount to avoid static lag and hydration errors
    const updateTime = () => {
      const now = Date.now();
      const diffSeconds = Math.floor((now - referenceWallTime) / 1000);
      setVoiceDuration(referenceVoiceDuration + (diffSeconds > 0 ? diffSeconds : 0));
    };
    
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatVoiceDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num: number) => num.toString().padStart(2, "0");
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  };
  // Real-time active voice members from bot API
  const [voiceMembers, setVoiceMembers] = useState<Array<{ name: string; avatar: string; isMuted?: boolean; isDeafened?: boolean; isSpeaking?: boolean; isLive?: boolean; badgeText?: string; roleValueSymbol?: string }>>([]);

  const [voiceTotalCount, setVoiceTotalCount] = useState(0);
  const [voiceChannelName, setVoiceChannelName] = useState("acheron otw t0");
  const [voiceChannelStatus, setVoiceChannelStatus] = useState<string | null>("[04:00] • Silhouette - Pastel Ghost");

  const parseVoiceStatus = (statusStr: string | null) => {
    if (!statusStr) return { duration: null, track: null, seed: "Silence" };
    
    // Check if it matches [MM:SS] • Track Info
    const match = statusStr.match(/^\[([\d:]+)\]\s*•?\s*(.*)$/);
    if (match) {
      return {
        duration: match[1],
        track: match[2].trim(),
        seed: match[2].trim().split(" - ")[0] || "Silence"
      };
    }
    
    return {
      duration: null,
      track: statusStr,
      seed: statusStr.split(" - ")[0] || "Silence"
    };
  };


  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([
    {
      id: "b1",
      content: "🎪 **PERTUNJUKAN AKBAR RESMI DIMULAI!** \n\nHalo para Anomaly sekalian! Malam ini tirai CrunchyVerse resmi dibuka lebar. Persiapkan tempat duduk Anda di barisan terdepan! Kami menghadirkan panggung interaktif baru ini khusus untuk Anda semua. \n\nBagikan keseruan ini ke teman-teman dan dapatkan role eksklusif malam ini!",
      author: "Pimpinan Produksi",
      authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager",
      timestamp: "Hari Ini pukul 08:30",
      imageUrl: "/theater_stage_bg.png"
    },
    {
      id: "b2",
      content: "🍿 **DIVISI KERUPUK & KERIPIK BERTEMPUR!** \n\nPertarungan sengit antara sekte Kerupuk gurih melawan sekte Keripik renyah akan dimulai di panggung koloseum suara malam ini pukul 20.00 WIB. Siapakah yang akan membawa pulang mahkota garing termegah? Pilih kubu Anda sekarang di channel #roles!",
      author: "Sutradara Event",
      authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=director",
      timestamp: "Kemarin pukul 18:15",
      imageUrl: null
    }
  ]);

  const [tiktok, setTiktok] = useState<TikTokStatus>({
    username: "@jobetmaritoas",
    displayName: "CrunchyWeeb",
    isLive: false,
    avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok",
    liveTitle: null,
    manualOverride: false
  });

  // Shared state for Quest Game sync data to pass as props
  const [syncGameData, setSyncGameData] = useState<{
    userCv: number;
    dealtQuests: any[];
    dealt: boolean;
    cardStatuses: Record<string, any>;
    allSubmissions: any[];
  }>({
    userCv: 0,
    dealtQuests: [],
    dealt: false,
    cardStatuses: {},
    allSubmissions: []
  });

  const performUnifiedSync = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const activeChanObj = chatChannelsList.find(c => c.id === activeChatChannel);
      const isVoice = activeChanObj?.type === "voice";
      const targetVoiceChannelId = isVoice ? activeChatChannel : "1435053596742914160";
      const isAdminUser = isUserAdmin(userRole);

      const res = await signedFetch(`${backendUrl}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: currentUser?.uid || null,
          chatChannelId: activeChatChannel,
          voiceChannelId: targetVoiceChannelId,
          isAdmin: isAdminUser
        })
      });

      if (res.ok) {
        const data = await res.json();
        
        // 1. Stats
        if (data.stats) {
          setStats(data.stats);
          setIsBotConnected(true);
          setErrorMsg(null);
        }

        // 2. Broadcasts
        if (data.broadcasts && data.broadcasts.length > 0) {
          setBroadcasts(data.broadcasts);
        }

        // 3. TikTok Status
        if (data.tiktok) {
          setTiktok(data.tiktok);
          if (!silent) {
            setManualOverride(data.tiktok.manualOverride);
            setIsLiveOverride(data.tiktok.isLive);
            if (data.tiktok.liveTitle) setLiveTitleOverride(data.tiktok.liveTitle);
          }
        }

        // 4. Voice Channel Details
        if (data.voiceChannel) {
          if (data.voiceChannel.members) {
            setVoiceMembers(data.voiceChannel.members);
            setVoiceTotalCount(data.voiceChannel.count || data.voiceChannel.members.length);
          }
          if (data.voiceChannel.name) {
            setVoiceChannelName(data.voiceChannel.name);
          }
          if (data.voiceChannel.status !== undefined) {
            setVoiceChannelStatus(data.voiceChannel.status);
          }
        }

        // 5. Chat Messages
        if (data.chatMessages && Array.isArray(data.chatMessages)) {
          setChatMessagesList(data.chatMessages);
        }

        // 6. Game Data (user, deck, submissions)
        const updatedGameData: any = {
          userCv: data.user?.cv || data.user?.points || 0,
          dealtQuests: data.deck?.cards || [],
          dealt: data.deck?.dealt || false,
          cardStatuses: data.deck?.statuses || {},
          allSubmissions: data.submissions || []
        };
        setSyncGameData(updatedGameData);

      } else {
        throw new Error("Gagal melakukan sinkronisasi data.");
      }
    } catch (err: any) {
      if (!silent) {
        setIsBotConnected(false);
        setErrorMsg(err.message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // ==============================================================================
  // ========== WEBSOCKET SYNC CLIENT ============================================
  // ==============================================================================
  const socketRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const sendWsSync = () => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      const activeChanObj = chatChannelsList.find(c => c.id === activeChatChannel);
      const isVoice = activeChanObj?.type === "voice";
      const targetVoiceChannelId = isVoice ? activeChatChannel : "1435053596742914160";
      const isAdminUser = isUserAdmin(userRole);

      socket.send(JSON.stringify({
        action: "sync",
        data: {
          uid: currentUser?.uid || null,
          chatChannelId: activeChatChannel,
          voiceChannelId: targetVoiceChannelId,
          isAdmin: isAdminUser
        }
      }));
    }
  };

  useEffect(() => {
    if (!hasMounted) return;

    let socket: WebSocket;
    let reconnectTimer: NodeJS.Timeout;

    const connectWs = () => {
      const wsUrl = backendUrl.replace(/^http/, "ws") + "/sync";
      console.log("🔌 Connecting to WebSocket:", wsUrl);
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("✅ WebSocket Connected");
        setWsConnected(true);
      };
 
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.action === "syncResponse" && payload.data) {
            const data = payload.data;
            
            // 1. Stats
            if (data.stats) {
              setStats(data.stats);
              setIsBotConnected(true);
              setErrorMsg(null);
            }
 
            // 2. Broadcasts
            if (data.broadcasts && data.broadcasts.length > 0) {
              setBroadcasts(data.broadcasts);
            }
 
            // 3. TikTok Status
            if (data.tiktok) {
              setTiktok(data.tiktok);
              setManualOverride(data.tiktok.manualOverride);
              setIsLiveOverride(data.tiktok.isLive);
              if (data.tiktok.liveTitle) setLiveTitleOverride(data.tiktok.liveTitle);
            }
 
            // 4. Voice Channel Details
            if (data.voiceChannel) {
              if (data.voiceChannel.members) {
                setVoiceMembers(data.voiceChannel.members);
                setVoiceTotalCount(data.voiceChannel.count || data.voiceChannel.members.length);
              }
              if (data.voiceChannel.name) {
                setVoiceChannelName(data.voiceChannel.name);
              }
              if (data.voiceChannel.status !== undefined) {
                setVoiceChannelStatus(data.voiceChannel.status);
              }
            }
 
            // 5. Chat Messages
            if (data.chatMessages && Array.isArray(data.chatMessages)) {
              setChatMessagesList(data.chatMessages);
            }
 
            // 6. Game Data (user, deck, submissions)
            const updatedGameData = {
              userCv: data.user?.cv || data.user?.points || 0,
              dealtQuests: data.deck?.cards || [],
              dealt: data.deck?.dealt || false,
              cardStatuses: data.deck?.statuses || {},
              allSubmissions: data.submissions || []
            };
            setSyncGameData(updatedGameData);
          }
        } catch (err) {
          console.error("❌ Error parsing WS message:", err);
        }
      };
 
      socket.onclose = () => {
        console.log("🔌 WebSocket Disconnected, reconnecting in 3s...");
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 3000);
      };
 
      socket.onerror = (err) => {
        console.error("❌ WebSocket Error:", err);
        socket.close();
      };
    };
 
    connectWs();
 
    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimer);
    };
  }, [backendUrl, hasMounted]);

  // Sync state through WebSocket on local changes
  useEffect(() => {
    if (hasMounted && wsConnected) {
      sendWsSync();
    }
  }, [currentUser?.uid, activeChatChannel, userRole, hasMounted, wsConnected]);

  const triggerSyncRefresh = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      sendWsSync();
    } else {
      performUnifiedSync(true);
    }
  };

  const frame1Ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const frame6Ref = useRef<HTMLElement>(null);
  const frame7Ref = useRef<HTMLElement>(null);

  // Auto-scroll chat to bottom when messages update
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [chatMessagesList]);

  // Handle Authentication Session Monitoring
  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      // Monitor real Firebase login state
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          // Check if we have cached profile details
          let cachedProfile: any = null;
          if (typeof window !== "undefined") {
            const cached = localStorage.getItem(`crunchy_profile_${firebaseUser.uid}`);
            if (cached) {
              try {
                cachedProfile = JSON.parse(cached);
              } catch (e) {}
            }
          }

          // If cached profile exists, instantly set UI states to avoid loading screen or latency
          if (cachedProfile) {
            console.log("⚡ Instant profile load from localStorage cache:", cachedProfile.name);
            setCurrentUser(firebaseUser);
            setDisplayName(cachedProfile.name);
            setUserRole(cachedProfile.role);
            setUserAvatar(cachedProfile.avatar || null);
          } else {
            // Provide immediate defaults if no cache yet
            setCurrentUser(firebaseUser);
            setDisplayName(firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : "Discord Penonton"));
            setUserAvatar(firebaseUser.photoURL || null);
            setUserRole("Penonton Teater"); // Safe default role
          }

          // Define background validation & sync function
          const resolveProfileBackground = async () => {
            const isAdminEmail = false;
            
            const discordProv = firebaseUser.providerData.find((p: any) => 
              p.providerId.includes("discord") || 
              p.providerId.includes("oidc") ||
              firebaseUser.uid.startsWith("oidc:")
            );

            let discordId: string | null = null;
            if (discordProv && discordProv.uid) {
              const match = discordProv.uid.match(/\d{17,20}/);
              if (match) discordId = match[0];
            }
            if (!discordId && firebaseUser.uid) {
              const match = firebaseUser.uid.match(/\d{17,20}/);
              if (match) discordId = match[0];
            }

            // Pre-fetch user document from Firestore (holds role, display name, and custom channels)
            let firestoreData: any = null;
            try {
              const userDocPromise = getDoc(doc(db, "users", firebaseUser.uid));
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500));
              const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;
              if (userDoc && userDoc.exists()) {
                firestoreData = userDoc.data();
                console.log("🔥 Successfully pre-fetched user profile from Firestore:", firestoreData);
              }
            } catch (err) {
              console.warn("⚠️ Firestore fetch timed out or failed on profile pre-fetch:", err);
            }

            let resolvedRole = "Penonton Teater";
            let resolvedName = "Discord Penonton";
            let resolvedAvatar: string | null = null;

            if (discordId) {
              // Check if discordId is in volunteerables collection
              let isVolunteerable = false;
              if (isFirebaseConfigured && db) {
                try {
                  const volDoc = await getDoc(doc(db, "volunteerables", discordId));
                  if (volDoc.exists()) {
                    isVolunteerable = true;
                  }
                } catch (e) {
                  console.warn("Gagal fetch volunteerable status on auth state change:", e);
                }
              }

              // Fallback: Check local Bot API
              if (!isVolunteerable) {
                try {
                  const res = await fetch(`${backendUrl}/api/volunteerables/${discordId}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data && data.isVolunteerable) {
                      isVolunteerable = true;
                    }
                  }
                } catch (e) {
                  console.warn("Gagal fetch volunteerable dari backend API:", e);
                }
              }

              const isDiscordAdmin = discordId === "661135501226672129" || discordId === "1410583272173600819";
              resolvedRole = (isAdminEmail || isDiscordAdmin || isVolunteerable) ? "Volunteer Theater" : "Penonton Teater";
              
              if (discordId === "588988763204616214") {
                resolvedRole = "Ketua Kerupuk";
              } else if (discordId === "331053654318776320") {
                resolvedRole = "Ketua Keripik";
              }

              // Sync with Firestore users document if it differs
              if (isFirebaseConfigured && db && firestoreData && firestoreData.role !== resolvedRole) {
                try {
                  await setDoc(doc(db, "users", firebaseUser.uid), { role: resolvedRole }, { merge: true });
                  console.log(`🔥 Auto-synced user role in Firestore to: ${resolvedRole}`);
                } catch (e) {
                  console.warn("Gagal sync user role di Firestore:", e);
                }
              }

              // Fetch live Discord username and avatar from bot server
              try {
                console.log(`🤖 Fetching live name/avatar from Bot API for Discord ID: "${discordId}"...`);
                const botRes = await fetch(`${backendUrl}/api/discord-user/${discordId}`);
                if (botRes.ok) {
                  const botData = await botRes.json();
                  if (botData && botData.displayName && botData.displayName !== "Discord Penonton") {
                    resolvedName = botData.displayName;
                    console.log(`🎯 Successfully resolved live name: "${resolvedName}"`);
                  }
                  if (botData && botData.avatar) {
                    resolvedAvatar = botData.avatar;
                    console.log(`🖼️ Successfully resolved live avatar URL: "${resolvedAvatar}"`);
                  }
                }
              } catch (botErr) {
                console.warn("⚠️ Bot API unreachable for Discord user fetch:", botErr);
              }

              // Fallback to Firebase's default display name or email if bot returned fallback
              if (resolvedName === "Discord Penonton") {
                resolvedName = firestoreData?.name || firebaseUser.displayName || firebaseUser.providerData[0]?.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : "Discord Penonton");
              }
            } else {
              // Standard Email/Google flow
              resolvedRole = isAdminEmail ? "Volunteer Theater" : "Penonton Teater";
              resolvedName = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : "Penonton Teater");

              // Extract Google Avatar URL if present
              if (firebaseUser.photoURL) {
                resolvedAvatar = firebaseUser.photoURL;
              }

              if (firestoreData) {
                if (firestoreData.role) resolvedRole = firestoreData.role;
                if (firestoreData.name) resolvedName = firestoreData.name;
              }
            }

            // Load custom channels from Firestore if present, otherwise check localStorage
            let loadedChannels: any[] | null = null;
            if (firestoreData && firestoreData.customChannels) {
              loadedChannels = firestoreData.customChannels;
              console.log("🔥 Successfully loaded custom channels from Firestore:", loadedChannels);
            }

            if (!loadedChannels && typeof window !== "undefined") {
              const savedForUser = localStorage.getItem(`crunchyverse_custom_channels_${firebaseUser.uid}`);
              if (savedForUser) {
                try {
                  loadedChannels = JSON.parse(savedForUser);
                  console.log("💾 Loaded custom channels from localStorage (user specific):", loadedChannels);
                } catch (e) {
                  console.error("Gagal parse user specific channels:", e);
                }
              }
            }

            // Update state and cache in background if there's any mismatch
            if (
              !cachedProfile ||
              cachedProfile.name !== resolvedName ||
              cachedProfile.role !== resolvedRole ||
              cachedProfile.avatar !== resolvedAvatar
            ) {
              console.log("🔄 Background verification complete, updating user profile states & cache.");
              setDisplayName(resolvedName);
              setUserRole(resolvedRole);
              setUserAvatar(resolvedAvatar);

              const newCachedProfile = {
                uid: firebaseUser.uid,
                name: resolvedName,
                role: resolvedRole,
                avatar: resolvedAvatar,
                discordId: discordId,
                cachedAt: Date.now()
              };
              localStorage.setItem(`crunchy_profile_${firebaseUser.uid}`, JSON.stringify(newCachedProfile));
            }

            if (loadedChannels) {
              setChatChannelsList(loadedChannels);
            }
          };

          // Kick off background updates without awaiting (non-blocking)
          resolveProfileBackground().catch(err => {
            console.error("⚠️ Error in background profile resolver:", err);
          });

        } else {
          // Check if we have a simulated/mock user session saved (e.g. from Discord login fallback)
          const activeSession = localStorage.getItem("crunchy_session");
          if (activeSession) {
            try {
              const sessionUser = JSON.parse(activeSession);
              if (sessionUser && typeof sessionUser.uid === 'string' && sessionUser.uid.startsWith("sim-")) {
                setCurrentUser(sessionUser);
                setDisplayName(sessionUser.name);
                setUserRole(sessionUser.role);
                setUserAvatar(sessionUser.avatar || null);
                
                // Load simulated user specific channels
                const savedForUser = localStorage.getItem(`crunchyverse_custom_channels_${sessionUser.uid}`);
                if (savedForUser) {
                  try {
                    setChatChannelsList(JSON.parse(savedForUser));
                  } catch (chErr) {}
                }
                return;
              }
            } catch (e) {
              console.error("Gagal parse simulated session:", e);
            }
          }
          setCurrentUser(null);
          setUserRole(null);
          setDisplayName("");
          setUserAvatar(null);
        }
      });

      return unsubscribe;
    } else {
      // Database Local Simulation Mode
      // Pre-seed demo users in localStorage if empty
      const existingUsers = localStorage.getItem("crunchy_users");
      if (!existingUsers) {
        const defaultUsers = [
          {
            uid: "sim-admin-1",
            email: "admin@crunchyverse.com",
            password: "admin",
            name: "Rio Agustiawan (Volunteer)",
            role: "Volunteer Theater"
          },
          {
            uid: "sim-user-1",
            email: "penonton@gmail.com",
            password: "popcorn",
            name: "GaringMania",
            role: "Penonton Teater"
          }
        ];
        localStorage.setItem("crunchy_users", JSON.stringify(defaultUsers));
      }

      // Check if logged in previously in localStorage
      const activeSession = localStorage.getItem("crunchy_session");
      if (activeSession) {
        const sessionUser = JSON.parse(activeSession);
        setTimeout(() => {
          setCurrentUser(sessionUser);
          setDisplayName(sessionUser.name);
          setUserRole(sessionUser.role);

          // Load simulated user specific channels
          const savedForUser = localStorage.getItem(`crunchyverse_custom_channels_${sessionUser.uid}`);
          if (savedForUser) {
            try {
              setChatChannelsList(JSON.parse(savedForUser));
              console.log(`💾 [Simulation Mode] Loaded custom channels for ${sessionUser.name}:`, JSON.parse(savedForUser));
            } catch (e) {
              console.error("Failed to parse simulated user specific channels:", e);
            }
          }
        }, 0);
      }
    }
  }, []);

  // Trigger Curtain Opening & Auto Fetch on Mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMounted(true);
      setVoiceMembers(MOCK_VOICE_MEMBERS);
      setVoiceTotalCount(14);

      // Load presentation checkpoints from localStorage
      if (typeof window !== "undefined") {
        const savedCheckpoints = localStorage.getItem("crunchyverse_slideshow_checkpoints");
        if (savedCheckpoints) {
          try {
            setCheckpoints(JSON.parse(savedCheckpoints));
          } catch (e) {
            console.error("Failed to parse checkpoints from localStorage", e);
          }
        }

        const savedPins = localStorage.getItem("crunchyverse_pinned_channels");
        if (savedPins) {
          try {
            setPinnedChannels(JSON.parse(savedPins));
          } catch (e) {
            console.error("Failed to parse pinned channels from localStorage", e);
          }
        }

        const savedChannels = localStorage.getItem("crunchyverse_custom_channels");
        if (savedChannels) {
          try {
            setChatChannelsList(JSON.parse(savedChannels));
          } catch (e) {
            console.error("Failed to parse custom channels from localStorage", e);
          }
        }
      }

      // Generate random dust particles for spotlight
      const particles = Array.from({ length: 25 }).map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 8}s`,
        duration: `${6 + Math.random() * 8}s`,
        drift: `${-50 + Math.random() * 100}px`,
        size: 2 + Math.random() * 5
      }));
      setDustParticles(particles);

      // Fetch initial data from server
      performUnifiedSync(false);
      fetchChatChannels();
    }, 0);

    // Auto refresh data every 15 seconds (fallback HTTP polling only if WS is disconnected)
    const interval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) return;
      performUnifiedSync(true);
    }, 15000);

    // Listen to Escape key to close presentation fullscreen
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDivergentFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [backendUrl]);

  // Perform immediate sync when active channel, user or role changes (only if WS is not open)
  useEffect(() => {
    if (hasMounted && (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)) {
      performUnifiedSync(true);
    }
  }, [currentUser?.uid, activeChatChannel, userRole, hasMounted]);

  // Forward boundary wheel events from ALL scroll-frame-inner sections
  // to the snap container so normal snap navigation is preserved.
  // - Scroll UP at top    → snap to previous frame
  // - Scroll DOWN at bottom → snap to next frame
  useEffect(() => {
    const snapContainer = containerRef.current;
    if (!snapContainer) return;

    let isSnapping = false;

    const handleInnerFrameWheel = (e: WheelEvent) => {
      if (isSnapping) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const target = e.currentTarget as HTMLElement;
      const atTop    = target.scrollTop <= 1;
      const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;

      const scrollingUp   = e.deltaY < 0;
      const scrollingDown = e.deltaY > 0;

      // Only intercept when we're at a boundary edge in the scroll direction
      if (!(scrollingUp && atTop) && !(scrollingDown && atBottom)) return;

      e.preventDefault();
      e.stopPropagation();

      isSnapping = true;
      const originalSnapType = snapContainer.style.scrollSnapType || '';
      snapContainer.style.scrollSnapType = "none";

      // Move the snap container by one full viewport height in the same direction
      snapContainer.scrollBy({ top: scrollingDown ? window.innerHeight : -window.innerHeight, behavior: "smooth" });

      setTimeout(() => {
        snapContainer.style.scrollSnapType = originalSnapType;
        isSnapping = false;
      }, 500); // Allow transition animation to finish before re-enabling snapping
    };

    // Attach to every snap frame (scroll-frame = Frame 1, scroll-frame-inner = Frames 2–6)
    const innerFrames = snapContainer.querySelectorAll<HTMLElement>(".scroll-frame, .scroll-frame-inner");
    innerFrames.forEach(el => el.addEventListener("wheel", handleInnerFrameWheel, { passive: false }));

    return () => {
      innerFrames.forEach(el => el.removeEventListener("wheel", handleInnerFrameWheel));
    };
  }, []);

  // Intersection Observer to track active section for left sidebar highlighting
  useEffect(() => {
    const snapContainer = containerRef.current;
    if (!snapContainer) return;

    const observerOptions = {
      root: snapContainer,
      rootMargin: "-25% 0px -25% 0px",
      threshold: 0.1,
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target.id) {
          setActiveFrame(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    const frameIds = [
      "stage-welcome",
      "stage-dashboard",
      "stage-roles",
      "stage-leaderboard",
      "stage-divergent",
      ...(isUserAdmin(userRole) ? ["stage-chat"] : []),
      "stage-game"
    ];

    frameIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Lock scroll when curtains are closed to prevent pre-entry navigation
  useEffect(() => {
    if (isScrollUnlocked) return;

    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const keysToBlock = ["ArrowDown", "ArrowUp", "Space", "PageDown", "PageUp", "Home", "End"];
      if (keysToBlock.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Attach listeners globally to window with passive: false to block scrolling gestures
    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", handleKeyDown, { passive: false });

    // Also disable scroll on html and body elements
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyHeight = document.body.style.height;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlHeight = document.documentElement.style.height;

    document.body.style.overflow = "hidden";
    document.body.style.height = "100vh";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100vh";

    return () => {
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", handleKeyDown);

      document.body.style.overflow = originalBodyOverflow;
      document.body.style.height = originalBodyHeight;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.height = originalHtmlHeight;
    };
  }, [isScrollUnlocked]);

  // Handle Spotlight follow mouse in Frame 1
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!frame1Ref.current) return;
    const rect = frame1Ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlightPos({ x: `${x}%`, y: `${y}%` });
  };

  // 10 premium draf slides bertema Honkai: Star Rail Divergent Universe
  const divergentSlides = [
    {
      title: "Divergent Universe: Pengantar Anomaly",
      subtitle: "Konsep Dasar & Struktur Presentasi Teater",
      desc: "Divergent Universe merupakan pilar utama materi presentasi teater CrunchyVerse. Panggung ini didesain untuk mendemonstrasikan mekanika kalkulasi persamaan teater secara visual, interaktif, dan premium.",
      badge: "BAGIAN 01 · PENGANTAR",
      icon: <Sparkles className="h-5 w-5 text-sky-400 animate-pulse" />,
      points: [
        "Materi interaktif bertema Honkai: Star Rail 4.3.",
        "Visualisasi kasta teater & persamaan algebra secara real-time.",
        "Presentasi visual performa tinggi dengan transisi velvet."
      ]
    },
    {
      title: "Sistem Kalkulasi Persamaan Teater",
      subtitle: "Formula & Algoritma Value Role (CV)",
      desc: "Kalkulasi kasta Anomaly CrunchyVerse didasarkan pada perolehan role Discord yang memiliki bobot nominal terhitung. Sistem secara otomatis memetakan member dengan kontribusi nilai poin tertinggi.",
      badge: "BAGIAN 02 · MEKANIKA",
      icon: <Award className="h-5 w-5 text-amber-400 animate-pulse" />,
      points: [
        "Bobot nilai otomatis diuraikan dari nama role Discord.",
        "Sorting real-time & rincian perolehan role member.",
        "Dashboard interaktif ramah pengguna untuk Volunteer."
      ]
    },
    {
      title: "Weighted Curios & Buffs Panggung",
      subtitle: "Interaksi Pengguna & Fitur Hiburan",
      desc: "Teater CrunchyVerse menyediakan berbagai Weighted Curios dan Buff panggung seperti status live otomatis untuk TikTok, sinkronisasi bot Cakey, serta broadcast pengumuman server.",
      badge: "BAGIAN 03 · INTEGRASI",
      icon: <Radio className="h-5 w-5 text-rose-400 animate-pulse" />,
      points: [
        "Status live TikTok Volunteer dengan deteksi cron 3 menit.",
        "Sinkronisasi durasi voice chat real-time berpresisi tinggi.",
        "Buku besar arsip kasta teater interaktif ber-paginasi."
      ]
    },
    {
      title: "Persamaan Aljabar: Ekstrapolasi Numerik",
      subtitle: "Meningkatkan Akurasi Perhitungan Panggung",
      desc: "Modul ekstrapolasi numerik memproyeksikan pertumbuhan Value Role (CV) setiap Anomaly berdasarkan tren keaktifan bulanan dan keikutsertaan event panggung CrunchyVerse.",
      badge: "BAGIAN 04 · PERSAMAAN",
      icon: <Activity className="h-5 w-5 text-sky-400 animate-pulse" />,
      points: [
        "Prediksi tren pertumbuhan keaktifan berkala.",
        "Deteksi anomali data & pembersihan otomatis.",
        "Visualisasi grafik performa untuk tim Volunteer."
      ]
    },
    {
      title: "Weighted Curios: Mekanisme Berkah Sakti",
      subtitle: "Item Koleksi Khusus & Pengubah Stat Panggung",
      desc: "Curios memberikan bonus multipler stat kepada Anomaly di leaderboard. Beberapa Curios legendaris dapat melipatgandakan perolehan poin dari aktivitas streaming dan partisipasi event teater.",
      badge: "BAGIAN 05 · CURIOS",
      icon: <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />,
      points: [
        "Multiplier bonus hingga 2.5x untuk panggung utama.",
        "Drop rate dinamis berdasarkan tingkat kesulitan event.",
        "Efek kosmetik premium pada profil leaderboard Discord."
      ]
    },
    {
      title: "Proses Ekstraksi & Pemetaan Memori",
      subtitle: "Penyimpanan Berkas Latar Belakang & Log Teater",
      desc: "Sistem penyimpanan modular teater merekam log transaksi bot secara efisien. Memastikan seluruh data riwayat kenaikan level dan pencapaian Anomaly terarsip dengan aman.",
      badge: "BAGIAN 06 · EKSTRAKSI",
      icon: <Save className="h-5 w-5 text-rose-400 animate-pulse" />,
      points: [
        "Log transaksi real-time dengan skema fail-safe.",
        "Ekspor data terkompresi untuk analisis musiman.",
        "Sistem pemulihan cepat jika terjadi kegagalan server."
      ]
    },
    {
      title: "Event Berkah (Buffs) Panggung Utama",
      subtitle: "Event Musiman & Pengganda Poin Terjadwal",
      desc: "Buff panggung diaktifkan selama pertunjukan langsung atau perayaan khusus CrunchyVerse. Meningkatkan interaksi penonton dan memberikan penghargaan instan bagi partisipan aktif.",
      badge: "BAGIAN 07 · BUFFS",
      icon: <Radio className="h-5 w-5 text-sky-400 animate-pulse" />,
      points: [
        "Event drop rate tinggi setiap akhir pekan teater.",
        "Tantangan kuis cepat dengan hadiah kasta instan.",
        "Integrasi otomatis ke kanal khusus pengumuman bot."
      ]
    },
    {
      title: "Tantangan Anomaly: Ujian Bos & Musuh",
      subtitle: "Statistik Pertempuran & Strategi Kemenangan",
      desc: "Papan klasemen tantangan mencatat kecepatan penyelesaian rintangan Divergent Universe. Hanya Anomaly dengan strategi Weighted Curios terbaik yang mampu menembus rekor tercepat.",
      badge: "BAGIAN 08 · TANTANGAN",
      icon: <Award className="h-5 w-5 text-amber-400 animate-pulse" />,
      points: [
        "Leaderboard khusus kecepatan klir (Clear Time).",
        "Rekomendasi komposisi kasta terbaik secara dinamis.",
        "Medali digital eksklusif untuk 3 besar penantang."
      ]
    },
    {
      title: "Sinkronisasi Discord & API Web Teater",
      subtitle: "Komunikasi Dua Arah Berkecepatan Tinggi",
      desc: "Memastikan sinkronisasi data instan antara bot Discord dan web front-end CrunchyVerse. Setiap pembaruan kasta, status live, atau log aktivitas langsung tecermin dalam hitungan milidetik.",
      badge: "BAGIAN 09 · INTEGRASI",
      icon: <Tv className="h-5 w-5 text-rose-400 animate-pulse" />,
      points: [
        "Websockets untuk pembaruan instan tanpa refresh halaman.",
        "Optimasi performa query database kasta teater.",
        "Validasi token keamanan untuk hak akses Volunteer."
      ]
    },
    {
      title: "Menunggu Gambar Presentasi Penuh",
      subtitle: "Draf Slide Blueprint Akhir CrunchyVerse",
      desc: "Blueprint presentasi modular ini telah siap sepenuhnya secara fungsional. Kirimkan berkas gambar presentasi akhir Anda (.png/.jpg) untuk menggantikan blueprint draf teater ini secara instan!",
      badge: "BAGIAN 10 · KESIMPULAN",
      icon: <Tv className="h-5 w-5 text-emerald-400 animate-pulse" />,
      points: [
        "Tata letak modular slide responsif (desktop & mobile).",
        "Dukungan penuh asset gambar lokal resolusi tinggi.",
        "Volunteer Theater dapat memperbarui materi kapan saja."
      ]
    }
  ];

  // Helper to save checkpoints with localStorage sync
  const saveCheckpointsToLocalStorage = (newCheckpoints: Array<number | null>) => {
    setCheckpoints(newCheckpoints);
    if (typeof window !== "undefined") {
      localStorage.setItem("crunchyverse_slideshow_checkpoints", JSON.stringify(newCheckpoints));
    }
  };

  // Click on a checkpoint slot (quick save or jump)
  const handleCheckpointClick = (slotIndex: number) => {
    if (editingCheckpointSlot !== null) {
      // If currently in editing mode, cancel editing if slot is clicked
      setEditingCheckpointSlot(null);
      return;
    }

    const savedSlideIdx = checkpoints[slotIndex];
    if (savedSlideIdx === null) {
      // Slot is empty -> Quick Save current active slide index
      const newCheckpoints = [...checkpoints];
      newCheckpoints[slotIndex] = activeSlide;
      saveCheckpointsToLocalStorage(newCheckpoints);
    } else {
      // Slot is filled -> Quick Jump to saved slide index
      setActiveSlide(savedSlideIdx);
    }
  };

  // Clear checkpoint slot
  const handleCheckpointDelete = (slotIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newCheckpoints = [...checkpoints];
    newCheckpoints[slotIndex] = null;
    saveCheckpointsToLocalStorage(newCheckpoints);
    if (editingCheckpointSlot === slotIndex) {
      setEditingCheckpointSlot(null);
    }
  };

  // Toggle Edit selection mode for a slot
  const toggleEditCheckpoint = (slotIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingCheckpointSlot === slotIndex) {
      setEditingCheckpointSlot(null);
    } else {
      setEditingCheckpointSlot(slotIndex);
    }
  };

  // Handle click on slide card (either normal jump or assign to active edit slot)
  const handleSlideSelect = (slideIdx: number) => {
    if (editingCheckpointSlot !== null) {
      const newCheckpoints = [...checkpoints];
      newCheckpoints[editingCheckpointSlot] = slideIdx;
      saveCheckpointsToLocalStorage(newCheckpoints);
      setEditingCheckpointSlot(null); // Exit edit mode
      setActiveSlide(slideIdx); // Also focus on selected slide
    } else {
      setActiveSlide(slideIdx);
    }
  };

  // Toggle pin state of a channel
  const togglePinChannel = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedChannels(prev => {
      const next = prev.includes(channelId) 
        ? prev.filter(id => id !== channelId) 
        : [...prev, channelId];
      if (typeof window !== "undefined") {
        localStorage.setItem("crunchyverse_pinned_channels", JSON.stringify(next));
      }
      return next;
    });
  };

  // Persist custom channels in Database (Firebase Firestore & localStorage & Express Bot Backend)
  const saveChannelsToDb = async (updatedList: Array<{ id: string; name: string; type: string; desc: string }>) => {
    // 1. Always update state
    setChatChannelsList(updatedList);

    // 2. Backup in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("crunchyverse_custom_channels", JSON.stringify(updatedList));
      if (currentUser) {
        localStorage.setItem(`crunchyverse_custom_channels_${currentUser.uid}`, JSON.stringify(updatedList));
      }
    }

    // 3. Persist to Express Bot Backend API
    try {
      await signedFetch(`${backendUrl}/api/chat/channels`, {
        method: "POST",
        body: JSON.stringify({ channels: updatedList }),
        sensitive: true
      });
    } catch (err) {
      console.warn("⚠️ Gagal menyimpan saluran ke bot backend:", err);
    }

    if (isFirebaseConfigured && db && currentUser) {
      try {
        await withTimeout(setDoc(doc(db, "users", currentUser.uid), {
          customChannels: updatedList
        }, { merge: true }));
        console.log("💾 Berhasil menyimpan daftar saluran ke Firebase Firestore.");
      } catch (err) {
        console.error("⚠️ Gagal menyimpan saluran ke Firebase Firestore:", err);
      }
    }
  };

  // Reset all channels in sidebar
  const handleResetChannels = () => {
    setPinnedChannels([]);
    setActiveChatChannel("");
    if (typeof window !== "undefined") {
      localStorage.setItem("crunchyverse_pinned_channels", JSON.stringify([]));
    }
    saveChannelsToDb([]);
  };

  // Add custom Discord channel dynamically
  const handleAddCustomChannel = async () => {
    const id = customChannelId.trim();
    if (!id) return;

    // Check for duplicate
    if (chatChannelsList.some(c => c.id === id)) {
      alert("Saluran dengan ID ini sudah ada di daftar!");
      setCustomChannelId("");
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/chat/channels/${id}`);
      if (res.ok) {
        const chan = await res.json();
        if (chan && chan.id) {
          const updated = [...chatChannelsList, chan];
          setActiveChatChannel(chan.id);
          setCustomChannelId("");
          saveChannelsToDb(updated);
          return;
        }
      }
    } catch (err) {
      console.warn("Backend API check failed or unreachable, using fallback simulation:", err);
    }

    // Fallback: Simulation quick-add
    const name = customChannelType === "text" 
      ? `✨ ┇ custom-${id.slice(-4)}` 
      : `📇 : CUSTOM-${id.slice(-4)}`;
    
    const newChan = {
      id,
      name,
      type: customChannelType,
      desc: `Saluran simulasi kustom terintegrasi (ID: ${id}) 🎭`
    };

    const updated = [...chatChannelsList, newChan];
    setActiveChatChannel(id);
    setCustomChannelId("");
    saveChannelsToDb(updated);
  };

  // Fetch Sparxie chat channels
  async function fetchChatChannels() {
    try {
      const res = await fetch(`${backendUrl}/api/chat/channels`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data)) {
          setChatChannelsList(data);
        }
      }
    } catch (err) {
      console.warn("Gagal fetch chat channels:", err);
    }
  };


  // Send Chat message
  const handleSendChatMessage = async () => {
    if (!chatInputVal.trim() && !attachedMediaUrl) return;

    // Parse Discord Message ID from Reply ID/Link
    let resolvedReplyId = replyingToMsg ? replyingToMsg.id : null;
    if (discordReplyRef.trim()) {
      const match = discordReplyRef.trim().match(/\d{17,20}$/);
      if (match) {
        resolvedReplyId = match[0];
      } else if (/^\d{17,20}$/.test(discordReplyRef.trim())) {
        resolvedReplyId = discordReplyRef.trim();
      }
    }

    const bodyData = {
      content: chatInputVal,
      mediaUrl: attachedMediaUrl,
      replyToMsgId: resolvedReplyId,
      authorName: displayName || "Discord Penonton",
      authorAvatar: userAvatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=" + (displayName || "penonton")
    };

    const sentText = chatInputVal;
    setChatInputVal("");
    setReplyingToMsg(null);
    setAttachedMediaUrl(null);
    setDiscordReplyRef("");
    setShowEmojiTray(false);

    try {
      const res = await signedFetch(`${backendUrl}/api/chat/channels/${activeChatChannel}/messages`, {
        method: "POST",
        body: JSON.stringify(bodyData),
        sensitive: true
      });

      if (res.ok) {
        performUnifiedSync(true);
        
        // Ensure this custom channel is added and saved in database when the user chats in it
        if (activeChatChannel && /^\d{17,20}$/.test(activeChatChannel)) {
          if (!chatChannelsList.some(c => c.id === activeChatChannel)) {
            const newChan = {
              id: activeChatChannel,
              name: `✨ ┇ custom-${activeChatChannel.slice(-4)}`,
              type: "text",
              desc: `Saluran terintegrasi (ID: ${activeChatChannel}) 🎭`
            };
            const updated = [...chatChannelsList, newChan];
            saveChannelsToDb(updated);
          } else {
            // Just force saving the current list to guarantee it's in the database
            saveChannelsToDb(chatChannelsList);
          }
        }

        // If sending to Sparxie chatbot channel, fetch again after 1.1s for bot response
        if (activeChatChannel === "1403255548698300423" || sentText.toLowerCase().includes("sparxie")) {
          setTimeout(() => {
            performUnifiedSync(true);
          }, 1100);
        }
      }
    } catch (err) {
      console.warn("Gagal mengirim pesan chat:", err);
    }
  };


  // Handle Auth Success from child component
  const handleAuthSuccess = (user: any, role: string, name: string, avatarUrl: string | null = null) => {
    setCurrentUser(user);
    setUserRole(role);
    setDisplayName(name);
    setUserAvatar(avatarUrl);
    
    if (user && user.uid) {
      const cachedProfile = {
        uid: user.uid,
        name: name,
        role: role,
        avatar: avatarUrl,
        discordId: user.discordId || (typeof user.uid === "string" && user.uid.startsWith("sim-discord-") ? user.uid.replace("sim-discord-", "") : null),
        cachedAt: Date.now()
      };
      localStorage.setItem(`crunchy_profile_${user.uid}`, JSON.stringify(cachedProfile));
    }

    if (!isFirebaseConfigured || !auth || (user && typeof user.uid === "string" && user.uid.startsWith("sim-"))) {
      localStorage.setItem("crunchy_session", JSON.stringify(user));
    }
  };

  // Sign out handler
  const handleLogout = async () => {
    localStorage.removeItem("crunchy_session");
    if (currentUser?.uid) {
      localStorage.removeItem(`crunchy_profile_${currentUser.uid}`);
    }
    if (isFirebaseConfigured && auth) {
      try {
        await signOut(auth);
      } catch (err) {}
      setUserAvatar(null);
    }
    setCurrentUser(null);
    setUserRole(null);
    setDisplayName("");
    setUserAvatar(null);
  };

  // Publish Volunteer Override Settings to Bot Express Backend API
  const publishVolunteerSettings = async (overrideState: boolean, isLiveState: boolean, titleText: string) => {
    setLoading(true);
    try {
      const res = await signedFetch(`${backendUrl}/api/tiktok/override`, {
        method: "POST",
        body: JSON.stringify({
          manualOverride: overrideState,
          isLive: isLiveState,
          liveTitle: titleText
        }),
        sensitive: true
      });

      if (!res.ok) throw new Error("Gagal mempublikasikan override.");
      const data = await res.json();
      setTiktok(data.state);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(`Gagal mempublikasikan status kontrol ke bot: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper to format numbers safely after mount to avoid hydration mismatch
  const formatNum = (num: number) => {
    if (!hasMounted) return num.toString();
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const cleanTiktokUsername = tiktok.username.startsWith('@') ? tiktok.username : `@${tiktok.username}`;
  const watchUrl = `https://www.tiktok.com/${cleanTiktokUsername}${tiktok.isLive ? '/live' : ''}`;

  // Mock TikTok Live Toggle (for visual interactive demonstration)
  const toggleTikTokLive = () => {
    const nextLiveState = !tiktok.isLive;
    setTiktok(prev => ({
      ...prev,
      isLive: nextLiveState,
      liveTitle: nextLiveState 
        ? "🎪 STAGE LIVE: Nobar Konser & Chit-chat Bareng Member Anomaly! 🍿"
        : null
    }));
    
    // Sync to backend if Volunteer is toggling via regular button
    if (isUserAdmin(userRole)) {
      publishVolunteerSettings(manualOverride, nextLiveState, liveTitleOverride);
    }
  };

  // Safe helper to scroll without scroll-snap glitching
  const safeScrollTo = (elementId: string) => {
    const snapContainer = containerRef.current;
    const targetElement = document.getElementById(elementId);
    if (!snapContainer || !targetElement) return;

    const originalSnapType = snapContainer.style.scrollSnapType || '';
    snapContainer.style.scrollSnapType = "none";
    
    targetElement.scrollIntoView({ behavior: "smooth" });

    setTimeout(() => {
      snapContainer.style.scrollSnapType = originalSnapType;
    }, 500);
  };

  // Scroll to Frame 2
  const scrollToStage = () => {
    safeScrollTo("stage-dashboard");
  };

  // Scroll to Frame 3
  const scrollToRoles = () => {
    safeScrollTo("stage-roles");
  };

  // Scroll to Frame 4 (Leaderboard)
  const scrollToLeaderboard = () => {
    safeScrollTo("stage-leaderboard");
  };

  // Scroll to Frame 5 (Divergent Universe)
  const scrollToDivergent = () => {
    safeScrollTo("stage-divergent");
  };

  // Scroll to Frame 6 (Sparxie Chat Console)
  const scrollToChat = () => {
    safeScrollTo("stage-chat");
  };

  // Scroll to Frame 7 (Interactive Quest Game)
  const scrollToGame = () => {
    safeScrollTo("stage-game");
  };

  // Scroll to Frame 1 (Welcome Stage)
  const scrollToWelcome = () => {
    safeScrollTo("stage-welcome");
  };

  const sidebarItems = [
    { id: "stage-welcome", label: "Lobi Utama", icon: Home },
    { id: "stage-dashboard", label: "Dashboard Teater", icon: Tv },
    { id: "stage-roles", label: "Arsip Kasta", icon: Users },
    { id: "stage-leaderboard", label: "Papan Jawara", icon: Award },
    { id: "stage-divergent", label: "Divergent Universe", icon: Layers },
    ...(isUserAdmin(userRole) ? [{ id: "stage-chat", label: "Konsol Obrolan", icon: MessageSquare }] : []),
    { id: "stage-game", label: "Tirai Tantangan", icon: Gamepad2 }
  ];

  return (
    <div 
      ref={containerRef} 
      className="scroll-container bg-theater-black text-foreground antialiased selection:bg-theater-red-light selection:text-white"
      style={{ overflowY: isScrollUnlocked ? "scroll" : "hidden" }}
    >
      
      {/* Global Curtain Overlay */}
      {!isScrollUnlocked && (
        <div className="fixed inset-0 z-[100] overflow-hidden pointer-events-auto">
          {/* Theatrical Curtain Left */}
          <div 
            className={`absolute top-0 left-0 bottom-0 w-1/2 curtain-fabric transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] z-[101] origin-left border-r-4 border-theater-gold/50 ${
              curtainsOpened ? "-translate-x-[90%] scale-x-95 rotate-y-12" : "translate-x-0"
            }`}
          >
            <div className="absolute inset-0 curtain-shadow-right" />
          </div>

          {/* Theatrical Curtain Right */}
          <div 
            className={`absolute top-0 right-0 bottom-0 w-1/2 curtain-fabric transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] z-[101] origin-right border-l-4 border-theater-gold/50 ${
              curtainsOpened ? "translate-x-[90%] scale-x-95 rotate-y-12" : "translate-x-0"
            }`}
          >
            <div className="absolute inset-0 curtain-shadow-left" />
          </div>

          {/* Centered Floating Open Curtain Prompt */}
          {!curtainsOpened && (
            <div className="absolute inset-0 flex items-center justify-center z-[102] pointer-events-auto bg-neutral-950/40 backdrop-blur-[2px] transition-all duration-1000">
              <button
                onClick={() => {
                  setCurtainsOpened(true);
                  setTimeout(() => {
                    setIsScrollUnlocked(true);
                  }, 1000);
                }}
                className="group relative px-8 sm:px-12 py-5 sm:py-7 rounded-2xl border-2 border-theater-gold bg-gradient-to-br from-theater-black via-neutral-900 to-theater-black text-theater-gold hover:text-white font-display font-black text-xs sm:text-sm tracking-[0.2em] uppercase shadow-[0_0_50px_rgba(212,175,55,0.35)] hover:shadow-[0_0_80px_rgba(212,175,55,0.6)] transition-all duration-500 hover:scale-105 active:scale-95 cursor-pointer flex flex-col items-center gap-3 overflow-hidden"
              >
                {/* Shimmer overlay effect */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                {/* Inner frame */}
                <span className="absolute inset-1 rounded-xl border border-theater-gold/30 group-hover:border-theater-gold/60 transition-colors pointer-events-none" />
                <div className="flex flex-col items-center gap-2.5 relative z-10">
                  <Ticket size={24} className="text-theater-gold group-hover:scale-110 transition-transform duration-300 animate-bounce" />
                  <span className="font-extrabold tracking-[0.25em]">Buka Tirai Teater</span>
                  <span className="text-[8px] sm:text-[9px] font-bold tracking-widest text-neutral-500 group-hover:text-neutral-300 transition-colors mt-1 font-sans">Click to Enter Stage</span>
                </div>
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Left Floating Navigation Sidebar */}
      {isScrollUnlocked && (
        <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col items-center gap-3 bg-neutral-950/80 border border-theater-gold/15 backdrop-blur-md px-2.5 py-5 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.85),_0_0_15px_rgba(212,175,55,0.05)]">
          {/* Brand Indicator / Mini Logo */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-theater-red to-theater-red-dark border border-theater-gold/30 flex items-center justify-center shadow-md animate-pulse-glow mb-1">
            <span className="font-display font-black text-[10px] text-theater-gold">CV</span>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-theater-gold/25 to-transparent mb-1" />

          {/* Navigation Buttons */}
          {sidebarItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeFrame === item.id;
            return (
              <button
                key={item.id}
                onClick={() => safeScrollTo(item.id)}
                className={`group relative w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-theater-gold/10 border-theater-gold text-theater-gold shadow-[0_0_15px_rgba(212,175,55,0.25)] scale-105"
                    : "bg-neutral-950/40 border-neutral-900/60 text-neutral-500 hover:border-theater-gold/40 hover:text-theater-gold hover:bg-neutral-900/30 hover:scale-105"
                }`}
              >
                <IconComponent size={16} className="transition-transform duration-300 group-hover:scale-110" />
                
                {/* Tooltip */}
                <div className="absolute left-12 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-theater-gold/35 text-theater-gold text-[9px] tracking-widest font-black uppercase shadow-2xl opacity-0 translate-x-[-10px] pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto transition-all duration-300 whitespace-nowrap z-50">
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* FRAME 1: THE WELCOME STAGE */}
      <section 
        id="stage-welcome"
        ref={frame1Ref}
        onMouseMove={handleMouseMove}
        className="scroll-frame flex flex-col justify-between items-center relative overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(6,1,2,0.9), rgba(6,1,2,0.7)), url('/theater_stage_bg.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Spotlight Overlay */}
        <div 
          className="absolute inset-0 spotlight transition-all duration-300 pointer-events-none mix-blend-screen z-10"
          style={{
            "--x": spotlightPos.x,
            "--y": spotlightPos.y
          } as React.CSSProperties}
        />

        {/* Floating Dust Particles */}
        <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
          {dustParticles.map((p) => (
            <div
              key={p.id}
              className="dust-particle"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.duration,
                "--drift": p.drift,
                width: `${p.size}px`,
                height: `${p.size}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>


        {/* Top Valance Curtain Border */}
        <div className="absolute top-0 left-0 right-0 h-16 sm:h-24 curtain-valance z-40 flex items-center justify-between px-6 border-b-2 border-theater-gold/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-theater-gold animate-ping" />
            <span className="font-display font-bold tracking-widest text-theater-gold text-xs sm:text-sm select-none">CRUNCHYVERSE SHOW</span>
          </div>
          
          <div className="flex items-center gap-2.5 sm:gap-4 z-50">
            {/* LOKET TIKET / AUTH BUTTON */}
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                {/* User Profile Avatar */}
                <div className="h-8 w-8 rounded-full overflow-hidden border border-theater-gold/45 bg-neutral-950 flex items-center justify-center shrink-0 shadow-md shadow-theater-black">
                  {userAvatar ? (
                    <img src={userAvatar} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <User size={14} className="text-theater-gold/80" />
                  )}
                </div>

                <div className="hidden md:flex flex-col text-right text-xs">
                  <span className="font-extrabold text-white leading-none">{displayName}</span>
                  <span className={`text-[9px] font-black tracking-widest uppercase mt-0.5 ${
                    isUserAdmin(userRole) ? "text-theater-gold" : "text-neutral-400"
                  }`}>
                    {userRole === "Volunteer Theater" ? "🎭 VOLUNTEER" : 
                     userRole === "Ketua Kerupuk" ? "👑 KETUA KERUPUK" : 
                     userRole === "Ketua Keripik" ? "👑 KETUA KERIPIK" : "🍿 PENONTON"}
                  </span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="bg-theater-red-dark/80 hover:bg-theater-red text-white p-2 rounded-xl border border-theater-red-light/30 transition-all flex items-center gap-1.5 cursor-pointer text-xs font-bold uppercase tracking-wider"
                  title="Keluar Teater"
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowLoginModal(true)}
                className="bg-gradient-to-r from-theater-gold to-theater-gold-dim hover:from-theater-gold-dim hover:to-theater-gold text-theater-black font-black text-xs uppercase tracking-widest py-2 px-4 rounded-xl shadow-lg shadow-theater-gold/10 hover:scale-105 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Ticket size={13} />
                <span>Loket Tiket</span>
              </button>
            )}

            {isUserAdmin(userRole) && (
              <button 
                onClick={() => setShowConfig(!showConfig)}
                className="text-xs font-bold text-theater-gold/70 hover:text-theater-gold transition-colors flex items-center gap-1.5 cursor-pointer py-1 px-3 rounded-full border border-theater-gold/30 bg-theater-black/50 hover:bg-theater-red-dark/80"
              >
                <Settings size={12} className="animate-spin-slow" />
                <span className="hidden sm:inline">Sinyal Bot</span>
              </button>
            )}
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest border transition-all ${
              isBotConnected 
                ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400" 
                : "border-theater-red-light/30 bg-theater-red-dark/30 text-theater-red-light animate-pulse"
            }`}>
              {isBotConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isBotConnected ? "CONNECTED" : "STANDBY"}
            </span>
          </div>
        </div>

        {/* Welcome Text Content */}
        <div className="flex-1 flex flex-col justify-center items-center px-4 relative z-20 text-center max-w-4xl mt-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-theater-gold/20 bg-theater-red-dark/60 text-theater-gold text-xs font-bold tracking-wider uppercase mb-6 shadow-lg shadow-theater-red-dark/35 animate-float">
            <Sparkles size={14} className="text-theater-gold" />
            <span>Pertunjukan Akbar Anomaly</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl md:text-8xl font-black text-white tracking-wider uppercase leading-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.9)] select-none">
            Crunchy<span className="text-theater-red-light bg-gradient-to-r from-theater-red-light to-red-400 bg-clip-text text-transparent drop-shadow-none">Verse</span>
          </h1>

          <div className="h-1.5 w-40 bg-gradient-to-r from-transparent via-theater-gold to-transparent my-6 sm:my-8" />

          <p className="text-sm sm:text-lg md:text-xl text-neutral-300 font-light max-w-2xl leading-relaxed tracking-wide mb-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
            Tirai panggung telah terbuka! Selamat datang di koloseum hiburan para Anomaly. Saksikan interaksi live kami, periksa pengumuman terhangat, dan rasakan kemeriahan panggung spektakuler CrunchyVerse.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <a 
              href="https://discord.gg/sGgCVMssDS"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-theater-gold via-[#ffd700] to-theater-gold-dim border-2 border-yellow-300 hover:border-white px-8 py-4 rounded-xl text-sm font-black uppercase tracking-widest text-neutral-950 shadow-xl shadow-theater-gold/30 hover:shadow-theater-gold/50 transition-all hover:scale-105 duration-300 cursor-pointer active:scale-95 animate-pulse-glow"
            >
              <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
              <span>VIP Ticket Entry</span>
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
            
            <a 
              href="https://hsr.hoyoverse.com/id-id/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 text-neutral-300 hover:text-white px-5 py-2.5 font-bold text-xs tracking-wider uppercase border border-neutral-700 hover:border-neutral-500 rounded-xl bg-theater-black/40 hover:bg-neutral-900/40 transition-all z-20"
            >
              <span>Honkai: Star Rail 4.3</span>
              <img 
                src="/march7th.png" 
                alt="March 7th" 
                className="h-5 w-5 rounded bg-neutral-950 object-cover shrink-0" 
              />
            </a>
          </div>
        </div>

        {/* Scroll Indicator */}
        <button 
          onClick={scrollToStage}
          className="pb-8 flex flex-col items-center gap-2 text-theater-gold/60 hover:text-theater-gold transition-colors z-20 cursor-pointer animate-bounce"
        >
          <span className="text-[10px] font-black tracking-widest uppercase">Scroll ke Bawah</span>
          <ChevronDown size={20} />
        </button>

        {/* Stage Lights Ground Reflection */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-theater-gold to-transparent opacity-80 z-20" />
      </section>

      {/* LOKET TIKET & CONFIG MODALS */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
        onSuccess={handleAuthSuccess} 
      />

      <ConfigModal 
        isOpen={showConfig} 
        onClose={() => setShowConfig(false)} 
        backendUrl={backendUrl} 
        setBackendUrl={setBackendUrl} 
        isBotConnected={isBotConnected} 
        onTestConnection={() => {
          performUnifiedSync(false);
        }} 
      />

      {/* FRAME 2: THE DASHBOARD & STATS STAGE */}
      <section 
        id="stage-dashboard"
        className="scroll-frame-inner bg-theater-black relative z-20 flex flex-col"
        style={{
          background: 'radial-gradient(circle at top, #180004 0%, #060102 100%)'
        }}
      >
        {/* Theatrical Curtain Header Trim */}
        <div className="w-full h-4 bg-gradient-to-r from-theater-red-dark via-theater-red-light to-theater-red-dark border-b border-theater-gold/50 shadow-md flex items-center justify-center" />

        {/* Dashboard Content Container */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 md:py-10 flex-1 flex flex-col gap-6 md:gap-8 justify-center">
          
          {/* Dashboard Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-900 pb-5">
            <div>
              <div className="flex items-center gap-2 text-theater-red-light text-xs font-bold uppercase tracking-widest mb-1">
                <Tv size={14} />
                <span>Pusat Informasi & Statistik Live</span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-wide uppercase select-none">
                LOBI <span className="text-theater-gold">CRUNCHYVERSE</span>
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              {currentUser && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-theater-gold/20 bg-theater-gold/5 text-xs text-theater-gold font-bold">
                  {/* User Profile Avatar */}
                  <div className="h-5 w-5 rounded-full overflow-hidden border border-theater-gold/40 bg-neutral-950 flex items-center justify-center shrink-0">
                    {userAvatar ? (
                      <img src={userAvatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <User size={10} className="text-theater-gold" />
                    )}
                  </div>
                  <span>{displayName} ({userRole === "Volunteer Theater" ? "Volunteer" : userRole === "Ketua Kerupuk" ? "Ketua Kerupuk" : userRole === "Ketua Keripik" ? "Ketua Keripik" : "Penonton"})</span>
                </div>
              )}
              
              <button 
                onClick={() => {
                  performUnifiedSync(false);
                }}
                disabled={loading}
                className="bg-neutral-900 border border-neutral-800 hover:border-theater-gold/40 p-2.5 rounded-xl text-neutral-400 hover:text-white transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
                title="Refresh Live Data"
              >
                <RefreshCw size={16} className={`${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-1.5 px-3 flex items-center gap-2 text-xs">
                <span className="text-neutral-500 font-medium">Mode:</span>
                <span className={`font-bold flex items-center gap-1.5 ${isBotConnected ? 'text-emerald-400' : 'text-theater-gold'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isBotConnected ? 'bg-emerald-400' : 'bg-theater-gold'}`} />
                  {isBotConnected ? "Discord Bot Live API" : "Simulasi/Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* MAIN DUAL GRID CONTAINER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
            
            {/* LEFT COLUMN: TIKTOK & BROADCASTS (SPAN 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6 md:gap-8 w-full">
              
              {/* TIKTOK STREAM BAR */}
              <div className="relative rounded-2xl border border-theater-gold/30 bg-neutral-950/50 backdrop-blur-md p-4 shadow-xl overflow-hidden group">
                {/* Glowing red accent light inside card when Live */}
                {tiktok.isLive && (
                  <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-theater-red-light/10 blur-[40px] pointer-events-none" />
                )}
                
                {/* Stage gold background grid */}
                <div className="absolute inset-0 bg-[radial-gradient(#d4af37_0.5px,transparent_0.5px)] [background-size:16px_16px] opacity-5 pointer-events-none" />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 z-10 relative">
                  <div className="flex items-center gap-3.5 w-full sm:w-auto">
                    {/* TikTok Profile Picture Wrapper */}
                    <div className="relative">
                      <div className={`h-14 w-14 rounded-full overflow-hidden border-2 flex items-center justify-center ${
                        tiktok.isLive ? 'border-theater-red-light shadow-lg shadow-theater-red-light/30' : 'border-neutral-800'
                      }`}>
                        <img 
                          src={tiktok.avatarUrl || "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok"} 
                          alt="TikTok Avatar" 
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23171717"/><circle cx="50" cy="35" r="20" fill="%23d4af37"/><path d="M50 60c-25 0-35 15-35 25h70c0-10-10-25-35-25z" fill="%23d4af37"/></svg>`;
                          }}
                        />
                      </div>
                      {tiktok.isLive && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-theater-red-light px-1.5 py-0.5 text-[8px] font-black text-white tracking-widest animate-pulse border border-neutral-950 uppercase">
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* TikTok Details */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-md font-bold text-white tracking-wide font-sans">{tiktok.displayName}</h3>
                        <span className="text-[10px] text-neutral-500 font-semibold">{tiktok.username}</span>
                      </div>
                      
                      {/* TikTok Status Banner */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider rounded-full px-2.5 py-0.5 border ${
                          tiktok.isLive 
                            ? 'border-theater-red-light/20 bg-theater-red-dark/40 text-theater-red-light animate-pulse' 
                            : 'border-neutral-800 bg-neutral-900/60 text-neutral-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${tiktok.isLive ? 'bg-theater-red-light animate-ping' : 'bg-neutral-600'}`} />
                          {tiktok.isLive ? '🔴 AIRING (LIVESTREAM)' : '⚫ INTERMISSION / SHOW OVER'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right bar interactivity */}
                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                    <a 
                      href={watchUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-theater-red hover:bg-theater-red-light text-white font-extrabold text-[10px] tracking-widest uppercase py-2 px-4 rounded-xl shadow-lg shadow-theater-red-dark/50 hover:shadow-theater-red-light/20 transition-all flex items-center gap-1 cursor-pointer hover:scale-103"
                    >
                      <span>Tonton</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                {/* TikTok Live Stream Title display if active */}
                {tiktok.isLive && (
                  <div className="mt-3.5 pt-3.5 border-t border-neutral-900/80 text-left z-10 relative">
                    {isEditingTitle ? (
                      <div className="flex gap-2 items-center bg-neutral-950 border border-theater-gold rounded-xl p-2 px-3 animate-fade-in w-full">
                        <input
                          type="text"
                          value={editingTitleVal}
                          onChange={(e) => setEditingTitleVal(e.target.value)}
                          placeholder="Masukkan judul live teater..."
                          className="flex-1 bg-transparent text-xs text-white focus:outline-none font-sans"
                        />
                        <button
                          onClick={async () => {
                            await publishVolunteerSettings(manualOverride, tiktok.isLive, editingTitleVal);
                            setIsEditingTitle(false);
                          }}
                          className="bg-theater-gold hover:bg-yellow-400 text-theater-black p-1 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <Save size={10} />
                          <span>Simpan</span>
                        </button>
                        <button
                          onClick={() => setIsEditingTitle(false)}
                          className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white p-1 px-2 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer shrink-0"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div 
                        className={`bg-theater-red-dark/30 border border-theater-red-dark/60 rounded-xl p-3 px-4 text-xs font-medium text-neutral-200 italic leading-relaxed tracking-wide shadow-inner flex items-start justify-between gap-2.5 w-full ${
                          isUserAdmin(userRole) ? "cursor-pointer hover:border-theater-gold/50 transition-colors" : ""
                        }`}
                        onClick={() => {
                          if (isUserAdmin(userRole)) {
                            setEditingTitleVal(tiktok.liveTitle || "");
                            setIsEditingTitle(true);
                          }
                        }}
                        title={isUserAdmin(userRole) ? "Klik untuk menyunting judul live secara inline" : undefined}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Radio size={16} className="text-theater-red-light shrink-0 mt-0.5 animate-pulse" />
                          <span className="font-sans font-semibold tracking-wide text-neutral-100 truncate sm:whitespace-normal">
                            {tiktok.liveTitle || "🎪 STAGE LIVE: Panggung Pertunjukan CrunchyVerse! 🍿"}
                          </span>
                        </div>
                        {isUserAdmin(userRole) && (
                          <div className="text-[8px] font-bold text-theater-gold uppercase tracking-widest bg-theater-gold/10 border border-theater-gold/20 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1 select-none">
                            <Sliders size={8} />
                            <span>Sunting</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* DISCORD #BROADCAST BOARD */}
              <div className="flex-1 rounded-2xl border border-neutral-900 bg-neutral-950/40 p-5 md:p-6 shadow-xl flex flex-col gap-5 text-left relative overflow-hidden">
                {/* Decorative retro stage lights board backdrop */}
                <div className="absolute top-0 right-0 h-1 w-full bg-gradient-to-r from-transparent via-theater-red-light/40 to-transparent pointer-events-none" />

                <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-theater-red-dark/80 text-theater-red-light border border-theater-red-light/35">
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-white uppercase tracking-wide">Papan Broadcast</h3>
                      <p className="text-[10px] text-neutral-500 font-semibold tracking-wide">Berita terkini dari channel #broadcast Discord</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-[9px] font-bold text-neutral-400 tracking-wider font-mono">#broadcast</span>
                </div>

                {/* Broadcast Messages Feed */}
                <div className="flex flex-col gap-5 overflow-y-auto max-h-[460px] pr-1.5 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
                  {broadcasts.length === 0 ? (
                    <div className="text-neutral-600 italic text-center py-10 font-sans">
                      Belum ada broadcast yang dikirim di panggung utama.
                    </div>
                  ) : (
                    broadcasts.map((msg, index) => (
                      <div 
                        key={msg.id || index}
                        className="rounded-xl border border-neutral-900/80 bg-neutral-950/60 hover:bg-neutral-950/90 p-4 transition-all duration-300 flex flex-col gap-3 group/msg relative"
                      >
                        {/* Message Sender Header */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center">
                              {msg.authorAvatar ? (
                                <img src={msg.authorAvatar} alt="Sender Avatar" className="h-full w-full" />
                              ) : (
                                <span className="text-xs">🤖</span>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-black text-white font-sans">{msg.author}</div>
                              <div className="text-[9px] text-neutral-500 font-semibold font-mono tracking-tighter">{msg.timestamp}</div>
                            </div>
                          </div>
                          <span className="text-[9px] font-black text-theater-gold/50 tracking-widest uppercase">AKT KEDUA</span>
                        </div>

                        {/* Message Content */}
                        <div className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-sans font-light select-text whitespace-pre-wrap pl-1 border-l-2 border-theater-red/30 focus:border-theater-red-light/60 outline-none">
                          {renderMessageContent(msg.content)}
                        </div>

                        {/* Broadcast Image Attachment if present */}
                        {msg.imageUrl && (
                          <div className="relative rounded-lg overflow-hidden border border-neutral-900/80 max-h-60 mt-1 shadow-md bg-neutral-950">
                            <img 
                              src={msg.imageUrl} 
                              alt="Broadcast Asset" 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover/msg:scale-102"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-theater-black/60 to-transparent pointer-events-none" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: DISCORD MEMBER STATS (SPAN 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6 md:gap-8 w-full">
              
              {/* ACTIVE VOICE CHANNEL PANEL (Specific to ID 1435053596742914160) */}
              <div className="rounded-2xl border border-emerald-500/30 bg-neutral-950/60 p-5 md:p-6 shadow-xl text-left relative overflow-hidden flex flex-col gap-4">
                {/* Glowing green accent light */}
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-emerald-500/5 blur-[35px] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.5px,transparent_0.5px)] [background-size:16px_16px] opacity-[0.03] pointer-events-none" />
                
                <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50 animate-pulse" />
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Obrolan Suara Aktif
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-neutral-500 font-mono tracking-wide">ID: 1435053596742914160</span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Glowing Speaker Icon Container */}
                    <div className="h-11 w-11 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/50 animate-pulse-glow">
                      <Mic size={20} className="animate-bounce-slow" />
                    </div>
                    
                    <div className="text-left min-w-0">
                      <h4 className="text-sm sm:text-base font-black text-white tracking-wide truncate font-sans">
                        {voiceChannelName}
                      </h4>
                      {/* Track Details */}
                      {(() => {
                        const { duration: statusDuration, track: statusTrack, seed: statusSeed } = parseVoiceStatus(voiceChannelStatus);
                        return voiceChannelStatus ? (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-neutral-400 font-medium">
                            {hasMounted ? (
                              <img 
                                src="/turtle_shell.png" 
                                alt="Track" 
                                className="h-3.5 w-3.5 object-cover shrink-0 animate-pulse" 
                              />
                            ) : (
                              <div className="h-3.5 w-3.5 shrink-0" />
                            )}
                            {statusDuration && <span className="text-emerald-400 font-mono">[{statusDuration}]</span>}
                            <span className="truncate">{statusDuration ? `• ${statusTrack}` : statusTrack}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-neutral-400 font-medium">
                            <span className="text-neutral-500 italic">Tidak ada status suara aktif</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Duration timer */}
                  <div className="text-right shrink-0">
                    <span className="font-mono text-sm sm:text-base font-bold text-emerald-400 tracking-wide tabular-nums">
                      {formatVoiceDuration(voiceDuration)}
                    </span>
                    <span className="block text-[8px] font-black text-neutral-500 uppercase tracking-wider mt-0.5">DURASI</span>
                  </div>
                </div>

                {/* Overlapping member PFPs berjejer ke kanan */}
                <div className="flex items-center justify-between mt-1 pt-3 border-t border-neutral-900/60">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">
                    Member Terhubung
                  </span>
                  
                  <div className="flex -space-x-2.5 overflow-hidden">
                    {hasMounted && voiceMembers.slice(0, 5).map((member, idx) => (
                      <div 
                        key={idx}
                        className="h-6 w-6 rounded-full overflow-hidden border-2 border-neutral-950 hover:-translate-y-1 transition-all duration-200 cursor-pointer shadow-sm relative group shrink-0"
                        title={member.name}
                      >
                        <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                      </div>
                    ))}
                    {hasMounted && (voiceTotalCount > 5 || voiceMembers.length > 5) && (
                      <div className="h-6 w-6 rounded-full bg-neutral-900 border-2 border-neutral-950 flex items-center justify-center text-[8px] font-black text-emerald-400 shrink-0 select-none">
                        +{voiceTotalCount > 5 ? (voiceTotalCount - 5) : (voiceMembers.length - 5)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* MEMBER STATS BOARD */}
              <div className="rounded-2xl border border-theater-gold/30 bg-neutral-950/60 p-5 md:p-6 shadow-xl text-left relative overflow-hidden flex flex-col gap-6">
                
                {/* Backdrop design of a seating theater chart */}
                <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-theater-gold/5 blur-[50px] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(#800020_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />

                <div className="border-b border-neutral-900 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-theater-gold/10 text-theater-gold border border-theater-gold/35">
                      <Users size={16} />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-white uppercase tracking-wide">Panggung Penonton</h3>
                      <p className="text-[10px] text-neutral-500 font-semibold tracking-wide">Kehadiran penonton CrunchyVerse real-time</p>
                    </div>
                  </div>
                </div>

                {/* THEATRICAL LAYOUT OF STATS */}
                <div className="flex flex-col gap-6">
                  
                  {/* LEVEL 1: TOTAL ANOMALY (SERVER MEMBERS) */}
                  <div className="relative rounded-xl border border-neutral-800 bg-neutral-950/90 p-5 flex flex-col items-center justify-center text-center shadow-md overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-theater-gold/5 via-transparent to-transparent pointer-events-none" />
                    
                    {/* Neon bar line representation of a stage screen */}
                    <div className="absolute top-0 inset-x-8 h-[2px] bg-gradient-to-r from-transparent via-theater-gold to-transparent" />

                    <div className="text-[10px] font-black text-theater-gold uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Award size={10} className="text-theater-gold" />
                      <span>Total Member (Anomaly)</span>
                    </div>

                    <div className="font-display text-4xl sm:text-5xl font-black text-white tracking-wider flex items-center justify-center drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                      {formatNum(stats.totalMembers)}
                    </div>
                    
                    <p className="text-[9px] text-neutral-500 mt-2 font-medium">Jiwa terdaftar yang berada di bawah panggung CrunchyVerse</p>
                  </div>

                  {/* LEVEL 2: DETAILED THEATER ROLES (KERUPUK & KERIPIK) */}
                  <div className="grid grid-cols-2 gap-4">
                    
                    {/* ROLE KERUPUK */}
                    <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/70 p-4 text-center relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-theater-red" />
                      
                      <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-theater-red" />
                        <span>Role Kerupuk</span>
                      </div>
                      
                      <div className="font-display text-2xl sm:text-3xl font-black text-white tracking-wide">
                        {formatNum(stats.totalKerupuk)}
                      </div>
                      <span className="text-[9px] text-neutral-500 mt-1 font-semibold uppercase tracking-wider block">Garing & Gurih</span>
                    </div>

                    {/* ROLE KERIPIK */}
                    <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/70 p-4 text-center relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-amber-600" />
                      
                      <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                        <span>Role Keripik</span>
                      </div>
                      
                      <div className="font-display text-2xl sm:text-3xl font-black text-white tracking-wide">
                        {formatNum(stats.totalKeripik)}
                      </div>
                      <span className="text-[9px] text-neutral-500 mt-1 font-semibold uppercase tracking-wider block">Renyah & Tipis</span>
                    </div>

                  </div>

                  {/* LEVEL 3: PRESENCE BREAKDOWN (ONLINE, IDLE, DND, OFFLINE) */}
                  <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4">
                    <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                      <Activity size={10} className="text-theater-red-light" />
                      <span>Status Kursi Penonton</span>
                    </div>

                    {/* Grid of statuses */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      
                      {/* ONLINE STATUS */}
                      <div className="rounded-lg border border-neutral-900/60 bg-neutral-950/50 p-2.5 flex flex-col items-center">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">Online</span>
                        </div>
                        <span className="font-sans font-extrabold text-sm text-white">{stats.online}</span>
                      </div>

                      {/* IDLE STATUS */}
                      <div className="rounded-lg border border-neutral-900/60 bg-neutral-950/50 p-2.5 flex flex-col items-center">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="h-2 w-2 rounded-full bg-amber-500 shadow-md shadow-amber-500/50" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">Idle</span>
                        </div>
                        <span className="font-sans font-extrabold text-sm text-white">{stats.idle}</span>
                      </div>

                      {/* DND STATUS */}
                      <div className="rounded-lg border border-neutral-900/60 bg-neutral-950/50 p-2.5 flex flex-col items-center">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="h-2 w-2 rounded-full bg-rose-600 shadow-md shadow-rose-600/50" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">DND</span>
                        </div>
                        <span className="font-sans font-extrabold text-sm text-white">{stats.dnd}</span>
                      </div>

                      {/* OFFLINE STATUS */}
                      <div className="rounded-lg border border-neutral-900/60 bg-neutral-950/50 p-2.5 flex flex-col items-center">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="h-2 w-2 rounded-full bg-neutral-600" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">Offline</span>
                        </div>
                        <span className="font-sans font-extrabold text-sm text-white">{stats.offline}</span>
                      </div>

                    </div>
                  </div>

                </div>

                <div className="border-t border-neutral-900/80 pt-4 text-center mt-1">
                  <div className="inline-flex items-center gap-1.5 text-[9px] text-neutral-500 font-bold uppercase tracking-wider">
                    <UserCheck size={11} className="text-theater-gold-dim" />
                    <span>Diverifikasi Secara Resmi Oleh CrunchyBot</span>
                  </div>
                </div>

              </div>



            </div>

          </div>

        </div>

        <ControlBooth
          currentUser={currentUser}
          userRole={userRole}
          backendUrl={backendUrl}
          manualOverride={manualOverride}
          setManualOverride={setManualOverride}
          isLiveOverride={isLiveOverride}
          setIsLiveOverride={setIsLiveOverride}
          liveTitleOverride={liveTitleOverride}
          setLiveTitleOverride={setLiveTitleOverride}
          publishVolunteerSettings={publishVolunteerSettings}
          handleLogout={handleLogout}
        />

        {/* Scroll To Roles Frame CTA Strip */}
        <div className="border-t border-neutral-900 bg-neutral-950/50 py-5 px-4 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-30">
          <div className="text-center sm:text-left">
            <div className="text-[9px] font-black text-theater-gold/60 uppercase tracking-widest mb-0.5">Arsip Kasta Teater</div>
            <div className="text-xs font-bold text-neutral-300">Jelajahi semua role, sekte, dan detail Value Role di server CrunchyVerse</div>
          </div>
          <button
            onClick={scrollToRoles}
            className="shrink-0 bg-gradient-to-r from-theater-gold to-theater-gold-dim hover:from-theater-gold-dim hover:to-theater-gold text-theater-black font-black text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl shadow-lg shadow-theater-gold/10 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Shield size={13} />
            <span>Buka Arsip Kasta</span>
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Minimalist Theatrical Footer */}
        <footer className="border-t border-neutral-900 bg-neutral-950/80 py-6 text-center text-[10px] text-neutral-500 tracking-wide font-medium relative z-30">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-theater-red-light" />
              <span className="font-display font-extrabold text-neutral-400 text-xs">CRUNCHYVERSE SPECTACULAR</span>
            </div>
            <p className="flex items-center justify-center gap-1">
              <span>Made with premium velvet styling for CrunchyVerse Show</span>
              <Heart size={10} className="text-theater-red-light fill-theater-red-light animate-pulse" />
              <span>© 2026. All rights reserved.</span>
            </p>
          </div>
        </footer>
      </section>

      {/* FRAME 3: ARSIP KASTA — ROLE & SEKTE STORAGE */}
      <section
        id="stage-roles"
        className="scroll-frame-inner bg-theater-black relative z-20 flex flex-col"
        style={{
          background: 'radial-gradient(circle at top left, #0d0800 0%, #060102 60%, #000308 100%)'
        }}
      >
        {/* Theatrical Top Trim */}
        <div className="w-full h-4 bg-gradient-to-r from-theater-gold-dim via-theater-gold to-theater-gold-dim border-b border-theater-gold/60 shadow-md" />

        {/* Content Area */}
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 md:py-12 flex-1 flex flex-col gap-8">

          {/* Frame 3 Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-900 pb-6">
            <div>
              <div className="flex items-center gap-2 text-theater-gold text-xs font-bold uppercase tracking-widest mb-1.5">
                <Shield size={13} />
                <span>Arsip Kasta Teater · Frame III</span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-wide uppercase select-none">
                PENYIMPANAN <span className="text-theater-gold">ROLE &amp; SEKTE</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-1.5 font-medium max-w-lg">
                Buku besar kasta panggung — nama, warna, kekuasaan, pemegang role, dan besaran Value Role dari tiap hierarki CrunchyVerse.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-1.5 px-3 flex items-center gap-2 text-xs">
                <span className="text-neutral-500 font-medium">Sumber:</span>
                <span className={`font-bold flex items-center gap-1.5 ${
                  isBotConnected ? 'text-emerald-400' : 'text-theater-gold'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    isBotConnected ? 'bg-emerald-400 animate-pulse' : 'bg-theater-gold'
                  }`} />
                  {isBotConnected ? 'Discord Bot Live' : 'Offline / Simulasi'}
                </span>
              </div>
              <button
                onClick={scrollToStage}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Kembali ke Lobi</span>
              </button>
            </div>
          </div>

          {/* Decorative separator lines */}
          <div className="absolute top-4 right-0 h-full w-64 opacity-5 pointer-events-none bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />

          {/* BotStorage Full Width */}
          <BotStorage backendUrl={backendUrl} />

        </div>

        {/* Bottom Navigation Strip */}
        <div className="border-t border-neutral-900 bg-neutral-950/60 py-5 px-4 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-30">
          <button
            onClick={scrollToStage}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <ChevronDown size={13} className="rotate-180" />
            <span>Kembali ke Lobi</span>
          </button>
          
          <button
            onClick={scrollToLeaderboard}
            className="bg-gradient-to-r from-theater-red to-theater-red-dark hover:from-theater-red-light hover:to-theater-red text-white font-black text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer border border-theater-red-light/20"
          >
            <Award size={13} />
            <span>Buka Papan Jawara ↓</span>
          </button>
        </div>

        {/* Frame 3 Footer */}
        <footer className="border-t border-neutral-900/60 bg-neutral-950/80 py-5 text-center text-[10px] text-neutral-600 tracking-wide font-medium">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-theater-gold/50" />
              <span className="font-display font-extrabold text-neutral-500 text-xs">CRUNCHYVERSE · ARSIP KASTA</span>
            </div>
            <p className="flex items-center justify-center gap-1">
              <span>Data role diambil langsung dari Discord Bot CrunchyVerse</span>
              <Heart size={10} className="text-theater-gold/60 fill-theater-gold/40" />
            </p>
          </div>
        </footer>
      </section>

      {/* FRAME 4: PAPAN PERINGKAT JAWARA & VALUE ROLE — LEADERBOARD ANOMALY */}
      <section
        id="stage-leaderboard"
        className="scroll-frame-inner bg-theater-black relative z-20 flex flex-col"
        style={{
          background: 'radial-gradient(circle at bottom right, #0d0800 0%, #060102 60%, #000308 100%)'
        }}
      >
        {/* Theatrical Top Trim */}
        <div className="w-full h-4 bg-gradient-to-r from-theater-red-dark via-theater-red to-theater-red-dark border-b border-theater-red-light/30 shadow-md" />

        {/* Content Area */}
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 md:py-12 flex-1 flex flex-col gap-8">

          {/* Frame 4 Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-900 pb-6">
            <div>
              <div className="flex items-center gap-2 text-theater-red-light text-xs font-bold uppercase tracking-widest mb-1.5">
                <Award size={13} />
                <span>Panggung Jawara · Frame IV</span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-wide uppercase select-none">
                PAPAN PERINGKAT <span className="text-theater-red-light">JAWARA &amp; VALUE ROLE</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-1.5 font-medium max-w-lg">
                Klasemen keaktifan Anomaly — Leveling, Streak, dan Voice Hours dari Cakey Bot, serta 10 Anomaly dengan Value Role (CV) tertinggi.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={scrollToRoles}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Kembali ke Kasta</span>
              </button>
              <button
                onClick={scrollToStage}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Lobi Utama</span>
              </button>
            </div>
          </div>

          {/* Leaderboard Board Component */}
          <LeaderboardBoard backendUrl={backendUrl} userRole={userRole} />

        </div>

        {/* Bottom Back Button Strip */}
        <div className="border-t border-neutral-900 bg-neutral-950/60 py-5 px-4 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-30">
          <button
            onClick={scrollToStage}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <ChevronDown size={13} className="rotate-180" />
            <span>Kembali ke Lobi Utama</span>
          </button>
          
          <button
            onClick={scrollToDivergent}
            className="bg-gradient-to-r from-theater-gold to-theater-gold-dim hover:from-theater-gold-dim hover:to-theater-gold text-theater-black font-black text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl shadow-lg shadow-theater-gold/10 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Tv size={13} />
            <span>Materi Divergent Universe</span>
            <ChevronRight size={13} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Frame 4 Footer */}
        <footer className="border-t border-neutral-900/60 bg-neutral-950/80 py-5 text-center text-[10px] text-neutral-600 tracking-wide font-medium">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-theater-red-light/50" />
              <span className="font-display font-extrabold text-neutral-500 text-xs">CRUNCHYVERSE · PAPAN JAWARA</span>
            </div>
            <p className="flex items-center justify-center gap-1">
              <span>Data peringkat diintegrasikan langsung dengan Cakey Bot API &amp; Discord Bot</span>
              <Heart size={10} className="text-theater-red-light/60 fill-theater-red-light/40" />
            </p>
          </div>
        </footer>
      </section>

      {/* FRAME 5: MATERI DIVERGENT UNIVERSE — THEATER PRESENTATION BLUEPRINT */}
      <section
        id="stage-divergent"
        className="scroll-frame-inner bg-theater-black relative z-20 flex flex-col min-h-screen"
        style={{
          background: 'radial-gradient(circle at top right, #000c1a 0%, #060102 60%, #080500 100%)'
        }}
      >
        {/* Theatrical Top Trim */}
        <div className="w-full h-4 bg-gradient-to-r from-sky-900 via-sky-500 to-sky-900 border-b border-sky-400/40 shadow-md shadow-sky-950/20" />

        {/* Content Area - Enlarge frame container to max-w-7xl */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 md:py-12 flex-1 flex flex-col gap-8">
          
          {/* Frame 5 Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-900 pb-6">
            <div>
              <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-widest mb-1.5 animate-pulse">
                <Tv size={13} />
                <span>Materi Presentasi · Frame V</span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-wide uppercase select-none">
                PROYEK <span className="text-sky-400">DIVERGENT UNIVERSE</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-1.5 font-medium max-w-lg">
                Blueprint &amp; draf materi presentasi teater — visual interaktif Divergent Universe (Honkai: Star Rail 4.3). Menunggu berkas gambar dari Volunteer.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={scrollToLeaderboard}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Papan Jawara</span>
              </button>
              <button
                onClick={scrollToStage}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Lobi Utama</span>
              </button>
            </div>
          </div>

          {/* Interactive Slide Presentation Deck Container */}
          {isUserAdmin(userRole) ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
            
            {/* Left/Main Column: Slide view screen (Span 8) */}
            <div className={`lg:col-span-8 flex flex-col gap-4 w-full transition-all duration-300 ${
              isDivergentFullscreen ? 'fixed inset-0 z-50 p-4 md:p-8 bg-neutral-950/95 flex flex-col justify-center items-center backdrop-blur-md' : ''
            }`}>
              <div 
                className={`relative w-full overflow-hidden rounded-2xl border bg-neutral-950 shadow-2xl flex flex-col group/slide border-sky-500/25 ${
                  isDivergentFullscreen ? 'max-w-5xl h-auto aspect-video max-h-[85vh]' : 'aspect-video'
                }`}
                style={{
                  background: 'radial-gradient(circle at center, #021124 0%, #060810 100%)'
                }}
              >
                {/* Tech grid mesh overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.02)_1px,transparent_1px)] [background-size:24px_24px] opacity-70 pointer-events-none" />

                {/* Glowing neon background light */}
                <div className="absolute -top-12 -left-12 h-64 w-64 rounded-full bg-sky-500/5 blur-[50px] pointer-events-none" />
                <div className="absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-sky-500/5 blur-[50px] pointer-events-none" />

                {/* Slide content area */}
                <div className="flex-1 p-6 md:p-10 flex flex-col justify-between relative z-10 text-left select-none">
                  
                  {/* Top Slide Row: Badge & index */}
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                    <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/20">
                      {divergentSlides[activeSlide].badge}
                    </span>
                    <span className="text-[10px] font-black font-mono text-neutral-500 tracking-wider">
                      {(activeSlide + 1).toString().padStart(2, '0')} / {divergentSlides.length.toString().padStart(2, '0')}
                    </span>
                  </div>

                  {/* Mid Slide Row: Slide blueprint details / Placeholder diagram */}
                  <div className="my-auto flex flex-col md:flex-row gap-6 md:gap-8 items-center py-4 md:py-6">
                    {/* Visual Mock Slide Preview Frame */}
                    <div className="w-full md:w-2/5 aspect-video md:aspect-square bg-neutral-900/50 border border-neutral-800 rounded-xl flex flex-col items-center justify-center relative p-3 shrink-0 shadow-inner group/preview overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(#0ea5e9_0.5px,transparent_0.5px)] [background-size:12px_12px] opacity-[0.04]" />
                      <div className="border border-dashed border-sky-500/30 rounded-lg h-full w-full flex flex-col items-center justify-center p-3 text-center">
                        <Tv className="text-sky-400/35 h-8 w-8 mb-2 group-hover/preview:scale-110 group-hover/preview:text-sky-400/60 transition-all duration-500" />
                        <span className="text-[9px] font-black text-sky-400/40 uppercase tracking-wider block">Slide {activeSlide + 1} Image</span>
                        <span className="text-[8px] text-neutral-600 font-sans mt-1 block max-w-[120px] leading-tight">Seret gambar ppt kesini nanti</span>
                      </div>
                    </div>

                    {/* Slide Information */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {divergentSlides[activeSlide].icon}
                        <h3 className="font-display text-base md:text-xl font-extrabold text-white tracking-wide truncate">
                          {divergentSlides[activeSlide].title}
                        </h3>
                      </div>
                      <h4 className="text-[11px] md:text-xs font-bold text-sky-400/70 tracking-wide mb-3 font-sans">
                        {divergentSlides[activeSlide].subtitle}
                      </h4>
                      <p className="text-[11px] md:text-xs text-neutral-400 font-medium leading-relaxed font-sans mb-4">
                        {divergentSlides[activeSlide].desc}
                      </p>
                      
                      {/* Interactive bullet points list */}
                      <ul className="flex flex-col gap-1.5">
                        {divergentSlides[activeSlide].points.map((pt, pIdx) => (
                          <li key={pIdx} className="flex items-start gap-2 text-[10px] md:text-[11px] text-neutral-300 font-semibold font-sans">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0 shadow-[0_0_6px_#0ea5e9]" />
                            <span className="truncate">{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Bottom Slide Row: Deck navigation buttons */}
                  <div className="flex items-center justify-between border-t border-neutral-900 pt-3">
                    <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest block font-sans">
                      CRUNCHYVERSE THEATER SLIDESHOW SYSTEM
                    </span>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveSlide(prev => Math.max(0, prev - 1))}
                        disabled={activeSlide === 0}
                        className="h-8 px-3 rounded-lg border border-neutral-800 bg-neutral-900 text-[10px] font-black uppercase text-neutral-400 hover:text-white hover:border-sky-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Sebelumnya
                      </button>
                      <button
                        onClick={() => setActiveSlide(prev => Math.min(divergentSlides.length - 1, prev + 1))}
                        disabled={activeSlide === divergentSlides.length - 1}
                        className="h-8 px-3 rounded-lg border border-neutral-800 bg-neutral-900 text-[10px] font-black uppercase text-neutral-400 hover:text-white hover:border-sky-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                </div>

                {/* Floating screen control actions */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 z-20 opacity-0 group-hover/slide:opacity-100 transition-opacity duration-300">
                  <button
                    onClick={() => setIsDivergentFullscreen(!isDivergentFullscreen)}
                    className="p-2 rounded-lg bg-neutral-950/80 border border-neutral-800 hover:border-sky-500/40 text-neutral-400 hover:text-white transition-all cursor-pointer shadow-md backdrop-blur-sm"
                    title={isDivergentFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
                  >
                    <Sliders size={12} className={isDivergentFullscreen ? 'rotate-180 text-sky-400' : ''} />
                  </button>
                </div>
              </div>

              {/* Premium Slide Checkpoint / Save-Point system */}
              <div className="rounded-xl border border-sky-500/15 bg-neutral-950/60 p-4 backdrop-blur-sm w-full flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-neutral-900 pb-2">
                  <div className="flex items-center gap-2">
                    <Bookmark size={13} className="text-sky-400 animate-pulse" />
                    <span className="text-[10px] font-black text-neutral-300 uppercase tracking-wider">Penyelamat Slide (Slide Checkpoints)</span>
                  </div>
                  {editingCheckpointSlot !== null ? (
                    <div className="flex items-center gap-2 animate-bounce">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                      <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Mode Pilihan: Klik Slide di Daftar Kanan untuk Slot {editingCheckpointSlot + 1}
                      </span>
                      <button
                        onClick={() => setEditingCheckpointSlot(null)}
                        className="text-[8px] font-black text-rose-400 hover:text-rose-300 uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <span className="text-[8px] font-medium text-neutral-500">
                      QoL Save & Jump: Tandai slide untuk navigasi kilat
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {checkpoints.map((cp, idx) => {
                    const isSlotEditing = editingCheckpointSlot === idx;
                    const isSlotFilled = cp !== null;
                    
                    return (
                      <div 
                        key={idx}
                        className={`relative rounded-xl border p-2 flex flex-col gap-2 transition-all duration-300 ${
                          isSlotEditing 
                            ? 'border-amber-500/40 bg-amber-500/5 shadow-md shadow-amber-950/20' 
                            : isSlotFilled
                            ? 'border-sky-500/30 bg-sky-950/20 hover:border-sky-500/55 shadow-inner'
                            : 'border-neutral-900 bg-neutral-950/40 hover:border-neutral-800'
                        }`}
                      >
                        {/* Slot header with Label & Edit button */}
                        <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                          <span className="text-[9px] font-black font-mono text-neutral-500">SLOT 0{idx + 1}</span>
                          
                          <div className="flex items-center gap-1">
                            {/* Edit Button */}
                            <button
                              onClick={(e) => toggleEditCheckpoint(idx, e)}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isSlotEditing
                                  ? 'bg-amber-500 text-neutral-950'
                                  : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
                              }`}
                              title="Pasang checkpoint dari pilihan slide"
                            >
                              <Edit3 size={10} />
                            </button>
                            
                            {/* Delete Button (only if filled) */}
                            {isSlotFilled && (
                              <button
                                onClick={(e) => handleCheckpointDelete(idx, e)}
                                className="p-1 rounded hover:bg-rose-950/40 text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Hapus checkpoint"
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Main Button Area for Save/Jump */}
                        <button
                          onClick={() => handleCheckpointClick(idx)}
                          className={`w-full py-3 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                            isSlotFilled
                              ? 'bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 hover:scale-[1.02] text-white active:scale-95'
                              : 'bg-neutral-900/60 hover:bg-sky-500/5 border border-dashed border-neutral-800 hover:border-sky-500/25 text-neutral-600 hover:text-sky-400 group/slotbtn'
                          }`}
                        >
                          {isSlotFilled ? (
                            <>
                              <span className="text-lg font-black font-mono tracking-tighter text-sky-400 group-hover:scale-110 transition-transform">
                                {cp + 1}
                              </span>
                              <span className="text-[8px] font-black text-sky-500/60 uppercase tracking-widest leading-none">
                                Slide {cp + 1}
                              </span>
                            </>
                          ) : (
                            <>
                              <Plus size={14} className="group-hover/slotbtn:rotate-90 transition-transform duration-300 text-neutral-600 group-hover/slotbtn:text-sky-400" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-600 group-hover/slotbtn:text-sky-400">
                                Simpan ({activeSlide + 1})
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Close fullscreen helper button (only visible when in fullscreen mode) */}
              {isDivergentFullscreen && (
                <button
                  onClick={() => setIsDivergentFullscreen(false)}
                  className="mt-4 px-6 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg hover:border-sky-500/30 transition-all"
                >
                  Tutup Layar Penuh (ESC)
                </button>
              )}
            </div>

            {/* Right Column: Slide navigation thumbnails list (Span 4) */}
            <div className="lg:col-span-4 flex flex-col gap-3.5 w-full">
              <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4 flex flex-col gap-3.5">
                <div className="text-[10px] font-black text-neutral-500 uppercase tracking-widest border-b border-neutral-900 pb-2 flex items-center justify-between">
                  <span>Daftar Slide Presentasi</span>
                  <span className="text-sky-400/80 font-bold font-mono">DRAF</span>
                </div>

                {/* Thumbnails grid */}
                <div className="flex flex-col gap-2.5 max-h-[460px] overflow-y-auto scrollbar-none pr-1">
                  {divergentSlides.map((slide, sIdx) => {
                    const isActive = sIdx === activeSlide;
                    return (
                      <button
                        key={sIdx}
                        onClick={() => handleSlideSelect(sIdx)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-300 group/thumb cursor-pointer relative ${
                          isActive
                            ? 'border-sky-500/40 bg-sky-500/5 shadow-md shadow-sky-950/20'
                            : 'border-neutral-900 hover:border-neutral-800 bg-neutral-950/50'
                        }`}
                      >
                        {/* Slide color tag indicators */}
                        {isActive && (
                          <span className="absolute left-0 top-3 bottom-3 w-1 bg-sky-400 rounded-r-md shadow-[0_0_6px_#0ea5e9]" />
                        )}

                        <span className={`text-[10px] font-black font-mono mt-0.5 shrink-0 ${
                          isActive ? 'text-sky-400' : 'text-neutral-600 group-hover/thumb:text-neutral-400'
                        }`}>
                          {(sIdx + 1).toString().padStart(2, '0')}
                        </span>

                        <div className="min-w-0">
                          <h4 className={`text-xs font-bold truncate ${
                            isActive ? 'text-white font-extrabold' : 'text-neutral-400 group-hover/thumb:text-white'
                          }`}>
                            {slide.title}
                          </h4>
                          <span className="text-[9px] font-semibold text-neutral-500 group-hover/thumb:text-sky-400/60 truncate block mt-0.5 font-sans">
                            {slide.badge}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center py-20 px-6 rounded-3xl border border-sky-500/10 bg-neutral-950/40 backdrop-blur-md relative overflow-hidden min-h-[300px]">
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
              <div className="absolute -top-12 -left-12 h-48 w-48 rounded-full bg-sky-500/5 blur-[40px] pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-sky-500/5 blur-[40px] pointer-events-none" />
              
              <div className="h-16 w-16 rounded-full border border-sky-500/20 bg-sky-500/5 flex items-center justify-center text-sky-400 mb-6 animate-pulse shadow-[0_0_15px_rgba(14,165,233,0.1)]">
                <Sliders size={24} />
              </div>
              
              <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white tracking-widest uppercase mb-3 select-none">
                COMING SOON
              </h3>
              
              <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-sky-400/50 to-transparent my-1" />
              
              <p className="text-xs sm:text-sm text-neutral-400 font-sans font-light leading-relaxed max-w-md text-center mt-2 select-none">
                Blueprint dan draf materi presentasi teater Divergent Universe sedang dalam proses penyusunan oleh tim volunteer teater CrunchyVerse. Silakan kembali lagi nanti!
              </p>
            </div>
          )}

        </div>

        {/* Bottom Back Button Strip */}
        <div className="border-t border-neutral-900 bg-neutral-950/60 py-5 px-4 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-30">
          <button
            onClick={scrollToStage}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <ChevronDown size={13} className="rotate-180" />
            <span>Kembali ke Lobi Utama</span>
          </button>
          
          {isUserAdmin(userRole) && (
            <button
              onClick={scrollToChat}
              className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-black text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl shadow-lg shadow-sky-950/20 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer border border-sky-400/20"
            >
              <MessageSquare size={13} />
              <span>Konsol Obrolan Sparxie ↓</span>
            </button>
          )}
        </div>

        {/* Frame 5 Footer */}
        <footer className="border-t border-neutral-900/60 bg-neutral-950/80 py-5 text-center text-[10px] text-neutral-600 tracking-wide font-medium">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-500/50 shadow-md shadow-sky-500/50" />
              <span className="font-display font-extrabold text-neutral-500 text-xs">CRUNCHYVERSE · PRESENTASI TEATER</span>
            </div>
            <p className="flex items-center justify-center gap-1">
              <span>Blueprint materi panggung presentasi modular CrunchyVerse</span>
              <Heart size={10} className="text-sky-400/60 fill-sky-400/40" />
            </p>
          </div>
        </footer>
      </section>

      {/* FRAME 6: KONSOL OBROLAN SPARXIE — INTERAKTIF & LIVE BOT CHAT ROOM */}
      <section
        id="stage-chat"
        ref={frame6Ref}
        className={`scroll-frame-inner bg-theater-black relative z-20 flex flex-col min-h-screen ${
          !isUserAdmin(userRole) ? "hidden" : ""
        }`}
        style={{
          background: 'radial-gradient(circle at bottom left, #020c1b 0%, #060102 60%, #0d0800 100%)'
        }}
      >
        {/* Theatrical Top Trim */}
        <div className="w-full h-4 bg-gradient-to-r from-sky-950 via-sky-500 to-sky-950 border-b border-sky-400/40 shadow-md shadow-sky-950/20" />

        {/* Content Area */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 md:py-12 flex-1 flex flex-col gap-8">
          
          {/* Frame 6 Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-900 pb-6">
            <div>
              <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-widest mb-1.5 animate-pulse">
                <Bot size={13} />
                <span>Konsol Obrolan · Frame VI</span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-wide uppercase select-none">
                OBROLAN ANOMALI <span className="text-sky-400">&amp; SPARXIE BOT</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-1.5 font-medium max-w-lg">
                Terminal komunikasi real-time terintegrasi — ngobrol seru dengan asisten cerdas Sparxie atau kirim broadcast langsung to kanal teater Discord CrunchyVerse.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={scrollToDivergent}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Materi Divergent</span>
              </button>
              <button
                onClick={scrollToStage}
                className="text-xs font-bold text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-full border border-neutral-800 hover:border-neutral-600 bg-neutral-950"
              >
                ↑ <span>Lobi Utama</span>
              </button>
            </div>
          </div>

          {/* Interactive Chat Console Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full flex-1 min-h-[580px] items-stretch">
            
            {/* Left Sidebar: Channels List (Span 3) */}
            <div className="lg:col-span-3 rounded-2xl border border-neutral-900 bg-neutral-950/40 p-4 flex flex-col gap-4 backdrop-blur-sm">
              <div className="text-[10px] font-black text-neutral-500 uppercase tracking-widest border-b border-neutral-900 pb-2.5 flex items-center justify-between">
                <span>Saluran Teater</span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleResetChannels}
                    className="text-[8px] font-black text-rose-400 hover:text-rose-300 uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 cursor-pointer select-none transition-all hover:bg-rose-500/25"
                    title="Kosongkan semua saluran di sidebar"
                  >
                    Reset
                  </button>
                  <span className="text-sky-400/80 font-bold font-mono">CHANNELS</span>
                </div>
              </div>

              {/* Channels List Grid - Scrollable with custom styling */}
              <div className="flex flex-col gap-4 flex-1 overflow-y-auto max-h-[350px] pr-1 scrollbar-thin scrollbar-thumb-sky-500/20 scrollbar-track-transparent select-none">
                
                {/* 1. PINNED CHANNELS SECTION */}
                {pinnedChannels.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[8px] font-black text-sky-400 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1 select-none">
                      <Pin size={8} className="fill-sky-400/80" />
                      <span>Tersemat (Pinned)</span>
                    </div>
                    {chatChannelsList.filter(c => pinnedChannels.includes(c.id)).map((chan) => {
                      const isActive = chan.id === activeChatChannel;
                      const IconComponent = chan.type === "voice" ? Mic : Hash;
                      return (
                        <div
                          key={chan.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveChatChannel(chan.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveChatChannel(chan.id);
                            }
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-300 group cursor-pointer relative focus:outline-none focus:ring-1 focus:ring-sky-500/30 ${
                            isActive
                              ? 'border-sky-500/40 bg-sky-500/5 text-white font-bold shadow-md shadow-sky-950/20'
                              : 'border-transparent hover:bg-neutral-900/40 text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-sky-400 rounded-r-md shadow-[0_0_6px_#0ea5e9]" />
                          )}
                          
                          <div className="flex items-center gap-2.5 min-w-0">
                            <IconComponent size={14} className={isActive ? 'text-sky-400 shrink-0' : 'text-neutral-600 group-hover:text-neutral-400 shrink-0'} />
                            <span className="truncate text-xs font-semibold">{chan.name}</span>
                          </div>

                          {/* Pin Toggle Trigger */}
                          <button
                            onClick={(e) => togglePinChannel(chan.id, e)}
                            className="p-1 rounded text-sky-400 hover:bg-sky-500/10 cursor-pointer transition-colors"
                            title="Lepas Sematan"
                          >
                            <Pin size={10} className="fill-sky-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. TEXT CHANNELS SECTION */}
                <div className="flex flex-col gap-1">
                  <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest px-2 mb-1.5 select-none">
                    Saluran Obrolan (Text)
                  </div>
                  {chatChannelsList.filter(c => c.type === "text" && !pinnedChannels.includes(c.id)).map((chan) => {
                    const isActive = chan.id === activeChatChannel;
                    return (
                      <div
                        key={chan.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveChatChannel(chan.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveChatChannel(chan.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-300 group cursor-pointer relative focus:outline-none focus:ring-1 focus:ring-sky-500/30 ${
                          isActive
                            ? 'border-sky-500/40 bg-sky-500/5 text-white font-bold shadow-md shadow-sky-950/20'
                            : 'border-transparent hover:bg-neutral-900/40 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-sky-400 rounded-r-md shadow-[0_0_6px_#0ea5e9]" />
                        )}
                        
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Hash size={14} className={isActive ? 'text-sky-400 shrink-0' : 'text-neutral-600 group-hover:text-neutral-400 shrink-0'} />
                          <span className="truncate text-xs font-semibold">{chan.name}</span>
                        </div>

                        {/* Pin Action Trigger */}
                        <button
                          onClick={(e) => togglePinChannel(chan.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-500 hover:text-sky-400 hover:bg-neutral-800 cursor-pointer transition-all"
                          title="Sematkan Saluran"
                        >
                          <Pin size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* 3. VOICE CHANNELS SECTION */}
                <div className="flex flex-col gap-1">
                  <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest px-2 mb-1.5 flex items-center justify-between select-none">
                    <span>Obrolan Suara (Voice)</span>
                    <span className="text-[7px] text-emerald-400 font-extrabold uppercase animate-pulse">Live</span>
                  </div>
                  {chatChannelsList.filter(c => c.type === "voice" && !pinnedChannels.includes(c.id)).map((chan) => {
                    const isActive = chan.id === activeChatChannel;
                    return (
                      <div
                        key={chan.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveChatChannel(chan.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveChatChannel(chan.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-300 group cursor-pointer relative focus:outline-none focus:ring-1 focus:ring-sky-500/30 ${
                          isActive
                            ? 'border-sky-500/40 bg-sky-500/5 text-white font-bold shadow-md shadow-sky-950/20'
                            : 'border-transparent hover:bg-neutral-900/40 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-sky-400 rounded-r-md shadow-[0_0_6px_#0ea5e9]" />
                        )}
                        
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Mic size={14} className={isActive ? 'text-sky-400 shrink-0' : 'text-neutral-600 group-hover:text-neutral-400 shrink-0'} />
                          <span className="truncate text-xs font-semibold">{chan.name}</span>
                        </div>

                        {/* Pin Action Trigger */}
                        <button
                          onClick={(e) => togglePinChannel(chan.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-500 hover:text-sky-400 hover:bg-neutral-800 cursor-pointer transition-all"
                          title="Sematkan Saluran"
                        >
                          <Pin size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom Channel Widget */}
              <div className="border-t border-neutral-900 pt-3 flex flex-col gap-2">
                <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest px-1">
                  Tambah Saluran (Discord ID)
                </span>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={customChannelId}
                    onChange={(e) => setCustomChannelId(e.target.value)}
                    placeholder="ID Saluran Discord..."
                    className="w-full bg-neutral-950 border border-neutral-900 focus:border-sky-500/30 rounded-lg py-1.5 px-2.5 text-[10px] text-white focus:outline-none placeholder-neutral-700 font-sans"
                  />
                  <div className="flex gap-1.5 items-center">
                    <select
                      value={customChannelType}
                      onChange={(e) => setCustomChannelType(e.target.value as "text" | "voice")}
                      className="bg-neutral-950 border border-neutral-900 text-neutral-400 hover:text-white rounded-lg py-1 px-1.5 text-[9px] focus:outline-none shrink-0 font-sans font-semibold cursor-pointer"
                    >
                      <option value="text"># Text</option>
                      <option value="voice">🎙️ Voice</option>
                    </select>
                    <button
                      onClick={handleAddCustomChannel}
                      className="flex-1 bg-sky-500 hover:bg-sky-400 text-neutral-950 font-black text-[9px] uppercase tracking-wider py-1 rounded-lg transition-all cursor-pointer shadow-md shadow-sky-950/20 active:scale-95 text-center"
                    >
                      Tambah
                    </button>
                  </div>
                </div>
              </div>

              {/* Connected Status info */}
              <div className="border-t border-neutral-900 pt-3 flex items-center gap-2 text-[10px] text-neutral-500 font-semibold font-sans">
                <span className={`h-1.5 w-1.5 rounded-full ${isBotConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>{isBotConnected ? 'Sparxie Bot connected' : 'Simulation Mode'}</span>
              </div>
            </div>

            {/* Central Chat Interface: Chat room panel (Span 9) */}
            <div className="lg:col-span-9 rounded-2xl border border-sky-500/10 bg-neutral-950/50 backdrop-blur-md flex flex-col items-stretch overflow-hidden relative min-h-[500px]">
              
              {/* Tech mesh grid overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.01)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none opacity-60" />

              {/* Chat Panel Header */}
              <div className="bg-neutral-950/80 border-b border-neutral-900 p-4 relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {chatChannelsList.find(c => c.id === activeChatChannel)?.type === "voice" ? (
                    <Mic className="text-sky-400 h-4 w-4 animate-pulse" />
                  ) : (
                    <Hash className="text-sky-400 h-4 w-4" />
                  )}
                  <span className="text-sm font-black text-white">
                    {chatChannelsList.find(c => c.id === activeChatChannel)?.name || "Tidak Ada Saluran"}
                  </span>
                  <span className="hidden md:inline h-1.5 w-1.5 rounded-full bg-neutral-700 mx-1" />
                  <span className="hidden md:inline text-[10px] text-neutral-500 font-medium">
                    {chatChannelsList.find(c => c.id === activeChatChannel)?.desc || "Silakan tambahkan atau pilih saluran di sebelah kiri."}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                    CONSOLE
                  </span>
                </div>
              </div>

              {/* Main Panel Content Area (Split Pane if Voice, Single Pane if Text) */}
              <div className="flex-1 flex flex-col md:flex-row items-stretch overflow-hidden relative z-10">
                
                {!activeChatChannel || chatChannelsList.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-neutral-950/20 select-none max-w-4xl mx-auto my-auto animate-fade-in relative z-20">
                    <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 to-transparent rounded-2xl filter blur-xl opacity-30 pointer-events-none" />
                    
                    {/* Futuristic Glassmorphic Icon */}
                    <div className="h-16 w-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center relative mb-6 shadow-xl shadow-black/40 group overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <Bot className="h-8 w-8 text-sky-400 animate-pulse relative z-10" />
                    </div>

                    <h3 className="text-base font-black tracking-wider text-white uppercase mb-2">
                      Selamat Datang di Sparxie Chat Console
                    </h3>
                    <p className="text-xs text-neutral-400 max-w-md leading-relaxed mb-8">
                      Sparxie Chat Console saat ini kosong. Ikuti panduan langkah demi langkah di bawah ini untuk memulai integrasi obrolan Discord CrunchyVerse.
                    </p>

                    {/* Step-by-Step Guideline Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl text-left mb-8">
                      
                      {/* Step 1 */}
                      <div className="p-4 rounded-xl border border-neutral-900 bg-neutral-950/60 backdrop-blur-md relative overflow-hidden group hover:border-sky-500/20 hover:bg-neutral-950 transition-all duration-300">
                        <div className="absolute top-0 right-0 h-16 w-16 bg-sky-500/5 rounded-full filter blur-xl pointer-events-none" />
                        <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25 mb-3 inline-block select-none font-mono">
                          LANGKAH 01
                        </span>
                        <h4 className="text-xs font-black text-white uppercase mb-1 flex items-center gap-1.5 font-sans">
                          <Plus size={12} className="text-sky-400" />
                          <span>Tambah Saluran</span>
                        </h4>
                        <p className="text-[10px] text-neutral-500 leading-relaxed font-semibold">
                          Masukkan 18-digit ID Saluran Discord Anda pada kolom <strong>&quot;Tambah Saluran&quot;</strong> di bagian bawah sidebar kiri.
                        </p>
                      </div>

                      {/* Step 2 */}
                      <div className="p-4 rounded-xl border border-neutral-900 bg-neutral-950/60 backdrop-blur-md relative overflow-hidden group hover:border-sky-500/20 hover:bg-neutral-955 transition-all duration-300">
                        <div className="absolute top-0 right-0 h-16 w-16 bg-sky-500/5 rounded-full filter blur-xl pointer-events-none" />
                        <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25 mb-3 inline-block select-none font-mono">
                          LANGKAH 02
                        </span>
                        <h4 className="text-xs font-black text-white uppercase mb-1 flex items-center gap-1.5 font-sans">
                          <Terminal size={12} className="text-sky-400" />
                          <span>Resolusi Otomatis</span>
                        </h4>
                        <p className="text-[10px] text-neutral-500 leading-relaxed font-semibold">
                          Bot Sparxie akan mendeteksi nama, tipe, dan deskripsi saluran dari API Discord nyata, atau menyimulasikannya.
                        </p>
                      </div>

                      {/* Step 3 */}
                      <div className="p-4 rounded-xl border border-neutral-900 bg-neutral-950/60 backdrop-blur-md relative overflow-hidden group hover:border-sky-500/20 hover:bg-neutral-955 transition-all duration-300">
                        <div className="absolute top-0 right-0 h-16 w-16 bg-sky-500/5 rounded-full filter blur-xl pointer-events-none" />
                        <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25 mb-3 inline-block select-none font-mono">
                          LANGKAH 03
                        </span>
                        <h4 className="text-xs font-black text-white uppercase mb-1 flex items-center gap-1.5 font-sans">
                          <MessageSquare size={12} className="text-sky-400" />
                          <span>Mulai Obrolan</span>
                        </h4>
                        <p className="text-[10px] text-neutral-500 leading-relaxed font-semibold">
                          Pilih saluran dari sidebar, mulailah mengirimkan pesan, lampirkan media, atau gunakan fitur balasan asli Discord!
                        </p>
                      </div>

                    </div>

                    {/* Quick Start Buttons / Status */}
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <button
                        onClick={() => {
                          const defaultList = [
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
                          ];
                          setChatChannelsList(defaultList);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("crunchyverse_custom_channels", JSON.stringify(defaultList));
                          }
                          setActiveChatChannel("portal");
                        }}
                        className="bg-sky-500 hover:bg-sky-400 text-neutral-950 font-black text-[10px] uppercase tracking-wider py-2 px-5 rounded-lg transition-all duration-300 cursor-pointer shadow-md shadow-sky-950/30 active:scale-95 text-center flex items-center gap-2"
                      >
                        <RefreshCw size={11} className="animate-spin-slow" />
                        Muat Saluran Bawaan
                      </button>
                    </div>

                  </div>
                ) : (
                  <>
                    {/* Left Side: Message List and Chat Input (Text-in-Voice or normal Text Chat) */}
                    <div className={`flex flex-col items-stretch flex-1 min-w-0 ${
                      chatChannelsList.find(c => c.id === activeChatChannel)?.type === "voice" 
                        ? "md:max-w-[70%] lg:max-w-[66%] border-r border-neutral-900" 
                        : ""
                    }`}>
                  
                  {/* Message List area */}
                  <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto max-h-[380px] flex flex-col gap-4 relative z-10 scrollbar-thin">
                    {chatMessagesList.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-ping mb-3" />
                        <p className="text-xs text-neutral-500">Menghubungkan ke aliran data...</p>
                      </div>
                    ) : (
                      chatMessagesList.map((msg) => {
                        const hasAttachment = !!msg.mediaUrl;
                        const hasReply = !!msg.replyToMsgId;
                        const repliedMsg = hasReply ? chatMessagesList.find(m => m.id === msg.replyToMsgId) : null;
                        
                        return (
                          <div key={msg.id} className="flex flex-col gap-1 text-left relative group">
                            
                            {/* Reply reference bar (Discord style) */}
                            {hasReply && (
                              <div className="flex items-center gap-2 text-[10px] text-neutral-500 pl-8 mb-0.5 select-none">
                                <Reply size={10} className="rotate-180 scale-x-[-1] text-neutral-600" />
                                <span className="font-semibold">@{repliedMsg ? repliedMsg.author : "User"}</span>
                                <span className="truncate max-w-[200px] opacity-75 italic font-sans">&ldquo;{repliedMsg ? repliedMsg.content : "Pesan terhapus"}&rdquo;</span>
                              </div>
                            )}

                            <div className="flex items-start gap-3">
                              {/* Sender Avatar */}
                              <div className={`h-8 w-8 rounded-xl overflow-hidden shrink-0 border bg-neutral-900 flex items-center justify-center ${
                                msg.isBot ? 'border-sky-500/40 shadow-sm shadow-sky-950/20' : 'border-neutral-800'
                              }`}>
                                <img src={msg.authorAvatar} alt="Avatar" className="h-full w-full object-cover" />
                              </div>

                              {/* Message Body */}
                              <div className="flex-1 min-w-0">
                                {/* Header row: name & timestamp */}
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-xs font-black tracking-wide ${
                                    msg.isBot 
                                      ? 'text-sky-400 font-extrabold shadow-[0_0_10px_rgba(14,165,233,0.1)]' 
                                      : msg.author === "Pimpinan Produksi"
                                      ? 'text-amber-400 font-extrabold'
                                      : 'text-neutral-200'
                                  }`}>
                                    {msg.author}
                                  </span>

                                  {/* Bot tag */}
                                  {msg.isBot && (
                                    <span className="text-[7px] font-black text-neutral-950 bg-sky-400 px-1 rounded uppercase tracking-widest leading-none select-none py-0.5">
                                      BOT
                                    </span>
                                  )}

                                  <span className="text-[9px] font-mono text-neutral-600 tracking-wider">
                                    {msg.timestamp}
                                  </span>

                                  {/* Reply trigger button */}
                                  <button
                                    onClick={() => setReplyingToMsg(msg)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-neutral-500 hover:text-sky-400 bg-neutral-900/60 hover:bg-neutral-800 cursor-pointer"
                                    title="Balas pesan ini"
                                  >
                                    <Reply size={10} />
                                  </button>
                                </div>

                                {/* Message text */}
                                <p className="text-xs text-neutral-300 leading-relaxed font-sans select-text break-words">
                                  {msg.content}
                                </p>

                                {/* Media Attachment Render */}
                                {hasAttachment && (
                                  <div className="mt-2.5 rounded-xl overflow-hidden border border-neutral-900 bg-neutral-950/80 max-w-[280px] aspect-auto shadow-md">
                                    <img src={msg.mediaUrl || ""} alt="Media Attachment" className="w-full h-full object-contain max-h-[160px]" />
                                  </div>
                                )}

                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {/* Scroll Anchor */}
                  </div>

                  {/* Chat Input Box (Bottom) */}
                  <div className="bg-neutral-950/90 border-t border-neutral-900 p-4 relative z-10 flex flex-col gap-2">
                    
                    {/* Tautkan Referensi Balasan Discord Asli (Optional) */}
                    <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-900/60 rounded-xl p-1.5 px-3 text-[10px] select-none">
                      <span className="text-neutral-500 font-extrabold shrink-0 flex items-center gap-1.5 font-sans">
                        <Reply size={11} className="rotate-180 scale-x-[-1] text-sky-400" />
                        <span>Reply Discord ID/Link (Optional):</span>
                      </span>
                      <input
                        type="text"
                        value={discordReplyRef}
                        onChange={(e) => setDiscordReplyRef(e.target.value)}
                        placeholder="ID / Link Pesan Discord Asli untuk dibalas bot..."
                        className="flex-1 bg-neutral-950 border border-neutral-900 focus:border-sky-500/25 rounded-lg py-1 px-2.5 text-[9px] text-white focus:outline-none placeholder-neutral-700 font-sans"
                      />
                      {discordReplyRef && (
                        <button
                          onClick={() => setDiscordReplyRef("")}
                          className="text-[8px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>

                    {/* Replying Status Banner */}
                    {replyingToMsg && (
                      <div className="flex items-center justify-between bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg p-2 px-3 text-[10px] font-semibold animate-fade-in">
                        <div className="flex items-center gap-1.5 truncate">
                          <Reply size={11} className="rotate-180 scale-x-[-1]" />
                          <span>Membalas <strong className="font-extrabold">@{replyingToMsg.author}</strong></span>
                          <span className="truncate opacity-80 italic">&ldquo;{replyingToMsg.content}&rdquo;</span>
                        </div>
                        <button
                          onClick={() => setReplyingToMsg(null)}
                          className="p-0.5 rounded hover:bg-sky-500/20 text-sky-400 cursor-pointer"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}

                    {/* Attached Mock Media Banner */}
                    {attachedMediaUrl && (
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg p-2 px-3 text-[10px] font-semibold animate-fade-in">
                        <div className="flex items-center gap-1.5">
                          <Image size={11} />
                          <span>Berkas Terlampir:</span>
                          <span className="font-mono truncate max-w-[220px]">{attachedMediaUrl}</span>
                        </div>
                        <button
                          onClick={() => setAttachedMediaUrl(null)}
                          className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 cursor-pointer"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}

                    {/* Interactive inputs */}
                    <div className="flex gap-2.5 items-center relative">
                      
                      {/* Plus mock media attachment button */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            // Toggling mock attachment: pick a random cool image link
                            const mockPics = [
                              "https://api.dicebear.com/7.x/identicon/svg?seed=HsR-curio",
                              "https://api.dicebear.com/7.x/shapes/svg?seed=starchat",
                              "https://api.dicebear.com/7.x/identicon/svg?seed=crunchy-boba",
                              "https://api.dicebear.com/7.x/shapes/svg?seed=popcorn-box"
                            ];
                            const randomPic = mockPics[Math.floor(Math.random() * mockPics.length)];
                            setAttachedMediaUrl(randomPic);
                          }}
                          className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-sky-500/30 text-neutral-400 hover:text-white transition-all flex items-center justify-center shrink-0 cursor-pointer"
                          title="Lampirkan Media Berkas (Mock)"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      {/* Text Input */}
                      <input
                        type="text"
                        value={chatInputVal}
                        onChange={(e) => setChatInputVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSendChatMessage();
                          }
                        }}
                        placeholder={`Kirim pesan ke #${chatChannelsList.find(c => c.id === activeChatChannel)?.name || "channel"}...`}
                        className="flex-1 bg-neutral-900 border border-neutral-800 focus:border-sky-500/40 rounded-xl py-2 px-3 text-xs text-white placeholder-neutral-500 focus:outline-none font-sans"
                      />

                      {/* Emoji Tray toggle button */}
                      <div className="relative">
                        <button
                          onClick={() => setShowEmojiTray(!showEmojiTray)}
                          className={`p-2 rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
                            showEmojiTray 
                              ? 'bg-sky-500 border-sky-400 text-neutral-950 font-bold' 
                              : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 hover:border-sky-500/30 text-neutral-400 hover:text-white'
                          }`}
                          title="Pilih Emoji"
                        >
                          <Smile size={15} />
                        </button>

                        {/* Curated HSR Emoji Tray */}
                        {showEmojiTray && (
                          <div className="absolute bottom-11 right-0 bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 flex gap-1.5 flex-wrap w-[180px] shadow-2xl z-50 animate-fade-in select-none">
                            {["🎪", "🍿", "🤖", "✨", "🪐", "🏆", "🤫", "🧋", "🔴", "🎉", "🌟", "💖"].map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => {
                                  setChatInputVal(prev => prev + emoji);
                                  setShowEmojiTray(false);
                                }}
                                className="h-7 w-7 text-sm flex items-center justify-center rounded hover:bg-neutral-850 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Send Button */}
                      <button
                        onClick={handleSendChatMessage}
                        className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white shadow-md shadow-sky-950/20 hover:scale-105 transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95 border border-sky-400/20"
                        title="Kirim Pesan"
                      >
                        <Send size={15} />
                      </button>

                    </div>
                  </div>

                </div>

                {/* Right Side: Voice Active Room Members Panel (Only visible on Voice Channel) */}
                {chatChannelsList.find(c => c.id === activeChatChannel)?.type === "voice" && (
                  <div className="hidden md:flex md:w-[30%] lg:w-[34%] bg-neutral-950/30 flex-col items-stretch p-4 gap-3.5 select-none relative overflow-y-auto max-h-[460px] scrollbar-thin scrollbar-thumb-sky-500/20 border-l border-neutral-900">
                    
                    {/* Header Panel */}
                    <div className="border-b border-neutral-900 pb-3 flex flex-col gap-1 text-left">
                      <div className="flex items-center justify-between text-xs text-neutral-400 font-bold font-sans">
                        <div className="flex items-center gap-1.5 text-emerald-400 animate-pulse">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[10px] uppercase tracking-wider font-black">Connected</span>
                        </div>
                        {/* Session Timer formatted beautifully in Green */}
                        <span className="text-[11px] font-bold font-mono text-emerald-400">
                          {formatVoiceDuration(voiceDuration)}
                        </span>
                      </div>
                      
                      {/* Active Status Row */}
                      <div className="text-[10px] text-neutral-500 font-semibold flex items-center justify-between mt-1 select-none">
                        <span className="truncate pr-1">Saluran Obrolan Suara Aktif</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="h-2 w-2 rounded-full bg-sky-500/40 animate-ping" />
                          <span className="text-[8px] font-black uppercase text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 leading-none">LIVE</span>
                        </div>
                      </div>
                    </div>

                    {/* Music Bot Play status row (If studying / active call) */}
                    {voiceChannelStatus && (
                      <div className="rounded-xl border border-sky-500/10 bg-sky-500/5 p-2.5 flex flex-col gap-1.5 text-left transition-all hover:bg-sky-500/10 hover:border-sky-500/20">
                        <div className="text-[8px] font-black text-sky-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Sedang Memutar (Now Playing)</span>
                          <span className="text-[7px] bg-sky-500 text-neutral-950 font-black px-1 rounded animate-pulse">MUSIC BOT</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg bg-neutral-900 border border-sky-500/30 flex items-center justify-center shrink-0 overflow-hidden">
                            {hasMounted ? (
                              <img 
                                src="/turtle_shell.png" 
                                alt="Turtle Shell" 
                                className="h-4.5 w-4.5 object-cover animate-pulse" 
                              />
                            ) : (
                              <div className="h-4.5 w-4.5 shrink-0" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {parseVoiceStatus(voiceChannelStatus).duration && (
                              <span className="text-[9px] font-black text-neutral-500 font-mono">[{parseVoiceStatus(voiceChannelStatus).duration}]</span>
                            )}
                            <p className="text-[10px] font-extrabold text-neutral-200 truncate leading-tight mt-0.5" title={parseVoiceStatus(voiceChannelStatus).track?.split(" - ")[0] || ""}>
                              {parseVoiceStatus(voiceChannelStatus).track?.split(" - ")[0] || "Silence"}
                            </p>
                            <span className="text-[8px] font-semibold text-neutral-500 block truncate" title={parseVoiceStatus(voiceChannelStatus).track?.split(" - ")[1] || ""}>
                              {parseVoiceStatus(voiceChannelStatus).track?.split(" - ")[1] || "Discord Music"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Participants List */}
                    <div className="flex flex-col gap-2.5 text-left">
                      <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest px-1.5 flex items-center justify-between select-none">
                        <span>Anggota Suara ({voiceMembers.length})</span>
                        <span className="text-[7px] text-neutral-600 font-sans tracking-tight">Real-time update</span>
                      </div>

                      {/* Vertically stacked list */}
                      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-sky-500/20">
                        {hasMounted && voiceMembers.slice(0, 6).map((member: any, mIdx) => {
                          const isSpeaking = member.isSpeaking;
                          const isMuted = member.isMuted;
                          const isDeafened = member.isDeafened;
                          const isLive = member.isLive;
                          const hasBadge = !!member.badgeText;
                          
                          return (
                            <div 
                              key={mIdx} 
                              className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-300 hover:bg-neutral-900/60 ${
                                isSpeaking 
                                  ? 'bg-sky-500/5 border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.05)] shadow-sky-500/5' 
                                  : 'bg-neutral-950/20 border-transparent hover:border-neutral-900'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Avatar with Speaking Ring */}
                                <div className={`relative h-7 w-7 rounded-full shrink-0 flex items-center justify-center transition-all ${
                                  isSpeaking 
                                    ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-neutral-950 scale-105 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                                    : 'border border-neutral-800'
                                }`}>
                                  <img 
                                    src={member.avatar || `https://api.dicebear.com/7.x/lorelei/svg?seed=${member.name}`} 
                                    alt="Avatar" 
                                    className="h-full w-full rounded-full object-cover" 
                                  />
                                  {isSpeaking && (
                                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-neutral-950 animate-pulse" />
                                  )}
                                </div>

                                {/* Name & Badges */}
                                <div className="min-w-0">
                                  <span className={`text-[10px] font-black truncate block ${
                                    isSpeaking ? 'text-white font-extrabold' : 'text-neutral-300'
                                  }`}>
                                    {member.name}
                                  </span>
                                  {/* Small VR/CV role indicator */}
                                  {member.roleValueSymbol && (
                                    <span className="text-[7.5px] font-extrabold text-sky-400/80 font-mono tracking-tighter uppercase leading-none block mt-0.5">
                                      Value: {member.roleValueSymbol}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Action/Audio State Icons on the Right */}
                              <div className="flex items-center gap-1.5 shrink-0 select-none">
                                {/* Red Live Badge */}
                                {isLive && (
                                  <span className="text-[7px] font-black text-white bg-rose-500 px-1 rounded uppercase tracking-wider animate-pulse leading-none py-0.5">
                                    LIVE
                                  </span>
                                )}

                                {/* Specific custom badge (e.g. HKS, KRPC) */}
                                {hasBadge && (
                                  <span className={`text-[7px] font-black px-1 rounded uppercase tracking-wider leading-none py-0.5 ${
                                    member.badgeText === "HKS" 
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-950/20' 
                                      : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-sm shadow-indigo-950/20'
                                  }`}>
                                    {member.badgeText}
                                  </span>
                                )}

                                {/* Speaking Friends Speaker Icon */}
                                {isSpeaking && (
                                  <svg className="h-3 w-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                  </svg>
                                )}

                                {/* Muted Microphone Icon */}
                                {isMuted && !isDeafened && (
                                  <svg className="h-3.5 w-3.5 text-neutral-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                  </svg>
                                )}

                                {/* Deafened Headset Icon */}
                                {isDeafened && (
                                  <svg className="h-3.5 w-3.5 text-rose-500/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                    <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 14.85-6.9"></path>
                                    <path d="M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-7a9 9 0 0 0-2.83-6.38"></path>
                                  </svg>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {hasMounted && voiceMembers.length > 6 && (
                          <div className="flex items-center gap-2 p-2 px-3.5 rounded-xl border border-neutral-900 bg-neutral-950/20 text-[9px] text-neutral-500 font-bold select-none">
                            <Users size={12} className="text-neutral-600 shrink-0" />
                            <span>+ {voiceMembers.length - 6} Anggota Suara lainnya...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

            </div>

          </div>

        </div>

        {/* Bottom Navigation Strip */}
        <div className="border-t border-neutral-900 bg-neutral-950/60 py-5 px-4 flex items-center justify-center gap-4 relative z-30">
          <button
            onClick={scrollToStage}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <ChevronDown size={13} className="rotate-180" />
            <span>Kembali ke Lobi Utama</span>
          </button>
          
          <button
            onClick={scrollToGame}
            className="bg-theater-gold hover:bg-yellow-400 text-theater-black font-black text-[10px] tracking-widest uppercase py-2.5 px-6 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Buka Tirai Tantangan</span>
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Frame 6 Footer */}
        <footer className="border-t border-neutral-900/60 bg-neutral-950/80 py-5 text-center text-[10px] text-neutral-600 tracking-wide font-medium">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-500/50 shadow-md shadow-sky-500/50" />
              <span className="font-display font-extrabold text-neutral-500 text-xs">CRUNCHYVERSE · SPARXIE CHATROOM</span>
            </div>
            <p className="flex items-center justify-center gap-1">
              <span>Konsol terminal komunikasi anomali real-time terintegrasi</span>
              <Heart size={10} className="text-sky-400/60 fill-sky-400/40" />
            </p>
          </div>
        </footer>
      </section>

      {/* FRAME 7: TIRAI TANTANGAN TEATER INTERAKTIF */}
      <section
        id="stage-game"
        ref={frame7Ref}
        className="scroll-frame-inner bg-theater-black relative z-20 flex flex-col min-h-screen"
        style={{
          background: 'radial-gradient(circle at top right, #110002 0%, #060102 100%)'
        }}
      >
        {/* Theatrical Top Trim */}
        <div className="w-full h-4 bg-gradient-to-r from-theater-red-dark via-theater-gold to-theater-red-dark border-b border-theater-gold/50 shadow-md shadow-theater-red-dark/20" />

        {isCountdownActive && !isUserAdmin(userRole) ? (
          <TiraiCountdown
            timeLeft={timeLeft}
            onScrollToLobby={scrollToStage}
          />
        ) : (
          <QuestGame
            currentUser={currentUser}
            displayName={displayName}
            userRole={userRole}
            onScrollToLobby={scrollToStage}
            backendUrl={backendUrl}
            syncData={syncGameData}
            onTriggerSync={triggerSyncRefresh}
          />
        )}
      </section>

    </div>
  );
}

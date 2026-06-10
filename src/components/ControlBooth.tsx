"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sliders, LogOut, Save, Terminal, Volume2, RefreshCw, Trash2, ExternalLink, Activity, X, UserPlus } from "lucide-react";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { doc, collection, getDocs, query, where } from "firebase/firestore";
import { signedFetch } from "../lib/api";

interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

interface DiscordChannel {
  id: string;
  name: string;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  channels: DiscordChannel[];
}

interface BackendState {
  isBotLoggedIn: boolean;
  botUsername: string | null;
  botAvatar: string | null;
  isConnectedToVoice: boolean;
  guildId: string | null;
  channelId: string | null;
  status: "offline" | "logging_in" | "ready" | "connecting_voice" | "connected_voice";
  logs: LogEntry[];
  guilds?: DiscordGuild[];
  inviteLink?: string | null;
}

interface ControlBoothProps {
  currentUser: any;
  userRole: string | null;
  backendUrl?: string;
  manualOverride: boolean;
  setManualOverride: (override: boolean) => void;
  isLiveOverride: boolean;
  setIsLiveOverride: (live: boolean) => void;
  liveTitleOverride: string;
  setLiveTitleOverride: (title: string) => void;
  publishVolunteerSettings: (override: boolean, isLive: boolean, title: string) => Promise<void>;
  handleLogout: () => void;
}

export default function ControlBooth({
  currentUser,
  userRole,
  backendUrl,
  manualOverride,
  setManualOverride,
  isLiveOverride,
  setIsLiveOverride,
  liveTitleOverride,
  setLiveTitleOverride,
  publishVolunteerSettings,
  handleLogout
}: ControlBoothProps) {
  const apiEndpoint = backendUrl || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 1500): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
      )
    ]);
  }

  // Tab State: "lobby" | "voice" | "volunteers"
  const [activeTab, setActiveTab] = useState<"lobby" | "voice" | "volunteers">("lobby");

  // Voice States
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [useManualInput, setUseManualInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(25).fill(4));

  const [backendState, setBackendState] = useState<BackendState>({
    isBotLoggedIn: false,
    botUsername: null,
    botAvatar: null,
    isConnectedToVoice: false,
    guildId: null,
    channelId: null,
    status: "offline",
    logs: [],
    guilds: [],
    inviteLink: null
  });

  // Extract a 17-20 digit numeric snowflake ID from currentUser
  let discordId: string | null = null;
  if (currentUser) {
    if (typeof currentUser.uid === "string" && currentUser.uid.startsWith("sim-discord-")) {
      discordId = currentUser.uid.replace("sim-discord-", "");
    } else {
      const providerData = currentUser.providerData || [];
      const discordProv = providerData.find((p: any) => 
        p.providerId.includes("discord") || 
        p.providerId.includes("oidc") ||
        (currentUser.uid && currentUser.uid.startsWith("oidc:"))
      );
      if (discordProv && discordProv.uid) {
        const match = discordProv.uid.match(/\d{17,20}/);
        if (match) discordId = match[0];
      }
      if (!discordId && currentUser.uid) {
        const match = currentUser.uid.match(/\d{17,20}/);
        if (match) discordId = match[0];
      }
    }
  }

  // Volunteers states and functions for Sim
  const [volunteersList, setVolunteersList] = useState<Array<{ discordId: string; addedAt: string; addedBy: string }>>([]);
  const [newVolunteerId, setNewVolunteerId] = useState("");

  const fetchVolunteerables = async () => {
    let list: any[] = [];
    let fetchedFromBackend = false;
    try {
      const res = await signedFetch(`${apiEndpoint}/api/volunteerables`);
      if (res.ok) {
        list = await res.json();
        fetchedFromBackend = true;
      }
    } catch (err) {
      console.warn("Gagal terhubung ke API backend bot untuk fetch volunteerables:", err);
    }

    if (!fetchedFromBackend && isFirebaseConfigured && db) {
      try {
        const querySnapshot = await withTimeout(getDocs(collection(db, "volunteerables")));
        querySnapshot.forEach((doc) => {
          list.push({
            discordId: doc.id,
            ...doc.data()
          });
        });
      } catch (err) {
        console.error("Gagal mengambil daftar volunteerables dari Firestore:", err);
      }
    }

    if (list.length === 0 && !fetchedFromBackend && (!isFirebaseConfigured || !db)) {
      const saved = localStorage.getItem("crunchy_volunteerables");
      if (saved) {
        list = JSON.parse(saved);
      }
    }

    setVolunteersList(list);
  };

  const handleAddVolunteer = async () => {
    const cleanId = newVolunteerId.trim();
    if (!cleanId) return;
    if (!/^\d{17,20}$/.test(cleanId)) {
      setErrorMessage("ID Discord tidak valid! Harus berupa 17-20 digit angka.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const addedAt = new Date().toISOString();
      const addedBy = currentUser.email || "Sim";

      // 1. Post to bot server backend
      let savedToBackend = false;
      try {
        const res = await signedFetch(`${apiEndpoint}/api/volunteerables`, {
          method: "POST",
          body: JSON.stringify({ discordId: cleanId, addedBy }),
          sensitive: true
        });
        if (res.ok) {
          savedToBackend = true;
        }
      } catch (err) {
        console.warn("Gagal terhubung ke API backend bot untuk tambah volunteer:", err);
      }

      // Firestore write bypassed from client-side for security purposes

      // 3. Fallback/simulation write to localStorage if not saved to backend
      if (!savedToBackend && (!isFirebaseConfigured || !db)) {
        const saved = localStorage.getItem("crunchy_volunteerables");
        const list = saved ? JSON.parse(saved) : [];
        if (!list.some((v: any) => v.discordId === cleanId)) {
          list.push({ discordId: cleanId, addedAt, addedBy });
          localStorage.setItem("crunchy_volunteerables", JSON.stringify(list));
        }

        // Sim sync user roles in local simulation
        const usersSaved = localStorage.getItem("crunchy_users");
        if (usersSaved) {
          const users = JSON.parse(usersSaved);
          let updated = false;
          users.forEach((u: any) => {
            if (u.uid === `sim-discord-${cleanId}` || u.discordId === cleanId) {
              u.role = "Volunteer Theater";
              updated = true;
            }
          });
          if (updated) {
            localStorage.setItem("crunchy_users", JSON.stringify(users));
          }
        }
      }

      setNewVolunteerId("");
      await fetchVolunteerables();
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Gagal menambahkan volunteer. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveVolunteer = async (cleanId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Delete on bot server backend
      let deletedFromBackend = false;
      try {
        const res = await signedFetch(`${apiEndpoint}/api/volunteerables/${cleanId}`, {
          method: "DELETE",
          sensitive: true
        });
        if (res.ok) {
          deletedFromBackend = true;
        }
      } catch (err) {
        console.warn("Gagal terhubung ke API backend bot untuk hapus volunteer:", err);
      }

      // Firestore delete bypassed from client-side for security purposes

      // 3. Fallback/simulation write to localStorage if not saved to backend
      if (!deletedFromBackend && (!isFirebaseConfigured || !db)) {
        const saved = localStorage.getItem("crunchy_volunteerables");
        if (saved) {
          let list = JSON.parse(saved);
          list = list.filter((v: any) => v.discordId !== cleanId);
          localStorage.setItem("crunchy_volunteerables", JSON.stringify(list));
        }

        if (cleanId !== "661135501226672129" && cleanId !== "1410583272173600819") {
          const usersSaved = localStorage.getItem("crunchy_users");
          if (usersSaved) {
            const users = JSON.parse(usersSaved);
            let updated = false;
            users.forEach((u: any) => {
              if (u.uid === `sim-discord-${cleanId}` || u.discordId === cleanId) {
                u.role = "Penonton Teater";
                updated = true;
              }
            });
            if (updated) {
              localStorage.setItem("crunchy_users", JSON.stringify(users));
            }
          }
        }
      }

      await fetchVolunteerables();
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Gagal menghapus volunteer.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "volunteers") {
      fetchVolunteerables();
    }
  }, [activeTab]);

  const animationRef = useRef<number | null>(null);

  // Load saved guild/channel from localStorage on client-side mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedGuildId = localStorage.getItem("voice_guild_id");
      const savedChannelId = localStorage.getItem("voice_channel_id");
      if (savedGuildId) setGuildId(savedGuildId);
      if (savedChannelId) setChannelId(savedChannelId);
    }
  }, []);

  // Sync / Poll Backend Status
  const fetchStatus = async () => {
    try {
      const res = await signedFetch(`${apiEndpoint}/api/voice-afk/status`);
      if (res.ok) {
        const data: BackendState = await res.json();
        setBackendState(data);
        setErrorMessage(null);
        
        // Auto-select if present on the server connection but empty locally
        if (data.guildId && !guildId) {
          setGuildId(data.guildId);
        }
        if (data.channelId && !channelId) {
          setChannelId(data.channelId);
        }
      }
    } catch (err) {
      console.warn("Gagal terhubung ke API backend bot VoiceAFK:", err);
    }
  };

  // Setup Polling Interval
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      // Poll every 10s if tab is open or bot is connecting/connected
      if (activeTab === "voice" || backendState.status === "connecting_voice" || backendState.status === "connected_voice") {
        fetchStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [apiEndpoint, activeTab, backendState.status, guildId, channelId]);

  // Waveform animation loop based on bot status
  useEffect(() => {
    const status = backendState.status;
    if (status === "connected_voice") {
      const animateWave = () => {
        setWaveformBars(
          Array.from({ length: 25 }, () => Math.floor(Math.random() * 26) + 4)
        );
        animationRef.current = requestAnimationFrame(animateWave);
      };
      animationRef.current = requestAnimationFrame(animateWave);
    } else if (status === "connecting_voice" || status === "logging_in") {
      const animateWave = () => {
        setWaveformBars(
          Array.from({ length: 25 }, (_, i) => {
            const time = Date.now() * 0.005;
            return Math.floor(Math.sin(time + i * 0.3) * 8) + 12;
          })
        );
        animationRef.current = requestAnimationFrame(animateWave);
      };
      animationRef.current = requestAnimationFrame(animateWave);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setWaveformBars(Array(25).fill(4));
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [backendState.status]);

  const handleSelectGuild = (id: string) => {
    setGuildId(id);
    localStorage.setItem("voice_guild_id", id);
    const selectedG = backendState.guilds?.find(g => g.id === id);
    if (selectedG && selectedG.channels.length > 0) {
      setChannelId(selectedG.channels[0].id);
      localStorage.setItem("voice_channel_id", selectedG.channels[0].id);
    } else {
      setChannelId("");
      localStorage.setItem("voice_channel_id", "");
    }
  };

  const handleSelectChannel = (id: string) => {
    setChannelId(id);
    localStorage.setItem("voice_channel_id", id);
  };

  const handleConnect = async () => {
    if (!guildId || !channelId) {
      setErrorMessage("Guild ID dan Channel ID wajib diisi!");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await signedFetch(`${apiEndpoint}/api/voice-afk/connect`, {
        method: "POST",
        body: JSON.stringify({ guildId, channelId }),
        sensitive: true
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackendState(data.state);
        localStorage.setItem("voice_guild_id", guildId);
        localStorage.setItem("voice_channel_id", channelId);
      } else {
        setErrorMessage(data.message || data.error || "Gagal menghubungkan ke voice channel.");
      }
    } catch (err: any) {
      setErrorMessage("Gagal menyambung. Hubungi Admin.");
    } finally {
      setIsLoading(false);
      fetchStatus();
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await signedFetch(`${apiEndpoint}/api/voice-afk/disconnect`, {
        method: "POST",
        sensitive: true
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackendState(data.state);
      } else {
        setErrorMessage(data.message || data.error || "Gagal memutuskan koneksi.");
      }
    } catch (err: any) {
      setErrorMessage("Gagal memutuskan koneksi.");
    } finally {
      setIsLoading(false);
      fetchStatus();
    }
  };

  const handleClearLogs = async () => {
    try {
      await signedFetch(`${apiEndpoint}/api/voice-afk/logs/clear`, { method: "POST", sensitive: true });
      setBackendState(prev => ({ ...prev, logs: [] }));
    } catch (err) {
      console.warn("Gagal membersihkan log server:", err);
    }
  };

  const isUserAdmin = (role: string | null) => {
    return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
  };

  if (!currentUser || !isUserAdmin(userRole)) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm w-full bg-neutral-950 border-2 border-theater-gold rounded-3xl p-5 shadow-2xl animate-float">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-theater-gold/10 text-theater-gold border border-theater-gold/40">
            <Sliders size={14} className="animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider font-display">Control Booth</h4>
            <span className="text-[8px] font-black text-theater-gold uppercase tracking-widest">
              {userRole === "Volunteer Theater" ? "🎭 VOLUNTEER THEATER" :
               userRole === "Ketua Kerupuk" ? "👑 KETUA KERUPUK" :
               userRole === "Ketua Keripik" ? "👑 KETUA KERIPIK" : "🎭 CONTROL BOOTH"}
            </span>
          </div>
        </div>
        
        <button 
          onClick={handleLogout}
          className="text-neutral-500 hover:text-theater-red-light transition-colors p-1 cursor-pointer"
          title="Keluar"
        >
          <LogOut size={14} />
        </button>
      </div>

      {/* TABS TRAY */}
      <div className="flex border-b border-neutral-900/80 mb-4 text-[10px] font-black uppercase tracking-wider gap-2">
        <button 
          onClick={() => setActiveTab("lobby")}
          className={`flex-1 pb-2 text-center transition-all cursor-pointer border-b-2 ${
            activeTab === "lobby" 
              ? "text-theater-gold border-theater-gold" 
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          🎭 Lobi Override
        </button>
        <button 
          onClick={() => setActiveTab("voice")}
          className={`flex-1 pb-2 text-center transition-all cursor-pointer border-b-2 ${
            activeTab === "voice" 
              ? "text-theater-gold border-theater-gold" 
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          🔊 Voice 24/7
        </button>
        {discordId === "661135501226672129" && (
          <button 
            onClick={() => setActiveTab("volunteers")}
            className={`flex-1 pb-2 text-center transition-all cursor-pointer border-b-2 ${
              activeTab === "volunteers" 
                ? "text-theater-gold border-theater-gold" 
                : "text-neutral-500 border-transparent hover:text-neutral-300"
            }`}
          >
            🔑 Volunteers
          </button>
        )}
      </div>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="mb-3 px-3 py-2 rounded-xl border border-theater-red-light/30 bg-theater-red/5 text-[10px] text-theater-red-light flex items-center justify-between gap-2">
          <span>⚠️ {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-extrabold uppercase hover:underline">Tutup</button>
        </div>
      )}

      {/* TAB CONTENT: LOBBY */}
      {activeTab === "lobby" && (
        <div className="space-y-4 text-left animate-fade-in">
          {/* OVERRIDE MODE TOGGLE */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
            <span className="font-semibold text-neutral-300">Mode Override Manual</span>
            <button 
              onClick={() => {
                const nextOverride = !manualOverride;
                setManualOverride(nextOverride);
                publishVolunteerSettings(nextOverride, isLiveOverride, liveTitleOverride);
              }}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                manualOverride ? "bg-theater-gold" : "bg-neutral-800"
              }`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                manualOverride ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>

          {/* LIVE OVERRIDE SWITCH */}
          {manualOverride && (
            <div className="space-y-3 animate-fade-in p-3 rounded-xl border border-theater-gold/20 bg-theater-gold/5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-300">Status Live Streaming</span>
                <button 
                  onClick={() => {
                    const nextLive = !isLiveOverride;
                    setIsLiveOverride(nextLive);
                    publishVolunteerSettings(manualOverride, nextLive, liveTitleOverride);
                  }}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                    isLiveOverride 
                      ? "bg-theater-red border-theater-red-light text-white" 
                      : "bg-neutral-900 border-neutral-800 text-neutral-400"
                  }`}
                >
                  {isLiveOverride ? "🔴 AIRED" : "⚫ OFFLINE"}
                </button>
              </div>

              {/* LIVE TITLE INPUT */}
              {isLiveOverride && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Judul Live Override</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={liveTitleOverride}
                      onChange={(e) => setLiveTitleOverride(e.target.value)}
                      placeholder="Masukkan judul live teater..."
                      className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-theater-gold font-sans"
                    />
                    <button 
                      onClick={() => publishVolunteerSettings(manualOverride, isLiveOverride, liveTitleOverride)}
                      className="bg-theater-gold text-theater-black font-extrabold px-3.5 rounded-lg text-[10px] hover:bg-yellow-400 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      title="Simpan Judul"
                    >
                      <Save size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AUTOMATION STATUS INFORMATION */}
          {!manualOverride && (
            <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-[10px] text-neutral-400 leading-relaxed flex items-start gap-2">
              <Terminal size={14} className="text-theater-gold shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-extrabold text-neutral-300">Auto-Cron Aktif:</span> Pengecekan live otomatis berjalan di backend tiap 3 menit untuk menyinkronkan status streaming asli dari TikTok.
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: VOICEAFK */}
      {activeTab === "voice" && (
        <div className="space-y-3.5 text-left animate-fade-in">
          
          {/* Bot State Panel */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-900">
            {backendState.botAvatar ? (
              <img 
                src={backendState.botAvatar} 
                alt="Avatar Bot" 
                className="h-10 w-10 rounded-lg border border-neutral-800 shadow"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-center text-lg shadow-inner">
                🤖
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h5 className="text-[10px] font-black text-white uppercase tracking-wider truncate">
                {backendState.botUsername || "Offline"}
              </h5>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  backendState.status === "connected_voice" 
                    ? "bg-emerald-500 animate-pulse" 
                    : backendState.status === "connecting_voice"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-neutral-600"
                }`} />
                <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest truncate">
                  {backendState.status === "connected_voice" && "Voice Stay Active"}
                  {backendState.status === "connecting_voice" && "Menyambungkan..."}
                  {backendState.status === "ready" && "Klien Siap"}
                  {backendState.status === "offline" && "Klien Standby"}
                </span>
              </div>
            </div>

            {/* Invite Button */}
            {backendState.inviteLink && (
              <a 
                href={backendState.inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] font-black text-theater-gold border border-theater-gold/30 hover:border-theater-gold hover:bg-theater-gold/10 px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer shrink-0"
                title="Undang Bot ke Server Baru"
              >
                <span>Undang</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* Connection Switch */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
            <div className="flex flex-col text-left">
              <span className="font-semibold text-neutral-300 text-xs">Stay 24/7</span>
              <span className="text-[9px] text-neutral-500 font-medium">
                {backendState.isConnectedToVoice ? "Koneksi Aktif" : "Koneksi Terputus"}
              </span>
            </div>
            
            <button
              onClick={backendState.isConnectedToVoice ? handleDisconnect : handleConnect}
              disabled={isLoading}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border shadow flex items-center gap-1 cursor-pointer ${
                isLoading 
                  ? "opacity-50 cursor-not-allowed border-neutral-800 bg-neutral-900 text-neutral-600" 
                  : backendState.isConnectedToVoice
                  ? "bg-theater-red/10 border-theater-red-light/30 text-theater-red-light hover:bg-theater-red/20 active:scale-95"
                  : "bg-theater-gold/10 border-theater-gold/30 text-theater-gold hover:bg-theater-gold/20 active:scale-95"
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Proses</span>
                </>
              ) : backendState.isConnectedToVoice ? (
                <>
                  <Volume2 size={10} className="animate-pulse" />
                  <span>Putus VC</span>
                </>
              ) : (
                <>
                  <Volume2 size={10} />
                  <span>Stay VC</span>
                </>
              )}
            </button>
          </div>

          {/* Selectors Tray */}
          <div className="space-y-2.5 p-3 rounded-xl border border-neutral-900 bg-neutral-950/40">
            <div className="flex justify-between items-center text-[9px]">
              <span className="font-bold text-neutral-400 uppercase tracking-widest">
                {useManualInput ? "INPUT ID MANUAL" : "SELEKTOR VOICE"}
              </span>
              <button
                onClick={() => setUseManualInput(!useManualInput)}
                className="font-black text-theater-gold hover:underline uppercase tracking-widest cursor-pointer"
              >
                {useManualInput ? "Dropdown" : "Mode ID"}
              </button>
            </div>

            {useManualInput ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-1 text-left">
                  <span className="text-[8px] font-bold text-neutral-500 uppercase">Server ID</span>
                  <input
                    type="text"
                    value={guildId}
                    onChange={(e) => {
                      setGuildId(e.target.value);
                      localStorage.setItem("voice_guild_id", e.target.value);
                    }}
                    placeholder="Guild ID"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-theater-gold font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1 text-left">
                  <span className="text-[8px] font-bold text-neutral-500 uppercase">Channel ID</span>
                  <input
                    type="text"
                    value={channelId}
                    onChange={(e) => {
                      setChannelId(e.target.value);
                      localStorage.setItem("voice_channel_id", e.target.value);
                    }}
                    placeholder="Channel ID"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-theater-gold font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <select
                  value={guildId}
                  onChange={(e) => handleSelectGuild(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-theater-gold cursor-pointer"
                >
                  <option value="" className="text-neutral-500">-- Pilih Server --</option>
                  {backendState.guilds?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.channels.length} VC)
                    </option>
                  ))}
                </select>

                <select
                  value={channelId}
                  onChange={(e) => handleSelectChannel(e.target.value)}
                  disabled={!guildId}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-theater-gold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="" className="text-neutral-500 font-sans">
                    {guildId ? "-- Pilih Saluran --" : "-- Pilih Server Dulu --"}
                  </option>
                  {backendState.guilds
                    ?.find((g) => g.id === guildId)
                    ?.channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        🔊 {c.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Visualizer */}
          <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-2.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <Activity size={10} className={backendState.status === "connected_voice" ? "text-theater-gold animate-pulse" : "text-neutral-500"} />
                Waveform Sinyal Voice
              </span>
              <span className="text-neutral-500 font-extrabold">Live Wave</span>
            </div>
            <div className="h-9 bg-neutral-900/30 border border-neutral-900 rounded-lg flex items-center justify-center gap-[3px] px-3 shadow-inner overflow-hidden">
              {waveformBars.map((height, idx) => (
                <div
                  key={idx}
                  className={`w-[2.5px] rounded-full transition-all duration-150 ${
                    backendState.status === "connected_voice"
                      ? "bg-gradient-to-t from-theater-gold to-yellow-500"
                      : backendState.status === "connecting_voice" || backendState.status === "logging_in"
                      ? "bg-gradient-to-t from-theater-red-light to-orange-500 animate-pulse"
                      : "bg-neutral-800"
                  }`}
                  style={{ height: `${height}px` }}
                />
              ))}
            </div>
          </div>

          {/* Live Console Logs */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                <Terminal size={10} className="text-theater-gold" />
                Live Console Monitor
              </span>
              <button
                onClick={handleClearLogs}
                className="text-[9px] font-black text-neutral-500 hover:text-theater-red-light uppercase tracking-widest flex items-center gap-0.5 cursor-pointer"
              >
                <Trash2 size={9} />
                <span>Bersihkan</span>
              </button>
            </div>

            <div className="h-28 bg-neutral-950 border border-neutral-900 rounded-xl p-2.5 font-mono text-[9px] flex flex-col gap-1 overflow-y-auto shadow-inner text-left scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
              {backendState.logs.length === 0 ? (
                <div className="text-neutral-600 italic text-center my-auto">
                  Console kosong. Hubungkan bot untuk melihat aktivitas.
                </div>
              ) : (
                backendState.logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-1 py-0.5 border-b border-neutral-900/30 last:border-b-0">
                    <span className="text-neutral-500 font-semibold select-none">[{log.timestamp}]</span>
                    <span className={`break-all ${
                      log.type === "success" ? "text-emerald-400" :
                      log.type === "error" ? "text-theater-red-light font-bold" :
                      log.type === "warning" ? "text-amber-400" :
                      "text-indigo-300"
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: VOLUNTEERS (Sim Only) */}
      {activeTab === "volunteers" && discordId === "661135501226672129" && (
        <div className="space-y-4 text-left animate-fade-in">
          {/* Add Volunteer Form */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-theater-gold/20 bg-theater-gold/5">
            <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">ID Discord Calon Volunteer</label>
            <div className="flex gap-2">
              <input 
                type="text"
                value={newVolunteerId}
                onChange={(e) => setNewVolunteerId(e.target.value)}
                placeholder="e.g. 661135501226672129"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-theater-gold font-mono"
              />
              <button 
                onClick={handleAddVolunteer}
                disabled={isLoading}
                className="bg-theater-gold text-theater-black font-extrabold px-3 py-1.5 rounded-lg text-xs hover:bg-yellow-400 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                title="Tambah Volunteer"
              >
                <UserPlus size={12} />
                <span>Tambah</span>
              </button>
            </div>
          </div>

          {/* Volunteer List */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Daftar Volunteer Aktif</label>
            <div className="max-h-48 overflow-y-auto bg-neutral-950 border border-neutral-900 rounded-xl p-2 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
              {volunteersList.length === 0 ? (
                <div className="text-neutral-600 italic text-center py-6 text-[10px]">
                  Belum ada volunteer yang ditambahkan.
                </div>
              ) : (
                volunteersList.map((vol) => (
                  <div key={vol.discordId} className="flex items-center justify-between p-2 rounded-lg bg-neutral-900/40 border border-neutral-900 text-[10px]">
                    <div className="flex flex-col text-left">
                      <span className="font-mono text-white font-bold">{vol.discordId}</span>
                      <span className="text-neutral-500 text-[8px] mt-0.5">Oleh: {vol.addedBy.split('@')[0]}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveVolunteer(vol.discordId)}
                      disabled={isLoading}
                      className="text-neutral-500 hover:text-theater-red-light p-1 transition-colors cursor-pointer disabled:opacity-50"
                      title="Hapus Volunteer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

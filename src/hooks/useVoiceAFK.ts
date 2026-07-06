import { useState, useEffect, useRef, useCallback } from "react";
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

interface UseVoiceAFKProps {
  apiEndpoint: string;
  activeTab: string;
}

export function useVoiceAFK({ apiEndpoint, activeTab }: UseVoiceAFKProps) {
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
  const fetchStatus = useCallback(async () => {
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
  }, [apiEndpoint, guildId, channelId]);

  // Setup Polling Interval
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (activeTab === "voice" || backendState.status === "connecting_voice" || backendState.status === "connected_voice") {
        fetchStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchStatus, activeTab, backendState.status]);

  // Waveform animation loop
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

  return {
    backendState,
    guildId,
    channelId,
    setGuildId,
    setChannelId,
    useManualInput,
    setUseManualInput,
    isLoading,
    errorMessage,
    setErrorMessage,
    waveformBars,
    handleSelectGuild,
    handleSelectChannel,
    handleConnect,
    handleDisconnect,
    handleClearLogs,
    fetchStatus
  };
}

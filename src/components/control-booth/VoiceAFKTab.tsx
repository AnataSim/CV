"use client";

import React from "react";
import { Volume2, RefreshCw, Activity, Terminal, Trash2, ExternalLink } from "lucide-react";

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

interface VoiceAFKTabProps {
  backendState: BackendState;
  guildId: string;
  channelId: string;
  setGuildId: (id: string) => void;
  setChannelId: (id: string) => void;
  useManualInput: boolean;
  setUseManualInput: (manual: boolean) => void;
  isLoading: boolean;
  waveformBars: number[];
  handleSelectGuild: (id: string) => void;
  handleSelectChannel: (id: string) => void;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleClearLogs: () => Promise<void>;
}

export default function VoiceAFKTab({
  backendState,
  guildId,
  channelId,
  setGuildId,
  setChannelId,
  useManualInput,
  setUseManualInput,
  isLoading,
  waveformBars,
  handleSelectGuild,
  handleSelectChannel,
  handleConnect,
  handleDisconnect,
  handleClearLogs,
}: VoiceAFKTabProps) {
  return (
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
  );
}

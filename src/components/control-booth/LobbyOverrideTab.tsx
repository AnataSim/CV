"use client";

import React from "react";
import { Save, Terminal } from "lucide-react";

interface LobbyOverrideTabProps {
  manualOverride: boolean;
  setManualOverride: (override: boolean) => void;
  isLiveOverride: boolean;
  setIsLiveOverride: (live: boolean) => void;
  liveTitleOverride: string;
  setLiveTitleOverride: (title: string) => void;
  publishVolunteerSettings: (override: boolean, isLive: boolean, title: string) => Promise<void>;
}

export default function LobbyOverrideTab({
  manualOverride,
  setManualOverride,
  isLiveOverride,
  setIsLiveOverride,
  liveTitleOverride,
  setLiveTitleOverride,
  publishVolunteerSettings,
}: LobbyOverrideTabProps) {
  return (
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
  );
}

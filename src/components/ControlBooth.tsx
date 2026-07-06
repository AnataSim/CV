"use client";

import React, { useState, useEffect } from "react";
import { Sliders, LogOut, ChevronDown } from "lucide-react";
import { useVoiceAFK } from "../hooks/useVoiceAFK";
import { useVolunteerManagement } from "../hooks/useVolunteerManagement";

import LobbyOverrideTab from "./control-booth/LobbyOverrideTab";
import VoiceAFKTab from "./control-booth/VoiceAFKTab";
import VolunteerManagerTab from "./control-booth/VolunteerManagerTab";

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

  // Tab State: "lobby" | "voice" | "volunteers"
  const [activeTab, setActiveTab] = useState<"lobby" | "voice" | "volunteers">("lobby");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localIsLoading, setLocalIsLoading] = useState(false);

  // ── Hook: Voice AFK ──
  const {
    backendState,
    guildId,
    channelId,
    setGuildId,
    setChannelId,
    useManualInput,
    setUseManualInput,
    isLoading: isVoiceLoading,
    errorMessage: voiceError,
    setErrorMessage: setVoiceError,
    waveformBars,
    handleSelectGuild,
    handleSelectChannel,
    handleConnect,
    handleDisconnect,
    handleClearLogs
  } = useVoiceAFK({ apiEndpoint, activeTab });

  // ── Hook: Volunteer Management ──
  const {
    volunteersList,
    newVolunteerId,
    setNewVolunteerId,
    fetchVolunteerables,
    handleAddVolunteer,
    handleRemoveVolunteer
  } = useVolunteerManagement({
    apiEndpoint,
    currentUser,
    setErrorMessage: setVoiceError,
    setIsLoading: setLocalIsLoading
  });

  const isLoading = isVoiceLoading || localIsLoading;

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

  useEffect(() => {
    if (activeTab === "volunteers") {
      fetchVolunteerables();
    }
  }, [activeTab, fetchVolunteerables]);

  // Auto collapse on mobile viewports on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsCollapsed(true);
    }
  }, []);

  const isUserAdmin = (role: string | null) => {
    return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
  };

  if (!currentUser || !isUserAdmin(userRole)) return null;

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-950 border-2 border-theater-gold text-theater-gold shadow-2xl hover:bg-neutral-900 active:scale-95 transition-all animate-float cursor-pointer"
        title="Buka Control Booth"
      >
        <Sliders size={20} className="animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm w-[calc(100vw-32px)] sm:w-full bg-neutral-950 border-2 border-theater-gold rounded-3xl p-5 shadow-2xl animate-float">
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
        
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setIsCollapsed(true)}
            className="text-neutral-500 hover:text-theater-gold transition-colors p-1 cursor-pointer"
            title="Sembunyikan"
          >
            <ChevronDown size={15} />
          </button>
          <button 
            onClick={handleLogout}
            className="text-neutral-500 hover:text-theater-red-light transition-colors p-1 cursor-pointer"
            title="Keluar"
          >
            <LogOut size={14} />
          </button>
        </div>
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
      {voiceError && (
        <div className="mb-3 px-3 py-2 rounded-xl border border-theater-red-light/30 bg-theater-red/5 text-[10px] text-theater-red-light flex items-center justify-between gap-2">
          <span>⚠️ {voiceError}</span>
          <button onClick={() => setVoiceError(null)} className="font-extrabold uppercase hover:underline">Tutup</button>
        </div>
      )}

      {/* TAB CONTENT: LOBBY */}
      {activeTab === "lobby" && (
        <LobbyOverrideTab
          manualOverride={manualOverride}
          setManualOverride={setManualOverride}
          isLiveOverride={isLiveOverride}
          setIsLiveOverride={setIsLiveOverride}
          liveTitleOverride={liveTitleOverride}
          setLiveTitleOverride={setLiveTitleOverride}
          publishVolunteerSettings={publishVolunteerSettings}
        />
      )}

      {/* TAB CONTENT: VOICEAFK */}
      {activeTab === "voice" && (
        <VoiceAFKTab
          backendState={backendState}
          guildId={guildId}
          channelId={channelId}
          setGuildId={setGuildId}
          setChannelId={setChannelId}
          useManualInput={useManualInput}
          setUseManualInput={setUseManualInput}
          isLoading={isLoading}
          waveformBars={waveformBars}
          handleSelectGuild={handleSelectGuild}
          handleSelectChannel={handleSelectChannel}
          handleConnect={handleConnect}
          handleDisconnect={handleDisconnect}
          handleClearLogs={handleClearLogs}
        />
      )}

      {/* TAB CONTENT: VOLUNTEERS (Sim Only) */}
      {activeTab === "volunteers" && discordId === "661135501226672129" && (
        <VolunteerManagerTab
          volunteersList={volunteersList}
          newVolunteerId={newVolunteerId}
          setNewVolunteerId={setNewVolunteerId}
          isLoading={isLoading}
          handleAddVolunteer={handleAddVolunteer}
          handleRemoveVolunteer={handleRemoveVolunteer}
        />
      )}
    </div>
  );
}

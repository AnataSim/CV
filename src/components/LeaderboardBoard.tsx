"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Award, Search, RefreshCw, Trophy, Flame, Mic, Coins, User, ChevronDown, Zap, CheckCircle, AlertCircle } from "lucide-react";
import { signedFetch } from "../lib/api";

interface LeaderboardUser {
  rank: number;
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  level?: number;
  xp?: number;
  nextXp?: number;
  streak?: number;
  hours?: number;
  cvAmount?: string;
  roleName?: string;
  roles?: Array<{ name: string; value: number; str: string; color: string }>;
}

interface LeaderboardData {
  leveling: LeaderboardUser[];
  streak: LeaderboardUser[];
  voice: LeaderboardUser[];
  cvWealth: LeaderboardUser[];
}

interface LeaderboardBoardProps {
  backendUrl: string;
  userRole?: string | null;
}

type TabType = "leveling" | "streak" | "voice" | "cvWealth";

const isUserAdmin = (role: string | null) => {
  return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
};

export default function LeaderboardBoard({ backendUrl, userRole = null }: LeaderboardBoardProps) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("leveling");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [integrating, setIntegrating] = useState(false);
  const [integrateResult, setIntegrateResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchLeaderboards = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/leaderboard`);
      if (!res.ok) throw new Error("Gagal mengambil data papan peringkat.");
      const json: LeaderboardData = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString("id-ID"));
    } catch (err: any) {
      console.warn(err);
      setError(err.message || "Gagal memuat papan peringkat teater.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeaderboards();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchLeaderboards]);

  // Integrasikan: update nama role Rank #1 di Discord
  const handleIntegrate = useCallback(async () => {
    setIntegrating(true);
    setIntegrateResult(null);
    try {
      const res = await signedFetch(`${backendUrl}/api/rank-roles/update`, { method: 'POST', sensitive: true });
      const json = await res.json();
      setIntegrateResult({ success: json.success, message: json.message });
      // Also refresh leaderboard after integration
      if (json.success) fetchLeaderboards(true);
    } catch (err: any) {
      setIntegrateResult({ success: false, message: 'Gagal menghubungi server. Pastikan bot aktif.' });
    } finally {
      setIntegrating(false);
      // Auto-clear toast after 6 seconds
      setTimeout(() => setIntegrateResult(null), 6000);
    }
  }, [backendUrl, fetchLeaderboards]);

  // Tab definitions
  const tabs = [
    { key: "leveling" as const, label: "Leveling", icon: <Trophy size={14} /> },
    { key: "streak" as const, label: "Daily Streak", icon: <Flame size={14} /> },
    { key: "voice" as const, label: "Voice Hours", icon: <Mic size={14} /> },
    { key: "cvWealth" as const, label: "Value Role", icon: <Coins size={14} /> },
  ];

  // Get current list based on active tab
  const getActiveList = (): LeaderboardUser[] => {
    if (!data) return [];
    return data[activeTab] || [];
  };

  // Filter list by search query
  const filteredList = getActiveList().filter(user =>
    user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.roleName && user.roleName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper for rank badge
  const renderRankBadge = (rank: number) => {
    if (rank === 1) return <span className="text-xl filter drop-shadow-sm select-none">👑</span>;
    if (rank === 2) return <span className="text-xl filter drop-shadow-sm select-none">🥈</span>;
    if (rank === 3) return <span className="text-xl filter drop-shadow-sm select-none">🥉</span>;
    return (
      <span className="text-[10px] font-black font-mono text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-md h-5 w-5 flex items-center justify-center">
        {rank}
      </span>
    );
  };

  // Helper to format values elegantly
  const renderStatValue = (user: LeaderboardUser) => {
    if (activeTab === "leveling") {
      const pct = user.xp && user.nextXp ? Math.min(100, (user.xp / user.nextXp) * 100) : 0;
      return (
        <div className="flex flex-col items-end gap-1 font-sans">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold text-neutral-500 uppercase tracking-wider">LEVEL</span>
            <span className="text-sm font-black text-theater-gold">{user.level}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-neutral-500 font-mono">{user.xp} / {user.nextXp} XP</span>
            <div className="h-1.5 w-16 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden shrink-0">
              <div 
                className="h-full bg-gradient-to-r from-theater-gold to-yellow-500 rounded-full" 
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      );
    }
    if (activeTab === "streak") {
      return (
        <div className="flex items-center gap-1.5 font-sans">
          <span className="text-sm font-black text-orange-400">{user.streak}</span>
          <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">HARI</span>
        </div>
      );
    }
    if (activeTab === "voice") {
      return (
        <div className="flex items-center gap-1.5 font-sans">
          <span className="text-sm font-black text-sky-400">{user.hours}</span>
          <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">JAM</span>
        </div>
      );
    }
    if (activeTab === "cvWealth") {
      return (
        <div className="flex flex-col items-end gap-0.5 font-sans text-right">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-extrabold text-theater-gold mr-0.5">CV</span>
            <span className="text-sm font-black text-white tracking-wide">{user.cvAmount}</span>
          </div>
          {user.roleName && (
            <span className="text-[8px] font-extrabold text-theater-gold/60 uppercase tracking-tighter truncate max-w-[150px]">
              {user.roleName}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-6 w-full text-left">
      
      {/* ── Header ── */}
      <div 
        className="rounded-2xl border border-neutral-900 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #060102 0%, #0d0800 100%)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theater-red-light/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theater-gold/20 to-transparent" />

        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div 
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border"
              style={{ background: "#ff336615", borderColor: "#ff336630" }}
            >
              <Award size={18} className="text-theater-red-light" />
            </div>
            <div>
              <h3 className="font-display text-base font-black text-white uppercase tracking-widest">
                Panggung Jawara &amp; Value Role
              </h3>
              <p className="text-[10px] text-neutral-500 font-semibold tracking-wide mt-0.5">
                Klasemen ranking anomaly CrunchyVerse teratas berdasarkan Value Role
                {lastUpdated && <span className="text-neutral-600 ml-2">· diperbarui {lastUpdated}</span>}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="shrink-0 flex items-center gap-2">

            {/* Integrasikan Button */}
            {isUserAdmin(userRole) && (
              <button
                onClick={handleIntegrate}
                disabled={integrating || loading}
                title="Update nama role Rank #1 di Discord berdasarkan data leaderboard terbaru"
                className="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:from-neutral-800 disabled:to-neutral-800 border border-sky-500/40 disabled:border-neutral-700 px-4 py-2 rounded-xl text-white disabled:text-neutral-500 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-black uppercase tracking-wider shadow-md shadow-sky-950/30 disabled:shadow-none active:scale-95"
              >
                <Zap size={12} className={integrating ? "animate-pulse" : ""} />
                <span>{integrating ? "Mengintegrasikan..." : "Integrasikan"}</span>
              </button>
            )}

            {/* Refresh Button */}
            <button 
              onClick={() => fetchLeaderboards()}
              disabled={loading}
              className="shrink-0 flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-red-light/30 px-4 py-2 rounded-xl text-neutral-400 hover:text-white transition-all cursor-pointer disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              <span>{loading ? "Memuat..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Integration result toast */}
        {integrateResult && (
          <div className={`mx-5 mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold border transition-all ${
            integrateResult.success
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/30 text-rose-300'
          }`}>
            {integrateResult.success
              ? <CheckCircle size={14} className="shrink-0 mt-0.5 text-emerald-400" />
              : <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-400" />}
            <span>{integrateResult.message}</span>
          </div>
        )}

        {/* Tab Navigation row */}
        <div className="border-t border-neutral-900/60 bg-neutral-950/40 p-1 flex overflow-x-auto gap-1 scrollbar-none">
          {tabs.map(({ key, label, icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveTab(key);
                  setSearchQuery("");
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  active 
                    ? "bg-theater-red/10 border border-theater-red-light/35 text-theater-red-light shadow-md shadow-theater-red-dark/10" 
                    : "border border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search filter ── */}
      <div className="relative">
        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600" />
        <input 
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={`Cari nama jawara di dalam papan ${tabs.find(t => t.key === activeTab)?.label}...`}
          className="w-full bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-theater-red-light/40 focus:outline-none text-xs text-white placeholder-neutral-600 rounded-xl pl-9 pr-4 py-2.5 transition-all font-sans"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-white text-xs cursor-pointer"
          >✕</button>
        )}
      </div>

      {/* ── Error message ── */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-900/40 text-xs font-semibold text-red-400 rounded-xl flex items-center gap-2 animate-fade-in">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* ── Leaderboard List ── */}
      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-theater-red-light/20 border-t-theater-red-light animate-spin" />
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Menyelaraskan Papan Jawara...
          </span>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded-2xl border border-neutral-900 bg-neutral-950/20 py-16 text-center text-neutral-600 italic text-sm">
          {searchQuery ? `Tidak ada jawara yang cocok dengan "${searchQuery}"` : "Klasemen kosong atau belum tersinkronisasi."}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredList.map((user) => {
            const isTop3 = user.rank <= 3;
            const isExpanded = expandedUser === user.id;
            const hasRoles = user.roles && user.roles.length > 0;
            
            // Border highlights for top 3
            let cardStyle = "border-neutral-900/80 bg-neutral-950/40 hover:bg-neutral-950/70";
            if (user.rank === 1) {
              cardStyle = "border-theater-gold/40 bg-gradient-to-r from-theater-gold/5 via-neutral-950/50 to-neutral-950/30 hover:from-theater-gold/8 hover:via-neutral-950/60 shadow-lg shadow-theater-gold/5";
            } else if (user.rank === 2) {
              cardStyle = "border-neutral-400/20 bg-gradient-to-r from-neutral-400/3 via-neutral-950/50 to-neutral-950/30 hover:from-neutral-400/5";
            } else if (user.rank === 3) {
              cardStyle = "border-amber-700/20 bg-gradient-to-r from-amber-700/3 via-neutral-950/50 to-neutral-950/30 hover:from-amber-700/5";
            }

            return (
              <div 
                key={user.id}
                onClick={() => {
                  if (activeTab === "cvWealth" && hasRoles) {
                    setExpandedUser(isExpanded ? null : user.id);
                  }
                }}
                className={`rounded-2xl border p-3 px-4 flex flex-col transition-all duration-300 transform ${
                  activeTab === "cvWealth" && hasRoles ? "cursor-pointer hover:scale-[1.008]" : ""
                } ${cardStyle}`}
              >
                {/* Main row details */}
                <div className="flex items-center justify-between gap-4 w-full">
                  {/* Left block: Rank & Profile details */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Rank badge */}
                    <div className="w-6 flex items-center justify-center shrink-0">
                      {renderRankBadge(user.rank)}
                    </div>

                    {/* Avatar with gold rim if Rank 1 */}
                    <div className="relative shrink-0">
                      <div className={`h-9 w-9 rounded-full overflow-hidden border flex items-center justify-center bg-neutral-900 ${
                        user.rank === 1 
                          ? 'border-theater-gold shadow-md shadow-theater-gold/10' 
                          : 'border-neutral-800'
                      }`}>
                        {user.avatar ? (
                          <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                        ) : (
                          <User size={14} className="text-neutral-600" />
                        )}
                      </div>
                    </div>

                    {/* User Identifications */}
                    <div className="text-left min-w-0">
                      <h4 className={`text-xs font-black tracking-wide truncate ${
                        user.rank === 1 ? "text-theater-gold" : "text-white"
                      }`}>
                        {user.displayName}
                      </h4>
                      <p className="text-[9px] text-neutral-500 font-semibold tracking-wide truncate">
                        @{user.username}
                      </p>
                    </div>
                  </div>

                  {/* Right block: Tab-specific Stats display & Expand indicator */}
                  <div className="shrink-0 flex items-center gap-2">
                    {renderStatValue(user)}
                    {activeTab === "cvWealth" && hasRoles && (
                      <ChevronDown 
                        size={14} 
                        className={`text-neutral-500 hover:text-white transition-transform duration-300 ml-1.5 shrink-0 ${
                          isExpanded ? "rotate-180 text-theater-gold" : ""
                        }`}
                      />
                    )}
                  </div>
                </div>

                {/* Expanded Role Breakdown section */}
                {activeTab === "cvWealth" && isExpanded && hasRoles && (
                  <div className="mt-3.5 pt-3.5 border-t border-neutral-900/60 w-full flex flex-col gap-2 font-sans select-none animate-slide-down">
                    <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest mb-1 flex items-center justify-between">
                      <span>Rincian Perolehan Role</span>
                      <span className="text-theater-gold/90 font-bold">Value Role (CV)</span>
                    </div>
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto scrollbar-none pr-1">
                      {user.roles?.map((role, rIdx) => (
                        <div 
                          key={rIdx}
                          className="flex items-center justify-between bg-neutral-950/50 hover:bg-neutral-950/90 border border-neutral-900/60 p-2.5 rounded-xl transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Role indicator colored dot with glowing drop-shadow */}
                            <span 
                              className="h-2 w-2 rounded-full shrink-0 shadow-sm"
                              style={{ 
                                backgroundColor: role.color || "#ff3366",
                                boxShadow: `0 0 8px ${role.color || "#ff3366"}b0` 
                              }}
                            />
                            <span className="text-xs font-bold text-neutral-200 tracking-wide truncate">
                              {role.name}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 font-mono text-xs font-extrabold text-theater-gold">
                            <span>+</span>
                            <span>{role.str}</span>
                            <span className="text-[7.5px] font-sans font-black tracking-wider uppercase ml-0.5 text-neutral-500">CV</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

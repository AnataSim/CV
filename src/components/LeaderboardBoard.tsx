"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Award, Search, RefreshCw, Trophy, Flame, Mic, Coins, Zap, CheckCircle, AlertCircle } from "lucide-react";
import { signedFetch } from "../lib/api";
import LeaderboardRow from "./leaderboard/LeaderboardRow";

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

  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("");
  const USERS_PER_PAGE = 10;

  // Reset page to 1 when changing tabs or search query
  useEffect(() => {
    setCurrentPage(1);
    setPageInput("");
  }, [activeTab, searchQuery]);

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

  const totalPages = Math.max(1, Math.ceil(filteredList.length / USERS_PER_PAGE));
  const pagedList = filteredList.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setCurrentPage(clamped);
    setPageInput("");
  };

  const getPageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [];
    const addRange = (from: number, to: number) => {
      for (let i = from; i <= to; i++) pages.push(i);
    };
    if (currentPage <= 4) {
      addRange(1, 5); pages.push("..."); pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1); pages.push("..."); addRange(totalPages - 4, totalPages);
    } else {
      pages.push(1); pages.push("...");
      addRange(currentPage - 1, currentPage + 1);
      pages.push("..."); pages.push(totalPages);
    }
    return pages;
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            {pagedList.map((user) => (
              <LeaderboardRow
                key={user.id}
                user={user}
                activeTab={activeTab}
                expandedUser={expandedUser}
                setExpandedUser={setExpandedUser}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 px-1 py-3 border-t border-neutral-900/60">
              {/* Pagination buttons */}
              <div className="flex items-center gap-1">
                {/* Prev */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-lg border border-neutral-900 flex items-center justify-center text-xs font-bold text-neutral-500 hover:text-white hover:border-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  ‹
                </button>

                {getPageNumbers().map((pg, idx) =>
                  pg === "..." ? (
                    <span key={`ellipsis-${idx}`} className="h-8 px-1 flex items-center justify-center text-neutral-600 text-xs select-none font-mono">
                      …
                    </span>
                  ) : (
                    <button
                      key={pg}
                      onClick={() => goToPage(pg as number)}
                      className="h-8 min-w-[2rem] px-2 rounded-lg border text-xs font-black transition-all cursor-pointer"
                      style={{
                        background:   currentPage === pg ? "rgba(229, 26, 45, 0.1)" : "#0c0708",
                        borderColor:  currentPage === pg ? "rgba(229, 26, 45, 0.4)" : "#221114",
                        color:        currentPage === pg ? "#e51a2d" : "#776669",
                        boxShadow:    currentPage === pg ? "0 0 12px rgba(229, 26, 45, 0.15)" : "none",
                      }}
                    >
                      {pg}
                    </button>
                  )
                )}

                {/* Next */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-lg border border-neutral-900 flex items-center justify-center text-xs font-bold text-neutral-500 hover:text-white hover:border-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  ›
                </button>
              </div>

              {/* Page info + input row */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="text-[9px] text-neutral-600 font-mono uppercase tracking-widest">
                  Halaman {currentPage} / {totalPages} &nbsp;·&nbsp; {filteredList.length} jawara
                </span>
                <div className="flex items-center gap-1.5 font-sans">
                  <span className="text-[9px] text-neutral-600 font-mono uppercase">Ke halaman:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    onChange={e => setPageInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const n = parseInt(pageInput);
                        if (!isNaN(n)) goToPage(n);
                      }
                    }}
                    placeholder="#"
                    className="w-14 text-center bg-neutral-950 border border-neutral-900 focus:border-theater-red-light/40 focus:outline-none text-xs text-white rounded-lg py-1 px-2 font-mono"
                  />
                  <button
                    onClick={() => { const n = parseInt(pageInput); if (!isNaN(n)) goToPage(n); }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-theater-red/30 text-theater-red-light hover:text-white hover:bg-theater-red/20 cursor-pointer transition-all uppercase tracking-wide"
                    style={{ background: "rgba(229, 26, 45, 0.05)" }}
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer count */}
          {!loading && filteredList.length > 0 && totalPages <= 1 && (
            <div className="text-center text-[9px] text-neutral-700 font-mono uppercase tracking-widest pb-2">
              {filteredList.length} jawara terdaftar
            </div>
          )}
        </div>
      )}
    </div>
  );
}

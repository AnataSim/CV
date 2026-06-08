"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Coins,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Key,
  Search,
  Hash,
  Lock,
  Eye,
  MessageSquare,
  Mic,
  Crown,
  Settings,
  Zap,
  Bell,
  Ban,
  Star,
} from "lucide-react";

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

interface RoleData {
  id: string;
  name: string;
  color: string;
  gradientColors: string[] | null;
  icon: string | null;
  cvAmount: string | null;
  position: number;
  permissions: string[];
  members: Member[];
}

interface BotStorageProps {
  backendUrl: string;
}

// ─── Permission icon & label map ────────────────────────────────────────────

const PERM_META: Record<string, { label: string; icon: React.ReactNode; tier: "admin" | "mod" | "basic" }> = {
  ADMINISTRATOR:           { label: "Administrator",        icon: <Crown size={9} />,      tier: "admin" },
  MANAGE_GUILD:            { label: "Kelola Server",        icon: <Settings size={9} />,   tier: "admin" },
  MANAGE_ROLES:            { label: "Kelola Role",          icon: <Shield size={9} />,     tier: "admin" },
  MANAGE_CHANNELS:         { label: "Kelola Channel",       icon: <Hash size={9} />,       tier: "admin" },
  MANAGE_MESSAGES:         { label: "Kelola Pesan",         icon: <MessageSquare size={9} />, tier: "mod" },
  MANAGE_WEBHOOKS:         { label: "Kelola Webhook",       icon: <Zap size={9} />,        tier: "mod" },
  KICK_MEMBERS:            { label: "Kick Member",          icon: <Ban size={9} />,        tier: "mod" },
  BAN_MEMBERS:             { label: "Ban Member",           icon: <Ban size={9} />,        tier: "mod" },
  MODERATE_MEMBERS:        { label: "Timeout Member",       icon: <Lock size={9} />,       tier: "mod" },
  VIEW_CHANNEL:            { label: "Lihat Channel",        icon: <Eye size={9} />,        tier: "basic" },
  SEND_MESSAGES:           { label: "Kirim Pesan",          icon: <MessageSquare size={9} />, tier: "basic" },
  ATTACH_FILES:            { label: "Lampirkan File",       icon: <MessageSquare size={9} />, tier: "basic" },
  CONNECT:                 { label: "Masuk Voice",          icon: <Mic size={9} />,        tier: "basic" },
  SPEAK:                   { label: "Bicara di Voice",      icon: <Mic size={9} />,        tier: "basic" },
  USE_EXTERNAL_EMOJIS:     { label: "Emoji Eksternal",      icon: <Star size={9} />,       tier: "basic" },
  ADD_REACTIONS:           { label: "Tambah Reaksi",        icon: <Star size={9} />,       tier: "basic" },
  MENTION_EVERYONE:        { label: "Mention @everyone",    icon: <Bell size={9} />,       tier: "mod" },
  MUTE_MEMBERS:            { label: "Bisukan Member",       icon: <Mic size={9} />,        tier: "mod" },
  DEAFEN_MEMBERS:          { label: "Deafen Member",        icon: <Mic size={9} />,        tier: "mod" },
  MOVE_MEMBERS:            { label: "Pindahkan Member",     icon: <Users size={9} />,      tier: "mod" },
  PRIORITY_SPEAKER:        { label: "Prioritas Suara",      icon: <Mic size={9} />,        tier: "basic" },
};

const TIER_STYLE = {
  admin: "bg-red-950/60 border-red-800/50 text-red-300",
  mod:   "bg-amber-950/60 border-amber-800/40 text-amber-300",
  basic: "bg-neutral-900 border-neutral-800 text-neutral-400",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function BotStorage({ backendUrl }: BotStorageProps) {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"position" | "name" | "cv">("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("");

  const ROLES_PER_PAGE = 10;

  const fetchRoles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/roles`);
      if (!res.ok) throw new Error("Gagal mengambil data kasta role teater.");
      const data: RoleData[] = await res.json();
      setRoles(data);
      setLastUpdated(new Date().toLocaleTimeString("id-ID"));
    } catch (err: any) {
      console.warn(err);
      setError(err.message || "Gagal memuat penyimpanan role.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRoles();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchRoles]);

  const toggleExpand = (roleId: string) => {
    setExpandedRole(prev => prev === roleId ? null : roleId);
  };

  const getRoleColor = (hex: string) =>
    hex === "#000000" || hex === "#000" ? "#d4af37" : hex;

  // Parse CV$ string to number for numeric sorting
  const parseCv = (cv: string | null): number => {
    if (!cv) return -1;
    return parseFloat(cv.replace(/[.,\s]/g, "").replace(",", ".")) || -1;
  };

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Apply sort on filtered results
  const sortedRoles = [...filteredRoles].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "position") {
      // Discord position: higher number = higher in list, desc = server order (top first)
      return (a.position - b.position) * dir;
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name, "id") * dir;
    }
    if (sortBy === "cv") {
      return (parseCv(a.cvAmount) - parseCv(b.cvAmount)) * dir;
    }
    return 0;
  });

  const toggleSort = (key: "position" | "name" | "cv") => {
    if (sortBy === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir(key === "cv" || key === "position" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
    }, 0);
    return () => clearTimeout(timer);
  }, [search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRoles.length / ROLES_PER_PAGE));
  const pagedRoles = sortedRoles.slice(
    (currentPage - 1) * ROLES_PER_PAGE,
    currentPage * ROLES_PER_PAGE
  );

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setCurrentPage(clamped);
    setPageInput("");
  };

  // Smart page numbers: always show first, last, current ± 1, ellipsis for gaps
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

  // Gradient color helper
  const getRoleGradient = (role: RoleData) => {
    if (role.gradientColors && role.gradientColors.length >= 2) {
      return `linear-gradient(90deg, ${role.gradientColors.join(", ")})`;
    }
    return null;
  };

  // Stats summary
  const totalMembers   = roles.reduce((s, r) => s + r.members.length, 0);
  const rolesWithCv    = roles.filter(r => r.cvAmount).length;
  const rolesWithIcon  = roles.filter(r => r.icon).length;

  return (
    <div className="flex flex-col gap-6">

      {/* Gradient animation keyframe */}
      <style>{`
        @keyframes role-gradient-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .role-gradient-text {
          background-size: 200% auto;
          animation: role-gradient-shift 3s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .role-gradient-bar {
          background-size: 200% auto;
          animation: role-gradient-shift 3s ease infinite;
        }
      `}</style>

      {/* ── Header ── */}
      <div
        className="rounded-2xl border border-neutral-800/60 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0d0d0d 0%, #111108 100%)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-600/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-900/40 to-transparent" />

        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border"
              style={{ background: "#d4af3715", borderColor: "#d4af3730" }}
            >
              <Shield size={18} style={{ color: "#d4af37" }} />
            </div>
            <div>
              <h3 className="font-display text-base font-black text-white uppercase tracking-widest">
                Arsip Role &amp; Sekte
              </h3>
              <p className="text-[10px] text-neutral-500 font-semibold tracking-wide mt-0.5">
                Data langsung dari Discord Bot CrunchyVerse
                {lastUpdated && <span className="text-neutral-600 ml-2">· diperbarui {lastUpdated}</span>}
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchRoles()}
            disabled={loading}
            className="shrink-0 flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-yellow-700/40 px-4 py-2 rounded-xl text-neutral-400 hover:text-white transition-all cursor-pointer disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Memuat..." : "Refresh"}</span>
          </button>
        </div>

        {/* Summary stats row */}
        <div className="border-t border-neutral-900 grid grid-cols-3 divide-x divide-neutral-900">
          {[
            { label: "Total Role",    value: roles.length,    icon: <Shield size={12} /> },
            { label: "Total Pemegang",value: totalMembers,    icon: <Users size={12} /> },
            { label: "Punya CV",      value: rolesWithCv,     icon: <Shield size={12} /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex flex-col items-center justify-center py-3 gap-0.5">
              <div className="flex items-center gap-1 text-neutral-500" style={{ color: "#d4af3799" }}>
                {icon}
              </div>
              <div className="font-display font-black text-white text-lg leading-none">{value}</div>
              <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-bold">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama role atau sekte..."
          className="w-full bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-yellow-700/50 focus:outline-none text-xs text-white placeholder-neutral-600 rounded-xl pl-9 pr-4 py-2.5 transition-all font-sans"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-white text-xs cursor-pointer"
          >✕</button>
        )}
      </div>

      {/* ── Sort Controls ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest shrink-0">Urutkan:</span>

        {([
          { key: "position" as const, label: "Urutan Discord", asc: "↑ Bawah Dulu",  desc: "↓ Atas Dulu" },
          { key: "name"     as const, label: "Nama",           asc: "A → Z",           desc: "Z → A" },
          { key: "cv"       as const, label: "Value Role",     asc: "↑ Terkecil",     desc: "↓ Terbesar" },
        ]).map(({ key, label, asc, desc }) => {
          const active = sortBy === key;
          return (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer"
              style={{
                background:   active ? "#d4af3715" : "#111",
                borderColor:  active ? "#d4af3740" : "#2a2a2a",
                color:        active ? "#d4af37"   : "#555",
              }}
            >
              <span>{label}</span>
              {active && (
                <span className="text-[9px] opacity-80">
                  {sortDir === "asc" ? asc : desc}
                </span>
              )}
              {active && (
                <span style={{ fontSize: 9, opacity: 0.7 }}>
                  {sortDir === "asc" ? "▲" : "▼"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-900/40 text-xs font-semibold text-red-400 rounded-xl flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* ── Role Cards ── */}
      {loading && roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-yellow-600/30 border-t-yellow-500 animate-spin" />
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Membuka lembar kasta...
          </span>
        </div>
      ) : sortedRoles.length === 0 ? (
        <div className="text-neutral-600 italic text-center py-14 text-sm">
          {search ? `Tidak ada role yang cocok dengan "${search}"` : "Tidak ada data role yang ditemukan."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pagedRoles.map((role) => {
            const isExpanded   = expandedRole === role.id;
            const roleColor    = getRoleColor(role.color);
            const gradient     = getRoleGradient(role);
            const hexAlpha08   = `${roleColor}14`;

            return (
              <div
                key={role.id}
                className="rounded-2xl border overflow-hidden transition-all duration-300"
                style={{
                  borderColor: isExpanded ? `${roleColor}50` : "#1a1a1a",
                  boxShadow: isExpanded ? `0 0 30px -4px ${roleColor}20` : "none",
                  background: "#0a0a0a",
                }}
              >
                {/* Left accent bar — solid or animated gradient */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${gradient ? "role-gradient-bar" : ""}`}
                  style={{
                    background: gradient ?? roleColor,
                    position: "absolute",
                  }}
                />

                {/* ── Card Header (always visible) ── */}
                <div
                  onClick={() => toggleExpand(role.id)}
                  className="pl-5 pr-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer select-none group relative"
                  style={{ background: isExpanded ? hexAlpha08 : "transparent" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Role icon / color swatch */}
                    <div
                      className="h-11 w-11 rounded-xl shrink-0 border flex items-center justify-center overflow-hidden"
                      style={{ borderColor: `${roleColor}40`, background: `${roleColor}15` }}
                    >
                      {role.icon ? (
                        <img
                          src={role.icon}
                          alt={role.name}
                          className="h-full w-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <Shield size={20} style={{ color: roleColor }} />
                      )}
                    </div>

                    {/* Name + badges */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {gradient ? (
                          <h4
                            className="role-gradient-text text-sm font-extrabold leading-tight truncate font-sans"
                            style={{ backgroundImage: gradient }}
                          >
                            {role.name}
                          </h4>
                        ) : (
                          <h4
                            className="text-sm font-extrabold leading-tight truncate font-sans"
                            style={{ color: roleColor }}
                          >
                            {role.name}
                          </h4>
                        )}
                        {role.cvAmount && (
                          <span
                            className="shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border"
                            style={{ color: "#d4af37", borderColor: "#d4af3730", background: "#d4af3710" }}
                          >
                            <Shield size={8} />
                            CV {role.cvAmount}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1">
                        {/* Color chip */}
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-neutral-500">
                          <span
                            className="h-2.5 w-2.5 rounded-sm border border-white/10"
                            style={{ background: roleColor }}
                          />
                          {roleColor.toUpperCase()}
                        </span>

                        {/* Member count */}
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-neutral-500 uppercase">
                          <Users size={9} />
                          {role.members.length} pemegang
                        </span>

                        {/* Permission count */}
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-neutral-500 uppercase">
                          <Key size={9} />
                          {role.permissions.length} izin
                        </span>

                        {/* Role icon indicator */}
                        {role.icon && (
                          <span className="text-[9px] font-bold text-neutral-600 uppercase">
                            🖼 Logo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div
                    className="shrink-0 h-7 w-7 rounded-lg border flex items-center justify-center transition-all"
                    style={{
                      borderColor: isExpanded ? `${roleColor}40` : "#2a2a2a",
                      background: isExpanded ? `${roleColor}15` : "#111",
                      color: isExpanded ? roleColor : "#555",
                    }}
                  >
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </div>
                </div>

                {/* ── Expanded Panel ── */}
                {isExpanded && (
                  <div
                    className="border-t flex flex-col gap-5 p-5"
                    style={{ borderColor: "#1a1a1a", background: "#070707" }}
                  >

                    {/* Row: Color + CV$ + Icon preview */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                      {/* Color info */}
                      <div className="rounded-xl border border-neutral-900 p-3 flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-lg shrink-0 border border-white/10 shadow-lg"
                          style={{ background: roleColor, boxShadow: `0 4px 16px ${roleColor}40` }}
                        />
                        <div>
                          <div className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Warna Role</div>
                          <div className="text-xs font-black text-white font-mono mt-0.5">{roleColor.toUpperCase()}</div>
                          <div className="text-[9px] text-neutral-600 font-mono">
                            #{parseInt(roleColor.slice(1, 3), 16)},{parseInt(roleColor.slice(3, 5), 16)},{parseInt(roleColor.slice(5, 7), 16)}
                          </div>
                        </div>
                      </div>

                      {/* CV$ treasury */}
                      <div
                        className="rounded-xl border p-3 flex items-center gap-3"
                        style={{ borderColor: "#d4af3720", background: "#d4af3708" }}
                      >
                        <div
                          className="h-10 w-10 rounded-lg shrink-0 border flex items-center justify-center"
                          style={{ borderColor: "#d4af3730", background: "#d4af3715", color: "#d4af37" }}
                        >
                          <Shield size={18} />
                        </div>
                        <div>
                          <div className="text-[8px] font-black text-yellow-700 uppercase tracking-widest">Kekuatan Value Role</div>
                          <div className="text-sm font-black text-yellow-400 font-display mt-0.5">
                            {role.cvAmount ? `CV ${role.cvAmount}` : "—"}
                          </div>
                          <div className="text-[9px] text-neutral-600">Nilai kontribusi kasta/role server</div>
                        </div>
                      </div>

                      {/* Role icon */}
                      <div className="rounded-xl border border-neutral-900 p-3 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg shrink-0 border border-neutral-800 bg-neutral-900 flex items-center justify-center overflow-hidden">
                          {role.icon ? (
                            <img src={role.icon} alt="Role logo" className="h-full w-full object-cover" />
                          ) : (
                            <Shield size={18} className="text-neutral-700" />
                          )}
                        </div>
                        <div>
                          <div className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Logo Role</div>
                          <div className="text-xs font-bold text-neutral-400 mt-0.5">
                            {role.icon ? "Ada gambar logo" : "Tidak ada logo"}
                          </div>
                          {role.icon && (
                            <a
                              href={role.icon}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[9px] text-yellow-600 hover:text-yellow-400 underline"
                            >
                              Lihat gambar ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Members */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                          <Users size={11} />
                          <span>Pemegang Role ({role.members.length})</span>
                        </div>
                      </div>

                      {role.members.length === 0 ? (
                        <div className="text-[10px] text-neutral-700 italic py-3 border border-neutral-900 rounded-xl text-center">
                          Belum ada member yang menyandang role ini.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {role.members.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center gap-2.5 p-2 rounded-xl border border-neutral-900 hover:border-neutral-700 bg-neutral-950/80 transition-all group/member"
                            >
                              <div className="h-8 w-8 rounded-full overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center shrink-0">
                                {member.avatar ? (
                                  <img
                                    src={member.avatar}
                                    alt={member.displayName}
                                    className="h-full w-full object-cover"
                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <User size={12} className="text-neutral-600" />
                                )}
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-[11px] font-bold text-white truncate leading-tight font-sans">
                                  {member.displayName}
                                </div>
                                <div className="text-[9px] text-neutral-600 truncate font-mono leading-none">
                                  @{member.username}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Permissions */}
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3">
                        <Key size={11} />
                        <span>Izin Kekuasaan ({role.permissions.length})</span>
                      </div>

                      {role.permissions.length === 0 ? (
                        <div className="text-[10px] text-neutral-700 italic py-3 border border-neutral-900 rounded-xl text-center">
                          Role ini tidak memiliki hak izin administratif khusus.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {role.permissions.map((perm, idx) => {
                            const meta = PERM_META[perm];
                            const tierStyle = TIER_STYLE[meta?.tier ?? "basic"];
                            return (
                              <span
                                key={idx}
                                className={`inline-flex items-center gap-1 text-[8px] font-extrabold border px-2 py-1 rounded-lg uppercase tracking-wider font-mono ${tierStyle}`}
                                title={perm}
                              >
                                {meta?.icon}
                                {meta?.label ?? perm.replace(/_/g, " ")}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div
          className="rounded-2xl border border-neutral-900 p-4 flex flex-col gap-3"
          style={{ background: "#0a0a0a" }}
        >
          {/* Page buttons row */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {/* Prev */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-lg border border-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500 hover:text-white hover:border-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              ‹
            </button>

            {getPageNumbers().map((pg, idx) =>
              pg === "..." ? (
                <span key={`ellipsis-${idx}`} className="h-8 px-1 flex items-center justify-center text-neutral-600 text-xs select-none">
                  …
                </span>
              ) : (
                <button
                  key={pg}
                  onClick={() => goToPage(pg as number)}
                  className="h-8 min-w-[2rem] px-2 rounded-lg border text-xs font-black transition-all cursor-pointer"
                  style={{
                    background:   currentPage === pg ? "#d4af3715" : "#111",
                    borderColor:  currentPage === pg ? "#d4af3750" : "#2a2a2a",
                    color:        currentPage === pg ? "#d4af37"   : "#666",
                    boxShadow:    currentPage === pg ? "0 0 12px #d4af3720" : "none",
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
              className="h-8 w-8 rounded-lg border border-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500 hover:text-white hover:border-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              ›
            </button>
          </div>

          {/* Page info + input row */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <span className="text-[9px] text-neutral-600 font-mono uppercase tracking-widest">
              Halaman {currentPage} / {totalPages} &nbsp;·&nbsp; {sortedRoles.length} role
            </span>
            <div className="flex items-center gap-1.5">
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
                className="w-14 text-center bg-neutral-900 border border-neutral-800 focus:border-yellow-700/50 focus:outline-none text-xs text-white rounded-lg py-1 px-2 font-mono"
              />
              <button
                onClick={() => { const n = parseInt(pageInput); if (!isNaN(n)) goToPage(n); }}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-all"
                style={{ background: "#d4af3715", borderColor: "#d4af3740", color: "#d4af37" }}
              >
                Go
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer count (single page case) */}
      {!loading && sortedRoles.length > 0 && totalPages <= 1 && (
        <div className="text-center text-[9px] text-neutral-700 font-mono uppercase tracking-widest pb-2">
          {sortedRoles.length} role terdaftar
        </div>
      )}
    </div>
  );
}

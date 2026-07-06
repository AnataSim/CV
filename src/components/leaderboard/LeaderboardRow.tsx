import React from "react";
import { User, ChevronDown, Trophy, Flame, Mic, Coins } from "lucide-react";

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

type TabType = "leveling" | "streak" | "voice" | "cvWealth";

interface LeaderboardRowProps {
  user: LeaderboardUser;
  activeTab: TabType;
  expandedUser: string | null;
  setExpandedUser: (id: string | null) => void;
}

export default function LeaderboardRow({ user, activeTab, expandedUser, setExpandedUser }: LeaderboardRowProps) {
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

  const renderStatValue = (u: LeaderboardUser) => {
    if (activeTab === "leveling") {
      const pct = u.xp && u.nextXp ? Math.min(100, (u.xp / u.nextXp) * 100) : 0;
      return (
        <div className="flex flex-col items-end gap-1 font-sans">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold text-neutral-500 uppercase tracking-wider">LEVEL</span>
            <span className="text-sm font-black text-theater-gold">{u.level}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-neutral-500 font-mono">{u.xp} / {u.nextXp} XP</span>
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
          <span className="text-sm font-black text-orange-400">{u.streak}</span>
          <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">HARI</span>
        </div>
      );
    }
    if (activeTab === "voice") {
      return (
        <div className="flex items-center gap-1.5 font-sans">
          <span className="text-sm font-black text-sky-400">{u.hours}</span>
          <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">JAM</span>
        </div>
      );
    }
    if (activeTab === "cvWealth") {
      return (
        <div className="flex flex-col items-end gap-0.5 font-sans text-right">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-extrabold text-theater-gold mr-0.5">CV</span>
            <span className="text-sm font-black text-white tracking-wide">{u.cvAmount}</span>
          </div>
          {u.roleName && (
            <span className="text-[8px] font-extrabold text-theater-gold/60 uppercase tracking-tighter truncate max-w-[150px]">
              {u.roleName}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div 
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
}

import React from "react";
import {
  Shield,
  Users,
  Key,
  User,
  Crown,
  Settings,
  MessageSquare,
  Zap,
  Ban,
  Lock,
  Eye,
  Bell,
  Star,
  Mic,
} from "lucide-react";

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

interface RoleDetailProps {
  role: RoleData;
  roleColor: string;
}

const PERM_META: Record<string, { label: string; icon: React.ReactNode; tier: "admin" | "mod" | "basic" }> = {
  ADMINISTRATOR:           { label: "Administrator",        icon: <Crown size={9} />,      tier: "admin" },
  MANAGE_GUILD:            { label: "Kelola Server",        icon: <Settings size={9} />,   tier: "admin" },
  MANAGE_ROLES:            { label: "Kelola Role",          icon: <Shield size={9} />,     tier: "admin" },
  MANAGE_CHANNELS:         { label: "Kelola Channel",       icon: <HashIcon size={9} />,       tier: "admin" },
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

// Custom mini Hash icon to avoid loading issue
function HashIcon({ size = 9 }: { size?: number }) {
  return (
    <span style={{ fontSize: size }} className="font-bold leading-none font-mono">#</span>
  );
}

export default function RoleDetail({ role, roleColor }: RoleDetailProps) {
  return (
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
  );
}

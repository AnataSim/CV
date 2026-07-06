import React from "react";
import { Shield, Users, Key, ChevronDown, ChevronUp } from "lucide-react";

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

interface RoleCardProps {
  role: RoleData;
  isExpanded: boolean;
  onToggleExpand: (roleId: string) => void;
  roleColor: string;
  gradient: string | null;
  hexAlpha08: string;
}

export default function RoleCard({
  role,
  isExpanded,
  onToggleExpand,
  roleColor,
  gradient,
  hexAlpha08
}: RoleCardProps) {
  return (
    <div
      onClick={() => onToggleExpand(role.id)}
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
  );
}

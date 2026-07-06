"use client";

import React from "react";
import { X } from "lucide-react";

interface Volunteer {
  discordId: string;
  addedAt: string;
  addedBy: string;
  username?: string;
  globalName?: string;
  avatarUrl?: string;
}

interface VolunteerListProps {
  volunteersList: Volunteer[];
  handleRemoveVolunteer: (discordId: string) => Promise<void>;
  isLoading: boolean;
}

export default function VolunteerList({
  volunteersList,
  handleRemoveVolunteer,
  isLoading,
}: VolunteerListProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Daftar Volunteer Aktif</label>
      <div className="max-h-48 overflow-y-auto bg-neutral-950 border border-neutral-900 rounded-xl p-2 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
        {volunteersList.length === 0 ? (
          <div className="text-neutral-600 italic text-center py-6 text-[10px]">
            Belum ada volunteer yang ditambahkan.
          </div>
        ) : (
          volunteersList.map((vol) => (
            <div key={vol.discordId} className="flex items-center justify-between p-2 rounded-lg bg-neutral-900/40 border border-neutral-900 text-[10px]">
              <div className="flex items-center gap-2 text-left">
                <img
                  src={vol.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png"}
                  alt="Discord Avatar"
                  className="w-7 h-7 rounded-full border border-neutral-800 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png";
                  }}
                />
                <div className="flex flex-col">
                  <span className="text-white font-bold">{vol.globalName || vol.username || "Discord User"}</span>
                  <span className="text-neutral-500 font-mono text-[8px] mt-0.5">{vol.discordId}</span>
                </div>
              </div>
              <button
                onClick={() => handleRemoveVolunteer(vol.discordId)}
                disabled={isLoading}
                className="text-neutral-500 hover:text-theater-red-light p-1 transition-colors cursor-pointer disabled:opacity-50"
                title="Hapus Volunteer"
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

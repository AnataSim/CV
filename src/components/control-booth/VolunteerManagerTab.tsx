"use client";

import React from "react";
import { UserPlus } from "lucide-react";
import VolunteerList from "./VolunteerList";

interface Volunteer {
  discordId: string;
  addedAt: string;
  addedBy: string;
  username?: string;
  globalName?: string;
  avatarUrl?: string;
}

interface VolunteerManagerTabProps {
  volunteersList: Volunteer[];
  newVolunteerId: string;
  setNewVolunteerId: (id: string) => void;
  isLoading: boolean;
  handleAddVolunteer: () => Promise<void>;
  handleRemoveVolunteer: (discordId: string) => Promise<void>;
}

export default function VolunteerManagerTab({
  volunteersList,
  newVolunteerId,
  setNewVolunteerId,
  isLoading,
  handleAddVolunteer,
  handleRemoveVolunteer,
}: VolunteerManagerTabProps) {
  return (
    <div className="space-y-4 text-left animate-fade-in">
      {/* Add Volunteer Form */}
      <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-theater-gold/20 bg-theater-gold/5">
        <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">ID Discord Calon Volunteer</label>
        <div className="flex gap-2">
          <input 
            type="text"
            value={newVolunteerId}
            onChange={(e) => setNewVolunteerId(e.target.value)}
            placeholder="e.g. 661135501226672129"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-theater-gold font-mono"
          />
          <button 
            onClick={handleAddVolunteer}
            disabled={isLoading}
            className="bg-theater-gold text-theater-black font-extrabold px-3 py-1.5 rounded-lg text-xs hover:bg-yellow-400 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
            title="Tambah Volunteer"
          >
            <UserPlus size={12} />
            <span>Tambah</span>
          </button>
        </div>
      </div>

      {/* Volunteer List */}
      <VolunteerList 
        volunteersList={volunteersList} 
        handleRemoveVolunteer={handleRemoveVolunteer} 
        isLoading={isLoading} 
      />
    </div>
  );
}

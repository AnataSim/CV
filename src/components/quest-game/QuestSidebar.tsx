import React from "react";
import { X, Search } from "lucide-react";

interface Quest {
  id: string;
  akt: string;
  title: string;
  description: string;
  difficulty: "Mudah" | "Sedang" | "Sulit" | "Legendaris";
  points: number;
}

interface QuestSidebarProps {
  allUsers: any[];
  dealt: boolean;
  showProgressSidebar: boolean;
  setShowProgressSidebar: (show: boolean) => void;
  activeRightTab: "members" | "completed";
  setActiveRightTab: (tab: "members" | "completed") => void;
  quests: Quest[];
  completedQuestIds: Set<string>;
  userSearchQuery: string;
  setUserSearchQuery: (query: string) => void;
  questSearchQuery: string;
  setQuestSearchQuery: (query: string) => void;
  currentUser: any;
  isUserAdmin: (role: string | null) => boolean;
  getAvatarUrl: (user: any) => string;
}

export default function QuestSidebar({
  allUsers,
  dealt,
  showProgressSidebar,
  setShowProgressSidebar,
  activeRightTab,
  setActiveRightTab,
  quests,
  completedQuestIds,
  userSearchQuery,
  setUserSearchQuery,
  questSearchQuery,
  setQuestSearchQuery,
  currentUser,
  isUserAdmin,
  getAvatarUrl
}: QuestSidebarProps) {
  if (!allUsers.length && !dealt) return null;

  return (
    <div 
      className={`absolute top-0 right-0 h-full w-[320px] bg-[#2b2d31]/95 border-l border-theater-gold/30 shadow-2xl transition-transform duration-300 z-50 flex flex-col p-5 backdrop-blur-md select-none ${
        showProgressSidebar ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
        <div className="flex items-center gap-2 text-theater-gold">
          <span className="text-sm">{activeRightTab === "members" ? "👥" : "🏆"}</span>
          <h3 className="font-display text-sm font-black uppercase tracking-wider text-[#f2f3f5]">
            {activeRightTab === "members" ? "Anggota Teater" : "Tantangan Selesai"}
          </h3>
        </div>
        <button
          onClick={() => setShowProgressSidebar(false)}
          className="text-[#949ba4] hover:text-[#dbdee1] p-1 rounded transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab Selection */}
      <div className="flex gap-2 mb-4 border-b border-neutral-800 pb-2.5 shrink-0">
        <button
          onClick={() => setActiveRightTab("members")}
          className={`flex-grow py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeRightTab === "members" ? "bg-theater-gold text-theater-black shadow-md shadow-theater-gold/10" : "bg-neutral-900 text-neutral-400 hover:text-white"
          }`}
        >
          👥 Anggota
        </button>
        <button
          onClick={() => setActiveRightTab("completed")}
          className={`flex-grow py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer relative flex items-center justify-center gap-1.5 ${
            activeRightTab === "completed" ? "bg-theater-gold text-theater-black shadow-md shadow-theater-gold/10" : "bg-neutral-900 text-neutral-400 hover:text-white"
          }`}
        >
          🏆 Selesai ({quests.filter(q => completedQuestIds.has(q.id)).length})
        </button>
      </div>

      {activeRightTab === "members" ? (
        /* AUDIENCE LIST TAB */
        <div className="flex-1 flex flex-col min-h-0 text-left font-sans">
          {/* Search input styled like Discord search */}
          <div className="relative mb-3.5 shrink-0 px-1">
            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder="Cari anggota..."
              className="w-full bg-[#1e1f22] border border-transparent focus:border-transparent focus:outline-none text-[11px] text-[#dbdee1] placeholder-[#949ba4] rounded-md pl-7.5 pr-6 py-1.5 transition-all font-sans"
            />
            {userSearchQuery && (
              <button 
                onClick={() => setUserSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#949ba4] hover:text-[#dbdee1] text-xs cursor-pointer"
              >✕</button>
            )}
          </div>

          {/* User list grouped like Discord */}
          <div className="flex-1 overflow-y-auto px-1 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-[#1a1b1e]">
            {(() => {
              const uniqueUsers = Array.from(
                new Map(
                  allUsers.map((u: any) => [u.uid || u.email || Math.random().toString(), u])
                ).values()
              );
              const filteredUsers = uniqueUsers.filter((u: any) => {
                const name = (u.name || u.displayName || u.email || "").toLowerCase();
                const role = (u.role || "").toLowerCase();
                const query = userSearchQuery.toLowerCase();
                return name.includes(query) || role.includes(query);
              });

              if (filteredUsers.length === 0) {
                return (
                  <div className="text-center text-[#949ba4] italic text-[11px] py-10 animate-fade-in">
                    {userSearchQuery ? "Tidak ada anggota yang cocok" : "Lobi teater kosong"}
                  </div>
                );
              }

              // Separate into Volunteer and Penonton
              const volunteers = filteredUsers.filter((u: any) => isUserAdmin(u.role));
              const viewers = filteredUsers.filter((u: any) => !isUserAdmin(u.role));

              const renderMemberRow = (user: any) => {
                const isMe = currentUser && (user.uid === currentUser.uid || user.email === currentUser.email);
                const isDiscordUser = user.discordId || user.uid?.includes("discord") || user.email?.includes("discord");
                const roleColorClass = isUserAdmin(user.role) ? "text-theater-gold font-bold" : "text-[#dbdee1]";

                return (
                  <div 
                    key={user.uid || user.email}
                    className="group flex items-center justify-between p-1.5 rounded-md hover:bg-[#35373c]/60 cursor-pointer transition-all duration-150"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Avatar with Status Dot */}
                      <div className="relative h-8 w-8 shrink-0">
                        <div className={`h-full w-full rounded-full overflow-hidden border bg-[#1e1f22] flex items-center justify-center ${
                          isUserAdmin(user.role) ? "border-theater-gold" : "border-neutral-900"
                        }`}>
                          <img src={getAvatarUrl(user)} alt="Avatar" className="h-full w-full object-cover" />
                        </div>
                        {/* Discord Active Status Indicator */}
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#23a55a] border-2 border-[#1e1f22] shadow-sm" />
                      </div>

                      {/* Name and Custom Status */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[12px] truncate leading-tight ${roleColorClass}`}>
                            {user.name || user.displayName || user.email?.split('@')[0] || "Anggota"}
                          </span>
                          {isMe && (
                            <span className="text-[8px] text-[#949ba4] font-medium shrink-0 leading-none bg-[#1e1f22] px-1 py-0.5 rounded">
                              Kamu
                            </span>
                          )}
                          {isDiscordUser && (
                            <span title="Login via Discord" className="shrink-0 animate-fade-in opacity-80 group-hover:opacity-100 transition-opacity">
                              <svg className="h-3 w-3 fill-current text-[#5865F2]" viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg">
                                <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.4-5c.87-.64,1.71-1.32,2.51-2a75.7,75.7,0,0,0,72.72,0c.8,0.7,1.64,1.38,2.51,2a68.43,68.43,0,0,1-10.4,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.24,124,25.43,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <span className="text-[9.5px] text-[#949ba4] truncate mt-0.5 font-medium leading-none">
                          {(user.role === "Volunteer Theater" ? "🕹️ Mengelola Teater" : user.role === "Ketua Kerupuk" ? "👑 Ketua Sekte Kerupuk" : user.role === "Ketua Keripik" ? "👑 Ketua Sekte Keripik" : "🍿 Menonton CrunchyVerse")} • CV$ {(user.cv || user.points || 0).toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* Volunteers Category */}
                  {volunteers.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[9px] font-bold text-[#949ba4] uppercase tracking-wider px-1.5 select-none mb-1 flex items-center gap-1.5">
                        <span>Volunteer Teater</span>
                        <span>—</span>
                        <span>{volunteers.length}</span>
                      </div>
                      {volunteers.map(renderMemberRow)}
                    </div>
                  )}

                  {/* Penonton Category */}
                  {viewers.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[9px] font-bold text-[#949ba4] uppercase tracking-wider px-1.5 select-none mb-1 flex items-center gap-1.5">
                        <span>Penonton Teater</span>
                        <span>—</span>
                        <span>{viewers.length}</span>
                      </div>
                      {viewers.map(renderMemberRow)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        /* COMPLETED QUESTS TAB */
        <div className="flex-1 flex flex-col min-h-0 text-left font-sans animate-fade-in">
          {/* Search input for completed quests */}
          <div className="relative mb-3.5 shrink-0 px-1">
            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text"
              value={questSearchQuery}
              onChange={(e) => setQuestSearchQuery(e.target.value)}
              placeholder="Cari tantangan selesai..."
              className="w-full bg-[#1e1f22] border border-transparent focus:border-transparent focus:outline-none text-[11px] text-[#dbdee1] placeholder-[#949ba4] rounded-md pl-7.5 pr-6 py-1.5 transition-all font-sans"
            />
            {questSearchQuery && (
              <button 
                onClick={() => setQuestSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#949ba4] hover:text-[#dbdee1] text-xs cursor-pointer"
              >✕</button>
            )}
          </div>

          {/* Completed Quests List */}
          <div className="flex-1 overflow-y-auto px-1 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-[#1a1b1e]">
            {(() => {
              const completedQuests = quests.filter(q => completedQuestIds.has(q.id));
              const filteredQuests = completedQuests.filter(q => {
                const title = (q.title || "").toLowerCase();
                const desc = (q.description || "").toLowerCase();
                const query = questSearchQuery.toLowerCase();
                return title.includes(query) || desc.includes(query);
              });

              if (filteredQuests.length === 0) {
                return (
                  <div className="text-center text-[#949ba4] italic text-[11px] py-10 animate-fade-in">
                    {questSearchQuery ? "Tidak ada tantangan yang cocok" : "Belum ada tantangan yang diselesaikan"}
                  </div>
                );
              }

              return filteredQuests.map((quest) => (
                <div 
                  key={quest.id}
                  className="border border-emerald-500/20 bg-emerald-950/20 p-3 rounded-xl flex flex-col gap-1.5 transition-all hover:bg-emerald-950/25"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[7.5px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase leading-none">{quest.akt || "Akt I"}</span>
                    <span className="text-[9px] font-mono text-theater-gold font-bold">+{quest.points} Poin</span>
                  </div>
                  <h4 className="text-xs font-bold text-[#dbdee1] leading-tight">{quest.title}</h4>
                  <p className="text-[9.5px] text-[#949ba4] font-sans leading-relaxed italic">{quest.description}</p>
                  <div className="flex items-center gap-1 text-[8px] font-extrabold text-emerald-400 uppercase mt-0.5 select-none">
                    <span>✓ Disetujui Admin</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

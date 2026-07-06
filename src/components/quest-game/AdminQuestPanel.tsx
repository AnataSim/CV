import React, { useState, useMemo } from "react";
import { Shield, Edit3, Trash2 } from "lucide-react";
import { signedFetch } from "../../lib/api";
import { isFirebaseConfigured } from "../../lib/firebase";

interface Quest {
  id: string;
  akt: string;
  difficulty: "Mudah" | "Sedang" | "Sulit" | "Legendaris";
  title: string;
  points: number;
  description: string;
  roleId?: string | null;
  roleName?: string | null;
  roleColor?: string | null;
  roleCv?: number | null;
}

interface AdminQuestPanelProps {
  onClose: () => void;
  quests: Quest[];
  allSubmissions: any[];
  allUsers: any[];
  onTriggerSync: () => void;
  backendUrl: string;
}

const isUserAdmin = (role: string | null) => {
  return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
};

// Helper to resolve avatar URL
const getAvatarUrl = (user: any) => {
  if (user.avatar) {
    if (user.avatar.startsWith("http")) return user.avatar;
    if (user.discordId) {
      return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
    }
  }
  const uidStr = String(user.uid || user.userId || "");
  if (uidStr.includes("661135501226672129")) {
    return "https://cdn.discordapp.com/avatars/661135501226672129/bd7645199e728f2edce98bdf1a7f4671.png";
  }
  const seed = encodeURIComponent(user.name || user.displayName || user.username || user.email || "visitor");
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;
};

export default function AdminQuestPanel({
  onClose,
  quests,
  allSubmissions,
  allUsers,
  onTriggerSync,
  backendUrl
}: AdminQuestPanelProps) {
  const [activeAdminTab, setActiveAdminTab] = useState<"editor" | "progress">("editor");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAkt, setNewAkt] = useState("Akt I");
  const [newDiff, setNewDiff] = useState<"Mudah" | "Sedang" | "Sulit" | "Legendaris">("Mudah");
  const [newPoints, setNewPoints] = useState(0);
  const [hasRoleReward, setHasRoleReward] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("");
  const [roleCv, setRoleCv] = useState<number | null>(null);
  const [isVerifyingRole, setIsVerifyingRole] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [expandedProgressUserId, setExpandedProgressUserId] = useState<string | null>(null);

  const pendingSubmissions = allSubmissions.filter((s: any) => s.status === "pending");

  // Verify Discord role by ID
  const handleVerifyRole = async () => {
    if (!roleId.trim()) {
      setAdminError("Masukkan Role ID Discord terlebih dahulu!");
      return;
    }
    setIsVerifyingRole(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      const response = await signedFetch(`${backendUrl}/api/discord-role/${roleId.trim()}`);
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setRoleName(data.name);
      setRoleColor(data.color);
      setRoleCv(data.cvAmount);
      setNewPoints(data.cvAmount); // Auto-override Poin Tester
      setAdminSuccess(`Role terverifikasi: "${data.name}" dengan nilai CV$ ${data.cvAmount}`);
    } catch (err: any) {
      console.warn("Verify role failed, using offline fallback:", err.message);
      if (roleId.trim() === "123" || !isFirebaseConfigured) {
        const mockName = `Sekte Kerupuk Elite (Mock)`;
        const mockColor = `#d4af37`;
        const mockCv = 150;
        setRoleName(mockName);
        setRoleColor(mockColor);
        setRoleCv(mockCv);
        setNewPoints(mockCv);
        setAdminSuccess(`[Simulasi Offline] Role terverifikasi: "${mockName}" dengan nilai CV$ ${mockCv}`);
      } else {
        setAdminError(`Gagal memverifikasi role: ${err.message}`);
      }
    } finally {
      setIsVerifyingRole(false);
    }
  };

  // Admin: Add new quest
  const handleAddQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminSuccess(null);

    if (!newTitle.trim() || !newDesc.trim()) {
      setAdminError("Judul dan objektif quest wajib diisi!");
      return;
    }

    if (hasRoleReward && (!roleId.trim() || !roleName)) {
      setAdminError("Harap masukkan dan periksa Role ID Discord terlebih dahulu jika Hadiah Role diaktifkan!");
      return;
    }

    const questData = {
      akt: newAkt.trim() || "Akt I",
      title: newTitle.trim(),
      description: newDesc.trim(),
      difficulty: newDiff,
      points: hasRoleReward ? Number(newPoints) : 0,
      roleId: hasRoleReward ? (roleId.trim() || null) : null,
      roleName: hasRoleReward ? (roleName.trim() || null) : null,
      roleColor: hasRoleReward ? (roleColor.trim() || null) : null,
      roleCv: hasRoleReward ? (roleCv || null) : null
    };

    try {
      const res = await signedFetch(`${backendUrl}/api/quests`, {
        method: "POST",
        body: JSON.stringify(questData),
        sensitive: true
      });
      if (res.ok) {
        setNewTitle("");
        setNewDesc("");
        setNewAkt("Akt I");
        setNewDiff("Mudah");
        setNewPoints(0);
        setHasRoleReward(false);
        setRoleId("");
        setRoleName("");
        setRoleColor("");
        setRoleCv(null);
        setAdminSuccess("Quest berhasil ditambahkan ke database!");
        onTriggerSync();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setAdminError(errJson.error || "Gagal menambahkan quest ke server.");
      }
    } catch (err: any) {
      setAdminError(`Gagal menghubungi server: ${err.message}`);
    }
  };

  // Admin: Delete quest
  const handleDeleteQuest = async (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus quest ini?")) {
      try {
        const res = await signedFetch(`${backendUrl}/api/quests/${id}`, {
          method: "DELETE",
          sensitive: true
        });
        if (res.ok) {
          onTriggerSync();
        } else {
          alert("Gagal menghapus quest.");
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  // Admin: Load default quests
  const handleLoadDefaultQuests = async () => {
    if (confirm("Apakah Anda yakin ingin memuat ulang 5 quest default teater ke database?")) {
      try {
        const res = await signedFetch(`${backendUrl}/api/quests/load-defaults`, {
          method: "POST",
          sensitive: true
        });
        if (res.ok) {
          setAdminSuccess("Quest default teater berhasil dimuat!");
          onTriggerSync();
        } else {
          alert("Gagal memuat quest default.");
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  // Admin: Delete all quests
  const handleDeleteAllQuests = async () => {
    if (confirm("PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA quest terdaftar di database?")) {
      try {
        const res = await signedFetch(`${backendUrl}/api/quests/delete-all`, {
          method: "POST",
          sensitive: true
        });
        if (res.ok) {
          setAdminSuccess("Semua quest terdaftar berhasil dihapus!");
          onTriggerSync();
        } else {
          alert("Gagal menghapus semua quest.");
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  // Admin: Approve submission
  const handleApproveSubmission = async (sub: any) => {
    try {
      const payload = {
        submissionId: sub.id,
        userId: sub.userId,
        discordId: sub.discordId || "",
        roleId: sub.roleId || "",
        points: sub.points || 0,
        questId: sub.questId,
        username: sub.username,
        userEmail: sub.userEmail || "",
        discordMessageId: sub.discordMessageId || ""
      };

      const response = await signedFetch(`${backendUrl}/api/submissions/approve`, {
        method: "POST",
        body: JSON.stringify(payload),
        sensitive: true
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      alert(`✅ Bukti submission berhasil disetujui!${data.roleAssigned ? ` Role "${data.roleName}" telah diberikan ke Discord.` : ""}`);
      onTriggerSync();
    } catch (err: any) {
      alert("❌ Gagal menyetujui: " + err.message);
    }
  };

  // Admin: Reject submission
  const handleRejectSubmission = async (sub: any) => {
    if (confirm("Apakah Anda yakin ingin menolak & menghapus bukti pengerjaan ini?")) {
      try {
        const payload = {
          submissionId: sub.id,
          userId: sub.userId,
          questId: sub.questId,
          discordMessageId: sub.discordMessageId || "",
          username: sub.username
        };

        const response = await signedFetch(`${backendUrl}/api/submissions/reject`, {
          method: "POST",
          body: JSON.stringify(payload),
          sensitive: true
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
        }

        alert("❌ Bukti submission berhasil ditolak dan dihapus.");
        onTriggerSync();
      } catch (err: any) {
        alert("❌ Gagal menolak: " + err.message);
      }
    }
  };

  // Group all submissions by user for Player Progress tracking
  const playersProgress = useMemo(() => {
    const groups: Record<string, {
      userId: string;
      username: string;
      userEmail: string;
      avatarUrl: string;
      submissions: any[];
      userObject?: any;
    }> = {};

    allSubmissions.forEach((sub: any) => {
      if (!sub.userId) return;
      
      if (!groups[sub.userId]) {
        const userObj = allUsers.find(u => u.uid === sub.userId);
        
        let avatarUrl = "";
        if (userObj) {
          avatarUrl = getAvatarUrl(userObj);
        } else {
          avatarUrl = getAvatarUrl({ uid: sub.userId, name: sub.username, email: sub.userEmail });
        }

        groups[sub.userId] = {
          userId: sub.userId,
          username: sub.username || userObj?.name || userObj?.displayName || "Pemain",
          userEmail: sub.userEmail || userObj?.email || "",
          avatarUrl,
          submissions: [],
          userObject: userObj
        };
      }
      
      groups[sub.userId].submissions.push(sub);
    });

    const playersWithCompletionTime = Object.values(groups).map((player: any) => {
      const activeApproved = player.submissions
        .filter((s: any) => s.status === "approved" && quests.some(q => q.id === s.questId))
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      const completionTime = activeApproved.length >= 5 ? new Date(activeApproved[4].createdAt).getTime() : Infinity;
      
      return {
        ...player,
        activeApprovedCount: activeApproved.length,
        completionTime
      };
    });

    const completersSorted = playersWithCompletionTime
      .filter(p => p.activeApprovedCount >= 5)
      .sort((a, b) => a.completionTime - b.completionTime);

    return playersWithCompletionTime.map(player => {
      let serialBadge = "";
      if (player.activeApprovedCount >= 5) {
        const rankIndex = completersSorted.findIndex(c => c.userId === player.userId);
        if (rankIndex === 0) serialBadge = "Serial #1";
        else if (rankIndex === 1) serialBadge = "Serial #2";
        else if (rankIndex === 2) serialBadge = "Serial #3";
        else serialBadge = "Last Chapter";
      }
      return {
        ...player,
        serialBadge
      };
    }).filter(player => player.activeApprovedCount > 0);
  }, [allSubmissions, allUsers, quests]);

  return (
    <div className="absolute inset-0 mx-auto my-auto w-[96%] max-w-5xl h-[88%] max-h-[680px] bg-neutral-950/95 backdrop-blur-md rounded-3xl border border-theater-gold/40 p-6 md:p-8 z-40 text-left flex flex-col gap-5 overflow-y-auto animate-fade-in shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
        <div className="flex items-center gap-2 text-theater-gold">
          <Shield size={18} />
          <h3 className="font-display text-lg font-black uppercase tracking-wider">Kabin Kreator Quest Teater</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveAdminTab("editor")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeAdminTab === "editor"
                ? "bg-theater-gold text-theater-black"
                : "bg-neutral-900 text-neutral-400 hover:text-white"
            }`}
          >
            Editor Quest
          </button>
          <button
            onClick={() => setActiveAdminTab("progress")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer relative flex items-center gap-1.5 ${
              activeAdminTab === "progress"
                ? "bg-theater-gold text-theater-black"
                : "bg-neutral-900 text-neutral-400 hover:text-white"
            }`}
          >
            <span>Progress Pemain</span>
            {pendingSubmissions.length > 0 && (
              <span className="h-5 w-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-[9px] font-black font-mono" title="Ada bukti menunggu verifikasi di Discord">
                {pendingSubmissions.length}
              </span>
            )}
          </button>
        </div>

        <button 
          onClick={onClose}
          className="text-neutral-400 hover:text-white font-bold text-xs bg-neutral-900 border border-neutral-800 hover:border-neutral-700 py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
        >
          Tutup Editor
        </button>
      </div>

      {activeAdminTab === "editor" ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Form Input */}
          <form onSubmit={handleAddQuest} className="md:col-span-5 flex flex-col gap-4 bg-neutral-900/40 p-5 rounded-2xl border border-neutral-800">
            <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-neutral-800 pb-2 flex items-center gap-1.5">
              <Edit3 size={11} className="text-theater-gold" />
              Tambah Quest Baru
            </h4>
            
            {adminError && <div className="p-2.5 rounded-lg border border-red-500/20 bg-red-950/40 text-[11px] text-red-300">⚠️ {adminError}</div>}
            {adminSuccess && <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-950/40 text-[11px] text-emerald-300">✅ {adminSuccess}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Akt Tantangan</label>
                <input
                  type="text"
                  required
                  value={newAkt}
                  onChange={(e) => setNewAkt(e.target.value)}
                  placeholder="e.g. Akt I"
                  className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-theater-gold transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Tingkat Kesulitan</label>
                <select
                  value={newDiff}
                  onChange={(e) => setNewDiff(e.target.value as "Mudah" | "Sedang" | "Sulit" | "Legendaris")}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-theater-gold transition-all cursor-pointer"
                >
                  <option value="Mudah">🟢 Mudah</option>
                  <option value="Sedang">🟡 Sedang</option>
                  <option value="Sulit">🔴 Sulit</option>
                  <option value="Legendaris">🔮 Legendaris</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Judul</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Nyanyi di Voice Channel"
                className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-theater-gold transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Objektif</label>
              <textarea
                required
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Jelaskan apa yang harus dilakukan pemain untuk menyelesaikan quest ini..."
                rows={3}
                className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-theater-gold transition-all resize-none font-sans"
              />
            </div>

            {/* Discord Role Reward Switch */}
            <div className="flex items-center justify-between border border-neutral-800/80 bg-neutral-950/40 rounded-xl p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black text-theater-gold uppercase tracking-widest">Hadiah Role Discord</span>
                <span className="text-[8px] text-neutral-500">Berikan role khusus saat quest ini selesai</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hasRoleReward}
                  onChange={(e) => {
                    setHasRoleReward(e.target.checked);
                    if (!e.target.checked) {
                      setRoleId("");
                      setRoleName("");
                      setRoleColor("");
                      setRoleCv(null);
                      setNewPoints(0);
                    }
                  }}
                  className="sr-only peer" 
                />
                <div className="w-8 h-4 bg-neutral-800 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-theater-gold peer-checked:after:bg-black peer-checked:after:border-black"></div>
              </label>
            </div>

            {/* Discord Role Reward Configuration */}
            {hasRoleReward && (
              <div className="border border-neutral-800/80 bg-neutral-950/40 rounded-xl p-3 flex flex-col gap-3">
                <span className="text-[9px] font-black text-theater-gold uppercase tracking-widest">Konfigurasi Hadiah Role</span>
                
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-[8px] font-bold text-neutral-500 uppercase tracking-widest">Role ID Discord</label>
                    <input
                      type="text"
                      value={roleId}
                      onChange={(e) => setRoleId(e.target.value)}
                      placeholder="e.g. 1511318299730903170"
                      className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-theater-gold transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyRole}
                    disabled={isVerifyingRole}
                    className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[9px] tracking-widest uppercase px-3 rounded-xl transition-all cursor-pointer shrink-0 self-end h-[36px]"
                  >
                    {isVerifyingRole ? "Memeriksa..." : "Periksa Role"}
                  </button>
                </div>

                {roleName && (
                  <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800/80 p-2 rounded-xl text-[10px] text-white">
                    <span className="w-2.5 h-2.5 rounded-full border border-current shrink-0" style={{ backgroundColor: roleColor || '#d4af37' }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{roleName}</div>
                      {roleCv !== null && <div className="text-[8px] text-neutral-500 font-mono">Parsed: CV$ {roleCv} (Nilai Poin Diatur Otomatis)</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Poin CV Field */}
            {(!hasRoleReward || (hasRoleReward && roleName)) && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Poin CV</label>
                <input
                  type="number"
                  disabled
                  value={newPoints}
                  className="bg-neutral-950/60 border border-neutral-800 text-neutral-500 rounded-xl px-3 py-2.5 text-xs focus:outline-none cursor-not-allowed"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-theater-gold to-theater-gold-dim hover:from-theater-gold-dim hover:to-theater-gold border border-yellow-300 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-theater-black shadow-lg shadow-theater-gold/10 transition-all cursor-pointer hover:scale-102 mt-2"
            >
              Simpan Quest Ke Database
            </button>
          </form>

          {/* Quest List */}
          <div className="md:col-span-7 flex flex-col gap-4">
            <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-900 pb-2 flex items-center justify-between">
              <span>Daftar Quest Terdaftar ({quests.length})</span>
              <span className="text-[9px] text-neutral-500 font-mono tracking-tighter">
                {isFirebaseConfigured ? "Sync: Firestore Active" : "Sync: Local Storage Sim"}
              </span>
            </h4>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLoadDefaultQuests}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/80 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[9px] tracking-widest uppercase py-2 px-3 rounded-xl transition-all cursor-pointer flex-1 text-center"
              >
                Muat Quest Default
              </button>
              <button
                type="button"
                onClick={handleDeleteAllQuests}
                className="bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/40 hover:border-rose-500 text-rose-300 font-bold text-[9px] tracking-widest uppercase py-2 px-3 rounded-xl transition-all cursor-pointer flex-1 text-center"
              >
                Hapus Semua Quest
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto max-h-[360px] pr-1 scrollbar-thin scrollbar-thumb-neutral-800">
              {quests.map((q) => (
                <div 
                  key={q.id}
                  className="flex items-center justify-between gap-4 border border-neutral-900/80 bg-neutral-950/60 p-3 px-4 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-neutral-500 font-mono font-bold tracking-tight bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">{q.akt || "Akt I"}</span>
                      <span className={`text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                        q.difficulty === "Mudah" ? "border-emerald-500/20 bg-emerald-950/40 text-emerald-400" :
                        q.difficulty === "Sedang" ? "border-amber-500/20 bg-amber-950/40 text-amber-400" :
                        q.difficulty === "Sulit" ? "border-rose-500/20 bg-rose-950/40 text-rose-400" :
                        "border-fuchsia-500/20 bg-fuchsia-950/40 text-fuchsia-400 animate-pulse"
                      }`}>
                        {q.difficulty}
                      </span>
                      <span className="text-xs font-bold text-white truncate">{q.title}</span>
                      <span className="text-[10px] text-theater-gold font-mono">+{q.points} Poin</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 truncate mt-1 font-sans">{q.description}</p>
                  </div>
                  <button 
                    onClick={() => handleDeleteQuest(q.id)}
                    className="text-neutral-500 hover:text-theater-red-light p-1.5 rounded-lg hover:bg-neutral-900/80 transition-all cursor-pointer shrink-0 border border-transparent hover:border-neutral-800"
                    title="Hapus Quest"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {quests.length === 0 && (
                <div className="text-center py-10 italic text-xs text-neutral-500">Belum ada quest terdaftar. Silakan tambahkan!</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* PLAYER PROGRESS DASHBOARD */
        <div className="flex-grow flex flex-col gap-4 overflow-y-auto min-h-0 font-sans">
          <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
            <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest">
              Progress Pengerjaan Pemain ({playersProgress.length})
            </h4>
            <span className="text-[10px] text-neutral-500 italic">
              Hanya menampilkan pemain yang telah menyelesaikan minimal 1 quest.
            </span>
          </div>

          <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[460px] pr-1.5 scrollbar-thin scrollbar-thumb-neutral-800">
            {playersProgress.map((player) => {
              const approvedCount = player.submissions.filter((s: any) => s.status === "approved" && quests.some((q: any) => q.id === s.questId)).length;
              const totalQuests = quests.length;
              const progressPercent = totalQuests > 0 ? (approvedCount / totalQuests) * 100 : 0;
              const isExpanded = expandedProgressUserId === player.userId;

              return (
                <div 
                  key={player.userId}
                  className="border border-neutral-900 hover:border-theater-gold/15 bg-neutral-950/30 rounded-2xl transition-all duration-300"
                >
                  {/* Collapsible Header */}
                  <div 
                    onClick={() => setExpandedProgressUserId(isExpanded ? null : player.userId)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full overflow-hidden border border-neutral-800 bg-neutral-900 shrink-0">
                        <img src={player.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white leading-tight">
                            {player.username}
                          </span>
                          {player.serialBadge && (
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border leading-none shrink-0 ${
                              player.serialBadge === "Serial #1" ? "border-amber-400 bg-amber-950/60 text-amber-300 animate-pulse shadow-sm shadow-amber-400/20" :
                              player.serialBadge === "Serial #2" ? "border-slate-300 bg-slate-900/60 text-slate-200 shadow-sm" :
                              player.serialBadge === "Serial #3" ? "border-amber-700 bg-amber-950/60 text-amber-600" :
                              "border-purple-500/30 bg-purple-950/40 text-purple-400"
                            }`}>
                              🏆 {player.serialBadge}
                            </span>
                          )}
                          {player.userObject?.role && (
                            <span className="text-[8px] bg-neutral-900 border border-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded uppercase font-semibold">
                              {player.userObject.role === "Volunteer Theater" ? "🎭 Volunteer" : 
                               player.userObject.role === "Ketua Kerupuk" ? "👑 Ketua Kerupuk" : 
                               player.userObject.role === "Ketua Keripik" ? "👑 Ketua Keripik" : "🍿 Penonton"}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-neutral-500 mt-1 truncate">
                          {player.userEmail || "Tamu Teater"} • ID: {player.userId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4.5 shrink-0 self-end sm:self-center">
                      {/* Progress Bar & Text */}
                      <div className="flex flex-col items-end gap-1.5 font-mono">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-theater-gold font-black">
                            {approvedCount}/{totalQuests} Selesai
                          </span>
                          {approvedCount > 0 && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Apakah Anda yakin ingin mereset SELURUH progress quest milik ${player.username}? Semua kartu akan dibagikan ulang.`)) {
                                  try {
                                    const res = await signedFetch(`${backendUrl}/api/submissions/reset-all`, {
                                      method: "POST",
                                      body: JSON.stringify({ userId: player.userId }),
                                      sensitive: true
                                    });
                                    if (res.ok) {
                                      onTriggerSync();
                                    }
                                  } catch (err) {
                                    console.error("Gagal mereset progress pemain:", err);
                                  }
                                }
                              }}
                              className="text-neutral-500 hover:text-theater-red-light font-black text-[8px] uppercase tracking-widest px-1.5 py-0.5 bg-neutral-900 border border-neutral-800 transition-colors cursor-pointer rounded"
                              title="Reset Semua Progress Pemain Ini"
                            >
                              Reset Progress
                            </button>
                          )}
                          <span className="text-[8px] text-neutral-400 font-bold bg-neutral-950/80 px-1.5 py-0.5 rounded border border-neutral-900">
                            {progressPercent.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-24 h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-950">
                          <div 
                            className="h-full bg-gradient-to-r from-theater-gold-dim to-theater-gold transition-all duration-500 rounded-full" 
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Chevron Indicator */}
                      <span className={`text-neutral-500 text-xs transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Expanded Quest Detail Checklist */}
                  {isExpanded && (
                    <div className="px-4 pb-5 pt-1 border-t border-neutral-900/60 bg-neutral-950/20 rounded-b-2xl flex flex-col gap-3">
                      <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-1">
                        Checklist Quest ({totalQuests})
                      </span>
                      
                      <div className="grid grid-cols-1 gap-2.5">
                        {quests.map((quest) => {
                          const questSubmissions = player.submissions.filter((s: any) => s.questId === quest.id);
                          const approvedSub = questSubmissions.find((s: any) => s.status === "approved");
                          const pendingSub = questSubmissions.find((s: any) => s.status === "pending");
                          
                          let status: "Completed" | "Pending" | "NotStarted" = "NotStarted";
                          
                          if (approvedSub) {
                            status = "Completed";
                          } else if (pendingSub) {
                            status = "Pending";
                          }

                          return (
                            <div 
                              key={quest.id}
                              className={`border p-3.5 rounded-xl flex flex-col sm:flex-row gap-3.5 justify-between items-start sm:items-center transition-all ${
                                status === "Completed" ? "border-emerald-500/15 bg-emerald-950/5 hover:bg-emerald-950/10" :
                                status === "Pending" ? "border-amber-500/15 bg-amber-950/5 hover:bg-amber-950/10" :
                                "border-neutral-900 bg-neutral-950/10 opacity-60 hover:opacity-80"
                              }`}
                            >
                              <div className="flex-1 flex gap-3.5 items-start min-w-0">
                                {/* Status Circle / Check */}
                                <div className={`h-5 w-5 rounded-full shrink-0 flex items-center justify-center border text-[9px] mt-0.5 font-bold ${
                                  status === "Completed" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
                                  status === "Pending" ? "border-amber-500 bg-amber-500/20 text-amber-400 animate-pulse" :
                                  "border-neutral-700 bg-neutral-900 text-neutral-500"
                                }`}>
                                  {status === "Completed" ? "✓" : status === "Pending" ? "⏳" : ""}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-white font-bold leading-tight truncate">{quest.title}</span>
                                    <span className="text-[8px] text-theater-gold font-mono">+{quest.points} Poin</span>
                                  </div>
                                  <span className="text-[9px] text-neutral-400 leading-normal font-sans mt-0.5 truncate">{quest.description}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 mt-2 sm:mt-0 select-none shrink-0 self-end sm:self-center">
                                {/* Pending review action buttons */}
                                {status === "Pending" && pendingSub && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {pendingSub.mediaUrl && (
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          let url = pendingSub.mediaUrl;
                                          if (url && !url.startsWith("http") && !url.startsWith("data:")) {
                                            url = `${backendUrl}${url}`;
                                          }
                                          // Trigger parent callback to show preview image/video
                                          alert(`Bukti media: ${url}`);
                                        }}
                                        className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-theater-gold font-bold text-[8.5px] uppercase tracking-wider py-1 px-2.5 rounded-lg transition-colors cursor-pointer"
                                      >
                                        Lihat Bukti
                                      </button>
                                    )}
                                    <button 
                                      type="button"
                                      onClick={() => handleRejectSubmission(pendingSub)}
                                      className="bg-rose-950/60 hover:bg-rose-900 border border-rose-900/40 text-rose-300 font-bold text-[8.5px] uppercase tracking-wider py-1 px-2.5 rounded-lg transition-colors cursor-pointer"
                                    >
                                      Tolak
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => handleApproveSubmission(pendingSub)}
                                      className="bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-900/40 text-emerald-300 font-bold text-[8.5px] uppercase tracking-wider py-1 px-2.5 rounded-lg transition-colors cursor-pointer"
                                    >
                                      Setujui
                                    </button>
                                  </div>
                                )}
                                
                                <span className={`text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  status === "Completed" ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20" :
                                  status === "Pending" ? "bg-amber-950/40 text-amber-400 border border-amber-500/20" :
                                  "bg-neutral-900 text-neutral-500 border border-neutral-800"
                                }`}>
                                  {status === "Completed" ? "Selesai" : status === "Pending" ? "Pending Review" : "Belum Selesai"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {playersProgress.length === 0 && (
              <div className="text-center py-14 italic text-xs text-neutral-500 bg-neutral-950/20 border border-dashed border-neutral-850 rounded-2xl">
                Belum ada pemain dengan quest yang disetujui (Approved).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

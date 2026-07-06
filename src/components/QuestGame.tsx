"use client";

import React, { useState, useEffect } from "react";
import { Play, Shield, Sparkle, X } from "lucide-react";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { signedFetch } from "../lib/api";

import SkyBackground from "./quest-game/SkyBackground";
import AdminQuestPanel from "./quest-game/AdminQuestPanel";
import CardHand from "./quest-game/CardHand";
import QuestSidebar from "./quest-game/QuestSidebar";

interface Quest {
  id: string;
  originalQuestId?: string;
  akt: string;
  title: string;
  description: string;
  difficulty: "Mudah" | "Sedang" | "Sulit" | "Legendaris";
  points: number;
  roleId?: string;
  roleName?: string;
  roleCv?: number;
  roleColor?: string;
}

const DEFAULT_QUESTS: Quest[] = [
  {
    id: "default-1",
    akt: "Akt I",
    title: "Tebak Member Anomaly",
    description: "Sebutkan nama member Anomaly terpopuler malam ini di voice channel utama beserta alasannya!",
    difficulty: "Mudah",
    points: 10
  },
  {
    id: "default-2",
    akt: "Akt I",
    title: "Sekte Kerupuk vs Keripik",
    description: "Bujuk 2 member offline untuk online dan memilih kubu garing di channel #roles!",
    difficulty: "Sedang",
    points: 25
  },
  {
    id: "default-3",
    akt: "Akt II",
    title: "Karaoke 1 Menit",
    description: "Nyanyikan sepenggal lagu favoritmu di Voice Channel selama minimal 1 menit!",
    difficulty: "Sedang",
    points: 30
  },
  {
    id: "default-4",
    akt: "Akt II",
    title: "Kolektor Kerupuk Teater",
    description: "Kumpulkan 100 poin kerupuk dalam game panggung utama dalam waktu 5 menit!",
    difficulty: "Sulit",
    points: 50
  },
  {
    id: "default-5",
    akt: "Akt III",
    title: "Misteri Admin Bahagia",
    description: "Cari tahu alasan kenapa admin utama CrunchyVerse sedang bahagia malam ini!",
    difficulty: "Legendaris",
    points: 100
  }
];

interface QuestGameProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentUser: any;
  displayName: string;
  userRole: string | null;
  onScrollToLobby?: () => void;
  backendUrl?: string;
  syncData?: {
    userCv: number;
    dealtQuests: Quest[];
    dealt: boolean;
    cardStatuses: Record<string, "active" | "pending" | "Completed" | "Denied">;
    allSubmissions: any[];
  };
  onTriggerSync?: () => void;
}

const isUserAdmin = (role: string | null) => {
  return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
};

export default function QuestGame({
  currentUser,
  displayName,
  userRole,
  onScrollToLobby,
  backendUrl,
  syncData,
  onTriggerSync
}: QuestGameProps) {
  const BACKEND_URL = backendUrl || (typeof window !== "undefined" ? localStorage.getItem("crunchy_backend_url") : null) || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";
  
  const [gameState, setGameState] = useState<"menu" | "playing">("menu");
  const [timeMode, setTimeMode] = useState<"auto" | "morning" | "sunset" | "night">("auto");
  const [currentHour, setCurrentHour] = useState<number>(() => {
    const hourStr = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false
    }).format(new Date());
    return parseInt(hourStr, 10) || 12;
  });
  
  // Realtime clock state
  const [timeString, setTimeString] = useState<string>("00:00:00");
  const [userCv, setUserCv] = useState<number>(0);
  const [hasMounted, setHasMounted] = useState(false);
  const [showProgressSidebar, setShowProgressSidebar] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"members" | "completed">("members");
  const [questSearchQuery, setQuestSearchQuery] = useState("");

  // Users database tracking for right sidebar
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const [quests, setQuests] = useState<Quest[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("crunchy_quests");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return DEFAULT_QUESTS;
        }
      }
    }
    return DEFAULT_QUESTS;
  });

  const [dealtQuests, setDealtQuests] = useState<Quest[]>(() => {
    if (syncData?.dealtQuests && syncData.dealtQuests.length > 0) {
      return syncData.dealtQuests;
    }
    if (typeof window !== "undefined") {
      const lastUid = currentUser?.uid || localStorage.getItem("crunchy_last_uid");
      if (lastUid) {
        const key = `crunchyverse_user_deck_${lastUid}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            return JSON.parse(stored).cards || [];
          } catch (e) {}
        }
      }
    }
    return [];
  });

  const [dealt, setDealt] = useState<boolean>(() => {
    if (syncData?.dealt) return syncData.dealt;
    if (typeof window !== "undefined") {
      const lastUid = currentUser?.uid || localStorage.getItem("crunchy_last_uid");
      if (lastUid) {
        const key = `crunchyverse_user_deck_${lastUid}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            return JSON.parse(stored).dealt || false;
          } catch (e) {}
        }
      }
    }
    return false;
  });

  const [cardFlipped, setCardFlipped] = useState<Record<string, boolean>>(() => {
    let localFlips: Record<string, boolean> = {};
    const uid = currentUser?.uid || (typeof window !== "undefined" ? localStorage.getItem("crunchy_last_uid") : null);
    if (uid) {
      const localFlipsKey = `crunchyverse_card_flips_${uid}`;
      if (typeof window !== "undefined") {
        const localFlipsRaw = localStorage.getItem(localFlipsKey);
        if (localFlipsRaw) {
          try {
            localFlips = JSON.parse(localFlipsRaw);
          } catch (e) {}
        }
      }
    }
    const finalCards = syncData?.dealtQuests || [];
    const finalStatuses = syncData?.cardStatuses || {};
    if (finalCards.length > 0) {
      finalCards.forEach((q: Quest) => {
        if (finalStatuses[q.id] && finalStatuses[q.id] !== "active") {
          localFlips[q.id] = true;
        }
      });
    }
    return localFlips;
  });

  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);
  const [cardStatuses, setCardStatuses] = useState<Record<string, "active" | "pending" | "Completed" | "Denied">>(() => {
    if (syncData?.cardStatuses && Object.keys(syncData.cardStatuses).length > 0) {
      return syncData.cardStatuses;
    }
    if (typeof window !== "undefined") {
      const lastUid = currentUser?.uid || localStorage.getItem("crunchy_last_uid");
      if (lastUid) {
        const key = `crunchyverse_user_deck_${lastUid}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            return JSON.parse(stored).statuses || {};
          } catch (e) {}
        }
      }
    }
    return {};
  });

  // Admin form state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);

  // Media upload states
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDealing, setIsDealing] = useState(false);

  // Check if current user has admin rights
  const isAdmin = isUserAdmin(userRole);

  // Hydration safety mount
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Subscribe to all users in database
  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const q = collection(db, "users");
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const usersList: any[] = [];
        snapshot.forEach((doc) => {
          usersList.push(doc.data());
        });
        setAllUsers(usersList);
      }, (err) => {
        console.warn("⚠️ Gagal sinkronisasi daftar user dari Firestore:", err);
      });
      return () => unsubscribe();
    } else {
      const loadLocalUsers = () => {
        const stored = localStorage.getItem("crunchy_users");
        if (stored) {
          try {
            setAllUsers(JSON.parse(stored));
          } catch (e) {
            console.error("Gagal parse crunchy_users:", e);
          }
        }
      };

      loadLocalUsers();
      window.addEventListener("storage", loadLocalUsers);
      const interval = setInterval(loadLocalUsers, 3000);
      return () => {
        window.removeEventListener("storage", loadLocalUsers);
        clearInterval(interval);
      };
    }
  }, []);

  // Update GMT+7 clock
  useEffect(() => {
    const updateTime = () => {
      const date = new Date();
      const timeStr = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(date);
      setTimeString(timeStr);

      if (timeMode === "auto") {
        const hourStr = new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          hour12: false
        }).format(date);
        setCurrentHour(parseInt(hourStr, 10) || 12);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timeMode]);

  const fetchCv = async () => {
    if (!currentUser?.uid) return;
    try {
      const res = await signedFetch(`${BACKEND_URL}/api/users/${currentUser.uid}`);
      if (res.ok) {
        const data = await res.json();
        setUserCv(data.cv || data.points || 0);
      }
    } catch (err) {
      console.warn("⚠️ Failed to sync user CV points from backend API:", err);
    }
  };

  const fetchDeckFromApi = async () => {
    if (!currentUser?.uid) return;
    try {
      const res = await signedFetch(`${BACKEND_URL}/api/decks/${currentUser.uid}`);
      if (res.ok) {
        const data = await res.json();
        setDealtQuests(data.cards || []);
        setDealt(data.dealt || false);
        const statuses = data.statuses || {};
        setCardStatuses(statuses);

        const key = `crunchyverse_user_deck_${currentUser.uid}`;
        localStorage.setItem(key, JSON.stringify(data));
        
        const localFlipsKey = `crunchyverse_card_flips_${currentUser.uid}`;
        const localFlipsRaw = localStorage.getItem(localFlipsKey);
        let localFlips: Record<string, boolean> = {};
        if (localFlipsRaw) {
          try {
            localFlips = JSON.parse(localFlipsRaw);
          } catch (e) {}
        }

        setCardFlipped(prev => {
          const nextFlips = { ...localFlips, ...prev };
          (data.cards || []).forEach((q: Quest) => {
            if (statuses[q.id] && statuses[q.id] !== "active") {
              nextFlips[q.id] = true;
            }
          });
          return nextFlips;
        });
      }
    } catch (apiErr) {
      const key = `crunchyverse_user_deck_${currentUser.uid}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          setDealtQuests(data.cards || []);
          setDealt(data.dealt || false);
          setCardStatuses(data.statuses || {});
        } catch (e) {}
      }
    }
  };

  const fetchSubmissionsFromApi = async () => {
    if (!isAdmin) return;
    try {
      const res = await signedFetch(`${BACKEND_URL}/api/submissions`);
      if (res.ok) {
        const list = await res.json();
        setAllSubmissions(list);
        localStorage.setItem("crunchy_all_submissions", JSON.stringify(list));
      }
    } catch (apiErr) {
      const stored = localStorage.getItem("crunchy_all_submissions");
      if (stored) {
        try {
          setAllSubmissions(JSON.parse(stored));
        } catch (e) {}
      }
    }
  };

  const fetchQuestsFromApi = async () => {
    try {
      const res = await signedFetch(`${BACKEND_URL}/api/quests`);
      if (res.ok) {
        const list = await res.json();
        setQuests(list);
        localStorage.setItem("crunchy_quests", JSON.stringify(list));
      }
    } catch (apiErr) {
      const stored = localStorage.getItem("crunchy_quests");
      if (stored) {
        try {
          setQuests(JSON.parse(stored));
        } catch (e) {}
      }
    }
  };

  // Sync state with parent props
  useEffect(() => {
    if (syncData) {
      setUserCv(syncData.userCv);
      setDealtQuests(syncData.dealtQuests);
      setDealt(syncData.dealt);
      setCardStatuses(syncData.cardStatuses);
      setAllSubmissions(syncData.allSubmissions);

      if (currentUser?.uid) {
        const key = `crunchyverse_user_deck_${currentUser.uid}`;
        localStorage.setItem(key, JSON.stringify({
          uid: currentUser.uid,
          dealt: syncData.dealt,
          cards: syncData.dealtQuests,
          statuses: syncData.cardStatuses
        }));
      }

      let localFlips: Record<string, boolean> = {};
      if (currentUser?.uid) {
        const localFlipsKey = `crunchyverse_card_flips_${currentUser.uid}`;
        const localFlipsRaw = localStorage.getItem(localFlipsKey);
        if (localFlipsRaw) {
          try {
            localFlips = JSON.parse(localFlipsRaw);
          } catch (e) {}
        }
      }

      setCardFlipped(prev => {
        const nextFlips = { ...localFlips, ...prev };
        (syncData.dealtQuests || []).forEach((q: Quest) => {
          if (syncData.cardStatuses[q.id] && syncData.cardStatuses[q.id] !== "active") {
            nextFlips[q.id] = true;
          }
        });
        return nextFlips;
      });
    }
  }, [syncData, currentUser]);

  useEffect(() => {
    if (!currentUser?.uid || syncData) return;
    fetchCv();
    const interval = setInterval(fetchCv, 15000);
    return () => clearInterval(interval);
  }, [currentUser, syncData]);

  useEffect(() => {
    if (!currentUser?.uid || syncData) return;

    const localFlipsKey = `crunchyverse_card_flips_${currentUser.uid}`;
    const localFlipsRaw = localStorage.getItem(localFlipsKey);
    if (localFlipsRaw) {
      try {
        setCardFlipped(JSON.parse(localFlipsRaw));
      } catch (e) {}
    }

    fetchDeckFromApi();
    const interval = setInterval(fetchDeckFromApi, 10000);
    return () => clearInterval(interval);
  }, [currentUser, syncData]);

  useEffect(() => {
    if (!isAdmin || syncData) return;
    fetchSubmissionsFromApi();
    const interval = setInterval(fetchSubmissionsFromApi, 15000);
    return () => clearInterval(interval);
  }, [isAdmin, syncData]);

  useEffect(() => {
    fetchQuestsFromApi();
    const interval = setInterval(fetchQuestsFromApi, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeQuestId && cardStatuses[activeQuestId] === "Completed") {
      setActiveQuestId(null);
    }
  }, [cardStatuses, activeQuestId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setMediaFile(e.target.files[0]);
      setUploadStatus(null);
    }
  };

  const handleSubmitMedia = async (quest: Quest) => {
    if (!mediaFile) {
      setUploadStatus("⚠️ Pilih file gambar/video bukti terlebih dahulu!");
      return;
    }

    setIsUploading(true);
    setUploadStatus("⏳ Mengompresi & mengirim bukti ke Discord...");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(mediaFile);
      
      reader.onload = async () => {
        const base64Data = reader.result as string;
        
        const payload = {
          questId: quest.id,
          userId: currentUser?.uid || `sim-user-${Date.now()}`,
          username: displayName || currentUser?.displayName || currentUser?.name || currentUser?.email || "Pemain Teater",
          userEmail: currentUser?.email || "",
          fileName: mediaFile.name,
          mediaData: base64Data
        };

        try {
          const response = await signedFetch(`${BACKEND_URL}/api/submissions/submit`, {
            method: "POST",
            sensitive: true,
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
          }

          setUploadStatus("✅ Bukti berhasil dikirim! Poin akan ditambahkan setelah disetujui admin.");
          setIsUploading(false);
          setMediaFile(null);
          
          if (onTriggerSync) onTriggerSync();
          else fetchDeckFromApi();
          
          setTimeout(() => {
            setActiveQuestId(null);
            setUploadStatus(null);
          }, 1500);

        } catch (fetchErr: any) {
          console.error("❌ Gagal submit media ke server:", fetchErr);
          setUploadStatus(`❌ Gagal mengirim: ${fetchErr.message}`);
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        setUploadStatus("❌ Gagal membaca file.");
        setIsUploading(false);
      };

    } catch (err: any) {
      console.error("❌ Gagal submit media:", err);
      setUploadStatus(`❌ Error: ${err.message}`);
      setIsUploading(false);
    }
  };

  const handleDealCards = async () => {
    if (quests.length === 0 || !currentUser?.uid || isDealing) return;
    setIsDealing(true);
    try {
      const easyQuests = quests.filter(q => q.difficulty === "Mudah");
      const mediumQuests = quests.filter(q => q.difficulty === "Sedang");
      const hardQuests = quests.filter(q => q.difficulty === "Sulit");
      const legendaryQuests = quests.filter(q => q.difficulty === "Legendaris");

      const completedQuestIds = new Set(
        allSubmissions
          .filter((s: any) => s.userId === currentUser.uid && s.status === "approved")
          .map((s: any) => s.questId)
      );
      const completedCount = completedQuestIds.size;
      const isFirstTime = completedCount === 0;

      const retainedCards = dealt ? dealtQuests.filter(q => cardStatuses[q.id] === "active" || cardStatuses[q.id] === "pending") : [];
      const selected: Quest[] = [...retainedCards];
      const selectedIds = new Set<string>(retainedCards.map(c => c.id));
      const pool = quests.filter(q => !completedQuestIds.has(q.id) && !selectedIds.has(q.id));
      const cardsToDraw = 5 - retainedCards.length;

      if (pool.length + retainedCards.length <= 5) {
        pool.forEach(q => {
          if (!selectedIds.has(q.id)) {
            selected.push(q);
            selectedIds.add(q.id);
          }
        });
      } else if (cardsToDraw > 0) {
        for (let i = 0; i < cardsToDraw; i++) {
          const rand = Math.random() * 100;
          let targetDifficulty: "Mudah" | "Sedang" | "Sulit" | "Legendaris" = "Mudah";

          if (isFirstTime) {
            if (rand < 50) targetDifficulty = "Mudah";
            else if (rand < 90) targetDifficulty = "Sedang";
            else if (rand < 99) targetDifficulty = "Sulit";
            else targetDifficulty = "Legendaris";
          } else {
            if (rand < 20) targetDifficulty = "Mudah";
            else if (rand < 70) targetDifficulty = "Sedang";
            else if (rand < 95) targetDifficulty = "Sulit";
            else targetDifficulty = "Legendaris";
          }

          let diffPool: Quest[] = [];
          if (targetDifficulty === "Mudah") diffPool = easyQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));
          else if (targetDifficulty === "Sedang") diffPool = mediumQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));
          else if (targetDifficulty === "Sulit") diffPool = hardQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));
          else if (targetDifficulty === "Legendaris") diffPool = legendaryQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));

          if (diffPool.length === 0) {
            const availableQuests = pool.filter(q => !selectedIds.has(q.id));
            if (availableQuests.length > 0) {
              const chosen = availableQuests[Math.floor(Math.random() * availableQuests.length)];
              selected.push(chosen);
              selectedIds.add(chosen.id);
            }
          } else {
            const chosen = diffPool[Math.floor(Math.random() * diffPool.length)];
            selected.push(chosen);
            selectedIds.add(chosen.id);
          }
        }
      }

      const randomId = Math.random().toString(36).substring(2, 10);
      const finalSelected = selected.map((q, idx) => {
        if (q.id && q.id.startsWith("quest-")) {
          return q;
        }
        return {
          ...q,
          originalQuestId: (q as any).originalQuestId || q.id,
          id: `quest-${currentUser.uid}.${randomId}_${idx}`
        };
      });

      const initialStatuses: Record<string, "active" | "pending" | "Completed" | "Denied"> = {};
      finalSelected.forEach(q => {
        initialStatuses[q.id] = cardStatuses[q.id] || "active";
      });

      const deckData = {
        uid: currentUser.uid,
        dealt: true,
        cards: finalSelected,
        statuses: initialStatuses
      };

      let apiSuccess = false;
      try {
        const res = await signedFetch(`${BACKEND_URL}/api/decks/deal`, {
          method: "POST",
          body: JSON.stringify({
            uid: currentUser.uid,
            cards: finalSelected,
            statuses: initialStatuses
          }),
          sensitive: true
        });
        if (res.ok) apiSuccess = true;
      } catch (err: any) {
        console.warn("⚠️ Gagal menyimpan deck ke Bot API:", err.message);
      }

      let firestoreSuccess = apiSuccess;
      if (!apiSuccess && !firestoreSuccess) {
        localStorage.setItem(`crunchyverse_user_deck_${currentUser.uid}`, JSON.stringify(deckData));
      }
      
      setDealtQuests(finalSelected);
      const flips: Record<string, boolean> = {};
      finalSelected.forEach(q => {
        flips[q.id] = cardFlipped[q.id] || false;
      });
      setCardFlipped(flips);
      if (currentUser?.uid) {
        const localFlipsKey = `crunchyverse_card_flips_${currentUser.uid}`;
        localStorage.setItem(localFlipsKey, JSON.stringify(flips));
      }
      setActiveQuestId(null);
      setDealt(true);
      if (onTriggerSync) onTriggerSync();
      else fetchDeckFromApi();
    } finally {
      setIsDealing(false);
    }
  };

  const handleCardClick = (questId: string) => {
    if (activeQuestId === questId) {
      setActiveQuestId(null);
    } else {
      setActiveQuestId(questId);
      setCardFlipped(prev => {
        const nextFlips = { ...prev, [questId]: true };
        if (currentUser?.uid) {
          const localFlipsKey = `crunchyverse_card_flips_${currentUser.uid}`;
          localStorage.setItem(localFlipsKey, JSON.stringify(nextFlips));
        }
        return nextFlips;
      });
    }
  };

  const getEffectiveHour = () => {
    if (timeMode === "morning") return 10;
    if (timeMode === "sunset") return 17;
    if (timeMode === "night") return 21;
    return currentHour;
  };

  const effectiveHour = getEffectiveHour();
  const isMorning = effectiveHour >= 6 && effectiveHour < 16;
  const isSunset = effectiveHour >= 16 && effectiveHour < 19;

  const getSkyClass = () => {
    if (isMorning) return "from-sky-400 via-blue-500 to-indigo-600";
    if (isSunset) return "from-[#ea580c] via-[#dc2626] to-[#581c87]";
    return "from-[#020617] via-[#0f172a] to-[#1e293b]";
  };
  
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

  const completedQuestIds = React.useMemo(() => {
    if (!currentUser?.uid) return new Set<string>();
    return new Set<string>(
      allSubmissions
        .filter((s: any) => s.userId === currentUser.uid && s.status === "approved")
        .map((s: any) => s.questId)
    );
  }, [allSubmissions, currentUser]);

  if (!hasMounted) return null;

  return (
    <div className={`flex-grow flex flex-col items-center justify-between text-center select-none relative overflow-hidden bg-gradient-to-b ${getSkyClass()} transition-all duration-[1500ms] ease-in-out`}>
      
      <SkyBackground isMorning={isMorning} isSunset={isSunset} />

      {/* 2. ADMIN CONTROL OVERLAY PANEL */}
      {isAdmin && showAdminPanel && (
        <AdminQuestPanel
          onClose={() => setShowAdminPanel(false)}
          quests={quests}
          allSubmissions={allSubmissions}
          allUsers={allUsers}
          onTriggerSync={() => {
            fetchQuestsFromApi();
            fetchSubmissionsFromApi();
            if (onTriggerSync) onTriggerSync();
          }}
          backendUrl={BACKEND_URL}
        />
      )}

      {/* 3. SIDEBAR TOGGLE BUTTONS */}
      {allUsers.length > 0 && (
        <button
          onClick={() => {
            if (!showProgressSidebar) {
              setActiveRightTab("members");
              setShowProgressSidebar(true);
            } else if (activeRightTab === "completed") {
              setActiveRightTab("members");
            } else {
              setShowProgressSidebar(false);
            }
          }}
          className="absolute right-0 top-[calc(50%-55px)] -translate-y-1/2 z-45 bg-[#2b2d31]/95 hover:bg-[#35373c]/95 border border-y border-l border-theater-gold/35 hover:border-theater-gold text-theater-gold font-extrabold text-[10px] tracking-wider uppercase py-4 px-3 rounded-l-2xl shadow-xl flex flex-col items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span className="text-sm">👥</span>
          <div className="flex flex-col items-center gap-0.5" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
            <span className="text-neutral-200 font-bold mb-0.5">{allUsers.length}</span>
            <span>ANGGOTA</span>
          </div>
        </button>
      )}

      {dealt && (
        <button
          onClick={() => {
            if (!showProgressSidebar) {
              setActiveRightTab("completed");
              setShowProgressSidebar(true);
            } else if (activeRightTab === "members") {
              setActiveRightTab("completed");
            } else {
              setShowProgressSidebar(false);
            }
          }}
          className="absolute right-0 top-[calc(50%+55px)] -translate-y-1/2 z-45 bg-[#2b2d31]/95 hover:bg-[#35373c]/95 border border-y border-l border-theater-gold/35 hover:border-theater-gold text-theater-gold font-extrabold text-[10px] tracking-wider uppercase py-4 px-3 rounded-l-2xl shadow-xl flex flex-col items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span className="text-sm">🏆</span>
          <div className="flex flex-col items-center gap-0.5" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
            <span className="text-neutral-200 font-bold mb-0.5 text-center">
              {quests.filter(q => completedQuestIds.has(q.id)).length}
            </span>
            <span>SELESAI</span>
          </div>
        </button>
      )}

      {/* 4. COLLAPSIBLE RIGHT SIDEBAR */}
      <QuestSidebar
        allUsers={allUsers}
        dealt={dealt}
        showProgressSidebar={showProgressSidebar}
        setShowProgressSidebar={setShowProgressSidebar}
        activeRightTab={activeRightTab}
        setActiveRightTab={setActiveRightTab}
        quests={quests}
        completedQuestIds={completedQuestIds}
        userSearchQuery={userSearchQuery}
        setUserSearchQuery={setUserSearchQuery}
        questSearchQuery={questSearchQuery}
        setQuestSearchQuery={setQuestSearchQuery}
        currentUser={currentUser}
        isUserAdmin={isUserAdmin}
        getAvatarUrl={getAvatarUrl}
      />

      {/* 5. REALTIME CLOCK (GMT+7 Clock) */}
      <div className="absolute top-6 left-6 z-30 hidden md:flex items-center gap-3">
        <div className="bg-neutral-950/80 border border-theater-gold/30 rounded-2xl p-2 px-4 shadow-lg flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-black tracking-widest text-neutral-500 uppercase">GMT+7:</span>
          <span className="text-xs font-mono font-bold text-theater-gold tracking-widest">{timeString}</span>
        </div>
      </div>

      {/* 6. USER PROFILE & CV BADGE */}
      <div className="absolute top-7 right-4 md:top-6 md:right-6 z-30 flex items-center gap-2 md:gap-3">
        <div className="bg-neutral-950/80 border border-theater-gold/30 rounded-2xl p-1.5 px-3 md:p-2 md:px-4 shadow-lg flex items-center gap-2 md:gap-3">
          <div className="flex flex-col text-right">
            <span className="text-[7px] md:text-[8px] font-black tracking-widest text-neutral-500 uppercase">Akun Teater</span>
            <span className="text-[9px] md:text-[10px] font-bold text-white max-w-[80px] md:max-w-[120px] truncate">{displayName || currentUser?.displayName || currentUser?.name || currentUser?.email || "Tamu Teater"}</span>
          </div>
          <div className="h-6 md:h-8 w-[1px] bg-neutral-800" />
          <div className="flex flex-col text-left">
            <span className="text-[7px] md:text-[8px] font-black tracking-widest text-neutral-500 uppercase">Crunchy Value</span>
            <span className="text-[10px] md:text-[11px] font-mono font-extrabold text-theater-gold flex items-center gap-1">
              <span>CV$ {userCv.toLocaleString("id-ID")}</span>
              <span className="text-[8px] md:text-[9px] animate-pulse">🌟</span>
            </span>
          </div>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => setShowAdminPanel(!showAdminPanel)} 
            className="flex items-center gap-1.5 md:gap-2 bg-theater-gold/10 hover:bg-theater-gold border border-theater-gold/30 hover:border-theater-gold text-theater-gold hover:text-theater-black transition-all font-black text-[8px] md:text-[9px] uppercase tracking-widest py-2 md:py-2.5 px-2.5 md:px-3.5 rounded-xl shadow-lg cursor-pointer"
          >
            <Shield size={10} />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* 7. GAME STAGE LAYOUT */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 relative">
        {/* A. MENU STATE */}
        {gameState === "menu" && (
          <div className="max-w-xl text-center z-10 flex flex-col items-center select-none animate-fade-in">
            <h2 className="font-display text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-neutral-100 to-neutral-500 tracking-widest uppercase mb-2">
              TIRAI TANTANGAN
            </h2>
            <div className="h-1 w-24 bg-gradient-to-r from-transparent via-theater-gold to-transparent my-4" />
            <p className="text-xs sm:text-sm text-neutral-300 font-sans font-light leading-relaxed mb-8">
              Buktikan keberanianmu di panggung teater CrunchyVerse! Buka kotak kartu misterius admin, selesaikan 5 tantangan acak yang kamu peroleh secara interaktif, dan kumpulkan poin penghargaan.
            </p>

            <button
              onClick={() => {
                setGameState("playing");
                setDealt(false);
              }}
              className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-theater-gold to-theater-gold-dim hover:from-theater-gold-dim hover:to-theater-gold border-2 border-yellow-200 py-4.5 px-10 rounded-2xl text-xs font-black uppercase tracking-widest text-neutral-950 shadow-xl shadow-theater-gold/15 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
            >
              <Play size={14} className="fill-current" />
              <span>Mulai Permainan</span>
            </button>
          </div>
        )}

        {/* B. PLAYING STATE */}
        {gameState === "playing" && (
          <div className="w-full flex-1 flex flex-col justify-between items-center animate-fade-in relative min-h-[640px]">
            
            <CardHand
              dealt={dealt}
              dealtQuests={dealtQuests}
              cardStatuses={cardStatuses}
              cardFlipped={cardFlipped}
              activeQuestId={activeQuestId}
              setActiveQuestId={setActiveQuestId}
              handleDealCards={handleDealCards}
              handleCardClick={handleCardClick}
              handleFileChange={handleFileChange}
              handleSubmitMedia={handleSubmitMedia}
              mediaFile={mediaFile}
              setMediaFile={setMediaFile}
              uploadStatus={uploadStatus}
              setUploadStatus={setUploadStatus}
              isUploading={isUploading}
            />

            {/* Custom CSS */}
            <style dangerouslySetInnerHTML={{ __html: `
              :root {
                --active-card-bottom: 100px;
                --active-card-height: 380px;
              }
              @media (min-width: 768px) {
                :root {
                  --active-card-bottom: 170px;
                  --active-card-height: 440px;
                }
              }
              @keyframes dealCardUno {
                0% {
                  transform: translate(-35vw, -45vh) rotate(-75deg) scale(0.1);
                  opacity: 0;
                }
              }
              @keyframes activeCardPop {
                0% {
                  transform: translateY(20px) scale(0.9);
                  opacity: 0;
                }
                100% {
                  transform: translateY(0) scale(1);
                  opacity: 1;
                }
              }
              .animate-deal-uno {
                animation: dealCardUno 0.35s cubic-bezier(0.25, 1, 0.5, 1) backwards;
                animation-delay: var(--delay, 0s);
              }
              .animate-active-card-pop {
                animation: activeCardPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
              }
              .fanned-card {
                transition: transform 0.35s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
                will-change: transform;
              }
              .fanned-card:hover {
                transform: translate3d(0, calc(var(--ty) - 32px), 0) rotate(var(--rot)) scale(1.18) !important;
                border-color: #d4af37 !important;
                box-shadow: 0 15px 35px rgba(212, 175, 55, 0.45);
                opacity: 1 !important;
              }
            `}} />

            {/* Return to Menu Button */}
            {dealt && (
              <div className="absolute bottom-6 right-6 z-20">
                <button
                  onClick={() => {
                    setDealt(false);
                    setGameState("menu");
                  }}
                  className="text-[8px] font-extrabold text-neutral-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer bg-neutral-950/60 hover:bg-neutral-900 border border-neutral-900/60 px-3 py-1.5 rounded-lg"
                >
                  Kembali ke Menu Utama
                </button>
              </div>
            )}

          </div>
        )}

      </div>

      {/* 8. FOOTER STRIP */}
      <div className="absolute bottom-0 inset-x-0 h-16 bg-neutral-950/80 border-t border-neutral-900 z-20 flex items-center justify-between px-6">
        <button
          onClick={onScrollToLobby}
          className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[9px] tracking-widest uppercase py-2 px-4 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
        >
          ↑ <span>Kembali ke Lobi</span>
        </button>

        <div className="md:hidden flex items-center gap-1.5 bg-neutral-900/60 border border-theater-gold/20 rounded-xl py-1 px-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-mono font-bold text-theater-gold tracking-widest">{timeString}</span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[9px] text-neutral-500 font-semibold tracking-wider select-none">
          <Sparkle size={10} className="text-theater-gold" />
          <span>FRAME VII · TIRAI TANTANGAN TEATER INTERAKTIF</span>
        </div>
      </div>

      {/* 9. FULLSIZE MEDIA PREVIEW MODAL OVERLAY */}
      {previewMediaUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
          onClick={() => setPreviewMediaUrl(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[85vh] w-full flex flex-col justify-center items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setPreviewMediaUrl(null)}
              className="absolute -top-12 right-0 text-white/75 hover:text-white bg-neutral-900/80 hover:bg-neutral-850 border border-neutral-800 p-2.5 rounded-full cursor-pointer transition-all hover:scale-105"
            >
              <X size={18} />
            </button>

            <div className="w-full h-full flex justify-center items-center overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl bg-neutral-950">
              {previewMediaUrl.startsWith("data:video") || previewMediaUrl.includes(".mp4") ? (
                <video src={previewMediaUrl} controls autoPlay className="max-w-full max-h-[75vh] object-contain" />
              ) : (
                <img src={previewMediaUrl} alt="Pratinjau Bukti" className="max-w-full max-h-[75vh] object-contain" />
              )}
            </div>
            
            <div className="text-[10px] text-neutral-400 font-sans tracking-wide">
              Klik di luar media atau tombol silang di atas untuk menutup.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

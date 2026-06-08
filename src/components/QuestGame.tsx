"use client";

import React, { useState, useEffect } from "react";
import { 
  Play, Trash2, Shield, 
  Sparkle, HelpCircle, Edit3, 
  Camera, UploadCloud, X, Check, Search
} from "lucide-react";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { 
  collection, addDoc, deleteDoc, doc, onSnapshot, query,
  where, setDoc, getDoc, updateDoc
} from "firebase/firestore";

interface Quest {
  id: string;
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



interface Star {
  id: number;
  left: string;
  top: string;
  size: number;
  speed: string;
  minOp: number;
  maxOp: number;
}

interface QuestGameProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentUser: any;
  displayName: string;
  userRole: string | null;
  onScrollToLobby?: () => void;
  backendUrl?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 1500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
    )
  ]);
}

const isUserAdmin = (role: string | null) => {
  return role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik";
};

export default function QuestGame({ currentUser, displayName, userRole, onScrollToLobby, backendUrl }: QuestGameProps) {
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
  // User real-time CV point state
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
  const [dealtQuests, setDealtQuests] = useState<Quest[]>([]);
  const [dealt, setDealt] = useState(false);
  const [cardFlipped, setCardFlipped] = useState<Record<string, boolean>>({});
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);
  const [cardStatuses, setCardStatuses] = useState<Record<string, "active" | "pending" | "Completed" | "Denied">>({});
  const activeQuest = activeQuestId ? dealtQuests.find(q => q.id === activeQuestId) : null;
  
  // Admin form state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
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

  // Submissions list for manual approval tab (now progress tab)
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [expandedProgressUserId, setExpandedProgressUserId] = useState<string | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);

  const pendingSubmissions = allSubmissions.filter((s: any) => s.status === "pending");

  // Media upload states
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Background stars for night mode (lazy initialized to prevent effect state cascading renders)
  const [stars] = useState<Star[]>(() =>
    Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 80}%`,
      size: Math.random() * 2 + 1,
      speed: `${Math.random() * 3 + 2}s`,
      minOp: Math.random() * 0.3,
      maxOp: Math.random() * 0.7 + 0.3
    }))
  );

  // Check if current user has admin rights
  const isAdmin = isUserAdmin(userRole) || currentUser?.email?.toLowerCase() === "rioagustiawan10188@gmail.com";

  // Hydration safety mount
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Subscribe to all users in database (Firestore real-time sync / LocalStorage fallback)
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
      // Offline Local Storage Simulation Mode
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
      // Listen to storage event to keep tabs in sync if opened in multiple tabs
      window.addEventListener("storage", loadLocalUsers);
      // Also poll every 3 seconds to ensure updates within the same window are captured quickly
      const interval = setInterval(loadLocalUsers, 3000);
      return () => {
        window.removeEventListener("storage", loadLocalUsers);
        clearInterval(interval);
      };
    }
  }, []);



  // Update GMT+7 realtime clock & sync hour for automatic sky
  useEffect(() => {
    const updateTime = () => {
      const date = new Date();
      
      // Realtime clock string in Asia/Jakarta timezone
      const timeStr = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(date);
      setTimeString(timeStr);

      // System hour in Asia/Jakarta timezone
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
    const interval = setInterval(updateTime, 1000); // update every second
    return () => clearInterval(interval);
  }, [timeMode]);

  // Real-time synchronization of player's CV points from Bot API
  useEffect(() => {
    if (!currentUser?.uid) return;

    let isMounted = true;
    let interval: any = null;

    const fetchCv = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/${currentUser.uid}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setUserCv(data.cv || data.points || 0);
          }
        }
      } catch (err) {
        console.warn("⚠️ Failed to sync user CV points from backend API:", err);
      }
    };

    fetchCv();
    interval = setInterval(fetchCv, 3000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [currentUser]);

  // Real-time synchronization of player's Quest Deck (drawn cards, status)
  useEffect(() => {
    if (!currentUser?.uid) return;

    let isMounted = true;
    let interval: any = null;

    const fetchDeckFromApi = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/decks/${currentUser.uid}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setDealtQuests(data.cards || []);
            setDealt(data.dealt || false);
            
            const statuses = data.statuses || {};
            setCardStatuses(statuses);

            // Save to LocalStorage as cache
            const key = `crunchyverse_user_deck_${currentUser.uid}`;
            localStorage.setItem(key, JSON.stringify(data));
            
            setCardFlipped(prev => {
              const nextFlips = { ...prev };
              (data.cards || []).forEach((q: Quest) => {
                if (statuses[q.id] && statuses[q.id] !== "active") {
                  nextFlips[q.id] = true;
                }
              });
              return nextFlips;
            });
          }
        }
      } catch (apiErr) {
        const key = `crunchyverse_user_deck_${currentUser.uid}`;
        const stored = localStorage.getItem(key);
        if (stored && isMounted) {
          try {
            const data = JSON.parse(stored);
            setDealtQuests(data.cards || []);
            setDealt(data.dealt || false);
            setCardStatuses(data.statuses || {});
          } catch (e) {}
        }
      }
    };

    fetchDeckFromApi();
    interval = setInterval(fetchDeckFromApi, 2000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [currentUser]);

  // Sync All Submissions for Admin Progress Panel
  useEffect(() => {
    if (!isAdmin) return;

    let isMounted = true;
    let interval: any = null;

    const fetchSubmissionsFromApi = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/submissions`);
        if (res.ok) {
          const list = await res.json();
          if (isMounted) {
            setAllSubmissions(list);
            localStorage.setItem("crunchy_all_submissions", JSON.stringify(list));
          }
        }
      } catch (apiErr) {
        const stored = localStorage.getItem("crunchy_all_submissions");
        if (stored && isMounted) {
          try {
            const list = JSON.parse(stored);
            setAllSubmissions(list);
          } catch (e) {}
        }
      }
    };

    fetchSubmissionsFromApi();
    interval = setInterval(fetchSubmissionsFromApi, 2000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [isAdmin]);

  // Sync Quests Database
  useEffect(() => {
    let isMounted = true;
    let interval: any = null;

    const fetchQuestsFromApi = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/quests`);
        if (res.ok) {
          const list = await res.json();
          if (isMounted) {
            setQuests(list);
            localStorage.setItem("crunchy_quests", JSON.stringify(list));
          }
        }
      } catch (apiErr) {
        const stored = localStorage.getItem("crunchy_quests");
        if (stored && isMounted) {
          try {
            setQuests(JSON.parse(stored));
          } catch (e) {}
        }
      }
    };

    fetchQuestsFromApi();
    interval = setInterval(fetchQuestsFromApi, 2000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  // Auto-reset activeQuestId if it is completed (filtered out from hand)
  useEffect(() => {
    if (activeQuestId && cardStatuses[activeQuestId] === "Completed") {
      setActiveQuestId(null);
    }
  }, [cardStatuses, activeQuestId]);



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
      const response = await fetch(`${BACKEND_URL}/api/discord-role/${roleId.trim()}`);
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
      // Fallback in case bot is offline (for sandbox / mock testing)
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

    let apiSuccess = false;
    try {
      const res = await fetch(`${BACKEND_URL}/api/quests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questData)
      });
      if (res.ok) apiSuccess = true;
    } catch (err: any) {
      console.warn("⚠️ Gagal menyimpan quest ke Bot API:", err.message);
    }

    let firestoreSuccess = false;
    if (isFirebaseConfigured && db) {
      try {
        await withTimeout(addDoc(collection(db, "quests"), questData));
        firestoreSuccess = true;
      } catch (err: any) {
        console.warn("⚠️ Gagal menyimpan quest ke Firestore:", err.message);
      }
    }

    if (!apiSuccess && !firestoreSuccess) {
      const updated = [...quests, { id: `local-${Date.now()}`, ...questData } as Quest];
      localStorage.setItem("crunchy_quests", JSON.stringify(updated));
      setQuests(updated);
    }

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
  };

  // Admin: Delete quest
  const handleDeleteQuest = async (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus quest ini?")) {
      // Update local state and localStorage immediately
      const updated = quests.filter(q => q.id !== id);
      localStorage.setItem("crunchy_quests", JSON.stringify(updated));
      setQuests(updated);

      let apiSuccess = false;
      try {
        const res = await fetch(`${BACKEND_URL}/api/quests/${id}`, {
          method: "DELETE"
        });
        if (res.ok) apiSuccess = true;
      } catch (err: any) {
        console.warn("⚠️ Gagal menghapus quest dari Bot API:", err.message);
      }

      let firestoreSuccess = false;
      if (isFirebaseConfigured && db) {
        try {
          await withTimeout(deleteDoc(doc(db, "quests", id)));
          firestoreSuccess = true;
        } catch (err: any) {
          console.warn("⚠️ Gagal menghapus quest dari Firestore:", err.message);
        }
      }
    }
  };

  // Admin: Load default quests
  const handleLoadDefaultQuests = async () => {
    if (confirm("Apakah Anda yakin ingin memuat ulang 5 quest default teater ke database?")) {
      setAdminError(null);
      setAdminSuccess(null);
      
      // Update local state and localStorage immediately
      const updated = [...quests];
      DEFAULT_QUESTS.forEach(dq => {
        if (!updated.some(q => q.title === dq.title)) {
          updated.push({ ...dq, id: `local-${Date.now()}-${Math.floor(Math.random()*1000)}` });
        }
      });
      localStorage.setItem("crunchy_quests", JSON.stringify(updated));
      setQuests(updated);

      let apiSuccess = false;
      try {
        const res = await fetch(`${BACKEND_URL}/api/quests/load-defaults`, {
          method: "POST"
        });
        if (res.ok) apiSuccess = true;
      } catch (err: any) {
        console.warn("⚠️ Gagal memuat quest default ke Bot API:", err.message);
      }

      let firestoreSuccess = false;
      if (isFirebaseConfigured && db) {
        try {
          for (const quest of DEFAULT_QUESTS) {
            const questData = {
              akt: quest.akt || "Akt I",
              title: quest.title,
              description: quest.description,
              difficulty: quest.difficulty,
              points: quest.points
            };
            await withTimeout(addDoc(collection(db, "quests"), questData));
          }
          firestoreSuccess = true;
        } catch (err: any) {
          console.warn("⚠️ Gagal memuat quest default ke Firestore:", err.message);
        }
      }

      setAdminSuccess("Quest default teater berhasil dimuat!");
    }
  };

  // Admin: Delete all quests
  const handleDeleteAllQuests = async () => {
    if (confirm("PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA quest terdaftar di database?")) {
      setAdminError(null);
      setAdminSuccess(null);

      // Update local state and localStorage immediately
      localStorage.setItem("crunchy_quests", JSON.stringify([]));
      setQuests([]);

      let apiSuccess = false;
      try {
        const res = await fetch(`${BACKEND_URL}/api/quests/delete-all`, {
          method: "POST"
        });
        if (res.ok) apiSuccess = true;
      } catch (err: any) {
        console.warn("⚠️ Gagal menghapus semua quest dari Bot API:", err.message);
      }

      let firestoreSuccess = false;
      if (isFirebaseConfigured && db) {
        try {
          for (const quest of quests) {
            await withTimeout(deleteDoc(doc(db, "quests", quest.id)));
          }
          firestoreSuccess = true;
        } catch (err: any) {
          console.warn("⚠️ Gagal menghapus semua quest dari Firestore:", err.message);
        }
      }

      setAdminSuccess("Semua quest terdaftar berhasil dihapus!");
    }
  };

  // Media Bukti Submissions Handlers
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
          questTitle: quest.title,
          questDescription: quest.description,
          points: quest.points,
          akt: quest.akt || "Akt I",
          userId: currentUser?.uid || `sim-user-${Date.now()}`,
          username: displayName || currentUser?.displayName || currentUser?.name || currentUser?.email || "Pemain Teater",
          userEmail: currentUser?.email || "",
          fileName: mediaFile.name,
          mediaData: base64Data,
          roleId: quest.roleId || "",
          roleName: quest.roleName || ""
        };

        try {
          const response = await fetch(`${BACKEND_URL}/api/submissions/submit`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
          }

          const resData = await response.json();
          
          const submissionDoc = {
            questId: quest.id,
            questTitle: quest.title,
            questDescription: quest.description,
            points: quest.points,
            akt: quest.akt || "Akt I",
            userId: payload.userId,
            username: payload.username,
            userEmail: payload.userEmail,
            discordMessageId: resData.discordMessageId || `sim-msg-${Date.now()}`,
            mediaUrl: resData.mediaUrl || base64Data,
            status: "pending",
            createdAt: new Date().toISOString(),
            roleId: quest.roleId || "",
            roleName: quest.roleName || ""
          };

          let firestoreSuccess = false;
          if (isFirebaseConfigured && db) {
            try {
              await withTimeout(addDoc(collection(db, "submissions"), submissionDoc));
              
              // Set user deck card status to "pending" in Firestore
              const deckRef = doc(db, "user_decks", payload.userId);
              const deckSnap = await withTimeout(getDoc(deckRef));
              if (deckSnap.exists()) {
                const deckData = deckSnap.data();
                const updatedStatuses = { ...deckData.statuses, [quest.id]: "pending" };
                await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
              }
              firestoreSuccess = true;
            } catch (fsErr: any) {
              console.warn("⚠️ Gagal menulis submission ke Firestore:", fsErr.message);
            }
          }

          if (!firestoreSuccess) {
            const stored = localStorage.getItem("crunchy_submissions");
            const submissionsList = stored ? JSON.parse(stored) : [];
            submissionsList.push({ id: `local-sub-${Date.now()}`, ...submissionDoc });
            localStorage.setItem("crunchy_submissions", JSON.stringify(submissionsList));

            // Set user deck card status to "pending" in LocalStorage
            const deckKey = `crunchyverse_user_deck_${payload.userId}`;
            const deckStr = localStorage.getItem(deckKey);
            if (deckStr) {
              const deckObj = JSON.parse(deckStr);
              deckObj.statuses = { ...deckObj.statuses, [quest.id]: "pending" };
              localStorage.setItem(deckKey, JSON.stringify(deckObj));
            }
          }

          setUploadStatus("✅ Bukti berhasil dikirim! Poin akan ditambahkan setelah disetujui admin.");
          setIsUploading(false);
          setMediaFile(null);
          
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

  // Admin Sandbox Manual Approvals
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

      const response = await fetch(`${BACKEND_URL}/api/submissions/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      let firestoreSuccess = false;
      if (isFirebaseConfigured && db) {
        try {
          const subRef = doc(db, "submissions", sub.id);
          await withTimeout(updateDoc(subRef, { status: "approved" }));

          const userRef = doc(db, "users", sub.userId);
          const userDoc = await withTimeout(getDoc(userRef));
          let newPoints = Number(sub.points) || 0;
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const currentPoints = userData.cv || userData.points || 0;
            newPoints += currentPoints;
            await withTimeout(updateDoc(userRef, { 
              cv: newPoints,
              points: newPoints
            }));
          } else {
            await withTimeout(setDoc(userRef, {
              uid: sub.userId,
              name: sub.username || "Pemain",
              email: sub.userEmail || "",
              role: "Penonton Teater",
              cv: newPoints,
              points: newPoints
            }));
          }

          if (sub.questId) {
            const deckRef = doc(db, "user_decks", sub.userId);
            const deckDoc = await withTimeout(getDoc(deckRef));
            if (deckDoc.exists()) {
              const deckData = deckDoc.data();
              const updatedStatuses = { ...deckData.statuses, [sub.questId]: "Completed" };
              await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
            }
          }
          firestoreSuccess = true;
        } catch (fsErr: any) {
          console.warn("⚠️ Gagal update approve ke Firestore:", fsErr.message);
        }
      }

      if (!firestoreSuccess) {
        // Fallback local storage approvals
        const stored = localStorage.getItem("crunchy_submissions");
        if (stored) {
          const list = JSON.parse(stored);
          const updated = list.map((s: any) => s.id === sub.id ? { ...s, status: "approved" } : s);
          localStorage.setItem("crunchy_submissions", JSON.stringify(updated));
        }

        const storedUsers = localStorage.getItem("crunchy_users");
        if (storedUsers) {
          const users = JSON.parse(storedUsers);
          const updatedUsers = users.map((u: any) => {
            if (u.uid === sub.userId) {
              const currentPoints = u.cv || u.points || 0;
              return { ...u, cv: currentPoints + sub.points, points: currentPoints + sub.points };
            }
            return u;
          });
          localStorage.setItem("crunchy_users", JSON.stringify(updatedUsers));
        }

        // Update local deck status
        if (sub.questId && sub.userId) {
          const deckKey = `crunchyverse_user_deck_${sub.userId}`;
          const deckStr = localStorage.getItem(deckKey);
          if (deckStr) {
            const deckObj = JSON.parse(deckStr);
            deckObj.statuses = { ...deckObj.statuses, [sub.questId]: "Completed" };
            localStorage.setItem(deckKey, JSON.stringify(deckObj));
          }
        }
      }
      alert(`✅ Bukti submission berhasil disetujui!${data.roleAssigned ? ` Role "${data.roleName}" telah diberikan ke Discord.` : ""}`);
    } catch (err: any) {
      alert("❌ Gagal menyetujui: " + err.message);
    }
  };

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

        const response = await fetch(`${BACKEND_URL}/api/submissions/reject`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
        }

        let firestoreSuccess = false;
        if (isFirebaseConfigured && db) {
          try {
            const subRef = doc(db, "submissions", sub.id);
            await withTimeout(deleteDoc(subRef));

            // Set card status inside user's hand to "Denied"
            if (sub.questId && sub.userId) {
              const deckRef = doc(db, "user_decks", sub.userId);
              const deckDoc = await withTimeout(getDoc(deckRef));
              if (deckDoc.exists()) {
                const deckData = deckDoc.data();
                const updatedStatuses = { ...deckData.statuses, [sub.questId]: "Denied" };
                await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
              }
            }
            firestoreSuccess = true;
          } catch (fsErr: any) {
            console.warn("⚠️ Gagal update reject ke Firestore:", fsErr.message);
          }
        }

        if (!firestoreSuccess) {
          const stored = localStorage.getItem("crunchy_submissions");
          if (stored) {
            const list = JSON.parse(stored);
            const updated = list.filter((s: any) => s.id !== sub.id);
            localStorage.setItem("crunchy_submissions", JSON.stringify(updated));
          }

          // Update local deck status
          if (sub.questId && sub.userId) {
            const deckKey = `crunchyverse_user_deck_${sub.userId}`;
            const deckStr = localStorage.getItem(deckKey);
            if (deckStr) {
              const deckObj = JSON.parse(deckStr);
              deckObj.statuses = { ...deckObj.statuses, [sub.questId]: "Denied" };
              localStorage.setItem(deckKey, JSON.stringify(deckObj));
            }
          }
        }
        alert("❌ Bukti submission berhasil ditolak dan dihapus.");
      } catch (err: any) {
        alert("❌ Gagal menolak: " + err.message);
      }
    }
  };

  // Game action: Deal Math.min(5, quests.length) cards
  const handleDealCards = async () => {
    if (quests.length === 0 || !currentUser?.uid) return;
    
    // Sort quests by difficulty
    const easyQuests = quests.filter(q => q.difficulty === "Mudah");
    const mediumQuests = quests.filter(q => q.difficulty === "Sedang");
    const hardQuests = quests.filter(q => q.difficulty === "Sulit");
    const legendaryQuests = quests.filter(q => q.difficulty === "Legendaris");

    // Check completed count based on approved active submissions
    const completedQuestIds = new Set(
      allSubmissions
        .filter((s: any) => s.userId === currentUser.uid && s.status === "approved")
        .map((s: any) => s.questId)
    );
    const completedCount = completedQuestIds.size;

    const isFirstTime = completedCount === 0;

    // Retain existing uncompleted cards in hand (active or pending)
    const retainedCards = dealt ? dealtQuests.filter(q => cardStatuses[q.id] === "active" || cardStatuses[q.id] === "pending") : [];
    
    const selected: Quest[] = [...retainedCards];
    const selectedIds = new Set<string>(retainedCards.map(c => c.id));

    // Exclude completed quests AND currently retained quests from the pool to avoid duplicates
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
      // Draw cardsToDraw unique cards based on weighted probabilities
      for (let i = 0; i < cardsToDraw; i++) {
        const rand = Math.random() * 100;
        let targetDifficulty: "Mudah" | "Sedang" | "Sulit" | "Legendaris" = "Mudah";

        if (isFirstTime) {
          // Pertama kali: Mudah 50%, Sedang 40%, Sulit 9%, Legendaris 1%
          if (rand < 50) targetDifficulty = "Mudah";
          else if (rand < 90) targetDifficulty = "Sedang";
          else if (rand < 99) targetDifficulty = "Sulit";
          else targetDifficulty = "Legendaris";
        } else {
          // Mengambil lagi: Mudah 20%, Sedang 50%, Sulit 25%, Legendaris 5%
          if (rand < 20) targetDifficulty = "Mudah";
          else if (rand < 70) targetDifficulty = "Sedang";
          else if (rand < 95) targetDifficulty = "Sulit";
          else targetDifficulty = "Legendaris";
        }

        // Get unselected quests of this difficulty from the pool
        let diffPool: Quest[] = [];
        if (targetDifficulty === "Mudah") diffPool = easyQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));
        else if (targetDifficulty === "Sedang") diffPool = mediumQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));
        else if (targetDifficulty === "Sulit") diffPool = hardQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));
        else if (targetDifficulty === "Legendaris") diffPool = legendaryQuests.filter(q => pool.some(p => p.id === q.id) && !selectedIds.has(q.id));

        // Fallback if target difficulty pool is empty
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

    const initialStatuses: Record<string, "active" | "pending" | "Completed" | "Denied"> = {};
    selected.forEach(q => {
      // Keep existing status if it was retained, otherwise default to "active"
      initialStatuses[q.id] = cardStatuses[q.id] || "active";
    });

    const deckData = {
      uid: currentUser.uid,
      dealt: true,
      cards: selected,
      statuses: initialStatuses
    };

    let apiSuccess = false;
    try {
      const res = await fetch(`${BACKEND_URL}/api/decks/deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: currentUser.uid,
          cards: selected,
          statuses: initialStatuses
        })
      });
      if (res.ok) apiSuccess = true;
    } catch (err: any) {
      console.warn("⚠️ Gagal menyimpan deck ke Bot API:", err.message);
    }

    let firestoreSuccess = false;
    if (isFirebaseConfigured && db) {
      try {
        await withTimeout(setDoc(doc(db, "user_decks", currentUser.uid), deckData));
        firestoreSuccess = true;
      } catch (err: any) {
        console.warn("⚠️ Gagal menyimpan deck ke Firestore:", err.message);
      }
    }

    if (!apiSuccess && !firestoreSuccess) {
      localStorage.setItem(`crunchyverse_user_deck_${currentUser.uid}`, JSON.stringify(deckData));
    }
    
    setDealtQuests(selected);
    // Reset card flips mapping
    const flips: Record<string, boolean> = {};
    selected.forEach(q => {
      flips[q.id] = false;
    });
    setCardFlipped(flips);
    setActiveQuestId(null);
    setDealt(true);
  };

  // Click card handler
  const handleCardClick = (questId: string) => {
    if (activeQuestId === questId) {
      setActiveQuestId(null);
    } else {
      setActiveQuestId(questId);
      setCardFlipped(prev => ({ ...prev, [questId]: true }));
    }
  };

  // Sky Gradient Calculation
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
    if (isSunset) return "from-orange-500 via-red-500 to-purple-900";
    return "from-[#020617] via-[#0f172a] to-[#1e293b]";
  };

  // Helper to resolve avatar URL elegantly
  const getAvatarUrl = (user: any) => {
    if (user.avatar) {
      if (user.avatar.startsWith("http")) return user.avatar;
      if (user.discordId) {
        return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
      }
    }
    // Hardcoded fallback for Sim
    const uidStr = String(user.uid || user.userId || "");
    if (uidStr.includes("661135501226672129")) {
      return "https://cdn.discordapp.com/avatars/661135501226672129/bd7645199e728f2edce98bdf1a7f4671.png";
    }
    const seed = encodeURIComponent(user.name || user.displayName || user.username || user.email || "visitor");
    return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;
  };

  // Find all quest IDs completed by the current user across their history
  const completedQuestIds = React.useMemo(() => {
    if (!currentUser?.uid) return new Set<string>();
    return new Set<string>(
      allSubmissions
        .filter((s: any) => s.userId === currentUser.uid && s.status === "approved")
        .map((s: any) => s.questId)
    );
  }, [allSubmissions, currentUser]);

  // Group all submissions by user for Player Progress tracking
  const playersProgress = React.useMemo(() => {
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
        // Find user in allUsers to get active metadata/avatar
        const userObj = allUsers.find(u => u.uid === sub.userId);
        
        let avatarUrl = "";
        if (currentUser && sub.userId === currentUser.uid && currentUser.avatar) {
          avatarUrl = currentUser.avatar;
        } else if (userObj) {
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

    // Compute completion times for 5th active quest to determine Serial / Last Chapter ranks
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

    // Sort players who have completed 5/5 by completionTime
    const completersSorted = playersWithCompletionTime
      .filter(p => p.activeApprovedCount >= 5)
      .sort((a, b) => a.completionTime - b.completionTime);

    // Map each player to add their serial rank badge
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
  }, [allSubmissions, allUsers, quests, currentUser]);

  return (
    <div className="flex-1 w-full relative overflow-hidden flex flex-col justify-between">
      
      {/* SIDEBAR TOGGLE BUTTONS (Floating on right edge, stacked) */}
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

      {/* COLLAPSIBLE RIGHT SIDEBAR (Anggota & Tantangan Selesai Tabs) */}
      {(allUsers.length > 0 || dealt) && (
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
                            {/* Discord Active Status Indicator (Green dot) */}
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
                            {/* Discord Custom Status line */}
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
      )}

      {/* REALTIME CLOCK (Floating top-left badge) */}
      <div className="absolute top-6 left-6 z-30 flex items-center gap-3">
        {/* GMT+7 Clock */}
        <div className="bg-neutral-950/80 border border-theater-gold/30 rounded-2xl p-2 px-4 shadow-lg flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-black tracking-widest text-neutral-500 uppercase">GMT+7:</span>
          <span className="text-xs font-mono font-bold text-theater-gold tracking-widest">{timeString}</span>
        </div>
      </div>

      {/* USER PROFILE & CV BADGE (Floating top-right badge) */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-3">
        <div className="bg-neutral-950/80 border border-theater-gold/30 rounded-2xl p-2 px-4 shadow-lg flex items-center gap-3">
          <div className="flex flex-col text-right">
            <span className="text-[8px] font-black tracking-widest text-neutral-500 uppercase">Akun Teater</span>
            <span className="text-[10px] font-bold text-white max-w-[120px] truncate">{displayName || currentUser?.displayName || currentUser?.name || currentUser?.email || "Tamu Teater"}</span>
          </div>
          <div className="h-8 w-[1px] bg-neutral-800" />
          <div className="flex flex-col text-left">
            <span className="text-[8px] font-black tracking-widest text-neutral-500 uppercase">Crunchy Value</span>
            <span className="text-[11px] font-mono font-extrabold text-theater-gold flex items-center gap-1">
              <span>CV$ {userCv.toLocaleString("id-ID")}</span>
              <span className="text-[9px] animate-pulse">🌟</span>
            </span>
          </div>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => setShowAdminPanel(!showAdminPanel)} 
            className="flex items-center gap-2 bg-theater-gold/10 hover:bg-theater-gold border border-theater-gold/30 hover:border-theater-gold text-theater-gold hover:text-theater-black transition-all font-black text-[9px] uppercase tracking-widest py-2.5 px-3.5 rounded-xl shadow-lg cursor-pointer"
          >
            <Shield size={12} />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Styles for dynamic pixel animations */}
      <style>{`
        @keyframes foxWalk {
          0% {
            left: -100px;
            transform: scaleX(1);
          }
          45% {
            left: calc(100% + 100px);
            transform: scaleX(1);
          }
          50% {
            left: calc(100% + 100px);
            transform: scaleX(-1);
          }
          95% {
            left: -100px;
            transform: scaleX(-1);
          }
          100% {
            left: -100px;
            transform: scaleX(1);
          }
        }

        @keyframes butterflyFly {
          0% {
            left: 15%;
            top: 25%;
            transform: scale(1) rotate(0deg);
          }
          25% {
            left: 45%;
            top: 15%;
            transform: scale(1.1) rotate(15deg);
          }
          50% {
            left: 75%;
            top: 50%;
            transform: scale(0.9) rotate(-10deg);
          }
          75% {
            left: 35%;
            top: 65%;
            transform: scale(1.05) rotate(5deg);
          }
          100% {
            left: 15%;
            top: 25%;
            transform: scale(1) rotate(0deg);
          }
        }

        .animate-fox-walk {
          animation: foxWalk 35s linear infinite;
        }

        .animate-butterfly-fly {
          animation: butterflyFly 20s ease-in-out infinite;
        }

        .pixelated {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}</style>

      {/* ADAPTIVE SKY BACKGROUND WITH PHOTO & PIXEL ANIMALS */}
      <div 
        className="absolute inset-0 adaptive-sky transition-colors duration-1000 z-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(6, 1, 2, 0.45), rgba(6, 1, 2, 0.85)), url('/challenge_bg.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        
        {/* Animated Pixel Animals */}
        <img
          src="/pixel_fox.png"
          alt="Pixel Fox"
          className="absolute bottom-12 w-16 h-16 pixelated pointer-events-none z-10 animate-fox-walk"
          style={{ mixBlendMode: 'multiply' }}
        />

        <img
          src="/pixel_butterfly.png"
          alt="Pixel Butterfly"
          className="absolute w-8 h-8 pixelated pointer-events-none z-10 animate-butterfly-fly"
          style={{ mixBlendMode: 'multiply' }}
        />

        {/* Day/Sunset clouds */}
        {(isMorning || isSunset) && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
            <div className="cloud-scroller flex w-[200%] h-full">
              <div className="w-1/2 h-full relative">
                <div className="absolute top-12 left-[10%] w-40 h-12 bg-white/30 rounded-full blur-[3px]" />
                <div className="absolute top-36 left-[35%] w-60 h-16 bg-white/20 rounded-full blur-[4px]" />
                <div className="absolute top-20 left-[70%] w-48 h-14 bg-white/35 rounded-full blur-[3px]" />
              </div>
              <div className="w-1/2 h-full relative">
                <div className="absolute top-12 left-[10%] w-40 h-12 bg-white/30 rounded-full blur-[3px]" />
                <div className="absolute top-36 left-[35%] w-60 h-16 bg-white/20 rounded-full blur-[4px]" />
                <div className="absolute top-20 left-[70%] w-48 h-14 bg-white/35 rounded-full blur-[3px]" />
              </div>
            </div>
          </div>
        )}

        {/* Night Twinkling Stars */}
        {!isMorning && !isSunset && hasMounted && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-90">
            {stars.map((star) => (
              <div
                key={star.id}
                className="star-twinkle absolute rounded-full bg-white"
                style={{
                  left: star.left,
                  top: star.top,
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  "--speed": star.speed,
                  "--min-op": star.minOp,
                  "--max-op": star.maxOp
                } as React.CSSProperties}
              />
            ))}
          </div>
        )}

        {/* Ambient Stage Lighting spotlight overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-theater-black via-transparent to-transparent opacity-85 z-0" />
      </div>

      {/* GAME WORKSPACE CONTAINER */}
      <div className="flex-1 z-10 relative flex flex-col justify-center items-center px-4 max-w-5xl mx-auto w-full pt-16 pb-28 text-center">
        
        {/* ADMIN MANAGEMENT PANEL MODAL OVERLAY */}
        {showAdminPanel && isAdmin && (
          <div className="absolute inset-0 mx-auto my-auto w-[96%] max-w-5xl h-[88%] max-h-[680px] bg-neutral-950/95 backdrop-blur-md rounded-3xl border border-theater-gold/40 p-6 md:p-8 z-40 text-left flex flex-col gap-5 overflow-y-auto animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <div className="flex items-center gap-2 text-theater-gold">
                <Shield size={18} />
                <h3 className="font-display text-lg font-black uppercase tracking-wider">Kabin Kreator Quest Teater</h3>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveAdminTab("editor")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeAdminTab === "editor" ? "bg-theater-gold text-theater-black" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}
                >
                  Editor Quest
                </button>
                <button
                  onClick={() => setActiveAdminTab("progress")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer relative flex items-center gap-1.5 ${activeAdminTab === "progress" ? "bg-theater-gold text-theater-black" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}
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
                onClick={() => setShowAdminPanel(false)}
                className="text-neutral-400 hover:text-white font-bold text-xs bg-neutral-900 border border-neutral-800 hover:border-neutral-700 py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
              >
                Tutup Editor
              </button>
            </div>

            {activeAdminTab === "editor" ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* Form Input (Left: Span 5) */}
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

                  {/* Poin CV Field (Tampil jika hasRoleReward false, atau jika hasRoleReward true dan roleName terisi) */}
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

                {/* Quest List (Right: Span 7) */}
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
              /* PLAYER PROGRESS CHECKLIST DASHBOARD */
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
                              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-theater-gold font-black">
                                  {approvedCount}/{totalQuests} Selesai
                                </span>
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
                                let activeSub = null;
                                
                                if (approvedSub) {
                                  status = "Completed";
                                  activeSub = approvedSub;
                                } else if (pendingSub) {
                                  status = "Pending";
                                  activeSub = pendingSub;
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
                                        {status === "Completed" ? "✓" : status === "Pending" ? "⏳" : "○"}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[7.5px] font-mono tracking-tight text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded leading-none border border-neutral-800">
                                            {quest.akt || "Akt I"}
                                          </span>
                                          <span className="text-xs font-bold text-[#dbdee1] truncate leading-tight">
                                            {quest.title}
                                          </span>
                                          <span className="text-[9.5px] font-mono text-theater-gold font-bold">
                                            +{quest.points} Poin
                                          </span>
                                        </div>
                                        
                                        {status === "NotStarted" ? (
                                          <p className="text-[9.5px] text-neutral-500 mt-1 italic font-sans leading-normal">
                                            Objektif: &ldquo;{quest.description}&rdquo;
                                          </p>
                                        ) : (
                                          <div className="flex flex-col gap-0.5 text-[9.5px] text-[#949ba4] font-sans mt-1 leading-normal">
                                            {activeSub.roleName && (
                                              <div className="text-[8.5px] font-extrabold text-theater-gold-dim">
                                                🎁 Hadiah Role: {activeSub.roleName}
                                              </div>
                                            )}
                                            {activeSub.createdAt && (
                                              <div className="text-[8.5px] text-neutral-500 font-mono mt-0.5">
                                                Disubmit pada: {new Date(activeSub.createdAt).toLocaleString("id-ID")}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Right Section: Media Thumbnail zoomable */}
                                    {activeSub && activeSub.mediaUrl && (
                                      <div 
                                        onClick={() => setPreviewMediaUrl(activeSub.mediaUrl)}
                                        className="h-11 w-20 rounded-lg overflow-hidden border border-neutral-800 hover:border-theater-gold/40 bg-neutral-900 shrink-0 cursor-zoom-in relative group transition-all"
                                      >
                                        {activeSub.mediaUrl.startsWith("data:video") || activeSub.mediaUrl.includes(".mp4") ? (
                                          <div className="relative h-full w-full flex items-center justify-center">
                                            <video src={activeSub.mediaUrl} className="object-cover h-full w-full" muted />
                                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[8px] uppercase tracking-wider font-extrabold opacity-0 group-hover:opacity-100 transition-opacity">
                                              🎬 Putar
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="relative h-full w-full">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={activeSub.mediaUrl} alt="Bukti" className="object-cover h-full w-full" />
                                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[8px] uppercase tracking-wider font-extrabold opacity-0 group-hover:opacity-100 transition-opacity">
                                              🔍 Lihat
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
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
        )}

        {/* 1. STATE MENU: Start Game Screen */}
        {gameState === "menu" && (
          <div className="flex flex-col items-center justify-center max-w-lg bg-neutral-950/70 border border-theater-gold/30 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-md animate-fade-in relative">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-theater-gold to-transparent" />
            
            <div className="rounded-full border border-theater-gold/20 bg-theater-gold/10 px-3.5 py-1 text-[9px] font-black text-theater-gold tracking-widest uppercase inline-block mb-3 animate-float">
              MODUL GAME AKHIR
            </div>
            <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-wide uppercase">
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

        {/* 2. STATE PLAYING: Card Deck Interaction */}
        {gameState === "playing" && (
          <div className="w-full flex-1 flex flex-col justify-between items-center animate-fade-in relative min-h-[640px]">
            
            {/* Visual 3D Card Deck Stack (Uno Style, Top-Left below Clock) */}
            <div className="absolute top-24 left-6 z-20 flex flex-col items-center gap-2">
              <div 
                onClick={handleDealCards}
                className="relative w-36 h-48 cursor-pointer group select-none"
                title={dealt ? "Klik untuk kocok ulang kartu" : "Klik untuk mengambil kartu"}
              >
                {/* 5 Layered 3D Cards Stack (Bottom to Top) */}
                <div className="absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-2xl border border-neutral-950 bg-neutral-950/80 shadow-sm transition-all" />
                <div className="absolute inset-0 translate-x-[8px] translate-y-[8px] rounded-2xl border border-neutral-900 bg-neutral-950/90 shadow-sm transition-all" />
                <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] rounded-2xl border border-neutral-900 bg-neutral-900 shadow-sm transition-all" />
                <div className="absolute inset-0 translate-x-[4px] translate-y-[4px] rounded-2xl border border-neutral-850 bg-neutral-900/95 shadow-sm transition-all" />
                <div className="absolute inset-0 translate-x-[2px] translate-y-[2px] rounded-2xl border border-neutral-800 bg-neutral-900 shadow-md transition-all" />
                
                {/* Top Glowing Card */}
                <div className="absolute inset-0 rounded-2xl border border-theater-gold/30 group-hover:border-theater-gold bg-gradient-to-br from-neutral-950 to-neutral-900 shadow-xl flex flex-col items-center justify-center p-3.5 transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-theater-gold/20">
                  <div className="h-10 w-10 rounded-full border border-theater-gold/15 bg-theater-gold/5 flex items-center justify-center text-theater-gold/45 mb-2.5 group-hover:text-theater-gold group-hover:border-theater-gold/30 transition-all">
                    <Sparkle size={16} className="animate-pulse" />
                  </div>
                  <span className="text-[9px] font-black text-theater-gold/80 group-hover:text-theater-gold tracking-widest uppercase text-center leading-none">
                    KARTU DECK
                  </span>
                  <span className="text-[6.5px] text-neutral-500 font-bold uppercase tracking-tighter mt-1.5 group-hover:text-neutral-400">
                    {dealt ? "KOCOK ULANG" : "AMBIL KARTU"}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Center Area: Instructions or Focused spotlight card sitting directly above */}
            <div className="flex-1 w-full flex items-center justify-center relative">
              
              {!dealt && (
                /* 2A. DEALT IS FALSE: Draw Instructions */
                <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm select-none z-10 bg-neutral-950/40 border border-neutral-900/40 rounded-3xl backdrop-blur-sm shadow-xl">
                  <div className="h-12 w-12 rounded-full border border-dashed border-neutral-700 flex items-center justify-center text-neutral-500 mb-4 animate-pulse">
                    <HelpCircle size={18} />
                  </div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2">Tarik Kartu Anda</h3>
                  <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                    Silakan klik tumpukan kartu di sebelah kiri atas untuk mengambil 5 kartu tantangan teater!
                  </p>
                </div>
              )}


            </div>

            {/* 2C. HAND OF DEALT CARDS (Fanned out, overlapping Uno style with smooth center/bottom slide) */}
            {dealt && (() => {
              const visibleQuests = dealtQuests.filter(q => cardStatuses[q.id] !== "Completed");
              const count = visibleQuests.length;
              if (count === 0) {
                return (
                  <div className="absolute inset-x-0 bottom-[160px] select-none z-10 flex flex-col items-center justify-center animate-fade-in">
                    <div className="bg-neutral-950/80 border border-theater-gold/30 rounded-2xl p-4 px-6 shadow-lg text-center">
                      <span className="text-xs font-bold text-white block mb-1">🎉 Semua Tantangan Selesai!</span>
                      <span className="text-[9px] text-neutral-400 font-sans">Kerja bagus! Hubungi Volunteer Teater jika Anda ingin mengambil kartu baru.</span>
                    </div>
                  </div>
                );
              }
              return (
                <div 
                  className={`absolute inset-x-0 select-none z-10 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
                    activeQuestId === null ? "bottom-[160px]" : "bottom-6"
                  }`}
                >
                  <div className="relative flex items-center justify-center w-[480px] h-52">
                    {visibleQuests.map((quest, idx) => {
                      const isFlippedToFront = !!cardFlipped[quest.id] || (cardStatuses[quest.id] && cardStatuses[quest.id] !== "active");
                      const isActive = activeQuestId === quest.id;
                      const isAnyActive = activeQuestId !== null;

                      // Fanning calculations (Larger cards w-30 h-44)
                      const offset = idx - (count - 1) / 2;
                      const rotate = offset * 6; // -12deg, -6deg, 0deg, 6deg, 12deg
                      const translateY = Math.abs(offset) * 6; // 12px, 3px, 0px, 3px, 12px
                      const cardWidth = 120; // w-30 = 120px
                      const spacing = 62; // Overlap spacing
                      const leftPos = 240 - (cardWidth / 2) + offset * spacing;

                      if (isActive) {
                        const questStatus = cardStatuses[quest.id] || "active";
                        const activeCardWidth = 340;
                        const activeCardHeight = 440;
                        const activeLeftPos = leftPos - (activeCardWidth - cardWidth) / 2;
                        return (
                          <div
                            key={quest.id || idx}
                            className="absolute border-2 border-theater-gold bg-gradient-to-br from-neutral-950 via-[#120204] to-neutral-950 rounded-3xl p-5 shadow-2xl flex flex-col justify-between items-center text-center animate-active-card-pop pointer-events-auto"
                            style={{
                              left: "50%",
                              marginLeft: "-170px",
                              width: `${activeCardWidth}px`,
                              height: `${activeCardHeight}px`,
                              bottom: "170px",
                              transform: `rotate(${rotate * 0.4}deg)`,
                              zIndex: 50,
                            }}
                          >
                            {/* Card Header */}
                            <div className="w-full flex items-center justify-between border-b border-neutral-900/80 pb-2">
                              <span className="text-[8px] font-mono font-bold text-neutral-500 uppercase">{quest.akt || "Akt I"}</span>
                              <span className={`text-[7px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                                quest.difficulty === "Mudah" ? "border-emerald-500/20 bg-emerald-950/40 text-emerald-400" :
                                quest.difficulty === "Sedang" ? "border-amber-500/20 bg-amber-950/40 text-amber-400" :
                                quest.difficulty === "Sulit" ? "border-rose-500/20 bg-rose-950/40 text-rose-400" :
                                "border-fuchsia-500/20 bg-fuchsia-950/40 text-fuchsia-400 animate-pulse"
                              }`}>
                                {quest.difficulty}
                              </span>
                            </div>

                            {/* Card Title & Objective Description */}
                            <div className="w-full flex-1 flex flex-col justify-center py-2 text-center">
                              <h4 className="text-xs font-black text-white uppercase tracking-wide leading-snug">
                                {quest.title}
                              </h4>
                              <div className="h-[1px] w-10 bg-theater-gold/30 my-2 mx-auto" />
                              <p className="text-[9px] text-neutral-300 font-sans leading-relaxed italic max-h-20 overflow-y-auto px-1.5 scrollbar-none mb-2">
                                &ldquo;{quest.description}&rdquo;
                              </p>
                              
                              {quest.roleName && (
                                <div className="text-[8px] font-extrabold px-2 py-0.5 bg-neutral-950/80 border border-theater-gold/15 rounded-lg flex items-center justify-center gap-1 max-w-[240px] mx-auto select-none mt-1 animate-pulse" style={{ color: quest.roleColor || '#d4af37' }}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-ping" style={{ backgroundColor: quest.roleColor || '#d4af37' }} />
                                  <span className="truncate">Hadiah Role: {quest.roleName}</span>
                                </div>
                              )}
                            </div>

                            {/* Integrated Submission Area directly on the card face */}
                            <div className="w-full bg-neutral-950/60 border border-neutral-900/80 rounded-xl p-3 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[7px] font-bold text-neutral-400 uppercase tracking-wider">Kirim Bukti Media</span>
                                <span className="text-[8px] text-theater-gold font-mono font-bold">+{quest.points} Poin</span>
                              </div>

                              {questStatus === "pending" && (
                                <div className="p-1.5 border border-yellow-500/20 bg-yellow-950/20 text-yellow-400 rounded-lg text-[8px] font-bold text-center animate-pulse flex items-center justify-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-yellow-400 animate-ping" />
                                  <span>⏳ Menunggu Persetujuan Admin</span>
                                </div>
                              )}

                              {questStatus === "Denied" && (
                                <div className="p-1.5 border border-rose-500/20 bg-rose-950/20 text-rose-300 rounded-lg text-[8px] font-bold text-center flex items-center justify-center gap-1.5 animate-bounce">
                                  <span className="h-1 w-1 rounded-full bg-rose-500" />
                                  <span>❌ Bukti Ditolak - Unggah Ulang Bukti</span>
                                </div>
                              )}

                              {questStatus === "Completed" && (
                                <div className="p-1.5 border border-emerald-500/25 bg-emerald-950/30 text-emerald-400 rounded-lg text-[8px] font-bold text-center flex items-center justify-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                  <span>🎉 Selesai / Completed</span>
                                </div>
                              )}

                              {questStatus === "pending" ? (
                                <div className="bg-neutral-950/90 border border-neutral-900 rounded-lg p-2.5 text-center text-[9px] text-neutral-500 font-sans italic">
                                  Bukti pengerjaan telah dikirim dan sedang diverifikasi oleh Volunteer Teater.
                                </div>
                              ) : questStatus === "Completed" ? (
                                <div className="bg-neutral-950/90 border border-neutral-900 rounded-lg p-2.5 text-center text-[9px] text-emerald-400/90 font-sans italic">
                                  Tantangan ini disetujui! Hadiah role dan poin telah diberikan.
                                </div>
                              ) : (
                                <>
                                  {/* Clickable compact dropzone */}
                                  <div className="relative border border-dashed border-neutral-800 hover:border-theater-gold/30 bg-neutral-950/90 rounded-lg p-2 flex flex-col items-center justify-center text-center cursor-pointer transition-all">
                                    <input
                                      type="file"
                                      accept="image/*,video/*"
                                      onChange={handleFileChange}
                                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    />
                                    {mediaFile ? (
                                      <div className="flex items-center gap-1 min-w-0">
                                        <Camera size={10} className="text-theater-gold shrink-0 animate-pulse" />
                                        <span className="text-[8px] text-white font-bold truncate max-w-[150px]">{mediaFile.name}</span>
                                        <span className="text-[6px] text-neutral-500 font-mono shrink-0">({(mediaFile.size / (1024 * 1024)).toFixed(1)}M)</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <UploadCloud size={10} className="text-neutral-500" />
                                        <span className="text-[8px] text-neutral-400 font-bold">Pilih foto/video bukti</span>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}

                              {/* Upload Status Feed */}
                              {uploadStatus && (
                                <div className={`p-0.5 rounded border text-[8px] text-center ${
                                  uploadStatus.startsWith("✅") ? "bg-emerald-950/40 border-emerald-500/20 text-emerald-300" :
                                  uploadStatus.startsWith("⏳") ? "bg-neutral-900 border-neutral-800 text-neutral-300 animate-pulse" :
                                  "bg-rose-950/40 border-rose-500/20 text-rose-300"
                                }`}>
                                  {uploadStatus}
                                </div>
                              )}

                              {/* Submit & Batal Buttons inside the Card */}
                              <div className="flex items-center gap-2 mt-0.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveQuestId(null);
                                    setMediaFile(null);
                                    setUploadStatus(null);
                                  }}
                                  className="flex-grow bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white font-bold text-[8px] uppercase tracking-widest py-2 rounded-lg transition-all cursor-pointer text-center"
                                >
                                  {questStatus === "Completed" ? "Tutup" : "Batal"}
                                </button>
                                {questStatus !== "pending" && questStatus !== "Completed" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSubmitMedia(quest);
                                    }}
                                    disabled={isUploading || !mediaFile}
                                    className="flex-grow bg-gradient-to-r from-theater-gold to-theater-gold-dim hover:from-theater-gold-dim hover:to-theater-gold text-theater-black font-black text-[8px] uppercase tracking-widest py-2 rounded-lg shadow-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-center"
                                  >
                                    {isUploading ? "Kirim..." : "Kirim Bukti"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={quest.id || idx}
                          onClick={() => handleCardClick(quest.id)}
                          className={`absolute w-[120px] h-[176px] card-perspective rounded-2xl border cursor-pointer shadow-lg transition-all duration-300 transform shrink-0 animate-deal-uno fanned-card ${
                            isAnyActive
                              ? "border-theater-gold/10 opacity-40 pointer-events-none"
                              : "border-theater-gold/20"
                          }`}
                          style={{
                            left: `${leftPos}px`,
                            transform: `translate3d(0, ${translateY}px, 0) rotate(${rotate}deg)`,
                            zIndex: idx + 10,
                            "--rot": `${rotate}deg`,
                            "--ty": `${translateY}px`,
                            "--delay": `${idx * 0.15}s`
                          } as React.CSSProperties}
                        >
                          <div className={`card-inner w-full h-full ${isFlippedToFront ? "is-flipped" : ""}`}>
                            
                            {/* Back Face (Locked Card) */}
                            <div className="card-face card-back p-3.5 border border-neutral-800 rounded-2xl flex flex-col justify-between items-center text-center">
                              <span className="text-[7.5px] font-black text-neutral-600 tracking-wider">CRUNCHYVERSE</span>
                              <div className="h-9 w-9 rounded-full border border-theater-gold/15 bg-theater-gold/5 flex items-center justify-center text-theater-gold/45">
                                <HelpCircle size={15} />
                              </div>
                              <span className="text-[8.5px] font-bold text-theater-gold/70 tracking-widest uppercase">KARTU {dealtQuests.indexOf(quest) + 1}</span>
                            </div>

                            {/* Front Face (Revealed Card) */}
                            <div className="card-face card-front border border-theater-gold bg-gradient-to-br from-neutral-950 via-[#100103] to-neutral-950 p-3.5 rounded-2xl flex flex-col justify-between items-center text-center">
                              <div className="flex flex-col items-center">
                                <span className={`text-[5.5px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                                  quest.difficulty === "Mudah" ? "border-emerald-500/20 bg-emerald-950/40 text-emerald-400" :
                                  quest.difficulty === "Sedang" ? "border-amber-500/20 bg-amber-950/40 text-amber-400" :
                                  quest.difficulty === "Sulit" ? "border-rose-500/20 bg-rose-950/40 text-rose-400" :
                                  "border-fuchsia-500/20 bg-fuchsia-950/40 text-fuchsia-400"
                                }`}>
                                  {quest.difficulty}
                                </span>
                                <div className="text-[8.5px] font-extrabold text-white mt-3 truncate w-26 text-center text-ellipsis overflow-hidden whitespace-nowrap">
                                  {quest.title}
                                </div>
                              </div>
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[8.5px] text-theater-gold font-mono font-bold">+{quest.points} Poin</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Custom Embedded animations for Uno card flights & active card pops */}
            <style dangerouslySetInnerHTML={{ __html: `
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
                animation: dealCardUno 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) backwards;
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

            {/* Return to Menu Button (Bottom Right) */}
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

      {/* FOOTER STRIP */}
      <div className="absolute bottom-0 inset-x-0 h-16 bg-neutral-950/80 border-t border-neutral-900 z-20 flex items-center justify-between px-6">
        <button
          onClick={onScrollToLobby}
          className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-theater-gold/40 text-neutral-300 hover:text-white font-bold text-[9px] tracking-widest uppercase py-2 px-4 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
        >
          ↑ <span>Kembali ke Lobi</span>
        </button>

        <div className="flex items-center gap-2 text-[9px] text-neutral-500 font-semibold tracking-wider select-none">
          <Sparkle size={10} className="text-theater-gold" />
          <span>FRAME VII · TIRAI TANTANGAN TEATER INTERAKTIF</span>
        </div>
      </div>

      {/* FULLSIZE MEDIA PREVIEW MODAL OVERLAY */}
      {previewMediaUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
          onClick={() => setPreviewMediaUrl(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[85vh] w-full flex flex-col justify-center items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => setPreviewMediaUrl(null)}
              className="absolute -top-12 right-0 text-white/75 hover:text-white bg-neutral-900/80 hover:bg-neutral-850 border border-neutral-800 p-2.5 rounded-full cursor-pointer transition-all hover:scale-105"
            >
              <X size={18} />
            </button>

            {/* Media Content */}
            <div className="w-full h-full flex justify-center items-center overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl bg-neutral-950">
              {previewMediaUrl.startsWith("data:video") || previewMediaUrl.includes(".mp4") ? (
                <video src={previewMediaUrl} controls autoPlay className="max-w-full max-h-[75vh] object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewMediaUrl} alt="Pratinjau Bukti" className="max-w-full max-h-[75vh] object-contain" />
              )}
            </div>
            
            {/* Context bar / note */}
            <div className="text-[10px] text-neutral-400 font-sans tracking-wide">
              Klik di luar media atau tombol silang di atas untuk menutup.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

import { useState, useCallback } from "react";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { signedFetch } from "../lib/api";

interface Volunteer {
  discordId: string;
  addedAt: string;
  addedBy: string;
  username?: string;
  globalName?: string;
  avatarUrl?: string;
}

interface UseVolunteerManagementProps {
  apiEndpoint: string;
  currentUser: any;
  setErrorMessage: (msg: string | null) => void;
  setIsLoading: (loading: boolean) => void;
}

export function useVolunteerManagement({
  apiEndpoint,
  currentUser,
  setErrorMessage,
  setIsLoading
}: UseVolunteerManagementProps) {
  const [volunteersList, setVolunteersList] = useState<Volunteer[]>([]);
  const [newVolunteerId, setNewVolunteerId] = useState("");

  const withTimeout = useCallback(<T>(promise: Promise<T>, timeoutMs: number = 1500): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
      )
    ]);
  }, []);

  const fetchVolunteerables = useCallback(async () => {
    let list: any[] = [];
    let fetchedFromBackend = false;
    try {
      const res = await signedFetch(`${apiEndpoint}/api/volunteerables`);
      if (res.ok) {
        list = await res.json();
        fetchedFromBackend = true;
      }
    } catch (err) {
      console.warn("Gagal terhubung ke API backend bot untuk fetch volunteerables:", err);
    }

    if (!fetchedFromBackend && isFirebaseConfigured && db) {
      try {
        const querySnapshot = await withTimeout(getDocs(collection(db, "volunteerables")));
        querySnapshot.forEach((doc) => {
          list.push({
            discordId: doc.id,
            ...doc.data()
          });
        });
      } catch (err) {
        console.error("Gagal mengambil daftar volunteerables dari Firestore:", err);
      }
    }

    if (list.length === 0 && !fetchedFromBackend && (!isFirebaseConfigured || !db)) {
      const saved = localStorage.getItem("crunchy_volunteerables");
      if (saved) {
        list = JSON.parse(saved);
      }
    }

    setVolunteersList(list);
  }, [apiEndpoint, withTimeout]);

  const handleAddVolunteer = async () => {
    const cleanId = newVolunteerId.trim();
    if (!cleanId) return;
    if (!/^\d{17,20}$/.test(cleanId)) {
      setErrorMessage("ID Discord tidak valid! Harus berupa 17-20 digit angka.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const addedAt = new Date().toISOString();
      const addedBy = currentUser.email || "Sim";

      // 1. Post to bot server backend
      let savedToBackend = false;
      try {
        const res = await signedFetch(`${apiEndpoint}/api/volunteerables`, {
          method: "POST",
          body: JSON.stringify({ discordId: cleanId, addedBy }),
          sensitive: true
        });
        if (res.ok) {
          savedToBackend = true;
        }
      } catch (err) {
        console.warn("Gagal terhubung ke API backend bot untuk tambah volunteer:", err);
      }

      // 3. Fallback/simulation write to localStorage if not saved to backend
      if (!savedToBackend && (!isFirebaseConfigured || !db)) {
        const saved = localStorage.getItem("crunchy_volunteerables");
        const list = saved ? JSON.parse(saved) : [];
        if (!list.some((v: any) => v.discordId === cleanId)) {
          list.push({ discordId: cleanId, addedAt, addedBy });
          localStorage.setItem("crunchy_volunteerables", JSON.stringify(list));
        }

        // Sim sync user roles in local simulation
        const usersSaved = localStorage.getItem("crunchy_users");
        if (usersSaved) {
          const users = JSON.parse(usersSaved);
          let updated = false;
          users.forEach((u: any) => {
            if (u.uid === `sim-discord-${cleanId}` || u.discordId === cleanId) {
              u.role = "Volunteer Theater";
              updated = true;
            }
          });
          if (updated) {
            localStorage.setItem("crunchy_users", JSON.stringify(users));
          }
        }
      }

      setNewVolunteerId("");
      await fetchVolunteerables();
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Gagal menambahkan volunteer. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveVolunteer = async (cleanId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Delete on bot server backend
      let deletedFromBackend = false;
      try {
        const res = await signedFetch(`${apiEndpoint}/api/volunteerables/${cleanId}`, {
          method: "DELETE",
          sensitive: true
        });
        if (res.ok) {
          deletedFromBackend = true;
        }
      } catch (err) {
        console.warn("Gagal terhubung ke API backend bot untuk hapus volunteer:", err);
      }

      // 3. Fallback/simulation write to localStorage if not saved to backend
      if (!deletedFromBackend && (!isFirebaseConfigured || !db)) {
        const saved = localStorage.getItem("crunchy_volunteerables");
        if (saved) {
          let list = JSON.parse(saved);
          list = list.filter((v: any) => v.discordId !== cleanId);
          localStorage.setItem("crunchy_volunteerables", JSON.stringify(list));
        }

        if (cleanId !== "661135501226672129" && cleanId !== "1410583272173600819") {
          const usersSaved = localStorage.getItem("crunchy_users");
          if (usersSaved) {
            const users = JSON.parse(usersSaved);
            let updated = false;
            users.forEach((u: any) => {
              if (u.uid === `sim-discord-${cleanId}` || u.discordId === cleanId) {
                u.role = "Penonton Teater";
                updated = true;
              }
            });
            if (updated) {
              localStorage.setItem("crunchy_users", JSON.stringify(users));
            }
          }
        }
      }

      await fetchVolunteerables();
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Gagal menghapus volunteer.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    volunteersList,
    newVolunteerId,
    setNewVolunteerId,
    fetchVolunteerables,
    handleAddVolunteer,
    handleRemoveVolunteer
  };
}

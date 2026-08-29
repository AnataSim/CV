import { useState, useCallback } from "react";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
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
        querySnapshot.forEach((docSnap) => {
          list.push({
            discordId: docSnap.id,
            ...docSnap.data()
          });
        });
      } catch (err) {
        console.error("Gagal mengambil daftar volunteerables dari Firestore:", err);
      }
    }

    if (list.length === 0 && !fetchedFromBackend && (!isFirebaseConfigured || !db)) {
      const saved = localStorage.getItem("crunchy_volunteerables");
      if (saved) {
        try {
          list = JSON.parse(saved);
        } catch (e) {}
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
      const addedBy = currentUser?.email || "Sim";

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

      // 2. Direct write to Firestore
      if (isFirebaseConfigured && db) {
        try {
          const item = { discordId: cleanId, addedAt, addedBy };
          await withTimeout(setDoc(doc(db, "volunteerables", cleanId), item));

          const targetUserKey = `sim-discord-${cleanId}`;
          const userRef = doc(db, "users", targetUserKey);
          const userSnap = await withTimeout(getDoc(userRef)).catch(() => null);
          if (userSnap && userSnap.exists()) {
            await withTimeout(updateDoc(userRef, { role: "Volunteer Theater" }));
          } else {
            await withTimeout(setDoc(userRef, {
              uid: targetUserKey,
              name: `Volunteer (${cleanId})`,
              role: "Volunteer Theater",
              discordId: cleanId,
              cv: 0,
              points: 0
            }));
          }
        } catch (dbErr: any) {
          console.warn("⚠️ Firestore write volunteerable notice:", dbErr.message);
        }
      }

      // 3. LocalStorage fallback
      const saved = localStorage.getItem("crunchy_volunteerables");
      const list = saved ? JSON.parse(saved) : [];
      if (!list.some((v: any) => v.discordId === cleanId)) {
        list.push({ discordId: cleanId, addedAt, addedBy });
        localStorage.setItem("crunchy_volunteerables", JSON.stringify(list));
      }

      const usersSaved = localStorage.getItem("crunchy_users");
      if (usersSaved) {
        try {
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
        } catch (e) {}
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

      // 2. Direct delete from Firestore
      if (isFirebaseConfigured && db) {
        try {
          await withTimeout(deleteDoc(doc(db, "volunteerables", cleanId)));
          if (cleanId !== "661135501226672129" && cleanId !== "1410583272173600819") {
            const targetUserKey = `sim-discord-${cleanId}`;
            const userRef = doc(db, "users", targetUserKey);
            const userSnap = await withTimeout(getDoc(userRef)).catch(() => null);
            if (userSnap && userSnap.exists()) {
              await withTimeout(updateDoc(userRef, { role: "Penonton Teater" }));
            }
          }
        } catch (dbErr: any) {
          console.warn("⚠️ Firestore delete volunteerable notice:", dbErr.message);
        }
      }

      // 3. LocalStorage fallback
      const saved = localStorage.getItem("crunchy_volunteerables");
      if (saved) {
        try {
          let list = JSON.parse(saved);
          list = list.filter((v: any) => v.discordId !== cleanId);
          localStorage.setItem("crunchy_volunteerables", JSON.stringify(list));
        } catch (e) {}
      }

      if (cleanId !== "661135501226672129" && cleanId !== "1410583272173600819") {
        const usersSaved = localStorage.getItem("crunchy_users");
        if (usersSaved) {
          try {
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
          } catch (e) {}
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

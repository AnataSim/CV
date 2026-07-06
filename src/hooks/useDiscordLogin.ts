import { useState } from "react";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface UseDiscordLoginProps {
  onSuccess: (user: any, role: string, name: string, avatarUrl?: string | null) => void;
  onClose: () => void;
}

export function useDiscordLogin({ onSuccess, onClose }: UseDiscordLoginProps) {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleDiscordLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    
    // Set up message listener for popup communication
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === "DISCORD_LOGIN_SUCCESS") {
        window.removeEventListener("message", handleMessage);
        const { id, username, global_name, avatar } = event.data.profile;
        
        try {
          const discordName = global_name || username;
          
          // Run the volunteer status check in parallel with signInAnonymously if firebase is configured
          const volunteerablePromise = (async () => {
            let isVol = false;
            if (isFirebaseConfigured && db) {
              try {
                const volDoc = await getDoc(doc(db, "volunteerables", id));
                if (volDoc.exists()) {
                  isVol = true;
                }
              } catch (e) {
                console.warn("Gagal fetch volunteerable status in login popup:", e);
              }
            }

            // Fallback: Check local Bot API
            if (!isVol) {
              try {
                const backendUrl = localStorage.getItem("crunchy_backend_url") || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";
                const res = await fetch(`${backendUrl}/api/volunteerables/${id}`);
                if (res.ok) {
                  const data = await res.json();
                  if (data && data.isVolunteerable) {
                    isVol = true;
                  }
                }
              } catch (e) {
                console.warn("Gagal fetch volunteerable dari backend API:", e);
              }
            }
            return isVol;
          })();

          const isDiscordAdmin = id === "661135501226672129" || id === "1410583272173600819";
          const resolvedName = discordName;
          
          if (isFirebaseConfigured && auth && db) {
            try {
              // Log in Firebase Auth using Anonymous auth so we get a real firebase UID
              const authPromise = signInAnonymously(auth);
              const [userCredential, isVolunteerable] = await Promise.all([authPromise, volunteerablePromise]);
              const firebaseUser = userCredential.user;
              
              let resolvedRole: string = (isDiscordAdmin || isVolunteerable) ? "Volunteer Theater" : "Penonton Teater";
              if (id === "588988763204616214") {
                resolvedRole = "Ketua Kerupuk";
              } else if (id === "331053654318776320") {
                resolvedRole = "Ketua Keripik";
              }

              // Cache user profile immediately in localStorage to enable instant load/refresh
              const cachedProfile = {
                uid: firebaseUser.uid,
                name: resolvedName,
                role: resolvedRole,
                avatar: avatar,
                discordId: id,
                cachedAt: Date.now()
              };
              localStorage.setItem(`crunchy_profile_${firebaseUser.uid}`, JSON.stringify(cachedProfile));
              
              // Save profile details to Firestore in the background (non-blocking)
              try {
                const userDocRef = doc(db, "users", firebaseUser.uid);
                setDoc(userDocRef, {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || `discord-${username}@crunchyverse.com`,
                  name: resolvedName,
                  role: resolvedRole,
                  avatar: avatar,
                  discordId: id
                }).catch(fsErr => {
                  console.warn("⚠️ Firestore write failed in background:", fsErr);
                });
                console.log("🔥 Triggered Firestore user profile save in background:", resolvedName);
              } catch (fsErr) {
                console.warn("⚠️ Error setting up Firestore write:", fsErr);
              }
              
              onSuccess(firebaseUser, resolvedRole, resolvedName, avatar);
            } catch (firebaseErr: any) {
              console.warn("⚠️ Firebase Anonymous Auth failed, falling back to local simulation session:", firebaseErr);
              const isVolunteerable = await volunteerablePromise;
              let resolvedRole: string = (isDiscordAdmin || isVolunteerable) ? "Volunteer Theater" : "Penonton Teater";
              if (id === "588988763204616214") {
                resolvedRole = "Ketua Kerupuk";
              } else if (id === "331053654318776320") {
                resolvedRole = "Ketua Keripik";
              }

              // Fallback to local simulation session when anonymous sign-in is disabled or restricted
              const mockUser = {
                uid: `sim-discord-${id}`,
                email: `discord-${username}@crunchyverse.com`,
                name: resolvedName,
                role: resolvedRole,
                avatar: avatar,
                discordId: id
              };
              
              // Cache profile in localStorage
              localStorage.setItem(`crunchy_profile_${mockUser.uid}`, JSON.stringify({
                uid: mockUser.uid,
                name: resolvedName,
                role: resolvedRole,
                avatar: avatar,
                discordId: id,
                cachedAt: Date.now()
              }));

              // Sync mock user to local storage users database
              try {
                const users = JSON.parse(localStorage.getItem("crunchy_users") || "[]");
                const existingIndex = users.findIndex((u: any) => u.uid === mockUser.uid);
                if (existingIndex > -1) {
                  users[existingIndex] = { ...users[existingIndex], ...mockUser };
                } else {
                  users.push(mockUser);
                }
                localStorage.setItem("crunchy_users", JSON.stringify(users));
              } catch (e) {
                console.error("Gagal sync user ke local storage:", e);
              }

              onSuccess(mockUser, resolvedRole, resolvedName, avatar);
            }
          } else {
            // Local simulation session
            const isVolunteerable = await volunteerablePromise;
            let resolvedRole: string = (isDiscordAdmin || isVolunteerable) ? "Volunteer Theater" : "Penonton Teater";
            if (id === "588988763204616214") {
              resolvedRole = "Ketua Kerupuk";
            } else if (id === "331053654318776320") {
              resolvedRole = "Ketua Keripik";
            }

            const mockUser = {
              uid: `sim-discord-${id}`,
              email: `discord-${username}@crunchyverse.com`,
              name: resolvedName,
              role: resolvedRole,
              avatar: avatar,
              discordId: id
            };

            // Cache profile in localStorage
            localStorage.setItem(`crunchy_profile_${mockUser.uid}`, JSON.stringify({
              uid: mockUser.uid,
              name: resolvedName,
              role: resolvedRole,
              avatar: avatar,
              discordId: id,
              cachedAt: Date.now()
            }));

            // Sync mock user to local storage users database
            try {
              const users = JSON.parse(localStorage.getItem("crunchy_users") || "[]");
              const existingIndex = users.findIndex((u: any) => u.uid === mockUser.uid);
              if (existingIndex > -1) {
                users[existingIndex] = { ...users[existingIndex], ...mockUser };
              } else {
                users.push(mockUser);
              }
              localStorage.setItem("crunchy_users", JSON.stringify(users));
            } catch (e) {
              console.error("Gagal sync user ke local storage:", e);
            }

            onSuccess(mockUser, resolvedRole, resolvedName, avatar);
          }
          onClose();
        } catch (err: any) {
          setAuthError(err.message || "Gagal masuk dengan Discord.");
        } finally {
          setAuthLoading(false);
        }
      }
    };
    
    window.addEventListener("message", handleMessage);
    
    // Auto-cleanup listener after 5 minutes to prevent memory leaks
    setTimeout(() => {
      window.removeEventListener("message", handleMessage);
    }, 300000);

    try {
      const backendUrl = localStorage.getItem("crunchy_backend_url") || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";
      const popupUrl = `${backendUrl}/api/oauth/link?state=frontend_login`;
      
      // Calculate popup center position
      const width = 500;
      const height = 800;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        popupUrl,
        "DiscordLoginPopup",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );
      
      if (!popup) {
        throw new Error("Popup diblokir oleh browser. Harap izinkan popup untuk CrunchyVerse.");
      }
    } catch (err: any) {
      window.removeEventListener("message", handleMessage);
      setAuthError(err.message || "Gagal membuka jendela login Discord.");
      setAuthLoading(false);
    }
  };

  return {
    authLoading,
    authError,
    setAuthError,
    handleDiscordLogin
  };
}

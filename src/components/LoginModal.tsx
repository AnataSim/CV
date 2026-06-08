"use client";

import React, { useState } from "react";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any, role: string, name: string, avatarUrl?: string | null) => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Discord Login Handler
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
          
          // Check if discordId is in volunteerables collection
          let isVolunteerable = false;
          if (isFirebaseConfigured && db) {
            try {
              const volDoc = await getDoc(doc(db, "volunteerables", id));
              if (volDoc.exists()) {
                isVolunteerable = true;
              }
            } catch (e) {
              console.warn("Gagal fetch volunteerable status in login popup:", e);
            }
          }

          // Fallback: Check local Bot API
          if (!isVolunteerable) {
            try {
              const backendUrl = localStorage.getItem("crunchy_backend_url") || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";
              const res = await fetch(`${backendUrl}/api/volunteerables/${id}`);
              if (res.ok) {
                const data = await res.json();
                if (data && data.isVolunteerable) {
                  isVolunteerable = true;
                }
              }
            } catch (e) {
              console.warn("Gagal fetch volunteerable dari backend API:", e);
            }
          }

          const isDiscordAdmin = id === "661135501226672129" || id === "1410583272173600819";
          let resolvedRole: string = (isDiscordAdmin || isVolunteerable) ? "Volunteer Theater" : "Penonton Teater";
          
          if (id === "588988763204616214") {
            resolvedRole = "Ketua Kerupuk";
          } else if (id === "331053654318776320") {
            resolvedRole = "Ketua Keripik";
          }

          const resolvedName = discordName;
          
          if (isFirebaseConfigured && auth) {
            try {
              // Log in Firebase Auth using Anonymous auth so we get a real firebase UID
              const userCredential = await signInAnonymously(auth);
              const firebaseUser = userCredential.user;
              
              // Save profile details to Firestore users document so onAuthStateChanged can load it on next refresh!
              try {
                const userDocRef = doc(db, "users", firebaseUser.uid);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500));
                const setDocPromise = setDoc(userDocRef, {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || `discord-${username}@crunchyverse.com`,
                  name: resolvedName,
                  role: resolvedRole,
                  avatar: avatar,
                  discordId: id
                });
                await Promise.race([setDocPromise, timeoutPromise]);
                console.log("🔥 Saved Discord user profile to Firestore:", resolvedName);
              } catch (fsErr) {
                console.warn("⚠️ Firestore unreachable during Discord login, proceeding with local session:", fsErr);
              }
              
              onSuccess(firebaseUser, resolvedRole, resolvedName, avatar);
            } catch (firebaseErr: any) {
              console.warn("⚠️ Firebase Anonymous Auth failed, falling back to local simulation session:", firebaseErr);
              // Fallback to local simulation session when anonymous sign-in is disabled or restricted
              const mockUser = {
                uid: `sim-discord-${id}`,
                email: `discord-${username}@crunchyverse.com`,
                name: resolvedName,
                role: resolvedRole,
                avatar: avatar,
                discordId: id
              };
              
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
            const mockUser = {
              uid: `sim-discord-${id}`,
              email: `discord-${username}@crunchyverse.com`,
              name: resolvedName,
              role: resolvedRole,
              avatar: avatar,
              discordId: id
            };

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      window.removeEventListener("message", handleMessage);
      setAuthError(err.message || "Gagal membuka jendela login Discord.");
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theater-black/90 backdrop-blur-md animate-fade-in">
      <div className="bg-neutral-950 border-2 border-theater-gold/60 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
        {/* Theatrical gold ticket banner grid */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-theater-gold via-yellow-200 to-theater-gold" />
        
        {/* Ticket Box side cutouts */}
        <div className="absolute top-1/2 -left-4 h-8 w-8 rounded-full bg-theater-black border border-neutral-900 -translate-y-1/2 pointer-events-none" />
        <div className="absolute top-1/2 -right-4 h-8 w-8 rounded-full bg-theater-black border border-neutral-900 -translate-y-1/2 pointer-events-none" />

        <div className="text-center mb-6">
          <span className="rounded-full border border-theater-gold/20 bg-theater-gold/10 px-3 py-1 text-[10px] font-black text-theater-gold tracking-widest uppercase inline-block mb-2">
            CRUNCHYVERSE BOX OFFICE
          </span>
          <h3 className="font-display text-2xl font-black text-white tracking-wider uppercase">LOKET TIKET TEATER</h3>
        </div>

        {/* ERROR DISPLAYER */}
        {authError && (
          <div className="p-3 bg-theater-red-dark/40 border border-theater-red/30 text-xs font-medium text-red-300 rounded-xl text-left mb-5 animate-fade-in">
            ⚠️ {authError}
          </div>
        )}

        <div className="space-y-6">
          <p className="text-center text-xs text-neutral-400 leading-relaxed">
            Untuk mengakses teater CrunchyVerse, silakan lakukan autentikasi menggunakan akun Discord Anda.
          </p>

          <button
            type="button"
            onClick={handleDiscordLogin}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] border border-[#5865F2] hover:border-[#4752C4] py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all shadow-lg hover:shadow-xl shadow-neutral-950 active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            {authLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-3 w-3 border-2 border-white/50 border-t-white" />
                <span>Menyambungkan...</span>
              </span>
            ) : (
              <>
                <svg className="h-5 w-5 fill-current" viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.4-5c.87-.64,1.71-1.32,2.51-2a75.7,75.7,0,0,0,72.72,0c.8,0.7,1.64,1.38,2.51,2a68.43,68.43,0,0,1-10.4,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.24,124,25.43,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
                </svg>
                <span>Masuk dengan Discord</span>
              </>
            )}
          </button>
        </div>

        <button 
          onClick={onClose}
          className="mt-6 w-full text-center text-xs font-semibold text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors"
        >
          Kembali ke Lobi
        </button>
      </div>
    </div>
  );
}

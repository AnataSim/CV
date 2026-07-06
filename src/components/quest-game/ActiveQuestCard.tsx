import React from "react";
import { Camera, UploadCloud } from "lucide-react";

interface Quest {
  id: string;
  akt: string;
  title: string;
  description: string;
  difficulty: "Mudah" | "Sedang" | "Sulit" | "Legendaris";
  points: number;
  roleName?: string;
  roleColor?: string;
}

interface ActiveQuestCardProps {
  quest: Quest;
  questStatus: string;
  mediaFile: File | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmitMedia: (quest: Quest) => void;
  uploadStatus: string | null;
  isUploading: boolean;
  setActiveQuestId: (id: string | null) => void;
  setMediaFile: (file: File | null) => void;
  setUploadStatus: (status: string | null) => void;
  rotate: number;
}

export default function ActiveQuestCard({
  quest,
  questStatus,
  mediaFile,
  handleFileChange,
  handleSubmitMedia,
  uploadStatus,
  isUploading,
  setActiveQuestId,
  setMediaFile,
  setUploadStatus,
  rotate
}: ActiveQuestCardProps) {
  return (
    <div
      className="absolute border-2 border-theater-gold bg-gradient-to-br from-neutral-950 via-[#120204] to-neutral-950 rounded-3xl p-4 md:p-5 shadow-2xl flex flex-col justify-between items-center text-center animate-active-card-pop pointer-events-auto"
      style={{
        left: "50%",
        width: "calc(100vw - 32px)",
        maxWidth: "340px",
        height: "var(--active-card-height, 380px)",
        bottom: "var(--active-card-bottom, 100px)",
        marginLeft: "calc(min(340px, 100vw - 32px) / -2)",
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

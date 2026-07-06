import React from "react";
import { Sparkle, HelpCircle } from "lucide-react";
import ActiveQuestCard from "./ActiveQuestCard";

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

interface CardHandProps {
  dealt: boolean;
  dealtQuests: Quest[];
  cardStatuses: Record<string, string>;
  cardFlipped: Record<string, boolean>;
  activeQuestId: string | null;
  setActiveQuestId: (id: string | null) => void;
  handleDealCards: () => void;
  handleCardClick: (id: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmitMedia: (quest: Quest) => void;
  mediaFile: File | null;
  setMediaFile: (file: File | null) => void;
  uploadStatus: string | null;
  setUploadStatus: (status: string | null) => void;
  isUploading: boolean;
}

export default function CardHand({
  dealt,
  dealtQuests,
  cardStatuses,
  cardFlipped,
  activeQuestId,
  setActiveQuestId,
  handleDealCards,
  handleCardClick,
  handleFileChange,
  handleSubmitMedia,
  mediaFile,
  setMediaFile,
  uploadStatus,
  setUploadStatus,
  isUploading
}: CardHandProps) {
  // Visual 3D Card Deck Stack (Uno Style, Top-Left below Clock)
  const renderDeck = () => (
    <div className="absolute top-24 left-16 md:left-24 z-20 flex flex-col items-center gap-2">
      <div 
        onClick={handleDealCards}
        className="relative w-28 h-36 md:w-36 md:h-48 cursor-pointer group select-none"
        title={dealt ? "Klik untuk kocok ulang kartu" : "Klik untuk mengambil kartu"}
      >
        {/* 5 Layered 3D Cards Stack (Bottom to Top) */}
        <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] md:translate-x-[10px] md:translate-y-[10px] rounded-2xl border border-neutral-950 bg-neutral-950/80 shadow-sm transition-all" />
        <div className="absolute inset-0 translate-x-[5px] translate-y-[5px] md:translate-x-[8px] md:translate-y-[8px] rounded-2xl border border-neutral-900 bg-neutral-950/90 shadow-sm transition-all" />
        <div className="absolute inset-0 translate-x-[4px] translate-y-[4px] md:translate-x-[6px] md:translate-y-[6px] rounded-2xl border border-neutral-900 bg-neutral-900 shadow-sm transition-all" />
        <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] md:translate-x-[4px] md:translate-y-[4px] rounded-2xl border border-neutral-850 bg-neutral-900/95 shadow-sm transition-all" />
        <div className="absolute inset-0 translate-x-[2px] translate-y-[2px] rounded-2xl border border-neutral-800 bg-neutral-900 shadow-md transition-all" />
        
        {/* Top Glowing Card */}
        <div className="absolute inset-0 rounded-2xl border border-theater-gold/30 group-hover:border-theater-gold bg-gradient-to-br from-neutral-950 to-neutral-900 shadow-xl flex flex-col items-center justify-center p-2 md:p-3.5 transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-theater-gold/20">
          <div className="h-7 w-7 md:h-10 md:w-10 rounded-full border border-theater-gold/15 bg-theater-gold/5 flex items-center justify-center text-theater-gold/45 mb-1.5 md:mb-2.5 group-hover:text-theater-gold group-hover:border-theater-gold/30 transition-all">
            <Sparkle size={12} className="animate-pulse md:scale-100 scale-90" />
          </div>
          <span className="text-[7.5px] md:text-[9px] font-black text-theater-gold/80 group-hover:text-theater-gold tracking-widest uppercase text-center leading-none">
            KARTU DECK
          </span>
          <span className="text-[5.5px] md:text-[6.5px] text-neutral-500 font-bold uppercase tracking-tighter mt-1.5 group-hover:text-neutral-400">
            {dealt ? "KOCOK ULANG" : "AMBIL KARTU"}
          </span>
        </div>
      </div>
    </div>
  );

  const visibleQuests = dealtQuests.filter(q => cardStatuses[q.id] !== "Completed");
  const count = visibleQuests.length;

  return (
    <>
      {renderDeck()}

      <div className="flex-1 w-full flex items-center justify-center relative">
        {!dealt && (
          /* DEALT IS FALSE: Draw Instructions */
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm select-none z-10 bg-neutral-950/40 border border-neutral-900/40 rounded-3xl backdrop-blur-sm shadow-xl mt-32 md:mt-0">
            <div className="h-12 w-12 rounded-full border border-dashed border-neutral-700 flex items-center justify-center text-neutral-500 mb-4 animate-pulse">
              <HelpCircle size={18} />
            </div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2">Tarik Kartu Anda</h3>
            <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
              Silakan klik tumpukan kartu di sebelah kiri untuk mengambil 5 kartu tantangan teater!
            </p>
          </div>
        )}
      </div>

      {dealt && (() => {
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
            className={`absolute inset-x-0 select-none flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
              activeQuestId === null ? "bottom-[160px] z-10" : "bottom-6 z-40"
            }`}
          >
            <div className="relative flex items-center justify-center w-full max-w-[480px] h-52 overflow-visible">
              {(() => {
                let newCardIdx = 0;
                return visibleQuests.map((quest, idx) => {
                  const isFlippedToFront = !!cardFlipped[quest.id] || (cardStatuses[quest.id] && cardStatuses[quest.id] !== "active");
                  const isActive = activeQuestId === quest.id;
                  const isAnyActive = activeQuestId !== null;

                  // Check if card is newly drawn
                  const isNewCard = !dealtQuests.some(oldQ => oldQ.id === quest.id);
                  const delay = "0s";

                  // Fanning calculations
                  const offset = idx - (count - 1) / 2;
                  const rotate = offset * 6;
                  const translateY = Math.abs(offset) * 6;
                  const cardWidth = 120;
                  const spacing = 62;

                  if (isActive) {
                    const questStatus = cardStatuses[quest.id] || "active";
                    return (
                      <ActiveQuestCard
                        key={quest.id || idx}
                        quest={quest}
                        questStatus={questStatus}
                        mediaFile={mediaFile}
                        handleFileChange={handleFileChange}
                        handleSubmitMedia={handleSubmitMedia}
                        uploadStatus={uploadStatus}
                        isUploading={isUploading}
                        setActiveQuestId={setActiveQuestId}
                        setMediaFile={setMediaFile}
                        setUploadStatus={setUploadStatus}
                        rotate={rotate}
                      />
                    );
                  }

                  return (
                    <div
                      key={quest.id || idx}
                      onClick={() => handleCardClick(quest.id)}
                      className={`absolute w-[120px] h-[176px] card-perspective rounded-2xl border cursor-pointer shadow-lg transform shrink-0 fanned-card ${
                        isNewCard ? "animate-deal-uno" : ""
                      } ${
                        isAnyActive
                          ? "border-theater-gold/10 opacity-40 pointer-events-none"
                          : "border-theater-gold/20"
                      }`}
                      style={{
                        left: "50%",
                        marginLeft: `${offset * spacing - (cardWidth / 2)}px`,
                        transform: `translate3d(0, ${translateY}px, 0) rotate(${rotate}deg)`,
                        zIndex: idx + 10,
                        "--rot": `${rotate}deg`,
                        "--ty": `${translateY}px`,
                        "--delay": delay
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
                });
              })()}
            </div>
          </div>
        );
      })()}
    </>
  );
}

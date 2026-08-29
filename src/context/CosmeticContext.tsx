"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

interface CosmeticContextType {
  getCursorPalette: () => string[];
  setCursorPalette: (palette: string[]) => void;
}

const defaultPalette = ['#d4af37', '#e51a2d', '#ffd700', '#ff4d4d', '#ffaa00'];

const CosmeticContext = createContext<CosmeticContextType>({
  getCursorPalette: () => defaultPalette,
  setCursorPalette: () => {},
});

export const CosmeticProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [palette, setPalette] = useState<string[]>(defaultPalette);

  const getCursorPalette = useCallback(() => palette, [palette]);
  const setCursorPalette = useCallback((newPalette: string[]) => setPalette(newPalette), []);

  return (
    <CosmeticContext.Provider value={{ getCursorPalette, setCursorPalette }}>
      {children}
    </CosmeticContext.Provider>
  );
};

export const useCosmetics = () => useContext(CosmeticContext);

// ──────────────────────────────────────────────
// SoundManager — Lightweight Minecraft-style
// click sounds + optional ambient music toggle.
// Uses native Audio API — no external libraries.
// ──────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

// Tiny click sound as base64 WAV (~1.5KB)
// This is a short, subtle "click" sound reminiscent of Minecraft UI
const CLICK_SOUND_B64 =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem("cc_sound");
    return stored !== "off";
  });

  const [musicEnabled, setMusicEnabled] = useState(() => {
    const stored = localStorage.getItem("cc_music");
    return stored === "on";
  });

  const clickAudio = useRef(null);

  useEffect(() => {
    clickAudio.current = new Audio(CLICK_SOUND_B64);
    clickAudio.current.volume = 0.3;
  }, []);

  const playClick = useCallback(() => {
    if (!soundEnabled || !clickAudio.current) return;
    try {
      clickAudio.current.currentTime = 0;
      clickAudio.current.play().catch(() => {});
    } catch {
      // Ignore audio errors
    }
  }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("cc_sound", next ? "on" : "off");
      return next;
    });
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("cc_music", next ? "on" : "off");
      return next;
    });
  }, []);

  const value = {
    soundEnabled,
    musicEnabled,
    playClick,
    toggleSound,
    toggleMusic,
  };

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    // Return a no-op if used outside provider (safety)
    return {
      soundEnabled: false,
      musicEnabled: false,
      playClick: () => {},
      toggleSound: () => {},
      toggleMusic: () => {},
    };
  }
  return ctx;
}

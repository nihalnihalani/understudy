// Fetches the pinned Gemini model IDs from /healthz once per session.
//
// Single source of truth for model strings is understudy/models.py — the
// frontend never embeds model literals (CLAUDE.md invariant #1). This hook
// memoizes the response module-level so every component that needs the
// pins shares a single in-flight fetch.

import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { GeminiModelPins } from "@/api/types";

let cached: GeminiModelPins | null = null;
let inFlight: Promise<GeminiModelPins> | null = null;

function ensureFetched(): Promise<GeminiModelPins> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = api
    .health()
    .then((h) => {
      cached = h.models;
      return h.models;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export function useGeminiModels(): GeminiModelPins | null {
  const [models, setModels] = useState<GeminiModelPins | null>(cached);
  useEffect(() => {
    if (models) return;
    let cancelled = false;
    ensureFetched()
      .then((m) => !cancelled && setModels(m))
      .catch(() => {
        // Silent: HUD falls back to "—" placeholders if /healthz is down.
      });
    return () => {
      cancelled = true;
    };
  }, [models]);
  return models;
}

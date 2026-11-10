import type { StationId } from "@/src/domain/types";

export interface UiPrefs {
  selectedStationId: StationId | null;
  view: "3d" | "map";
}

const KEY = "linkr-factory-ui-v1";

const EMPTY: UiPrefs = { selectedStationId: null, view: "3d" };

/**
 * Client preference port. This stores view choices only.
 * Jobs, resources, and workflow progress live in FactoryRepository on the server
 * so they survive a closed browser. A later Supabase-backed repository can
 * replace that server store without changing this interface.
 */
export interface ClientPreferenceStore {
  load(): UiPrefs;
  save(prefs: UiPrefs): void;
}

export const browserPreferenceStore: ClientPreferenceStore = {
  load() {
    if (typeof window === "undefined") return EMPTY;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw) as Partial<UiPrefs>;
      return {
        selectedStationId: parsed.selectedStationId ?? null,
        view: parsed.view === "map" ? "map" : "3d",
      };
    } catch {
      return EMPTY;
    }
  },
  save(prefs) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  },
};

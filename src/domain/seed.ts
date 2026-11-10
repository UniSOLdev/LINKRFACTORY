import { MISSION_DEFS } from "@/src/domain/catalog";
import { RESOURCE_IDS, STATION_IDS, type FactoryState, type StationId } from "@/src/domain/types";

const UNBUILT = new Set<StationId>(["outreach", "crm"]);

export function initialFactory(): FactoryState {
  return {
    stations: STATION_IDS.map((id) => ({
      id,
      built: !UNBUILT.has(id),
      level: 1,
      config: { mode: "simulation-only", shift: "day" },
    })),
    resources: RESOURCE_IDS.map((id) => ({
      id,
      amount: id === "productionCapacity" ? 1 : 0,
      simulation: true as const,
      verified: false as const,
    })),
    missions: MISSION_DEFS.map((mission) => ({
      id: mission.id,
      completedAt: null,
      evidenceJobId: null,
    })),
    lead: null,
    workflow: { id: null, status: "idle" },
  };
}

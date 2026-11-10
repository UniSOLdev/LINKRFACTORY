import type { StationId } from "@/src/domain/types";

export const STATION_POSITIONS: Record<StationId, [number, number, number]> = {
  intake: [-3.7, 0, -2.2],
  research: [-0.65, 0, -2.2],
  qualification: [2.45, 0, -2.2],
  creative: [5.5, 0, -2.2],
  outreach: [-3.7, 0, 2.2],
  crm: [-0.65, 0, 2.2],
  delivery: [2.45, 0, 2.2],
  approval: [5.5, 0, 2.2],
};

export const BELT_POINTS: Record<StationId, [number, number, number]> = {
  intake: [-3.7, 0.55, -1.25],
  research: [-0.65, 0.55, -1.25],
  qualification: [2.45, 0.55, -1.25],
  creative: [5.5, 0.55, -1.25],
  outreach: [-3.7, 0.55, 1.25],
  crm: [-0.65, 0.55, 1.25],
  delivery: [2.45, 0.55, 1.25],
  approval: [5.5, 0.55, 1.25],
};

export const MAIN_CHAIN: StationId[] = [
  "intake",
  "research",
  "qualification",
  "creative",
  "approval",
  "delivery",
];

export const CONVEYOR_LINKS: Array<[StationId, StationId]> = [
  ["intake", "research"],
  ["research", "qualification"],
  ["qualification", "creative"],
  ["creative", "approval"],
  ["approval", "delivery"],
  ["intake", "outreach"],
  ["research", "crm"],
];

export function leadWorldPosition(stationId: StationId, progress: number): [number, number, number] {
  const index = MAIN_CHAIN.indexOf(stationId);
  const dest = BELT_POINTS[stationId];
  const clamped = Math.max(0, Math.min(1, progress));
  if (index < 0) return dest;
  const origin =
    index === 0
      ? ([dest[0] - 3.4, dest[1], dest[2]] as [number, number, number])
      : BELT_POINTS[MAIN_CHAIN[index - 1]];
  return [
    origin[0] + (dest[0] - origin[0]) * clamped,
    origin[1] + (dest[1] - origin[1]) * clamped,
    origin[2] + (dest[2] - origin[2]) * clamped,
  ];
}

export function mapPercent(x: number, z: number): { left: number; top: number } {
  return {
    left: ((x - -10) / 20) * 100,
    top: ((z - -8) / 16) * 100,
  };
}

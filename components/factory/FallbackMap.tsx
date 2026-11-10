"use client";

import { CONVEYOR_LINKS, BELT_POINTS, leadWorldPosition, mapPercent, STATION_POSITIONS } from "@/src/domain/layout";
import type { FactorySnapshot } from "@/src/domain/derive";
import type { StationId } from "@/src/domain/types";
import { STATUS_HEX, STATUS_LABEL } from "@/lib/format";

export function FallbackMap({
  snapshot,
  selectedId,
  onSelect,
  reason,
}: {
  snapshot: FactorySnapshot;
  selectedId: StationId | null;
  onSelect: (id: StationId | null) => void;
  reason: string;
}) {
  const lead = snapshot.lead;
  const leadPoint = lead ? leadWorldPosition(lead.stationId, lead.progress) : null;
  const leadPos = leadPoint ? mapPercent(leadPoint[0], leadPoint[2]) : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07060d]" data-testid="factory-map">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.16),transparent_55%)]" />
      <p className="absolute left-3 top-3 z-10 max-w-sm text-xs text-slate-400">{reason}</p>
      <div className="absolute inset-3 top-10 sm:inset-6 sm:top-12">
        <div className="relative h-full w-full" onClick={() => onSelect(null)}>
          {CONVEYOR_LINKS.map(([from, to]) => {
            const a = BELT_POINTS[from];
            const b = BELT_POINTS[to];
            const start = mapPercent(a[0], a[2]);
            const end = mapPercent(b[0], b[2]);
            const horizontal = Math.abs(a[0] - b[0]) >= Math.abs(a[2] - b[2]);
            return (
              <div
                key={`${from}-${to}`}
                className="belt-flow absolute rounded-full opacity-80"
                style={{
                  left: `${Math.min(start.left, end.left)}%`,
                  top: `${Math.min(start.top, end.top)}%`,
                  width: horizontal ? `${Math.max(Math.abs(end.left - start.left), 1)}%` : "1.4%",
                  height: horizontal ? "1.6%" : `${Math.max(Math.abs(end.top - start.top), 1)}%`,
                }}
              />
            );
          })}
          {snapshot.stations.map((station) => {
            const [x, , z] = STATION_POSITIONS[station.id];
            const pos = mapPercent(x, z);
            const selected = station.id === selectedId;
            return (
              <button
                key={station.id}
                type="button"
                data-testid={`building-${station.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(station.id);
                }}
                className="absolute w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-2 py-2 text-left shadow-panel sm:w-[14%]"
                style={{
                  left: `${pos.left}%`,
                  top: `${pos.top}%`,
                  background: station.built ? "#161222" : "transparent",
                  borderColor: selected ? "#C4B5FD" : station.built ? "#2A2340" : "#6D28D9",
                  boxShadow: selected ? "0 0 0 1px #C4B5FD" : undefined,
                }}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-white sm:text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_HEX[station.status] }} />
                  {station.shortName}
                </span>
                <span className="mt-1 hidden text-[10px] text-slate-400 sm:block">{STATUS_LABEL[station.status]}</span>
              </button>
            );
          })}
          {lead && leadPos && (
            <div
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[#1A1028]"
              style={{ left: `${leadPos.left}%`, top: `${leadPos.top}%` }}
              data-testid="lead-token"
            >
              {lead.name} · sim
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

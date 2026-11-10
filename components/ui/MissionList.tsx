import type { FactorySnapshot } from "@/src/domain/derive";

export function MissionList({ snapshot }: { snapshot: FactorySnapshot }) {
  return (
    <section className="flex flex-col gap-3 p-4" data-testid="missions">
      <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-slate-500">Missions</p>
      <ul className="space-y-2">
        {snapshot.missions.map((mission) => (
          <li key={mission.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2" data-testid={`mission-${mission.id}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{mission.title}</p>
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {mission.completedAt ? "Done" : "Open"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{mission.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

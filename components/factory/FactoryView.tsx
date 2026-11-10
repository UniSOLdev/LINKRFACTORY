"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import type { FactorySnapshot } from "@/src/domain/derive";
import type { StationId } from "@/src/domain/types";
import { FallbackMap } from "@/components/factory/FallbackMap";

const FactoryScene = dynamic(() => import("@/components/factory/FactoryScene").then((mod) => mod.FactoryScene), {
  ssr: false,
});

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onFail();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function FactoryView({
  snapshot,
  selectedId,
  receivedAt,
  view,
  onSelect,
}: {
  snapshot: FactorySnapshot;
  selectedId: StationId | null;
  receivedAt: number;
  view: "3d" | "map";
  onSelect: (id: StationId | null) => void;
}) {
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);

  useEffect(() => {
    setWebgl(detectWebGL());
    setReady(true);
  }, []);

  if (!ready) return <div className="h-full w-full bg-[#07060d]" />;

  const show3d = view === "3d" && webgl && !sceneFailed;
  if (!show3d) {
    const reason = !webgl || sceneFailed
      ? "WebGL is unavailable. This 2D floor uses the same jobs, selection, and simulation."
      : "2D floor map. The same machines and jobs are on the 3D view.";
    return <FallbackMap snapshot={snapshot} selectedId={selectedId} onSelect={onSelect} reason={reason} />;
  }

  return (
    <SceneBoundary onFail={() => setSceneFailed(true)}>
      <FactoryScene snapshot={snapshot} selectedId={selectedId} receivedAt={receivedAt} onSelect={onSelect} />
    </SceneBoundary>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { FactorySnapshot, StationView } from "@/src/domain/derive";
import { BELT_POINTS, CONVEYOR_LINKS, leadWorldPosition } from "@/src/domain/layout";
import type { StationId } from "@/src/domain/types";
import { STATUS_HEX } from "@/lib/format";

export function FactoryScene({
  snapshot,
  selectedId,
  receivedAt,
  onSelect,
}: {
  snapshot: FactorySnapshot;
  selectedId: StationId | null;
  receivedAt: number;
  onSelect: (id: StationId | null) => void;
}) {
  const [labels, setLabels] = useState<LabelPoint[]>([]);
  const publish = useRef(setLabels);
  publish.current = setLabels;
  return (
    <div className="relative h-full w-full">
    <Canvas
      camera={{ position: [7.4, 7.6, 7.2], fov: 42, near: 0.1, far: 200 }}
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#07060d"]} />
      <fog attach="fog" args={["#07060d", 42, 96]} />
      <hemisphereLight args={["#d6ccff", "#140e1c", 0.7]} />
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.85}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-8, 6, -4]} color="#7C3AED" intensity={18} distance={28} />
      <pointLight position={[8, 5, 6]} color="#C4B5FD" intensity={8} distance={22} />
      <FactoryFloor />
      {CONVEYOR_LINKS.map(([from, to]) => (
        <Conveyor
          key={`${from}-${to}`}
          from={BELT_POINTS[from]}
          to={BELT_POINTS[to]}
          hot={snapshot.stations.some((station) => (station.id === from || station.id === to) && station.status === "working")}
        />
      ))}
      <BeltCrate from={BELT_POINTS.intake} to={BELT_POINTS.creative} />
      {snapshot.stations.map((station) => (
        <Building key={station.id} station={station} selected={station.id === selectedId} onSelect={onSelect} />
      ))}
      <LeadToken lead={snapshot.lead} receivedAt={receivedAt} />
      <CameraRig />
      <LabelProjector stations={snapshot.stations} lead={snapshot.lead} receivedAt={receivedAt} publish={publish} />
    </Canvas>
    {labels.filter((label) => label.id !== "lead").map((label) => (
      <button
        key={label.id}
        type="button"
        data-testid={`building-${label.id}`}
        className="pointer-events-auto absolute z-10 min-h-11 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[#C4B5FD]/40 bg-black/80 px-3 text-sm font-medium tracking-tight text-white"
        style={{ left: label.x, top: label.y }}
        onClick={(event) => {
          event.stopPropagation();
          if (label.id !== "lead") onSelect(label.id);
        }}
      >
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: STATUS_HEX[label.status] }} />
        {label.name}
      </button>
    ))}
    {labels.filter((label) => label.id === "lead").map((label) => (
      <div
        key="lead"
        data-testid="lead-token"
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[10px] text-white"
        style={{ left: label.x, top: label.y }}
      >
        {label.name}
      </div>
    ))}
    </div>
  );
}

type LabelPoint = {
  id: StationId | "lead";
  name: string;
  status: StationView["status"];
  x: number;
  y: number;
};

function LabelProjector({
  stations,
  lead,
  receivedAt,
  publish,
}: {
  stations: StationView[];
  lead: FactorySnapshot["lead"];
  receivedAt: number;
  publish: { current: (labels: LabelPoint[]) => void };
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    const point = new THREE.Vector3();
    const project = () => {
      const next: LabelPoint[] = [];
      const place = (id: LabelPoint["id"], name: string, status: StationView["status"], world: [number, number, number]) => {
        point.set(world[0], world[1] + 0.45, world[2]);
        point.project(camera);
        const depth = point.z;
        const x = (point.x * 0.5 + 0.5) * size.width;
        const y = (-point.y * 0.5 + 0.5) * size.height;
        if (depth < -1 || depth > 1 || x < -80 || y < -40 || x > size.width + 80 || y > size.height + 40) return;
        next.push({ id, name, status, x, y });
      };
      for (const station of stations) {
        place(station.id, station.shortName, station.status, [station.position[0], 1.7, station.position[2]]);
      }
      if (lead) {
        const extra = lead.moving && lead.durationMs > 0 ? Date.now() - receivedAt : 0;
        const progress = lead.moving && lead.durationMs > 0 ? Math.min(1, lead.progress + extra / lead.durationMs) : lead.progress;
        const world = leadWorldPosition(lead.stationId, progress);
        place("lead", `${lead.name} · simulated`, "working", world);
      }
      publish.current(next);
    };
    project();
    const timer = window.setInterval(project, 250);
    window.addEventListener("linkr-zoom", project);
    window.addEventListener("linkr-camera-reset", project);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("linkr-zoom", project);
      window.removeEventListener("linkr-camera-reset", project);
    };
  }, [camera, lead, publish, receivedAt, size, stations]);
  return null;
}

function CameraRig() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const rig = () => {
      const controls = get().controls as {
        target: THREE.Vector3;
        update: () => void;
        object: THREE.Camera;
      } | null;
      return controls;
    };
    const zoom = (direction: number) => {
      const controls = rig();
      if (!controls) return;
      const offset = controls.object.position.clone().sub(controls.target);
      const next = Math.min(52, Math.max(8, offset.length() * (direction > 0 ? 0.82 : 1.16)));
      offset.setLength(next);
      controls.object.position.copy(controls.target).add(offset);
      controls.update();
    };
    const reset = () => {
      const controls = rig();
      if (!controls) return;
      controls.object.position.set(7.4, 7.6, 7.2);
      controls.target.set(0.8, 0, 0);
      controls.update();
    };
    const onZoom = (event: Event) => zoom((event as CustomEvent<number>).detail);
    window.addEventListener("linkr-zoom", onZoom);
    window.addEventListener("linkr-camera-reset", reset);
    reset();
    return () => {
      window.removeEventListener("linkr-zoom", onZoom);
      window.removeEventListener("linkr-camera-reset", reset);
    };
  }, [get]);

  return (
    <OrbitControls
      makeDefault
      enableDamping
      enablePan
      screenSpacePanning
      dampingFactor={0.12}
      minDistance={8}
      maxDistance={52}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2.15}
      target={[0.8, 0, 0]}
    />
  );
}

function FactoryFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[14, 72]} />
        <meshStandardMaterial color="#100e16" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[12.2, 12.45, 80]} />
        <meshBasicMaterial color="#7C3AED" transparent opacity={0.55} />
      </mesh>
      <gridHelper args={[28, 14, "#3a2a58", "#1a1524"]} position={[0, 0.03, 0]} />
    </group>
  );
}

function Conveyor({
  from,
  to,
  hot,
}: {
  from: [number, number, number];
  to: [number, number, number];
  hot: boolean;
}) {
  const texture = useMemo(() => makeBeltTexture(), []);
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  useFrame((_, delta) => {
    texture.offset.y = (texture.offset.y - delta * (hot ? 0.85 : 0.18)) % 1;
  });
  return (
    <group position={[(from[0] + to[0]) / 2, 0.16, (from[2] + to[2]) / 2]} rotation={[0, yaw, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[0.78, 0.1, Math.max(length - 0.2, 0.4)]} />
        <meshStandardMaterial color="#14101c" metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.56, Math.max(length - 0.4, 0.3)]} />
        <meshStandardMaterial map={texture} roughness={0.45} metalness={0.15} />
      </mesh>
    </group>
  );
}

function BeltCrate({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = (clock.elapsedTime * 0.08) % 1;
    mesh.position.set(from[0] + (to[0] - from[0]) * t, 0.42, from[2] + (to[2] - from[2]) * t);
  });
  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[0.28, 0.22, 0.28]} />
      <meshStandardMaterial color="#2A2144" emissive="#7C3AED" emissiveIntensity={0.25} />
    </mesh>
  );
}

function Building({
  station,
  selected,
  onSelect,
}: {
  station: StationView;
  selected: boolean;
  onSelect: (id: StationId) => void;
}) {
  const rotor = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }, delta) => {
    if (rotor.current) {
      const speed = station.status === "working" ? 2.4 : station.status === "awaiting_approval" ? 0.45 : 0;
      rotor.current.rotation.y += delta * speed;
    }
    if (lamp.current) {
      const t = clock.elapsedTime;
      lamp.current.emissiveIntensity =
        station.status === "working"
          ? 0.55 + Math.sin(t * 6) * 0.4
          : station.status === "blocked"
            ? Math.sin(t * 8) > 0
              ? 1
              : 0.15
            : station.status === "awaiting_approval"
              ? 0.4 + Math.sin(t * 3) * 0.5
              : station.status === "completed"
                ? 0.75
                : 0.18;
    }
  });
  const color = STATUS_HEX[station.status];
  const height = station.id === "approval" ? 3.8 : 1.7;
  return (
    <group position={station.position} scale={0.7}>
      <mesh
        position={[0, height / 2, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(station.id);
        }}
      >
        <boxGeometry args={[4.4, height + 1.4, 3.4]} />
        <meshStandardMaterial transparent opacity={0} />
      </mesh>
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <boxGeometry args={[3.5, 0.16, 2.7]} />
        <meshStandardMaterial color={selected ? "#2A2040" : "#161222"} />
      </mesh>
      {station.built ? <BuiltStation id={station.id} statusColor={color} /> : <Scaffold />}
      {station.built && (
        <group ref={rotor} position={[0, station.id === "approval" ? 2.2 : 1.15, 0.15]}>
          <mesh>
            <torusGeometry args={[0.34, 0.06, 8, 20]} />
            <meshStandardMaterial color="#C4B5FD" emissive={color} emissiveIntensity={station.status === "working" ? 0.9 : 0.2} />
          </mesh>
        </group>
      )}
      <mesh position={[1.35, height + 0.28, 0]}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial ref={lamp} color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      {station.status === "working" && (
        <mesh position={[-1.15 + Math.max(station.progress, 0.04) * 1.15, 0.22, 1.25]}>
          <boxGeometry args={[Math.max(station.progress, 0.04) * 2.3, 0.08, 0.1]} />
          <meshStandardMaterial color="#C4B5FD" emissive="#7C3AED" emissiveIntensity={0.9} />
        </mesh>
      )}
      {station.level > 1 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[2.15, 2.28, 40]} />
          <meshBasicMaterial color="#34D399" />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[2.05, 2.28, 40]} />
          <meshBasicMaterial color="#C4B5FD" />
        </mesh>
      )}
      {(station.status === "working" || station.status === "blocked" || station.status === "awaiting_approval") && (
        <pointLight position={[0, height, 0.4]} color={color} intensity={station.status === "blocked" ? 4 : 7} distance={7} />
      )}
    </group>
  );
}

function Scaffold() {
  const posts: Array<[number, number]> = [
    [-1.2, -0.8],
    [1.2, -0.8],
    [-1.2, 0.8],
    [1.2, 0.8],
  ];
  return (
    <group>
      {posts.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.9, z]}>
          <cylinderGeometry args={[0.05, 0.05, 1.6, 8]} />
          <meshStandardMaterial color="#5B21B6" />
        </mesh>
      ))}
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[2.6, 0.05, 1.8]} />
        <meshStandardMaterial color="#7C3AED" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function BuiltStation({ id, statusColor }: { id: StationId; statusColor: string }) {
  if (id === "approval") {
    return (
      <group>
        <mesh position={[0, 1.9, 0]} castShadow>
          <boxGeometry args={[1.55, 3.6, 1.55]} />
          <meshStandardMaterial color="#241C33" metalness={0.45} roughness={0.35} />
        </mesh>
        <mesh position={[0, 3.2, 0.8]}>
          <boxGeometry args={[1.2, 0.7, 0.08]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.45} />
        </mesh>
        <mesh position={[0, 3.95, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
          <meshStandardMaterial color="#C4B5FD" />
        </mesh>
      </group>
    );
  }
  if (id === "research") {
    return (
      <group>
        <Body color="#221A30" />
        <mesh position={[-0.75, 1.25, 0]}>
          <cylinderGeometry args={[0.26, 0.28, 1.15, 18]} />
          <meshStandardMaterial color="#7C3AED" transparent opacity={0.38} roughness={0.05} />
        </mesh>
        <mesh position={[0.7, 1.05, 0.2]}>
          <cylinderGeometry args={[0.18, 0.2, 0.8, 16]} />
          <meshStandardMaterial color="#C4B5FD" transparent opacity={0.45} />
        </mesh>
      </group>
    );
  }
  if (id === "qualification") {
    return (
      <group>
        <Body color="#1C1728" wide />
        <mesh position={[-0.55, 1.15, 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.9, 18]} />
          <meshStandardMaterial color="#3B3058" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0.55, 1.15, 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.9, 18]} />
          <meshStandardMaterial color="#3B3058" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    );
  }
  if (id === "creative") {
    return (
      <group>
        <Body color="#261C38" />
        <mesh position={[-0.7, 1.85, 0]} rotation={[0, 0, 0.45]}>
          <boxGeometry args={[1.15, 0.1, 2.2]} />
          <meshStandardMaterial color="#C4B5FD" emissive="#7C3AED" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0.55, 1.85, 0]} rotation={[0, 0, 0.45]}>
          <boxGeometry args={[1.15, 0.1, 2.2]} />
          <meshStandardMaterial color="#A78BFA" emissive="#7C3AED" emissiveIntensity={0.2} />
        </mesh>
      </group>
    );
  }
  if (id === "intake") {
    return (
      <group>
        <Body color="#1A1526" />
        <mesh position={[0, 1.55, 1.05]}>
          <boxGeometry args={[3.2, 0.08, 0.9]} />
          <meshStandardMaterial color="#312447" />
        </mesh>
        <mesh position={[0, 0.85, 1.2]}>
          <boxGeometry args={[1.5, 1.1, 0.08]} />
          <meshStandardMaterial color="#0C0A12" />
        </mesh>
      </group>
    );
  }
  if (id === "delivery") {
    return (
      <group>
        <Body color="#1B1724" wide />
        <mesh position={[1.35, 0.48, 1.15]} castShadow>
          <boxGeometry args={[0.42, 0.42, 0.42]} />
          <meshStandardMaterial color="#3A3054" />
        </mesh>
        <mesh position={[1.35, 0.9, 1.15]}>
          <boxGeometry args={[0.32, 0.32, 0.32]} />
          <meshStandardMaterial color="#7C3AED" emissive="#7C3AED" emissiveIntensity={0.3} />
        </mesh>
      </group>
    );
  }
  if (id === "outreach") {
    return (
      <group>
        <Body color="#1A1428" />
        <mesh position={[0, 2.35, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 1.8, 8]} />
          <meshStandardMaterial color="#C4B5FD" />
        </mesh>
        <mesh position={[0.35, 2.9, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.7, 0.04, 0.04]} />
          <meshStandardMaterial color="#A78BFA" />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <Body color="#20182E" wide />
      <mesh position={[0, 1.15, 1.16]}>
        <boxGeometry args={[2.4, 0.45, 0.06]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function Body({ color, wide = false }: { color: string; wide?: boolean }) {
  return (
    <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
      <boxGeometry args={[wide ? 3.15 : 2.7, 1.4, 2.15]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.48} />
    </mesh>
  );
}

function LeadToken({ lead, receivedAt }: { lead: FactorySnapshot["lead"]; receivedAt: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!lead || !ref.current) return;
    const extra = lead.moving && lead.durationMs > 0 ? Date.now() - receivedAt : 0;
    const progress = lead.moving && lead.durationMs > 0 ? Math.min(1, lead.progress + extra / lead.durationMs) : lead.progress;
    const [x, y, z] = leadWorldPosition(lead.stationId, progress);
    ref.current.position.set(x, y, z);
  });
  if (!lead) return null;
  const [x, y, z] = leadWorldPosition(lead.stationId, lead.progress);
  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh castShadow>
        <boxGeometry args={[0.46, 0.3, 0.46]} />
        <meshStandardMaterial color="#F7F4FF" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.16, 0.05, 0.16]} />
        <meshStandardMaterial color="#7C3AED" emissive="#7C3AED" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function makeBeltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = new THREE.Texture();
    return fallback;
  }
  context.fillStyle = "#161222";
  context.fillRect(0, 0, 64, 128);
  context.strokeStyle = "#7C3AED";
  context.lineWidth = 5;
  context.lineCap = "round";
  for (const y of [28, 78]) {
    context.beginPath();
    context.moveTo(10, y + 18);
    context.lineTo(32, y);
    context.lineTo(54, y + 18);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

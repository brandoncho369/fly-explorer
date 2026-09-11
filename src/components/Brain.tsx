"use client";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// colour per super_class index (see flybench.export.CLASS_ORDER)
const CLASS_COLORS = [
  [0.45, 0.47, 0.55], // other
  [0.35, 0.75, 0.95], // sensory
  [0.55, 0.85, 0.55], // visual_projection
  [0.60, 0.60, 0.72], // central
  [0.95, 0.60, 0.35], // descending
  [0.98, 0.40, 0.45], // motor
  [0.55, 0.55, 0.85], // optic
  [0.85, 0.70, 0.40], // ascending
  [0.80, 0.50, 0.80], // endocrine
];

const vert = /* glsl */ `
  attribute float activity;
  attribute float highlight;
  attribute vec3 base;
  uniform float uSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float a = activity;
    vec3 hot = vec3(1.0, 0.95, 0.55);
    vec3 hl = vec3(0.35, 0.95, 1.0);
    vec3 c = mix(base * 0.55, hot, a);
    c = mix(c, hl, highlight * 0.7 * (1.0 - a));
    vColor = c;
    vAlpha = 0.35 + 0.65 * max(a, highlight * 0.6);
    float size = uSize * (1.0 + 3.0 * a + 1.2 * highlight);
    gl_PointSize = size * uPixelRatio * (2.6 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float soft = smoothstep(0.25, 0.05, r);
    gl_FragColor = vec4(vColor, vAlpha * soft);
  }
`;

interface Props {
  positions: Float32Array | null;
  classes: Uint8Array | null;
  activityRef: React.MutableRefObject<Uint8Array | null>;
  highlight: Set<number>;
  spin?: boolean;
  onUserRotate?: () => void;
}

function Cloud({ positions, classes, activityRef, highlight }: Omit<Props, "spin" | "onUserRotate">) {
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const { geom, scale } = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    if (!positions || !classes) return { geom, scale: 1 };
    const n = positions.length / 3;
    // centre + normalise to ~[-1, 1]
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const p = positions[3 * i + k]; if (p < min[k]) min[k] = p; if (p > max[k]) max[k] = p; }
    const centre = min.map((m, k) => (m + max[k]) / 2);
    const extent = Math.max(...max.map((m, k) => m - min[k])) || 1;
    const scale = 2 / extent;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[3 * i + k] = (positions[3 * i + k] - centre[k]) * scale;
    // FlyWire coordinates: y is dorsal-ventral, flip so the brain is upright
    for (let i = 0; i < n; i++) pos[3 * i + 1] *= -1;
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = CLASS_COLORS[classes[i]] ?? CLASS_COLORS[0]; base.set(c, 3 * i); }
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("base", new THREE.BufferAttribute(base, 3));
    const act = new THREE.BufferAttribute(new Float32Array(n), 1);
    act.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute("activity", act);
    geom.setAttribute("highlight", new THREE.BufferAttribute(new Float32Array(n), 1));
    return { geom, scale };
  }, [positions, classes]);

  useEffect(() => {
    const attr = geom.getAttribute("highlight") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    arr.fill(0);
    highlight.forEach((i) => { if (i < arr.length) arr[i] = 1; });
    attr.needsUpdate = true;
  }, [geom, highlight]);

  useFrame(() => {
    const a = activityRef.current;
    const attr = geom.getAttribute("activity") as THREE.BufferAttribute | undefined;
    if (!a || !attr) return;
    const arr = attr.array as Float32Array;
    const n = Math.min(arr.length, a.length);
    for (let i = 0; i < n; i++) arr[i] = a[i] / 255;
    attr.needsUpdate = true;
  });

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSize: { value: positions && positions.length / 3 > 20000 ? 1.8 : 4.5 }, uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [positions],
  );

  void scale;
  return <points ref={geomRef as never} geometry={geom} material={material} />;
}

export default function Brain({ spin = true, onUserRotate, ...props }: Props) {
  return (
    <Canvas camera={{ position: [0, 0.4, 2.6], fov: 45, near: 0.01, far: 50 }} dpr={[1, 2]} gl={{ antialias: false, alpha: false }} style={{ background: "#07080c" }}>
      <color attach="background" args={["#07080c"]} />
      <Cloud {...props} />
      <OrbitControls enableDamping dampingFactor={0.08} autoRotate={spin} autoRotateSpeed={0.4} minDistance={0.5} maxDistance={8} onStart={onUserRotate} />
    </Canvas>
  );
}

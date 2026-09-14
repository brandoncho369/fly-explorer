"use client";
import { memo, useEffect, useMemo, useRef } from "react";
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

// Highlight markers: a second point layer drawn on top of the cloud (no depth test), so that a
// two-neuron set like MN9 or the Giant Fiber is findable inside 140k other dots. Small sets get
// large rings; big sets (thousands of olfactory RNs) get small filled dots so they do not paint
// over the whole brain.
const markerVert = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPixelRatio * (2.6 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const markerFrag = /* glsl */ `
  uniform float uRing;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    // uRing = 1: hollow ring with a bright centre dot; uRing = 0: solid dot
    float ring = smoothstep(0.30, 0.36, r) * smoothstep(0.5, 0.44, r);
    float core = smoothstep(0.14, 0.06, r);
    float a = mix(smoothstep(0.5, 0.3, r), max(ring, core), uRing);
    gl_FragColor = vec4(0.35, 0.95, 1.0, a);
  }
`;

function Markers({ geom, highlight, n }: { geom: THREE.BufferGeometry; highlight: Set<number>; n: number }) {
  const markerGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const src = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
    const idx = [...highlight].filter((i) => src && i < src.count);
    const pos = new Float32Array(idx.length * 3);
    idx.forEach((i, k) => { if (src) { pos[3 * k] = src.getX(i); pos[3 * k + 1] = src.getY(i); pos[3 * k + 2] = src.getZ(i); } });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [geom, highlight]);
  const material = useMemo(() => {
    const small = highlight.size <= 64;
    const bigBrain = n > 20000;
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: small ? 22 : bigBrain ? 4 : 7 },
        uRing: { value: small ? 1 : 0 },
        uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 },
      },
      vertexShader: markerVert,
      fragmentShader: markerFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }, [highlight, n]);
  if (highlight.size === 0) return null;
  return <points geometry={markerGeom} material={material} renderOrder={10} />;
}

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
  return (
    <>
      <points ref={geomRef as never} geometry={geom} material={material} />
      <Markers geom={geom} highlight={highlight} n={positions ? positions.length / 3 : 0} />
    </>
  );
}

function Brain({ spin = true, onUserRotate, ...props }: Props) {
  return (
    <Canvas camera={{ position: [0, 0.4, 2.6], fov: 45, near: 0.01, far: 50 }} dpr={[1, 2]} gl={{ antialias: false, alpha: false }} style={{ background: "#07080c" }}>
      <color attach="background" args={["#07080c"]} />
      <Cloud {...props} />
      <OrbitControls enableDamping dampingFactor={0.08} autoRotate={spin} autoRotateSpeed={0.4} minDistance={0.5} maxDistance={8} onStart={onUserRotate} />
    </Canvas>
  );
}

// The sidebar re-renders every animation frame; the canvas must not.
export default memo(Brain);

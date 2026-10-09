import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const { clamp, lerp } = THREE.MathUtils;
const statusEl = document.getElementById('status');
const video = document.getElementById('cam');
const setStatus = (t) => { statusEl.textContent = t; };
// mapea v de [a,b] a [c,d] recortando en los extremos
const remap = (v, a, b, c, d) => c + (d - c) * clamp((v - a) / (b - a), 0, 1);

// ───────────── escena ─────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x03030a);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.z = 6;
const view = { w: 1, h: 1 }; // tamaño visible del plano z = 0

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  view.h = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  view.w = view.h * camera.aspect;
}
addEventListener('resize', resize);
resize();

// ───────────── material de partículas ─────────────
const U = {
  uTime: { value: 0 },
  uScatter: { value: 0 },
  uHue: { value: 0 },
  uPixelRatio: { value: renderer.getPixelRatio() },
};

const vertexShader = /* glsl */ `
  uniform float uTime, uScatter, uHue, uSize, uPixelRatio;
  attribute vec3 aColor;
  attribute float aSeed;
  varying vec3 vColor;

  vec3 hueShift(vec3 c, float a) {
    float cs = cos(a), sn = sin(a);
    vec3 k = vec3(0.57735);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
  }

  void main() {
    vec3 dir = normalize(position + 1e-5);
    float s = uScatter * (0.25 + aSeed);
    vec3 jitter = vec3(
      sin(uTime * 1.3 + aSeed * 40.0),
      cos(uTime * 1.1 + aSeed * 30.0),
      sin(uTime * 0.9 + aSeed * 20.0)
    ) * (0.015 + uScatter * 0.12);
    vec3 p = position + dir * s * 1.4 + jitter;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.7 + aSeed * 0.8) / -mv.z;
    vColor = clamp(hueShift(aColor, uHue), 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, d) * 0.95);
  }
`;

function makeMaterial(size) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uSize: { value: size } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makePoints(pos, col, seed, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  return p;
}

// ───────────── esfera + núcleo ─────────────
const world = new THREE.Group();
world.rotation.order = 'XYZ';
scene.add(world);

function buildSphere() {
  const SURF = 42000, CORE = 14000, R = 1.4;
  const n = SURF + CORE;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n);
  const c = new THREE.Color();
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < SURF; i++) {
    const y = 1 - (i / (SURF - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    pos.set([x * R, y * R, z * R], i * 3);
    const t = clamp(0.5 + 0.5 * (x * 0.7 + y * 0.5 + z * 0.5), 0, 1);
    const hue = 0.9 - 0.38 * t + 0.03 * Math.sin(y * 14);
    c.setHSL(((hue % 1) + 1) % 1, 0.9, 0.58);
    col.set([c.r, c.g, c.b], i * 3);
    seed[i] = Math.random();
  }
  for (let i = SURF; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u), rad = R * 0.95 * Math.cbrt(Math.random());
    pos.set([Math.cos(th) * r * rad, u * rad, Math.sin(th) * r * rad], i * 3);
    c.setHSL(0.6 + (Math.random() - 0.5) * 0.08, 0.9, 0.5);
    col.set([c.r, c.g, c.b], i * 3);
    seed[i] = Math.random();
  }
  world.add(makePoints(pos, col, seed, makeMaterial(14)));
}

// ───────────── anillos orbitando ─────────────
const rings = [];
function buildRings() {
  const RINGS = 7, PER = 6500;
  const mat = makeMaterial(20);
  const c = new THREE.Color();
  for (let i = 0; i < RINGS; i++) {
    const pos = new Float32Array(PER * 3), col = new Float32Array(PER * 3), seed = new Float32Array(PER);
    const base = 1.95 + i * 0.17;
    for (let k = 0; k < PER; k++) {
      const a = Math.random() * Math.PI * 2;
      const rad = base + (Math.random() - 0.5) * 0.14;
      pos.set([Math.cos(a) * rad, Math.sin(a) * rad, (Math.random() - 0.5) * 0.14], k * 3);
      c.setHSL((a / (Math.PI * 2) + i * 0.13) % 1, 0.9, 0.6);
      col.set([c.r, c.g, c.b], k * 3);
      seed[k] = Math.random();
    }
    const pts = makePoints(pos, col, seed, mat);
    const tilt = new THREE.Group();
    tilt.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    tilt.add(pts);
    world.add(tilt);
    rings.push({ pts, tilt, speed: (0.15 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1) });
  }
}

buildSphere();
buildRings();

// ───────────── esqueletos de las manos ─────────────
const CONN = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function makeSkeleton(color) {
  const group = new THREE.Group();
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONN.length * 6), 3)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })
  );
  const joints = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3)),
    new THREE.PointsMaterial({ color, size: 0.07, transparent: true, depthTest: false })
  );
  lines.frustumCulled = joints.frustumCulled = false;
  lines.renderOrder = joints.renderOrder = 10;
  group.add(lines, joints);
  group.visible = false;
  scene.add(group);
  return { group, lines, joints };
}
const skeletons = [makeSkeleton(0xff4fa3), makeSkeleton(0x4fe3ff)]; // izquierda en pantalla = rosa
let showSkeleton = true;

function drawSkeleton(sk, pts) {
  const lp = sk.lines.geometry.attributes.position;
  CONN.forEach(([a, b], i) => {
    lp.setXYZ(i * 2, pts[a].x, pts[a].y, 0);
    lp.setXYZ(i * 2 + 1, pts[b].x, pts[b].y, 0);
  });
  lp.needsUpdate = true;
  const jp = sk.joints.geometry.attributes.position;
  pts.forEach((p, i) => jp.setXYZ(i, p.x, p.y, 0));
  jp.needsUpdate = true;
}

// ───────────── interpretar las manos ─────────────
const state = {
  pos: new THREE.Vector3(),
  scale: 1,
  roll: 0,
  scatter: 0.12,
  hands: 0,
};
let missed = 99;

// espejo: lo que ves en pantalla es como un espejo
const toWorld = (lm) => new THREE.Vector3((0.5 - lm.x) * view.w, (0.5 - lm.y) * view.h, 0);

function analyze(lm) {
  const pts = lm.map(toWorld);
  const palm = new THREE.Vector3();
  [0, 5, 9, 13, 17].forEach((i) => palm.add(pts[i]));
  palm.multiplyScalar(0.2);
  const size = Math.max(pts[0].distanceTo(pts[9]), 1e-4);
  const tips = [8, 12, 16, 20].reduce((s, i) => s + pts[i].distanceTo(pts[0]), 0) / 4;
  return {
    pts, palm, size,
    open: remap(tips / size, 1.1, 1.9, 0, 1),         // puño → 0, mano abierta → 1
    pinch: remap(pts[4].distanceTo(pts[8]) / size, 0.15, 1.2, 0, 1),
    angle: Math.atan2(pts[9].y - pts[0].y, pts[9].x - pts[0].x) - Math.PI / 2,
  };
}

function applyHands(list) {
  const hands = list.map(analyze).sort((a, b) => a.palm.x - b.palm.x);
  state.hands = hands.length;
  skeletons.forEach((s, i) => { s.group.visible = showSkeleton && !!hands[i]; });
  hands.slice(0, 2).forEach((h, i) => drawSkeleton(skeletons[i], h.pts));

  if (hands.length >= 2) {
    const [a, b] = hands;
    const d = a.palm.distanceTo(b.palm) / view.h;
    state.pos.copy(a.palm).add(b.palm).multiplyScalar(0.5);
    state.scale = remap(d, 0.1, 1.0, 0.4, 2.6);
    state.roll = clamp(Math.atan2(b.palm.y - a.palm.y, b.palm.x - a.palm.x), -1.2, 1.2);
    state.scatter = (a.open + b.open) * 0.5;
  } else if (hands.length === 1) {
    const h = hands[0];
    state.pos.copy(h.palm);
    state.scale = remap(h.pinch, 0, 1, 0.5, 2.4);
    state.roll = clamp(h.angle, -1.2, 1.2);
    state.scatter = h.open;
  } else {
    state.pos.set(0, 0, 0);
    state.scale = manual.zoom;
    state.roll = 0;
    state.scatter = 0.12;
  }
}

// ───────────── mouse (cuando no hay cámara) ─────────────
const manual = { zoom: 1, yaw: 0, pitch: 0, drag: false };
addEventListener('wheel', (e) => { manual.zoom = clamp(manual.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.4, 2.8); });
addEventListener('pointerdown', () => { manual.drag = true; });
addEventListener('pointerup', () => { manual.drag = false; });
addEventListener('pointermove', (e) => {
  if (!manual.drag) return;
  manual.yaw += e.movementX * 0.006;
  manual.pitch = clamp(manual.pitch + e.movementY * 0.006, -1.2, 1.2);
});

// ───────────── teclas ─────────────
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'h') { showSkeleton = !showSkeleton; }
  if (k === 'v') video.classList.toggle('visible');
  if (k === 'c') U.uHue.value += 0.9;
  if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

// ───────────── MediaPipe + cámara ─────────────
let landmarker = null;
let lastVideoTime = -1;

async function initTracking() {
  try {
    setStatus('Pidiendo acceso a la cámara…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();

    setStatus('Cargando modelo de manos…');
    const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    const options = (delegate) => ({
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
    setStatus('Listo · muestra tus manos');
  } catch (err) {
    console.error(err);
    setStatus('Sin cámara (' + (err.name || 'error') + ') · usa el mouse');
  }
}

function detect() {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, performance.now());
  if (res.landmarks && res.landmarks.length) {
    missed = 0;
    applyHands(res.landmarks);
  } else if (++missed === 8) {
    applyHands([]); // pierde las manos unos frames antes de volver al reposo
  }
}

// ───────────── bucle ─────────────
const clock = new THREE.Clock();
let spin = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  U.uTime.value += dt;
  detect();
  if (!landmarker && missed >= 8) { // sin tracking: el zoom lo manda la rueda
    state.scale = manual.zoom;
  }

  const k = 1 - Math.exp(-dt * 8);
  world.position.lerp(state.pos, k);
  world.scale.setScalar(lerp(world.scale.x, state.scale, k));
  world.rotation.z = lerp(world.rotation.z, state.roll, k);
  spin += dt * 0.3;
  world.rotation.y = spin + manual.yaw;
  world.rotation.x = lerp(world.rotation.x, manual.pitch, k);
  U.uScatter.value = lerp(U.uScatter.value, state.scatter, 1 - Math.exp(-dt * 5));

  const expand = 1 + U.uScatter.value * 0.35;
  rings.forEach((r) => {
    r.pts.rotation.z += r.speed * dt;
    r.tilt.scale.setScalar(expand);
  });

  renderer.render(scene, camera);
  if (state.hands) setStatus(`${state.hands} ${state.hands === 1 ? 'mano' : 'manos'} · escala ${state.scale.toFixed(1)}`);
}

animate();
initTracking();

// para pruebas desde la consola del navegador
window.particleDebug = { applyHands, state };

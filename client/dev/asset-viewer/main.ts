import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BuildingDef, BuildingKind, hashSeed } from "@mc/shared";
import { makeBuilding } from "../../src/assets/buildings.js";
import { makeBenches, makeHydrants, makeStreetlights, makeTrees, TREE_SPECIES } from "../../src/assets/props.js";
import { applyNight } from "../../src/render/lights.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86b3d9);
scene.fog = new THREE.Fog(0x86b3d9, 120, 400);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 600);
camera.position.set(30, 28, 55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(30, 4, 0);
// dev: ?t=x,y,z aims the camera, ?c=x,y,z places it
{
  const q = new URLSearchParams(location.search);
  const t = q.get("t")?.split(",").map(Number);
  if (t?.length === 3 && t.every(isFinite)) controls.target.set(t[0], t[1], t[2]);
  const c = q.get("c")?.split(",").map(Number);
  if (c?.length === 3 && c.every(isFinite)) camera.position.set(c[0], c[1], c[2]);
}

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
sun.shadow.camera.right = sun.shadow.camera.top = 80;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xbdd5ea, 0x51473a, 0.7);
scene.add(hemi);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshStandardMaterial({ color: 0x3d4247, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function label(text: string, x: number, z: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 48;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 24px system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 5;
  ctx.strokeText(text, 128, 32);
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(6, 1.1, 1);
  s.position.set(x, 0.8, z + 5);
  scene.add(s);
}

// dev: ?def=kind,floors,style,seed,fw,fd renders one specific building at origin
{
  const q = new URLSearchParams(location.search);
  const d = q.get("def")?.split(",");
  if (d && d.length >= 4) {
    const def: BuildingDef = {
      kind: d[0] as BuildingKind,
      floors: Number(d[1]),
      style: Number(d[2]),
      seed: Number(d[3]),
      name: "debug",
    };
    const b = makeBuilding(def, Number(d[4] ?? 14), Number(d[5] ?? 12));
    b.position.set(30, 0, 20);
    b.updateMatrix();
    scene.add(b);
  }
}

// every building kind × every style
const kinds: Array<[BuildingKind, number]> = [
  ["house", 2],
  ["shop", 2],
  ["office", 5],
  ["apartment", 4],
  ["tower", 10],
  ["skyscraper", 18],
  ["warehouse", 1],
  ["factory", 2],
];
kinds.forEach(([kind, floors], row) => {
  for (let style = 0; style < 4; style++) {
    const def: BuildingDef = {
      kind,
      floors,
      style,
      seed: hashSeed(row, style, 0xdead),
      name: `${kind} s${style}`,
    };
    const b = makeBuilding(def, 12, 10);
    b.position.set(style * 16, 0, -row * 22);
    b.updateMatrix();
    scene.add(b);
  }
  label(kind, -14, -row * 22);
});

// furniture row
import("../../src/assets/furniture.js").then(async ({ makeFurniture }) => {
  const { FURNITURE } = await import("@mc/shared");
  FURNITURE.forEach((f, i) => {
    const m = makeFurniture(f.id);
    m.position.set(66 + i * 5, 0, -6);
    scene.add(m);
  });
  label("furniture", 60, -4);
});

// props row
const treePlaces = Array.from({ length: TREE_SPECIES }, (_, s) => [
  { x: 70 + s * 8, z: 10, rot: 0, scale: 1 },
]);
scene.add(makeTrees(treePlaces));
scene.add(makeStreetlights([{ x: 70, z: 22, rot: 0 }]));
const bench = makeBenches([{ x: 78, z: 22 }]);
if (bench) scene.add(bench);
const hydrant = makeHydrants([{ x: 84, z: 22 }]);
if (hydrant) scene.add(hydrant);
label("props", 76, 26);

// time-of-day slider drives sun + emissives, same curve family as the game
const tod = document.getElementById("tod") as HTMLInputElement;
function applyTod() {
  const t = parseFloat(tod.value);
  const theta = (t - 0.25) * Math.PI * 2;
  const elev = Math.sin(theta);
  const day = THREE.MathUtils.smoothstep(elev, -0.06, 0.25);
  sun.intensity = 2.8 * day;
  hemi.intensity = 0.18 + 0.6 * day;
  const sky = new THREE.Color(0x0a1220).lerp(new THREE.Color(0x86b3d9), day);
  scene.background = sky;
  (scene.fog as THREE.Fog).color.copy(sky);
  applyNight(1 - day);
}
tod.addEventListener("input", applyTod);
applyTod();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

import * as THREE from "three";

// Registry of emissive materials (windows, signs, streetlamp bulbs) whose
// intensity follows the day/night cycle. The engine drives applyNight().
interface Entry {
  mat: THREE.MeshStandardMaterial | THREE.SpriteMaterial;
  max: number;
}
const entries: Entry[] = [];

export function registerNight(mat: THREE.MeshStandardMaterial, max: number) {
  entries.push({ mat, max });
}

export function registerNightOpacity(mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial, max: number) {
  entries.push({ mat: mat as never, max });
}

export function applyNight(n: number) {
  for (const e of entries) {
    const m = e.mat as THREE.MeshStandardMaterial;
    if ("emissiveIntensity" in m) m.emissiveIntensity = e.max * n;
    else (e.mat as THREE.SpriteMaterial).opacity = e.max * n;
  }
}

export function clearNightRegistry() {
  entries.length = 0;
}

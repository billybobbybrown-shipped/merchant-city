import * as THREE from "three";
import { decodeAppearance } from "@mc/shared";
import { type AvatarRig, makeAvatarRig, poseWalk } from "../assets/avatar.js";
import { excludeFromAO, includeInAO } from "../render/engine.js";

interface Avatar {
  group: THREE.Group;
  rig: AvatarRig;
  tag?: THREE.Mesh; // players only — the crowd stays anonymous
  cur: THREE.Vector2;
  dest: THREE.Vector2;
  phase: number;
  gait: number; // 0 standing, 1 walking — eased so steps don't snap on
}

function nameTag(name: string): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = "#f2f5f8";
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // a billboarded plane, not a Sprite — sprites break the GTAO depth/normal pre-pass
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  tag.position.y = 2.35;
  excludeFromAO(tag);
  return tag;
}

function makeAvatar(name: string, appearance: string, named: boolean): Avatar {
  const group = new THREE.Group();
  const rig = makeAvatarRig(decodeAppearance(appearance));
  const tag = named ? nameTag(name) : undefined;
  group.add(rig.group);
  if (tag) group.add(tag);
  return { group, rig, tag, cur: new THREE.Vector2(), dest: new THREE.Vector2(), phase: 0, gait: 0 };
}

const qTmp = new THREE.Quaternion();
const qWant = new THREE.Quaternion();
const mTmp = new THREE.Matrix4();
const vTag = new THREE.Vector3();
const vCam = new THREE.Vector3();
const vDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();

export class PlayerRenderer {
  readonly group = new THREE.Group();
  private avatars = new Map<string, Avatar>();

  // citizens are part of the scenery, so only players are labelled
  constructor(private named = true) {}

  add(sessionId: string, name: string, appearance: string, x: number, y: number) {
    const a = makeAvatar(name, appearance, this.named);
    a.cur.set(x, y);
    a.dest.set(x, y);
    a.group.position.set(x, 0, y);
    this.avatars.set(sessionId, a);
    this.group.add(a.group);
  }

  // someone saved a new look — swap the body, keep their position and name tag
  redress(sessionId: string, appearance: string) {
    const a = this.avatars.get(sessionId);
    if (!a) return;
    a.group.remove(a.rig.group);
    a.rig.mesh.geometry.dispose();
    a.rig.mesh.skeleton.dispose();
    a.rig = makeAvatarRig(decodeAppearance(appearance));
    a.group.add(a.rig.group);
  }

  remove(sessionId: string) {
    const a = this.avatars.get(sessionId);
    if (a) {
      if (a.tag) includeInAO(a.tag);
      this.group.remove(a.group);
      this.avatars.delete(sessionId);
    }
  }

  // Server state lands here; rendering eases toward it.
  setDest(sessionId: string, x: number, y: number) {
    this.avatars.get(sessionId)?.dest.set(x, y);
  }

  // how far off the ground to draw someone — used when you're upstairs, since
  // the server only knows where you are on the plan, not which storey
  private elevation = new Map<string, number>();

  elevate(sessionId: string, y: number): void {
    if (y) this.elevation.set(sessionId, y);
    else this.elevation.delete(sessionId);
  }

  position(sessionId: string): THREE.Vector2 | null {
    return this.avatars.get(sessionId)?.cur ?? null;
  }

  update(dt: number, camera?: THREE.Camera, cullCenter?: THREE.Vector3, cullRadius = 0) {
    for (const [sid, a] of this.avatars.entries()) {
      if (cullCenter && cullRadius > 0) {
        const vis =
          Math.hypot(a.cur.x - cullCenter.x, a.cur.y - cullCenter.z) <= cullRadius;
        a.group.visible = vis;
        if (!vis) {
          // far NPCs still track server position, just skip the animation work
          a.cur.x = a.dest.x;
          a.cur.y = a.dest.y;
          continue;
        }
      }
      const dx = a.dest.x - a.cur.x;
      const dy = a.dest.y - a.cur.y;
      const dist = Math.hypot(dx, dy);
      const k = Math.min(1, dt * 12);
      a.cur.x += dx * k;
      a.cur.y += dy * k;
      const moving = dist > 0.05;
      if (moving) {
        // stride rate follows how fast they're actually closing the gap, so a
        // short shuffle doesn't sprint on the spot
        a.phase += dt * Math.min(13, 6 + dist * 9);
        // avatars are modelled facing -z (that's where the eyes are), so the
        // half turn puts their front, not their back, along the way they walk
        a.group.rotation.y = Math.atan2(dx, dy) + Math.PI;
      }
      // ease in and out of the gait rather than snapping between poses
      a.gait += ((moving ? 1 : 0) - a.gait) * Math.min(1, dt * 9);
      if (!moving && a.gait < 0.02) a.phase = 0;
      const bob = poseWalk(a.rig, a.phase, a.gait);
      a.group.position.set(a.cur.x, bob + (this.elevation.get(sid) ?? 0), a.cur.y);

      // Billboard the name last, once the avatar's own turn and lean are set —
      // reading them a frame late is what made the tag swing about. Built from
      // world up rather than the camera's own roll, so the text never tips or
      // flips whichever way you orbit.
      if (camera && a.tag) {
        a.group.updateMatrixWorld(true);
        a.tag.getWorldPosition(vTag);
        camera.getWorldPosition(vCam);
        vDir.subVectors(vCam, vTag);
        if (vDir.lengthSq() > 1e-6) {
          vDir.normalize();
          mTmp.lookAt(vDir, ORIGIN, UP);
          qWant.setFromRotationMatrix(mTmp);
          a.group.getWorldQuaternion(qTmp).invert();
          a.tag.quaternion.copy(qTmp).multiply(qWant);
        }
      }
    }
  }
}

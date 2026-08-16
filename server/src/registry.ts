// Rooms register here so out-of-room services (the economy ticker) can push
// updates and per-player notifications to whoever is online.
export interface RoomLike {
  broadcastAll(type: string, msg: unknown): void;
  sendToEntity(eid: number, type: string, msg: unknown): void;
}

const rooms = new Set<RoomLike>();

export const registry = {
  add: (r: RoomLike) => rooms.add(r),
  remove: (r: RoomLike) => rooms.delete(r),
  broadcast(type: string, msg: unknown) {
    for (const r of rooms) r.broadcastAll(type, msg);
  },
  sendTo(eid: number, type: string, msg: unknown) {
    for (const r of rooms) r.sendToEntity(eid, type, msg);
  },
};

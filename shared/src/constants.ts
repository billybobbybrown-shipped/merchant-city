export const CITY_SIZE = 192;
export const TILE_WORLD_SIZE = 2; // meters per tile in the 3D scene
export const STARTING_CASH = 10_000;
export const PLAYER_SPEED = 7; // world units / second
export const TICK_RATE = 20; // server simulation ticks / second
export const TICK_MS = 1000 / TICK_RATE;
export const DAY_LENGTH_SEC = 600; // one in-game day = 10 real minutes

export const SERVER_PORT = 2567;

export enum Tile {
  Grass = 0,
  Road = 1,
  Sidewalk = 2,
  Water = 3,
  Lot = 4,
}

export type Zone = "residential" | "commercial" | "industrial" | "mixed" | "park";

export const ZONE_BASE_VALUE: Record<Zone, number> = {
  commercial: 120,
  mixed: 90,
  residential: 60,
  industrial: 40,
  park: 0,
};

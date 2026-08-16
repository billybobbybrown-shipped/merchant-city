import { Schema, type, MapSchema } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") tx = 0; // movement target
  @type("float32") ty = 0;
  @type("string") appearance = "";
  @type("float64") cash = 0;
}

export class NpcState extends Schema {
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") appearance = "";
}

export class CityState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();
  @type("float32") dayTime = 0; // 0..1 fraction of the in-game day
}

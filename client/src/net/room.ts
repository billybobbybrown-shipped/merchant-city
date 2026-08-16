import { Client, Room } from "colyseus.js";
import { WS_URL } from "../config.js";

export async function joinCity(token: string): Promise<Room> {
  const client = new Client(WS_URL);
  return client.joinOrCreate("city", { token });
}

import { z } from "zod";
import { CITY_SIZE, TILE_WORLD_SIZE } from "./constants.js";

export const DisplayNameSchema = z
  .string()
  .min(3)
  .max(16)
  .regex(/^[A-Za-z0-9_]+$/, "letters, numbers and underscore only");

export const EmailSchema = z.string().email().max(254);
export const PasswordSchema = z.string().min(8).max(128);

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const LoginSchema = RegisterSchema;

export const SetNameSchema = z.object({
  name: DisplayNameSchema,
});

const WORLD_MAX = CITY_SIZE * TILE_WORLD_SIZE;

// Client → server movement intent: a target point in world coordinates.
export const MoveIntentSchema = z.object({
  x: z.number().finite().min(0).max(WORLD_MAX),
  y: z.number().finite().min(0).max(WORLD_MAX),
});

export type MoveIntent = z.infer<typeof MoveIntentSchema>;

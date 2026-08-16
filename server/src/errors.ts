// Player-facing economic failures (insufficient funds, invalid target, ...).
// Anything else that throws is a bug and logs as such.
export class EconomyError extends Error {}

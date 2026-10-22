export type CameraState = { x: number; y: number };
export type CameraBounds = { x: number; y: number; width: number; height: number };

/** Top-left camera position clamped to caller-supplied world bounds. */
export function followCamera(
  x: number, y: number, viewportWidth: number, viewportHeight: number, bounds: CameraBounds,
): CameraState {
  if (![x, y, viewportWidth, viewportHeight, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || viewportWidth < 0 || viewportHeight < 0 || bounds.width < 0 || bounds.height < 0) {
    throw new RangeError("Camera coordinates must be finite and sizes non-negative");
  }
  return {
    x: Math.max(bounds.x, Math.min(x - viewportWidth / 2, bounds.x + Math.max(0, bounds.width - viewportWidth))),
    y: Math.max(bounds.y, Math.min(y - viewportHeight / 2, bounds.y + Math.max(0, bounds.height - viewportHeight))),
  };
}

/** Inject a presentation-only RNG; this helper never consumes simulation randomness. */
export function shakeOffset(trauma: number, random: () => number, amplitude = 26): CameraState {
  if (!Number.isFinite(trauma) || !Number.isFinite(amplitude) || amplitude < 0) {
    throw new RangeError("Shake values must be finite and amplitude non-negative");
  }
  const strength = Math.max(0, Math.min(1, trauma)) ** 2 * amplitude;
  if (strength === 0) return { x: 0, y: 0 };
  return { x: (random() * 2 - 1) * strength, y: (random() * 2 - 1) * strength };
}

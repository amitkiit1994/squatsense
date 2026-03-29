/**
 * Shared skeleton overlay drawing utility.
 *
 * Used by live play view and video replay component.
 * Color-coded by form score: green (good), amber (moderate), red (poor).
 */

// MediaPipe pose skeleton connections (upper + lower body)
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
];

/**
 * Draw a pose skeleton on a canvas context.
 *
 * @param ctx - Canvas 2D rendering context
 * @param landmarks - Array of [x, y] pixel coordinates (33 MediaPipe landmarks)
 * @param formScore - Current form score (0-100) or null; determines skeleton color
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: [number, number][],
  formScore: number | null,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  if (landmarks.length === 0) return;

  // Determine color based on form score
  let color = "#00ff88"; // green
  if (formScore !== null) {
    if (formScore < 60) color = "#ff3366";
    else if (formScore < 80) color = "#ffbf00";
  }

  // Draw connection lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const [a, b] of POSE_CONNECTIONS) {
    if (a < landmarks.length && b < landmarks.length) {
      const [ax, ay] = landmarks[a];
      const [bx, by] = landmarks[b];
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  // Draw landmark circles
  ctx.fillStyle = color;
  for (const [x, y] of landmarks) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

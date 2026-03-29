/**
 * In-memory store for video replay data between the play and results pages.
 *
 * Survives Next.js client-side navigation (router.push) but is naturally
 * cleared on hard refresh, which matches the ephemeral design.
 */

export interface ReplayFrame {
  timestamp: number; // ms since blitz start
  landmarks: [number, number][];
  formScore: number | null;
  phase: string;
  repCount: number;
}

export interface ReplayData {
  videoBlob: Blob;
  frameData: ReplayFrame[];
}

let _videoBlob: Blob | null = null;
let _frameData: ReplayFrame[] = [];

export function setReplayData(videoBlob: Blob | null, frameData: ReplayFrame[]): void {
  _videoBlob = videoBlob;
  _frameData = frameData;
}

export function getReplayData(): ReplayData | null {
  if (!_videoBlob || _frameData.length === 0) return null;
  return { videoBlob: _videoBlob, frameData: _frameData };
}

export function clearReplayData(): void {
  _videoBlob = null;
  _frameData = [];
}

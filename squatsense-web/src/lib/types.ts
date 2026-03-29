export interface WebSocketFrameResult {
  type: "frame_result";
  landmarks: [number, number][];
  metrics: {
    knee_flexion_deg?: number;
    trunk_angle_deg?: number;
    com_offset_norm?: number;
    depth_score?: number;
    stability_score?: number;
    symmetry_score?: number;
    tempo_score?: number;
    rom_score?: number;
    composite_score?: number;
  };
  rep_count: number;
  form_score: number | null;
  fatigue: { fatigue_index: number; fatigue_risk: string } | null;
  status: string;
  phase: string;
}

export interface WebSocketSessionSummary {
  type: "session_summary";
  exercise_type: string;
  total_reps: number;
  avg_form_score: number;
  reps: Array<{
    rep_number: number;
    composite_score: number;
    depth_score: number;
    stability_score: number;
    symmetry_score: number;
    tempo_score: number;
    rom_score: number;
  }>;
}

export type WebSocketMessage = WebSocketFrameResult | WebSocketSessionSummary | { error: string };

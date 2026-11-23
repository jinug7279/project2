export type JointGroup = "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";

export type BodySideFilter = "both" | "left" | "right";

export type MovementPresetId =
  | "squat"
  | "sprint"
  | "deadlift"
  | "golf_swing"
  | "lunge";

export interface SimulationParams {
  presetId: MovementPresetId;
  depthPct: number; // 40 ~ 115 (%)
  trunkLeanBiasDeg: number; // 0 ~ 25 (deg)
  asymmetryPct: number; // 0 ~ 25 (%)
  tempoSec: number; // 0.8 ~ 4.5 (sec per cycle)
  cycles: number; // 1 ~ 4
}

export interface Point2D {
  x: number;
  y: number;
  visibility: number;
}

export interface JointAnglePair {
  left: number | null;
  right: number | null;
}

export interface FramePoseData {
  timestampSec: number;
  landmarks: Point2D[] | null;
  angles: Record<JointGroup, JointAnglePair>;
  trunkLean: number | null;
  comX: number | null;
  visibilityScore: number;
}

export interface JointStatSummary {
  joint: JointGroup;
  labelKo: string;
  leftMin: number | null;
  leftMax: number | null;
  leftRom: number | null;
  leftMean: number | null;
  rightMin: number | null;
  rightMax: number | null;
  rightRom: number | null;
  rightMean: number | null;
  asymmetryDeg: number | null;
}

export interface KeyframeSnapshot {
  label: string;
  timestampSec: number;
  dataUrl: string;
}

export interface JointEvaluationItem {
  jointName: string;
  side: string;
  status: "양호" | "주의" | "개선필요";
  measuredRom: string;
  finding: string;
  recommendation: string;
}

export interface ImprovementPointItem {
  title: string;
  priority: "높음" | "중간" | "낮음";
  description: string;
  drill: string;
}

export interface BiomechanicsReport {
  detectedMovement: string;
  overallSummary: string;
  postureCharacteristics: string[];
  jointEvaluations: JointEvaluationItem[];
  improvementPoints: ImprovementPointItem[];
}

export interface AnalysisSession {
  id: string;
  createdAt: string;
  title: string;
  exerciseType: string;
  simulationParams: SimulationParams;
  durationSec: number;
  videoWidth: number;
  videoHeight: number;
  fpsSampled: number;
  framesDetected: number;
  totalFramesSampled: number;
  frames: FramePoseData[];
  summary: JointStatSummary[];
  avgTrunkLean: number | null;
  thumbnailDataUrl: string;
  keyframeImages: KeyframeSnapshot[];
  report: BiomechanicsReport | null;
  reportError: string | null;
}

export const JOINT_META: Record<
  JointGroup,
  { labelKo: string; colorLeft: string; colorRight: string; description: string }
> = {
  shoulder: {
    labelKo: "어깨",
    colorLeft: "#2563EB",
    colorRight: "#60A5FA",
    description: "골반-어깨-팔꿈치 각도",
  },
  elbow: {
    labelKo: "팔꿈치",
    colorLeft: "#0891B2",
    colorRight: "#22D3EE",
    description: "어깨-팔꿈치-손목 각도",
  },
  wrist: {
    labelKo: "손목",
    colorLeft: "#4F46E5",
    colorRight: "#818CF8",
    description: "팔꿈치-손목-손가락 각도",
  },
  hip: {
    labelKo: "골반",
    colorLeft: "#0F766E",
    colorRight: "#2DD4BF",
    description: "어깨-골반-무릎 각도",
  },
  knee: {
    labelKo: "무릎",
    colorLeft: "#D97706",
    colorRight: "#FBBF24",
    description: "골반-무릎-발목 각도",
  },
  ankle: {
    labelKo: "발목",
    colorLeft: "#DC2626",
    colorRight: "#F87171",
    description: "무릎-발목-발끝 각도",
  },
};

export interface MovementPresetMeta {
  id: MovementPresetId;
  nameKo: string;
  viewLabel: string;
  description: string;
  defaultParams: SimulationParams;
}

export const MOVEMENT_PRESETS: MovementPresetMeta[] = [
  {
    id: "squat",
    nameKo: "스쿼트",
    viewLabel: "측면 3/4 시점",
    description: "고관절·무릎·발목의 동시 굴곡 및 상체 중립 정렬 시뮬레이션",
    defaultParams: {
      presetId: "squat",
      depthPct: 90,
      trunkLeanBiasDeg: 6,
      asymmetryPct: 3,
      tempoSec: 2.6,
      cycles: 2,
    },
  },
  {
    id: "sprint",
    nameKo: "스프린트 러닝",
    viewLabel: "측면 주법 시점",
    description: "지지기·추진기·체공기 보행 주기와 상하지 교차 스윙 시뮬레이션",
    defaultParams: {
      presetId: "sprint",
      depthPct: 92,
      trunkLeanBiasDeg: 10,
      asymmetryPct: 4,
      tempoSec: 1.1,
      cycles: 3,
    },
  },
  {
    id: "deadlift",
    nameKo: "데드리프트",
    viewLabel: "측면 힙힌지 시점",
    description: "고관절 경첩 움직임, 척추 중립 유지 및 수직 바 경로 시뮬레이션",
    defaultParams: {
      presetId: "deadlift",
      depthPct: 88,
      trunkLeanBiasDeg: 5,
      asymmetryPct: 3,
      tempoSec: 2.8,
      cycles: 2,
    },
  },
  {
    id: "golf_swing",
    nameKo: "골프 스윙",
    viewLabel: "정면 타석 시점",
    description: "어드레스·백스윙 코킹·임팩트·팔로우스루 회전 역학 시뮬레이션",
    defaultParams: {
      presetId: "golf_swing",
      depthPct: 95,
      trunkLeanBiasDeg: 14,
      asymmetryPct: 5,
      tempoSec: 2.0,
      cycles: 2,
    },
  },
  {
    id: "lunge",
    nameKo: "포워드 런지",
    viewLabel: "측면 스플릿 시점",
    description: "전방 지지 다리 무릎·발목 제어 및 후방 고관절 신전 시뮬레이션",
    defaultParams: {
      presetId: "lunge",
      depthPct: 90,
      trunkLeanBiasDeg: 5,
      asymmetryPct: 4,
      tempoSec: 2.4,
      cycles: 2,
    },
  },
];

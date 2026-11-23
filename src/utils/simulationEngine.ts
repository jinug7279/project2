import {
  type BodySideFilter,
  type FramePoseData,
  JOINT_META,
  type JointAnglePair,
  type JointGroup,
  type JointStatSummary,
  type KeyframeSnapshot,
  MOVEMENT_PRESETS,
  type Point2D,
  type SimulationParams,
} from "../types/biomechanics";

const STAGE_W = 960;
const STAGE_H = 540;
const ASPECT_RATIO = STAGE_W / STAGE_H;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Smooth bell curve [0 -> 1 -> 0] over phase in [0, 1]
function smoothBell(phase: number): number {
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

// Compute exact geometric angle ABC in degrees (aspect-ratio corrected)
function calcAngleDeg(a: Point2D, b: Point2D, c: Point2D): number {
  const v1x = (a.x - b.x) * ASPECT_RATIO;
  const v1y = a.y - b.y;
  const v2x = (c.x - b.x) * ASPECT_RATIO;
  const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) return 180;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return Math.round(((Math.acos(cos) * 180) / Math.PI) * 10) / 10;
}

function calcTrunkLeanDeg(ls: Point2D, rs: Point2D, lh: Point2D, rh: Point2D): number {
  const sX = ((ls.x + rs.x) / 2) * ASPECT_RATIO;
  const sY = (ls.y + rs.y) / 2;
  const hX = ((lh.x + rh.x) / 2) * ASPECT_RATIO;
  const hY = (lh.y + rh.y) / 2;
  const dx = sX - hX;
  const dy = Math.max(1e-5, hY - sY);
  return Math.round(((Math.atan2(Math.abs(dx), dy) * 180) / Math.PI) * 10) / 10;
}

// Helper: place endpoint from origin (in aspect-corrected space) at angle from vertical-down (0 = straight down, + = forward/right, - = backward/left)
function stepFromVerticalDown(
  origin: { x: number; y: number },
  length: number,
  angleFromDownDeg: number
): { x: number; y: number } {
  const rad = degToRad(angleFromDownDeg);
  return {
    x: origin.x + (Math.sin(rad) * length) / ASPECT_RATIO,
    y: origin.y + Math.cos(rad) * length,
  };
}

// Helper: angle from vertical-up (0 = straight up, + = leaning forward/right, - = backward/left)
function stepFromVerticalUp(
  origin: { x: number; y: number },
  length: number,
  angleFromUpDeg: number
): { x: number; y: number } {
  const rad = degToRad(angleFromUpDeg);
  return {
    x: origin.x + (Math.sin(rad) * length) / ASPECT_RATIO,
    y: origin.y - Math.cos(rad) * length,
  };
}

/**
 * Generates MediaPipe-compatible 33-point normalized landmarks at a given timestamp
 * using analytical forward kinematics tailored to each sports movement.
 */
export function computeSimulatedFrame(
  params: SimulationParams,
  timestampSec: number
): FramePoseData {
  const cyclePhase = ((timestampSec % params.tempoSec) / params.tempoSec + 1) % 1;
  const depthScale = params.depthPct / 100;
  const asymRatio = params.asymmetryPct / 100;

  // Normalized anthropometric segment lengths (in vertical normalized units where total height ~ 0.68)
  const thighL = 0.175;
  const shinL = 0.175;
  const footL = 0.065;
  const torsoL = 0.21;
  const upperArmL = 0.125;
  const forearmL = 0.115;
  const handL = 0.045;
  const groundY = 0.86;

  // Initialize 33 landmarks
  const lm: Point2D[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.98,
  }));

  const setPt = (idx: number, pt: { x: number; y: number }) => {
    lm[idx] = { x: pt.x, y: pt.y, visibility: 0.99 };
  };

  if (params.presetId === "squat") {
    const w = smoothBell(cyclePhase);
    // Lateral perspective separation for left vs right limbs
    const leftOffsetX = -0.022;
    const rightOffsetX = 0.022;

    const baseAnkleL = { x: 0.48 + leftOffsetX, y: groundY - 0.025 };
    const baseAnkleR = { x: 0.48 + rightOffsetX, y: groundY - 0.025 };

    // Asymmetry shifts more flexion to left side and less to right side
    const shinForwardL = lerp(3, 24 * depthScale * (1 + asymRatio * 0.45), w);
    const shinForwardR = lerp(3, 24 * depthScale * (1 - asymRatio * 0.45), w);

    const thighBackL = lerp(-4, -68 * depthScale * (1 + asymRatio * 0.35), w);
    const thighBackR = lerp(-4, -68 * depthScale * (1 - asymRatio * 0.35), w);

    const kneeL = stepFromVerticalUp(baseAnkleL, shinL, shinForwardL);
    const kneeR = stepFromVerticalUp(baseAnkleR, shinL, shinForwardR);

    const hipL = stepFromVerticalUp(kneeL, thighL, thighBackL);
    const hipR = stepFromVerticalUp(kneeR, thighL, thighBackR);
    const hipMid = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };

    const trunkAngle = lerp(5, 30 * depthScale + params.trunkLeanBiasDeg, w);
    const shoulderMid = stepFromVerticalUp(hipMid, torsoL, trunkAngle);
    const shoulderL = { x: shoulderMid.x + leftOffsetX * 0.9, y: shoulderMid.y - 0.005 };
    const shoulderR = { x: shoulderMid.x + rightOffsetX * 0.9, y: shoulderMid.y + 0.005 };

    // Arms counterbalance forward during squat descent
    const upperArmFwdL = lerp(12, 72 * depthScale, w);
    const upperArmFwdR = lerp(12, 72 * depthScale * (1 - asymRatio * 0.2), w);
    const elbowL = stepFromVerticalDown(shoulderL, upperArmL, upperArmFwdL);
    const elbowR = stepFromVerticalDown(shoulderR, upperArmL, upperArmFwdR);

    const forearmAngleL = upperArmFwdL + lerp(16, 22, w);
    const forearmAngleR = upperArmFwdR + lerp(16, 22, w);
    const wristL = stepFromVerticalDown(elbowL, forearmL, forearmAngleL);
    const wristR = stepFromVerticalDown(elbowR, forearmL, forearmAngleR);

    const indexL = stepFromVerticalDown(wristL, handL, forearmAngleL - 6);
    const indexR = stepFromVerticalDown(wristR, handL, forearmAngleR - 6);

    const footIndexL = { x: baseAnkleL.x + footL / ASPECT_RATIO, y: groundY };
    const footIndexR = { x: baseAnkleR.x + footL / ASPECT_RATIO, y: groundY };

    const head = stepFromVerticalUp(shoulderMid, 0.085, trunkAngle * 0.65);

    setPt(0, head);
    setPt(11, shoulderL);
    setPt(12, shoulderR);
    setPt(13, elbowL);
    setPt(14, elbowR);
    setPt(15, wristL);
    setPt(16, wristR);
    setPt(19, indexL);
    setPt(20, indexR);
    setPt(23, hipL);
    setPt(24, hipR);
    setPt(25, kneeL);
    setPt(26, kneeR);
    setPt(27, baseAnkleL);
    setPt(28, baseAnkleR);
    setPt(31, footIndexL);
    setPt(32, footIndexR);
  } else if (params.presetId === "sprint") {
    const theta = cyclePhase * Math.PI * 2;
    const stride = depthScale;

    // Hip vertical bounce (double frequency of stride)
    const hipY = 0.49 - Math.abs(Math.sin(theta)) * 0.028 * stride;
    const hipMid = { x: 0.5, y: hipY };
    const hipL = { x: hipMid.x - 0.012, y: hipMid.y };
    const hipR = { x: hipMid.x + 0.012, y: hipMid.y };

    const trunkAngle = 12 + params.trunkLeanBiasDeg * 0.8 + Math.sin(theta * 2) * 2.5;
    const shoulderMid = stepFromVerticalUp(hipMid, torsoL, trunkAngle);
    const shoulderL = { x: shoulderMid.x - 0.014, y: shoulderMid.y };
    const shoulderR = { x: shoulderMid.x + 0.014, y: shoulderMid.y };

    // Thigh swing angles (counter-phase Left vs Right)
    const thighAngleL = 8 + Math.sin(theta) * 48 * stride * (1 + asymRatio * 0.25);
    const thighAngleR = 8 + Math.sin(theta + Math.PI) * 48 * stride * (1 - asymRatio * 0.25);

    const kneeL = stepFromVerticalDown(hipL, thighL, thighAngleL);
    const kneeR = stepFromVerticalDown(hipR, thighL, thighAngleR);

    // Shin trails thigh during drive/recovery (knee flexion)
    const kneeFlexL = 22 + Math.max(0, Math.sin(theta - 0.8)) * 75 * stride + Math.max(0, -Math.sin(theta)) * 55 * stride;
    const kneeFlexR = 22 + Math.max(0, Math.sin(theta + Math.PI - 0.8)) * 75 * stride + Math.max(0, -Math.sin(theta + Math.PI)) * 55 * stride;

    const ankleL = stepFromVerticalDown(kneeL, shinL, thighAngleL - kneeFlexL);
    const ankleR = stepFromVerticalDown(kneeR, shinL, thighAngleR - kneeFlexR);

    const footAngleL = 78 + Math.sin(theta) * 18;
    const footAngleR = 78 + Math.sin(theta + Math.PI) * 18;
    const footIndexL = stepFromVerticalDown(ankleL, footL, thighAngleL - kneeFlexL + footAngleL);
    const footIndexR = stepFromVerticalDown(ankleR, footL, thighAngleR - kneeFlexR + footAngleR);

    // Reciprocal arm swing (opposite to legs)
    const armAngleL = Math.sin(theta + Math.PI) * 46 * stride;
    const armAngleR = Math.sin(theta) * 46 * stride;
    const elbowL = stepFromVerticalDown(shoulderL, upperArmL, armAngleL);
    const elbowR = stepFromVerticalDown(shoulderR, upperArmL, armAngleR);

    const elbowFlexL = 82 + Math.sin(theta + Math.PI) * 16;
    const elbowFlexR = 82 + Math.sin(theta) * 16;
    const wristL = stepFromVerticalDown(elbowL, forearmL, armAngleL + elbowFlexL);
    const wristR = stepFromVerticalDown(elbowR, forearmL, armAngleR + elbowFlexR);

    const indexL = stepFromVerticalDown(wristL, handL, armAngleL + elbowFlexL + 6);
    const indexR = stepFromVerticalDown(wristR, handL, armAngleR + elbowFlexR + 6);
    const head = stepFromVerticalUp(shoulderMid, 0.082, trunkAngle * 0.8);

    setPt(0, head);
    setPt(11, shoulderL);
    setPt(12, shoulderR);
    setPt(13, elbowL);
    setPt(14, elbowR);
    setPt(15, wristL);
    setPt(16, wristR);
    setPt(19, indexL);
    setPt(20, indexR);
    setPt(23, hipL);
    setPt(24, hipR);
    setPt(25, kneeL);
    setPt(26, kneeR);
    setPt(27, ankleL);
    setPt(28, ankleR);
    setPt(31, footIndexL);
    setPt(32, footIndexR);
  } else if (params.presetId === "deadlift") {
    const w = smoothBell(cyclePhase);
    const leftOffsetX = -0.018;
    const rightOffsetX = 0.018;

    const ankleL = { x: 0.47 + leftOffsetX, y: groundY - 0.025 };
    const ankleR = { x: 0.47 + rightOffsetX, y: groundY - 0.025 };

    const shinForwardL = lerp(4, 13 * depthScale, w);
    const shinForwardR = lerp(4, 13 * depthScale * (1 - asymRatio * 0.25), w);
    const kneeL = stepFromVerticalUp(ankleL, shinL, shinForwardL);
    const kneeR = stepFromVerticalUp(ankleR, shinL, shinForwardR);

    const thighBackL = lerp(-5, -34 * depthScale * (1 + asymRatio * 0.2), w);
    const thighBackR = lerp(-5, -34 * depthScale * (1 - asymRatio * 0.2), w);
    const hipL = stepFromVerticalUp(kneeL, thighL, thighBackL);
    const hipR = stepFromVerticalUp(kneeR, thighL, thighBackR);
    const hipMid = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };

    const trunkAngle = lerp(6, 58 * depthScale + params.trunkLeanBiasDeg * 0.85, w);
    const shoulderMid = stepFromVerticalUp(hipMid, torsoL, trunkAngle);
    const shoulderL = { x: shoulderMid.x + leftOffsetX, y: shoulderMid.y - 0.004 };
    const shoulderR = { x: shoulderMid.x + rightOffsetX, y: shoulderMid.y + 0.004 };

    // Arms hang vertically downward holding barbell along midfoot
    const armTargetX = 0.49;
    const elbowL = stepFromVerticalDown(shoulderL, upperArmL, lerp(4, -6, w));
    const elbowR = stepFromVerticalDown(shoulderR, upperArmL, lerp(4, -6, w));
    const wristL = { x: armTargetX + leftOffsetX * 0.7, y: elbowL.y + forearmL * 0.96 };
    const wristR = { x: armTargetX + rightOffsetX * 0.7, y: elbowR.y + forearmL * 0.96 };
    const indexL = { x: wristL.x, y: wristL.y + handL };
    const indexR = { x: wristR.x, y: wristR.y + handL };

    const footIndexL = { x: ankleL.x + footL / ASPECT_RATIO, y: groundY };
    const footIndexR = { x: ankleR.x + footL / ASPECT_RATIO, y: groundY };
    const head = stepFromVerticalUp(shoulderMid, 0.082, trunkAngle * 0.75);

    setPt(0, head);
    setPt(11, shoulderL);
    setPt(12, shoulderR);
    setPt(13, elbowL);
    setPt(14, elbowR);
    setPt(15, wristL);
    setPt(16, wristR);
    setPt(19, indexL);
    setPt(20, indexR);
    setPt(23, hipL);
    setPt(24, hipR);
    setPt(25, kneeL);
    setPt(26, kneeR);
    setPt(27, ankleL);
    setPt(28, ankleR);
    setPt(31, footIndexL);
    setPt(32, footIndexR);
  } else if (params.presetId === "golf_swing") {
    // Front/facing view golf swing phases:
    // 0.00-0.15 Address -> 0.15-0.48 Backswing -> 0.48-0.64 Downswing/Impact -> 0.64-1.00 Follow-through & Return
    let swingAngle = 0; // -1 = full backswing (viewer's left/athlete's right), +1.15 = full follow-through
    if (cyclePhase < 0.45) {
      const p = cyclePhase / 0.45;
      swingAngle = -Math.sin((p * Math.PI) / 2) * 1.0 * depthScale;
    } else if (cyclePhase < 0.68) {
      const p = (cyclePhase - 0.45) / 0.23;
      swingAngle = lerp(-1.0 * depthScale, 1.15 * depthScale, p * p * (3 - 2 * p));
    } else {
      const p = (cyclePhase - 0.68) / 0.32;
      swingAngle = lerp(1.15 * depthScale, 0, p * p * (3 - 2 * p));
    }

    const hipShiftX = swingAngle * 0.028 * (1 + asymRatio * 0.4);
    const hipMid = { x: 0.5 + hipShiftX, y: 0.52 };
    const stanceHalfW = 0.075;
    const shoulderHalfW = 0.068 * Math.cos(swingAngle * 0.55);

    const ankleL = { x: 0.5 - stanceHalfW, y: groundY - 0.02 };
    const ankleR = { x: 0.5 + stanceHalfW, y: groundY - 0.02 };
    const footIndexL = { x: ankleL.x - 0.028, y: groundY };
    const footIndexR = { x: ankleR.x + 0.028, y: groundY };

    const hipL = { x: hipMid.x - 0.042, y: hipMid.y };
    const hipR = { x: hipMid.x + 0.042, y: hipMid.y };

    const kneeFlex = 14 + params.trunkLeanBiasDeg * 0.25;
    const kneeL = {
      x: (ankleL.x + hipL.x) / 2 + swingAngle * 0.018,
      y: (ankleL.y + hipL.y) / 2 - kneeFlex * 0.0005,
    };
    const kneeR = {
      x: (ankleR.x + hipR.x) / 2 + swingAngle * 0.012,
      y: (ankleR.y + hipR.y) / 2 - kneeFlex * 0.0005,
    };

    const torsoTilt = swingAngle * 10 + (params.trunkLeanBiasDeg - 14) * 0.35;
    const shoulderMid = stepFromVerticalUp(hipMid, torsoL * 0.94, torsoTilt);
    const shoulderL = { x: shoulderMid.x - shoulderHalfW, y: shoulderMid.y + swingAngle * 0.015 };
    const shoulderR = { x: shoulderMid.x + shoulderHalfW, y: shoulderMid.y - swingAngle * 0.015 };

    // Club hands arc from bottom center up to backswing shoulder and follow-through shoulder
    const arcTheta = swingAngle * degToRad(118);
    const clubHandX = shoulderMid.x + (Math.sin(arcTheta) * 0.21) / ASPECT_RATIO;
    const clubHandY = shoulderMid.y + Math.cos(arcTheta) * 0.21;

    // Lead arm (left on screen) stays relatively straight; trail arm folds at top
    const elbowL = {
      x: lerp(shoulderL.x, clubHandX, 0.52) - 0.015,
      y: lerp(shoulderL.y, clubHandY, 0.52) + 0.012,
    };
    const elbowR = {
      x: lerp(shoulderR.x, clubHandX, 0.48) + 0.022,
      y: lerp(shoulderR.y, clubHandY, 0.48) + 0.025,
    };
    const wristL = { x: clubHandX - 0.005, y: clubHandY };
    const wristR = { x: clubHandX + 0.005, y: clubHandY };

    // Wrist cock angle varies dynamically with swingAngle
    const cockAngle = Math.abs(swingAngle) * 32;
    const indexL = stepFromVerticalDown(wristL, handL * 1.3, swingAngle * 95 + cockAngle);
    const indexR = stepFromVerticalDown(wristR, handL * 1.3, swingAngle * 95 + cockAngle);
    const head = stepFromVerticalUp(shoulderMid, 0.08, torsoTilt * 0.3);

    setPt(0, head);
    setPt(11, shoulderL);
    setPt(12, shoulderR);
    setPt(13, elbowL);
    setPt(14, elbowR);
    setPt(15, wristL);
    setPt(16, wristR);
    setPt(19, indexL);
    setPt(20, indexR);
    setPt(23, hipL);
    setPt(24, hipR);
    setPt(25, kneeL);
    setPt(26, kneeR);
    setPt(27, ankleL);
    setPt(28, ankleR);
    setPt(31, footIndexL);
    setPt(32, footIndexR);
  } else {
    // Forward Lunge (sagittal split stance)
    const w = smoothBell(cyclePhase);
    const frontAnkle = { x: 0.62, y: groundY - 0.025 };
    const rearAnkle = { x: 0.34, y: groundY - 0.045 - w * 0.015 };

    const frontShinFwd = lerp(4, 18 * depthScale * (1 + asymRatio * 0.3), w);
    const kneeR = stepFromVerticalUp(frontAnkle, shinL, frontShinFwd);
    const thighAngleR = lerp(-24, -78 * depthScale, w);
    const hipR = stepFromVerticalUp(kneeR, thighL, thighAngleR);

    // Rear leg descends straight below hip
    const rearShinAngle = lerp(26, 76 * depthScale * (1 - asymRatio * 0.25), w);
    const kneeL = stepFromVerticalUp(rearAnkle, shinL, rearShinAngle);
    const hipL = { x: hipR.x - 0.018, y: hipR.y };
    const hipMid = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };

    const trunkAngle = lerp(4, 12 + params.trunkLeanBiasDeg, w);
    const shoulderMid = stepFromVerticalUp(hipMid, torsoL, trunkAngle);
    const shoulderL = { x: shoulderMid.x - 0.014, y: shoulderMid.y };
    const shoulderR = { x: shoulderMid.x + 0.014, y: shoulderMid.y };

    const armFwdL = lerp(10, 32 * depthScale, w);
    const armBackR = lerp(8, -18 * depthScale, w);
    const elbowL = stepFromVerticalDown(shoulderL, upperArmL, armFwdL);
    const elbowR = stepFromVerticalDown(shoulderR, upperArmL, armBackR);
    const wristL = stepFromVerticalDown(elbowL, forearmL, armFwdL + 48);
    const wristR = stepFromVerticalDown(elbowR, forearmL, armBackR + 42);
    const indexL = stepFromVerticalDown(wristL, handL, armFwdL + 44);
    const indexR = stepFromVerticalDown(wristR, handL, armBackR + 38);

    const footIndexR = { x: frontAnkle.x + footL / ASPECT_RATIO, y: groundY };
    const footIndexL = { x: rearAnkle.x + (footL * 0.65) / ASPECT_RATIO, y: groundY };
    const head = stepFromVerticalUp(shoulderMid, 0.082, trunkAngle * 0.7);

    setPt(0, head);
    setPt(11, shoulderL);
    setPt(12, shoulderR);
    setPt(13, elbowL);
    setPt(14, elbowR);
    setPt(15, wristL);
    setPt(16, wristR);
    setPt(19, indexL);
    setPt(20, indexR);
    setPt(23, hipL);
    setPt(24, hipR);
    setPt(25, kneeL);
    setPt(26, kneeR);
    setPt(27, rearAnkle);
    setPt(28, frontAnkle);
    setPt(31, footIndexL);
    setPt(32, footIndexR);
  }

  // Exact geometric joint angle extraction from simulated landmarks
  const angles: Record<JointGroup, JointAnglePair> = {
    shoulder: {
      left: calcAngleDeg(lm[23], lm[11], lm[13]),
      right: calcAngleDeg(lm[24], lm[12], lm[14]),
    },
    elbow: {
      left: calcAngleDeg(lm[11], lm[13], lm[15]),
      right: calcAngleDeg(lm[12], lm[14], lm[16]),
    },
    wrist: {
      left: calcAngleDeg(lm[13], lm[15], lm[19]),
      right: calcAngleDeg(lm[14], lm[16], lm[20]),
    },
    hip: {
      left: calcAngleDeg(lm[11], lm[23], lm[25]),
      right: calcAngleDeg(lm[12], lm[24], lm[26]),
    },
    knee: {
      left: calcAngleDeg(lm[23], lm[25], lm[27]),
      right: calcAngleDeg(lm[24], lm[26], lm[28]),
    },
    ankle: {
      left: calcAngleDeg(lm[25], lm[27], lm[31]),
      right: calcAngleDeg(lm[26], lm[28], lm[32]),
    },
  };

  const trunkLean = calcTrunkLeanDeg(lm[11], lm[12], lm[23], lm[24]);
  const comX = Math.round(((lm[23].x + lm[24].x) / 2) * 1000) / 1000;

  return {
    timestampSec: Math.round(timestampSec * 100) / 100,
    landmarks: lm,
    angles,
    trunkLean,
    comX,
    visibilityScore: 1,
  };
}

export function summarizeJoints(frames: FramePoseData[]): {
  summary: JointStatSummary[];
  avgTrunkLean: number | null;
} {
  const joints: JointGroup[] = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"];
  const summary: JointStatSummary[] = joints.map((joint) => {
    const leftVals: number[] = [];
    const rightVals: number[] = [];

    for (const f of frames) {
      const l = f.angles[joint].left;
      const r = f.angles[joint].right;
      if (l !== null) leftVals.push(l);
      if (r !== null) rightVals.push(r);
    }

    const leftMin = leftVals.length ? Math.min(...leftVals) : null;
    const leftMax = leftVals.length ? Math.max(...leftVals) : null;
    const leftRom =
      leftMin !== null && leftMax !== null ? Math.round((leftMax - leftMin) * 10) / 10 : null;
    const leftMean = leftVals.length
      ? Math.round((leftVals.reduce((a, b) => a + b, 0) / leftVals.length) * 10) / 10
      : null;

    const rightMin = rightVals.length ? Math.min(...rightVals) : null;
    const rightMax = rightVals.length ? Math.max(...rightVals) : null;
    const rightRom =
      rightMin !== null && rightMax !== null ? Math.round((rightMax - rightMin) * 10) / 10 : null;
    const rightMean = rightVals.length
      ? Math.round((rightVals.reduce((a, b) => a + b, 0) / rightVals.length) * 10) / 10
      : null;

    const asymmetryDeg =
      leftMean !== null && rightMean !== null
        ? Math.round(Math.abs(leftMean - rightMean) * 10) / 10
        : null;

    return {
      joint,
      labelKo: JOINT_META[joint].labelKo,
      leftMin,
      leftMax,
      leftRom,
      leftMean,
      rightMin,
      rightMax,
      rightRom,
      rightMean,
      asymmetryDeg,
    };
  });

  const trunkVals = frames.map((f) => f.trunkLean).filter((v): v is number => v !== null);
  const avgTrunkLean = trunkVals.length
    ? Math.round((trunkVals.reduce((a, b) => a + b, 0) / trunkVals.length) * 10) / 10
    : null;

  return { summary, avgTrunkLean };
}

export interface SimulationRenderOptions {
  showSkeleton: boolean;
  showAngles: boolean;
  showComLine: boolean;
  sideFilter: BodySideFilter;
  presetId?: SimulationParams["presetId"];
}

const POSE_CONNECTIONS: Array<[number, number, "left" | "right" | "center"]> = [
  [11, 12, "center"],
  [11, 23, "left"],
  [12, 24, "right"],
  [23, 24, "center"],
  [11, 13, "left"],
  [13, 15, "left"],
  [15, 19, "left"],
  [12, 14, "right"],
  [14, 16, "right"],
  [16, 20, "right"],
  [23, 25, "left"],
  [25, 27, "left"],
  [27, 31, "left"],
  [24, 26, "right"],
  [26, 28, "right"],
  [28, 32, "right"],
];

const JOINT_LANDMARK_MAP: Array<{
  joint: JointGroup;
  side: "left" | "right";
  idx: number;
}> = [
  { joint: "shoulder", side: "left", idx: 11 },
  { joint: "shoulder", side: "right", idx: 12 },
  { joint: "elbow", side: "left", idx: 13 },
  { joint: "elbow", side: "right", idx: 14 },
  { joint: "wrist", side: "left", idx: 15 },
  { joint: "wrist", side: "right", idx: 16 },
  { joint: "hip", side: "left", idx: 23 },
  { joint: "hip", side: "right", idx: 24 },
  { joint: "knee", side: "left", idx: 25 },
  { joint: "knee", side: "right", idx: 26 },
  { joint: "ankle", side: "left", idx: 27 },
  { joint: "ankle", side: "right", idx: 28 },
];

export function drawSimulationStage(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  frame: FramePoseData | null,
  options: SimulationRenderOptions
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 1. Calibrated Biomechanics Laboratory Backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  bgGrad.addColorStop(0, "#09182E");
  bgGrad.addColorStop(1, "#0D2342");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Aspect-preserving drawing box
  const canvasAspect = canvasWidth / canvasHeight;
  let drawW = canvasWidth;
  let drawH = canvasHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (ASPECT_RATIO > canvasAspect) {
    drawW = canvasWidth;
    drawH = canvasWidth / ASPECT_RATIO;
    offsetY = (canvasHeight - drawH) / 2;
  } else {
    drawH = canvasHeight;
    drawW = canvasHeight * ASPECT_RATIO;
    offsetX = (canvasWidth - drawW) / 2;
  }

  const toPx = (pt: { x: number; y: number }) => ({
    x: offsetX + pt.x * drawW,
    y: offsetY + pt.y * drawH,
  });

  // Subtle calibration gridlines
  ctx.strokeStyle = "rgba(148, 163, 184, 0.11)";
  ctx.lineWidth = 1;
  const gridStep = Math.max(36, Math.round(drawW / 16));
  for (let x = offsetX % gridStep; x < canvasWidth; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }
  for (let y = offsetY % gridStep; y < canvasHeight; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }

  // Force Plate / Ground Reference Line
  const groundPxY = offsetY + 0.865 * drawH;
  ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(offsetX + drawW * 0.12, groundPxY);
  ctx.lineTo(offsetX + drawW * 0.88, groundPxY);
  ctx.stroke();

  if (!frame || !frame.landmarks) return;
  const lm = frame.landmarks;

  // Vertical Center of Mass (COM) Plumb Line
  if (options.showComLine && frame.comX !== null) {
    const comPx = offsetX + frame.comX * drawW;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(comPx, offsetY + drawH * 0.14);
    ctx.lineTo(comPx, groundPxY);
    ctx.stroke();
    ctx.restore();

    const hipMidY = ((lm[23].y + lm[24].y) / 2) * drawH + offsetY;
    ctx.beginPath();
    ctx.arc(comPx, hipMidY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250, 204, 21, 0.9)";
    ctx.fill();
  }

  // Anatomical Silhouette Torso + Head
  const headPx = toPx(lm[0]);
  const sMid = toPx({ x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 });
  const hMid = toPx({ x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 });

  // Head circle & neck
  ctx.beginPath();
  ctx.moveTo(sMid.x, sMid.y);
  ctx.lineTo(headPx.x, headPx.y);
  ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const headR = Math.max(10, drawH * 0.036);
  ctx.beginPath();
  ctx.arc(headPx.x, headPx.y, headR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(30, 58, 138, 0.55)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(226, 232, 240, 0.9)";
  ctx.stroke();

  // Spine / Trunk Center Axis
  ctx.beginPath();
  ctx.moveTo(hMid.x, hMid.y);
  ctx.lineTo(sMid.x, sMid.y);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.stroke();

  // Skeleton Connections
  if (options.showSkeleton) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [iA, iB, side] of POSE_CONNECTIONS) {
      if (options.sideFilter !== "both" && side !== "center" && side !== options.sideFilter) {
        continue;
      }
      const a = toPx(lm[iA]);
      const b = toPx(lm[iB]);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = side === "center" ? 3.5 : 4.5;
      ctx.strokeStyle =
        side === "left"
          ? "#3B82F6"
          : side === "right"
            ? "#22D3EE"
            : "rgba(248, 250, 252, 0.9)";
      ctx.stroke();
    }

    const bodyNodes = [11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32];
    for (const idx of bodyNodes) {
      const isLeft = idx % 2 === 1;
      const side = isLeft ? "left" : "right";
      if (options.sideFilter !== "both" && side !== options.sideFilter) {
        continue;
      }
      const p = toPx(lm[idx]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = isLeft ? "#2563EB" : "#06B6D4";
      ctx.stroke();
    }
  }

  // Real-time Joint Angle Labels
  if (options.showAngles) {
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";

    for (const item of JOINT_LANDMARK_MAP) {
      if (options.sideFilter !== "both" && item.side !== options.sideFilter) {
        continue;
      }
      const angleVal = frame.angles[item.joint][item.side];
      if (angleVal === null) continue;

      const p = toPx(lm[item.idx]);
      const text = `${JOINT_META[item.joint].labelKo} ${Math.round(angleVal)}°`;
      const metrics = ctx.measureText(text);
      const boxW = metrics.width + 10;
      const boxH = 20;
      const labelX = item.side === "left" ? p.x - boxW - 10 : p.x + 10;
      const labelY = Math.max(8, Math.min(canvasHeight - boxH - 8, p.y - boxH / 2));

      ctx.fillStyle = "rgba(11, 31, 58, 0.88)";
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, boxW, boxH, 4);
      ctx.fill();

      ctx.strokeStyle = item.side === "left" ? "rgba(59, 130, 246, 0.75)" : "rgba(34, 211, 238, 0.75)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#F8FAFC";
      ctx.fillText(text, labelX + 5, labelY + boxH / 2);
    }
  }

  // Subtle corner coordinate indicator
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
  ctx.fillText(
    `t = ${frame.timestampSec.toFixed(2)}s · 상체 기울기 ${frame.trunkLean?.toFixed(1) ?? "-"}°`,
    16,
    24
  );
}

export function findNearestFrame(frames: FramePoseData[], timestampSec: number): FramePoseData | null {
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestDiff = Math.abs(frames[0].timestampSec - timestampSec);
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].timestampSec - timestampSec);
    if (d < bestDiff) {
      best = frames[i];
      bestDiff = d;
    }
  }
  return best;
}

export interface GeneratedSimulationData {
  exerciseType: string;
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
}

export function generateSimulationDataset(params: SimulationParams): GeneratedSimulationData {
  const preset = MOVEMENT_PRESETS.find((p) => p.id === params.presetId) ?? MOVEMENT_PRESETS[0];
  const durationSec = Math.round(params.tempoSec * params.cycles * 100) / 100;
  const fpsSampled = 20;
  const totalFrames = Math.max(24, Math.min(140, Math.round(durationSec * fpsSampled)));

  const frames: FramePoseData[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = (i / (totalFrames - 1)) * durationSec;
    frames.push(computeSimulatedFrame(params, t));
  }

  const { summary, avgTrunkLean } = summarizeJoints(frames);

  // Render 3 real canvas snapshots for Gemini vision inspection & thumbnail
  const snapCanvas = document.createElement("canvas");
  snapCanvas.width = 640;
  snapCanvas.height = 360;
  const ctx = snapCanvas.getContext("2d");

  const keyframeImages: KeyframeSnapshot[] = [];
  if (ctx) {
    const peakIndex = Math.round((totalFrames - 1) / (params.cycles * 2));
    const midIndex = Math.min(totalFrames - 1, Math.max(1, peakIndex));
    const indices: Array<{ idx: number; label: string }> = [
      { idx: 0, label: "시작 · 준비 자세" },
      { idx: midIndex, label: "최대 가동 · 전환 구간" },
      { idx: totalFrames - 1, label: "마무리 · 복귀 자세" },
    ];

    for (const item of indices) {
      const f = frames[item.idx];
      drawSimulationStage(ctx, snapCanvas.width, snapCanvas.height, f, {
        showSkeleton: true,
        showAngles: true,
        showComLine: true,
        sideFilter: "both",
        presetId: params.presetId,
      });
      keyframeImages.push({
        label: item.label,
        timestampSec: f.timestampSec,
        dataUrl: snapCanvas.toDataURL("image/jpeg", 0.8),
      });
    }
  }

  return {
    exerciseType: preset.nameKo,
    durationSec,
    videoWidth: STAGE_W,
    videoHeight: STAGE_H,
    fpsSampled,
    framesDetected: frames.length,
    totalFramesSampled: frames.length,
    frames,
    summary,
    avgTrunkLean,
    thumbnailDataUrl: keyframeImages[1]?.dataUrl ?? keyframeImages[0]?.dataUrl ?? "",
    keyframeImages,
  };
}

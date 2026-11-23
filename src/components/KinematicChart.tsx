import React, { useMemo, useRef, useState } from "react";
import {
  type BodySideFilter,
  type FramePoseData,
  JOINT_META,
  type JointGroup,
} from "../types/biomechanics";

interface KinematicChartProps {
  frames: FramePoseData[];
  durationSec: number;
  currentTimeSec: number;
  onSeek: (timeSec: number) => void;
  activeJoints: JointGroup[];
  onToggleJoint: (joint: JointGroup) => void;
  sideFilter: BodySideFilter;
  onChangeSide: (side: BodySideFilter) => void;
}

const ALL_JOINTS: JointGroup[] = ["knee", "hip", "ankle", "shoulder", "elbow", "wrist"];

export const KinematicChart: React.FC<KinematicChartProps> = ({
  frames,
  durationSec,
  currentTimeSec,
  onSeek,
  activeJoints,
  onToggleJoint,
  sideFilter,
  onChangeSide,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 960;
  const height = 270;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const safeDuration = Math.max(durationSec, 0.2);

  const toX = (t: number) => padL + (Math.min(Math.max(t, 0), safeDuration) / safeDuration) * plotW;
  const toY = (deg: number) => padT + plotH - (Math.min(Math.max(deg, 0), 185) / 185) * plotH;

  const seriesPaths = useMemo(() => {
    const items: Array<{
      key: string;
      joint: JointGroup;
      side: "left" | "right";
      color: string;
      dashed: boolean;
      pathD: string;
    }> = [];

    for (const joint of activeJoints) {
      const sidesToRender: Array<"left" | "right"> =
        sideFilter === "both" ? ["left", "right"] : [sideFilter];

      for (const side of sidesToRender) {
        let pathD = "";
        let drawing = false;
        for (const f of frames) {
          const val = f.angles[joint][side];
          if (val === null) {
            drawing = false;
            continue;
          }
          const x = toX(f.timestampSec).toFixed(1);
          const y = toY(val).toFixed(1);
          pathD += drawing ? ` L ${x} ${y}` : ` M ${x} ${y}`;
          drawing = true;
        }

        if (pathD.trim()) {
          items.push({
            key: `${joint}-${side}`,
            joint,
            side,
            color: side === "left" ? JOINT_META[joint].colorLeft : JOINT_META[joint].colorRight,
            dashed: side === "right" && sideFilter === "both",
            pathD: pathD.trim(),
          });
        }
      }
    }
    return items;
  }, [frames, activeJoints, sideFilter, safeDuration]);

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || frames.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedPlotX = Math.min(Math.max(relX - padL, 0), plotW);
    const targetTime = (clampedPlotX / plotW) * safeDuration;

    let nearest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const d = Math.abs(frames[i].timestampSec - targetTime);
      if (d < minDiff) {
        minDiff = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedPlotX = Math.min(Math.max(relX - padL, 0), plotW);
    const targetTime = (clampedPlotX / plotW) * safeDuration;
    onSeek(targetTime);
  };

  const hoveredFrame = hoverIdx !== null ? frames[hoverIdx] : null;
  const playheadX = toX(currentTimeSec);

  const yTicks = [0, 45, 90, 135, 180];
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => (safeDuration * i) / xTickCount);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-[#0B1F3A]">
            시간별 관절 각도 변화 그래프
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            그래프 위를 클릭하면 해당 시점의 영상 프레임으로 즉시 이동합니다 · 실선: 좌측 · 점선: 우측
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Joint selector buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ALL_JOINTS.map((joint) => {
              const active = activeJoints.includes(joint);
              return (
                <button
                  key={joint}
                  type="button"
                  onClick={() => onToggleJoint(joint)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: JOINT_META[joint].colorLeft }}
                    aria-hidden="true"
                  />
                  <span>{JOINT_META[joint].labelKo}</span>
                </button>
              );
            })}
          </div>

          {/* Side filter */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
            {(
              [
                { id: "both", label: "양측" },
                { id: "left", label: "좌측" },
                { id: "right", label: "우측" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSide(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sideFilter === opt.id
                    ? "bg-white text-[#0B1F3A] shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live readout HUD when hovering */}
      <div className="min-h-8 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-600">
        <span className="font-semibold text-[#0B1F3A]">
          {hoveredFrame
            ? `미리보기 시점: ${hoveredFrame.timestampSec.toFixed(2)}s`
            : `현재 재생 시점: ${currentTimeSec.toFixed(2)}s`}
        </span>
        {(hoveredFrame ?? frames.find((f) => Math.abs(f.timestampSec - currentTimeSec) < 0.25)) &&
          activeJoints.map((j) => {
            const refFrame =
              hoveredFrame ?? frames.find((f) => Math.abs(f.timestampSec - currentTimeSec) < 0.25);
            if (!refFrame) return null;
            const l = refFrame.angles[j].left;
            const r = refFrame.angles[j].right;
            return (
              <span key={j} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-xs"
                  style={{ backgroundColor: JOINT_META[j].colorLeft }}
                />
                <span className="text-slate-500">{JOINT_META[j].labelKo}</span>
                <span className="text-slate-900 font-medium">
                  좌 {l !== null ? `${l.toFixed(1)}°` : "-"} / 우{" "}
                  {r !== null ? `${r.toFixed(1)}°` : "-"}
                </span>
              </span>
            );
          })}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-crosshair select-none"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverIdx(null)}
          onClick={handleSvgClick}
          role="img"
          aria-label="시간별 주요 관절 각도 변화 그래프"
        >
          {/* Horizontal grid & Y labels */}
          {yTicks.map((deg) => {
            const y = toY(deg);
            return (
              <g key={deg}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px] font-mono"
                >
                  {deg}°
                </text>
              </g>
            );
          })}

          {/* X-axis ticks */}
          {xTicks.map((t, idx) => {
            const x = toX(t);
            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + plotH}
                  stroke="#F1F5F9"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px] font-mono"
                >
                  {t.toFixed(1)}s
                </text>
              </g>
            );
          })}

          {/* Data curves */}
          {seriesPaths.map((s) => (
            <path
              key={s.key}
              d={s.pathD}
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Hover crosshair */}
          {hoveredFrame && (
            <line
              x1={toX(hoveredFrame.timestampSec)}
              y1={padT}
              x2={toX(hoveredFrame.timestampSec)}
              y2={padT + plotH}
              stroke="#94A3B8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Active video playhead */}
          <line
            x1={playheadX}
            y1={padT}
            x2={playheadX}
            y2={padT + plotH}
            stroke="#0B1F3A"
            strokeWidth={2}
          />
          <circle cx={playheadX} cy={padT} r={4} fill="#0B1F3A" />
        </svg>
      </div>
    </div>
  );
};

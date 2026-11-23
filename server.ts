import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface JointSummaryPayload {
  joint: string;
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

interface KeyframePayload {
  label: string;
  timestampSec: number;
  dataUrl: string;
}

interface AnalyzeRequestBody {
  exerciseType: string;
  fileName: string;
  durationSec: number;
  framesDetected: number;
  totalFramesSampled: number;
  avgTrunkLean: number | null;
  summary: JointSummaryPayload[];
  keyframes: KeyframePayload[];
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "18mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/analyze-biomechanics", async (req, res) => {
    try {
      const body = req.body as AnalyzeRequestBody;

      if (!body || !Array.isArray(body.summary) || body.framesDetected <= 0) {
        res.status(400).json({
          error: "유효한 관절 추출 데이터가 없습니다. 인체가 인식된 영상으로 다시 분석해 주세요.",
          code: "INVALID_POSE_DATA",
        });
        return;
      }

      let ai: GoogleGenAI;
      try {
        ai = getGeminiClient();
      } catch {
        res.status(503).json({
          error:
            "AI 분석 API 키(GEMINI_API_KEY)가 설정되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const formattedJointMetrics = body.summary
        .map((j) => {
          const lStr =
            j.leftMin !== null && j.leftMax !== null && j.leftRom !== null
              ? `좌측 최소 ${j.leftMin.toFixed(1)}° / 최대 ${j.leftMax.toFixed(1)}° / 가동범위(ROM) ${j.leftRom.toFixed(1)}° (평균 ${j.leftMean?.toFixed(1)}°)`
              : "좌측 미측정(가려짐)";
          const rStr =
            j.rightMin !== null && j.rightMax !== null && j.rightRom !== null
              ? `우측 최소 ${j.rightMin.toFixed(1)}° / 최대 ${j.rightMax.toFixed(1)}° / 가동범위(ROM) ${j.rightRom.toFixed(1)}° (평균 ${j.rightMean?.toFixed(1)}°)`
              : "우측 미측정(가려짐)";
          const asym =
            j.asymmetryDeg !== null ? `좌우 평균 차이 ${j.asymmetryDeg.toFixed(1)}°` : "좌우 비교 불가";
          return `- ${j.labelKo}: ${lStr} | ${rStr} | ${asym}`;
        })
        .join("\n");

      const trunkLine =
        body.avgTrunkLean !== null
          ? `상체 평균 전경 각도(수직선 기준): ${body.avgTrunkLean.toFixed(1)}°`
          : "상체 전경 각도: 측정 불가";

      const promptText = `당신은 스포츠공학(Sports Biomechanics) 및 운동역학 전문 AI 분석가입니다.
아래는 사용자가 SPORTS AI 시뮬레이션 환경에서 실행한 운동 동작의 순운동학(Forward Kinematics) 관절 각도 실측 데이터와 주요 시점 키프레임 이미지입니다.

[시뮬레이션 및 계측 메타데이터]
- 운동 동작 종목: ${body.exerciseType}
- 시뮬레이션 길이: ${body.durationSec.toFixed(2)}초
- 분석 프레임 수: ${body.framesDetected}프레임
- ${trunkLine}

[6대 주요 관절 실측 데이터]
${formattedJointMetrics}

[분석 지침]
1. 반드시 위 계측 각도 수치와 첨부된 시뮬레이션 키프레임 이미지에 근거해서만 분석하십시오.
2. 관절 가동범위(ROM), 상체 전경 각도, 좌우 비대칭 수치가 부상 위험이나 운동 효율성에 미치는 영향을 구체적인 수치(도, °)를 인용해 한국어로 작성하십시오.
3. 측정된 편향이나 비대칭이 있다면 개선할 점과 실천 가능한 교정 운동 드릴을 제안하십시오.`;

      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (Array.isArray(body.keyframes)) {
        for (const kf of body.keyframes.slice(0, 4)) {
          const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(kf.dataUrl);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: { parts },
        config: {
          systemInstruction:
            "스포츠공학 생체역학 연구원 어조로 정밀하고 객관적인 한국어 JSON 응답만 반환하십시오. 실측되지 않은 수치는 절대 지어내지 마십시오.",
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedMovement: {
                type: Type.STRING,
                description: "영상과 관절 패턴에서 판별된 실제 운동 동작 명칭 (한국어)",
              },
              overallSummary: {
                type: Type.STRING,
                description: "전체 움직임 역학, 안정성 및 효율성에 대한 2~3문장 전문 총평",
              },
              postureCharacteristics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "실측 각도 수치를 인용한 주요 동작 특징 3~4가지",
              },
              jointEvaluations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    jointName: { type: Type.STRING, description: "관절명 (예: 무릎, 골반, 어깨)" },
                    side: { type: Type.STRING, description: "양측, 좌측, 또는 우측" },
                    status: {
                      type: Type.STRING,
                      description: "반드시 '양호', '주의', '개선필요' 중 하나",
                    },
                    measuredRom: {
                      type: Type.STRING,
                      description: "실측된 가동범위/각도 요약 문자열",
                    },
                    finding: {
                      type: Type.STRING,
                      description: "해당 관절의 생체역학적 관찰 소견",
                    },
                    recommendation: {
                      type: Type.STRING,
                      description: "해당 관절의 구체적 자세 교정 팁",
                    },
                  },
                },
              },
              improvementPoints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "개선 항목 제목" },
                    priority: {
                      type: Type.STRING,
                      description: "반드시 '높음', '중간', '낮음' 중 하나",
                    },
                    description: { type: Type.STRING, description: "개선 필요 이유 및 역학적 영향" },
                    drill: { type: Type.STRING, description: "실천 가능한 교정 운동 또는 큐잉" },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = (response.text ?? "").trim();
      if (!rawText) {
        res.status(502).json({
          error: "AI 모델로부터 분석 결과를 수신하지 못했습니다. 다시 시도해 주세요.",
          code: "EMPTY_AI_RESPONSE",
        });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({ report: parsed });
    } catch (err: unknown) {
      console.error("[SPORTS AI] /api/analyze-biomechanics error:", err);
      const message = err instanceof Error ? err.message : "알 수 없는 서버 오류";
      if (message.includes("403") || message.includes("PERMISSION_DENIED") || message.includes("API_KEY")) {
        res.status(403).json({
          error:
            "AI API 키 인증에 실패했습니다. Settings > Secrets 패널에서 유효한 GEMINI_API_KEY가 설정되어 있는지 확인해 주세요.",
          code: "API_KEY_INVALID",
        });
        return;
      }
      if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({
          error: "AI 분석 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
          code: "RATE_LIMITED",
        });
        return;
      }
      res.status(500).json({
        error: `생체역학 AI 분석 중 오류가 발생했습니다: ${message}`,
        code: "ANALYSIS_FAILED",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SPORTS AI] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

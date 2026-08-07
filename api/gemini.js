const allowedOrigins = new Set([
  "https://vnrxzxrnt.github.io",
  "https://bsc-busan-surf-cast.vercel.app",
]);

function cors(req, res) {
  const origin = req.headers.origin || "";
  if (allowedOrigins.has(origin) || /^https:\/\/bsc-busan-surf-cast-[\w-]+\.vercel\.app$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isScore(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const zone = cleaned.match(/(?:zone|구역)["'\s:：-]*([ABC])/i)?.[1]?.toUpperCase();
    return { zone, recommendation: cleaned };
  }
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST 요청만 지원합니다." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "AI 추천 설정이 아직 완료되지 않았습니다." });

  const { beach, level, waveStrength, windStrength, depth, zones } = req.body || {};
  if (typeof beach !== "string" || typeof level !== "string" || ![waveStrength, windStrength, depth].every(isScore)) {
    return res.status(400).json({ error: "AI 추천에 필요한 조건이 올바르지 않습니다." });
  }

  const safeZones = Object.fromEntries(
    Object.entries(zones || {}).filter(([key, value]) =>
      ["A", "B", "C"].includes(key) && value && [value.waveStrength, value.windStrength, value.depth].every(isScore)
    )
  );
  if (Object.keys(safeZones).length !== 3) {
    return res.status(400).json({ error: "구역 기준 정보가 부족합니다." });
  }

  const prompt = `당신은 부산 해수욕장의 안전 중심 서핑 구역 추천 코치입니다.
아래 사용자의 프로필과 원하는 조건을 비교해 A, B, C 중 정확히 한 구역을 고르세요.
사용자가 직접 입력한 0~100 값은 실제 관측값이 아니라 원하는 파도 세기, 풍속, 수심의 상대적 강도입니다.
초급자는 안전을 우선하고, 중급·고급자는 원하는 강도와 구역 특성의 유사성을 함께 고려하세요.
응답은 반드시 {"zone":"A","recommendation":"한국어 2~3문장의 구체적인 이유"} 형태의 JSON 하나만 반환하세요.
과장하거나 확정적으로 안전하다고 말하지 마세요.

해수욕장: ${beach.slice(0, 50)}
서핑 등급: ${level.slice(0, 20)}
원하는 파도 세기: ${Number(waveStrength)}
원하는 풍속: ${Number(windStrength)}
원하는 수심: ${Number(depth)}
구역 특성: ${JSON.stringify(safeZones)}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.25 },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Gemini 요청에 실패했습니다.");
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    const parsed = extractJson(text);
    const zone = String(parsed.zone || "").toUpperCase();
    if (!["A", "B", "C"].includes(zone) || !parsed.recommendation) throw new Error("AI 추천 결과 형식이 올바르지 않습니다.");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ zone, recommendation: String(parsed.recommendation).slice(0, 700) });
  } catch (error) {
    return res.status(502).json({ error: error.message || "AI 추천을 불러오지 못했습니다." });
  }
}

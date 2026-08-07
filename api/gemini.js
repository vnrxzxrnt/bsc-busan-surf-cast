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

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST 요청만 지원합니다." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "AI 추천 설정이 아직 완료되지 않았습니다." });

  const { beach, wave, wind, temperature, level, userRequest, zones, preferences } = req.body || {};
  if (![beach, wave, wind, temperature, level, userRequest].every(value => typeof value === "string" || typeof value === "number") || !Array.isArray(zones)) {
    return res.status(400).json({ error: "추천에 필요한 해양 정보가 부족합니다." });
  }

  const safeZones = zones.slice(0, 6).map(zone => ({
    id: String(zone?.id || "").toUpperCase().replace(/[^A-F]/g, "").slice(0, 1),
    wave: Math.max(0, Math.min(20, Number(zone?.wave) || 0)),
    wind: Math.max(0, Math.min(100, Number(zone?.wind) || 0)),
    waveStrength: Math.max(0, Math.min(100, Number(zone?.waveStrength) || 0)),
    windStrength: Math.max(0, Math.min(100, Number(zone?.windStrength) || 0)),
    waterLevel: Math.max(0, Math.min(100, Number(zone?.waterLevel) || 0)),
  })).filter(zone => zone.id);
  if (!safeZones.length) return res.status(400).json({ error: "추천할 구역 정보가 없습니다." });
  const preference = Object.fromEntries(["wave", "wind", "depth"].map(key => [key, Math.max(0, Math.min(100, Number(preferences?.[key]) || 0))]));
  const levelName = String(level).toLowerCase();
  const safetyPenalty = zone => {
    if (/초급|beginner/.test(levelName)) return Math.max(0, zone.waveStrength - 45) * 1.6 + Math.max(0, zone.windStrength - 45) * 1.4;
    if (/중급|intermediate/.test(levelName)) return Math.max(0, zone.waveStrength - 75) + Math.max(0, zone.windStrength - 75);
    return 0;
  };
  const scoredZones = safeZones.map(zone => {
    const distance = Math.abs(preference.wave - zone.waveStrength) + Math.abs(preference.wind - zone.windStrength) + Math.abs(preference.depth - zone.waterLevel);
    const score = Math.max(0, Math.round(100 - (distance + safetyPenalty(zone)) / 3));
    return { ...zone, score };
  }).sort((a, b) => b.score - a.score);
  const selected = scoredZones[0];

  const prompt = `당신은 부산 해변의 안전 중심 서핑 코치입니다. 0~100 선호도와 프로필 실력을 수치 비교한 결과 ${selected.id}구역이 가장 적합하게 선정되었습니다. 추천 구역은 바꾸지 말고, 사용자가 조절한 세 수치와 현재 환경을 근거로 선택 이유를 설명하세요. 해수면 높이는 실제 측정값이 아닌 구역 선택용 상대 선호도이므로 실제 수심이나 조위를 단정하지 마세요. 사용자 요청에 없는 사실(혼잡도, 해저 지형, 수질 등)을 지어내지 말고, 현장 안전요원과 공식 경보를 우선하라는 안내를 포함하세요. 한국어로 답하세요.\n\n해변: ${String(beach).slice(0, 50)}\n전체 파고: ${String(wave).slice(0, 20)}m\n전체 풍속: ${String(wind).slice(0, 20)}m/s\n기온: ${String(temperature).slice(0, 20)}°C\n프로필 실력: ${String(level).slice(0, 30)}\n사용자 설정: 파도 ${preference.wave}/100, 풍속 ${preference.wind}/100, 해수면 높이 ${preference.depth}/100\n선정 구역: ${selected.id}구역 (구역 파고 ${selected.wave}m, 구역 풍속 ${selected.wind}m/s, 수치 일치도 ${selected.score}%)\n추가 요청: ${String(userRequest).slice(0, 300)}\n\n다음 JSON 형식만 출력하세요: {"recommendation":"선택 이유와 안전 안내를 포함한 2~3문장"}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Gemini 요청에 실패했습니다.");
    const raw = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!raw) throw new Error("추천 결과를 받지 못했습니다.");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("추천 결과 형식이 올바르지 않습니다."); }
    const recommendation = String(parsed?.recommendation || "").trim();
    if (!recommendation) throw new Error("추천 설명을 받지 못했습니다.");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ zone: selected.id, match: selected.score, recommendation });
  } catch (error) {
    return res.status(502).json({ error: error.message || "AI 추천을 불러오지 못했습니다." });
  }
}

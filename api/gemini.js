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
    wave: String(zone?.wave || "0").replace(/[^0-9.]/g, "").slice(0, 10),
  })).filter(zone => zone.id);
  if (!safeZones.length) return res.status(400).json({ error: "추천할 구역 정보가 없습니다." });
  const preference = Object.fromEntries(["wave", "wind", "depth"].map(key => [key, Math.max(0, Math.min(100, Number(preferences?.[key]) || 0))]));

  const prompt = `당신은 부산 해변의 안전 중심 서핑 코치입니다. 반드시 제공된 구역 중 하나만 선택하세요. 사용자의 프로필 실력과 요청, 현재 환경, 0~100 선호도를 함께 고려하되 안전을 최우선으로 판단하세요. 선호도 0은 약한 파도·약한 바람·얕은 수심, 100은 강한 파도·강한 바람·깊은 수심을 원한다는 뜻입니다. 수심 선호도는 실제 수심 측정값이 아니므로 특정 구역의 실제 수심을 단정하지 마세요. 초급자는 사용자가 높은 값을 골라도 안전 기준상 낮은 파고와 안정적인 구역을 우선하고, 중급/고급도 위험한 환경에서는 보수적으로 추천하세요. 사용자 요청에 없는 사실(혼잡도, 해저 지형, 수질 등)을 지어내지 마세요. 한국어로 답하세요.\n\n해변: ${String(beach).slice(0, 50)}\n전체 파고: ${String(wave).slice(0, 20)}m\n실제 풍속: ${String(wind).slice(0, 20)}m/s\n기온: ${String(temperature).slice(0, 20)}°C\n프로필 실력: ${String(level).slice(0, 30)}\n원하는 파도 세기: ${preference.wave}/100\n원하는 풍속: ${preference.wind}/100\n선호 수심: ${preference.depth}/100 (실측 아님)\n사용자 요청: ${String(userRequest).slice(0, 300)}\n선택 가능한 구역: ${safeZones.map(zone => `${zone.id}구역(파고 ${zone.wave}m)`).join(", ")}\n\n다음 JSON 형식만 출력하세요: {"zone":"A","recommendation":"선택 이유와 안전 안내를 포함한 2~3문장"}`;

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
    const zone = String(parsed?.zone || "").toUpperCase().replace(/[^A-F]/g, "").slice(0, 1);
    const recommendation = String(parsed?.recommendation || "").trim();
    if (!safeZones.some(item => item.id === zone) || !recommendation) throw new Error("추천 결과가 제공된 구역과 일치하지 않습니다.");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ zone, recommendation });
  } catch (error) {
    return res.status(502).json({ error: error.message || "AI 추천을 불러오지 못했습니다." });
  }
}

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

  const { beach, wave, wind, temperature, level } = req.body || {};
  if (![beach, wave, wind, temperature, level].every(value => typeof value === "string" || typeof value === "number")) {
    return res.status(400).json({ error: "추천에 필요한 해양 정보가 부족합니다." });
  }

  const prompt = `당신은 부산 해변의 안전 중심 서핑 코치입니다. 다음 정보를 바탕으로 한국어로 3문장 이내의 짧은 개인 맞춤 추천을 작성하세요. 현장 안전요원과 공식 경보를 항상 우선하라고 마지막에 덧붙이세요. 과장하거나 정확하지 않은 예측은 하지 마세요.\n해변: ${String(beach).slice(0, 50)}\n파고: ${String(wave).slice(0, 20)}m\n풍속: ${String(wind).slice(0, 20)}m/s\n기온: ${String(temperature).slice(0, 20)}°C\n사용자 실력: ${String(level).slice(0, 30)}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Gemini 요청에 실패했습니다.");
    const recommendation = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!recommendation) throw new Error("추천 결과를 받지 못했습니다.");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ recommendation });
  } catch (error) {
    return res.status(502).json({ error: error.message || "AI 추천을 불러오지 못했습니다." });
  }
}

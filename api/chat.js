export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { messages, systemPrompt } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: "bad request" });

  const apiKey = process.env.deepseek;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 256,
        messages: [
          { role: "system", content: systemPrompt || "你是一个温柔的线上陪伴者，用简短的中文回复，1到4句话。" },
          ...messages,
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });
    return res.status(200).json({ text: data.choices?.[0]?.message?.content || "" });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}

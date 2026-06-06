export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, systemPrompt } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: systemPrompt || "你是一个温柔的线上陪伴者，用简短的中文回复，1到4句话。",
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const text = data.content?.[0]?.text || "";
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Upstream request failed" });
  }
}

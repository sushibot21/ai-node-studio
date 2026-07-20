// Each provider adapter takes a normalized { model, systemPrompt, input, temperature }
// and returns a normalized { text } (or { imageBase64 } for image nodes).
// Add a new provider by writing one function here and registering it below.

// Builds the user message content, attaching a screenshot as an image block when
// one is provided (data URL) so analysis/redesign can be grounded in what the
// page actually looks like, not just its DOM.
function anthropicContent(input, image) {
  const match = typeof image === "string" && /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(image);
  if (!match) return input;
  return [
    { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } },
    { type: "text", text: input }
  ];
}

async function callAnthropic({ model, systemPrompt, input, temperature, image }) {
  const resolvedModel = model || "claude-opus-4-7";
  // Opus 4.7+ rejects temperature/top_p/top_k and budget_tokens (400). Only
  // pass sampling params on older models that still accept them.
  const isNewGen = /^claude-(opus-4-[78]|opus-4-8|sonnet-5|fable-5|mythos-5)/.test(resolvedModel);
  const body = {
    model: resolvedModel,
    max_tokens: 8192,
    system: systemPrompt || undefined,
    messages: [{ role: "user", content: anthropicContent(input, image) }]
  };
  if (!isNewGen && temperature != null) body.temperature = temperature;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Anthropic request failed");
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { text };
}

async function callOpenAI({ model, systemPrompt, input, temperature }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      temperature: temperature ?? 1,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: input }
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  return { text: data.choices?.[0]?.message?.content || "" };
}

async function callGemini({ model, systemPrompt, input, temperature }) {
  const m = model || "gemini-1.5-pro";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: { temperature: temperature ?? 1 },
        contents: [{ role: "user", parts: [{ text: input }] }]
      })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Gemini request failed");
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  return { text };
}

async function callOpenAIImage({ model, input }) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: model || "dall-e-3",
      prompt: input,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI image request failed");
  return { imageBase64: data.data?.[0]?.b64_json };
}

async function callOllama({ model, systemPrompt, input, temperature }) {
  const res = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: temperature ?? 0.7 },
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: input }
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Ollama request failed");
  return { text: data.message?.content || "" };
}

export const PROVIDERS = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  gemini: callGemini,
  ollama: callOllama,
  "openai-image": callOpenAIImage
};

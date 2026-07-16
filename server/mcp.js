// Minimal Streamable HTTP MCP client. Connections stay server-side so browser
// workflows never expose MCP credentials or bypass the user's allow-list.
const sessions = new Map();

function parseBody(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    const data = text.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

async function rpc(serverUrl, method, params, sessionId) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(serverUrl, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP server returned ${res.status}: ${text.slice(0, 240)}`);
  const body = parseBody(text, res.headers.get("content-type") || "");
  if (body.error) throw new Error(body.error.message || "MCP request failed");
  return { result: body.result, sessionId: res.headers.get("mcp-session-id") || sessionId };
}

async function sessionFor(serverUrl) {
  let sessionId = sessions.get(serverUrl);
  if (sessionId) return sessionId;
  const init = await rpc(serverUrl, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "AI Node Studio", version: "0.1.0" } });
  sessionId = init.sessionId;
  if (!sessionId) throw new Error("MCP server did not return a session id. Use a Streamable HTTP MCP server.");
  sessions.set(serverUrl, sessionId);
  await rpc(serverUrl, "notifications/initialized", {}, sessionId);
  return sessionId;
}

export async function listMCPTools(serverUrl) {
  if (!serverUrl?.startsWith("http")) throw new Error("Enter a valid MCP Streamable HTTP URL");
  const result = await rpc(serverUrl, "tools/list", {}, await sessionFor(serverUrl));
  return result.result?.tools || [];
}

export async function callMCPTool({ serverUrl, toolName, arguments: args }) {
  if (!toolName) throw new Error("Choose an MCP tool");
  const result = await rpc(serverUrl, "tools/call", { name: toolName, arguments: args || {} }, await sessionFor(serverUrl));
  const content = result.result?.content || [];
  return { text: content.map((item) => item.text || (item.data ? `[${item.type}]` : JSON.stringify(item))).join("\n") };
}

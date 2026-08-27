const ACTIONS = ["praise", "surprised", "think", "happy", "frighten", "curious"];
const COMMAND_HINT = /(?:叫叫|小鸡|比(?:个)?赞|点赞|夸夸|惊讶|吃惊|想一想|思考|开心|笑一个|害怕|吓一跳|好奇|鼓励)/;

function parseAction(value) {
  try {
    const action = JSON.parse(value)?.action;
    return ACTIONS.includes(action) ? action : null;
  } catch {
    return null;
  }
}

async function readSse(response, onDelta) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";
  let argumentsText = "";
  let finalAction = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const eventBlock of events) {
      const data = eventBlock.split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (event.type === "response.output_text.delta" && event.delta) onDelta?.(event.delta);
      if (event.type === "response.function_call_arguments.delta") argumentsText += event.delta || "";
      if (event.type === "response.function_call_arguments.done") {
        finalAction = parseAction(event.arguments || argumentsText) || finalAction;
      }
      if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        finalAction = parseAction(event.item.arguments || argumentsText) || finalAction;
      }
      if (event.type === "response.completed") {
        for (const item of event.response?.output || []) {
          if (item.type === "function_call") finalAction = parseAction(item.arguments) || finalAction;
        }
      }
    }
    if (done) break;
  }
  return finalAction;
}

export function getArkConfig(env = process.env) {
  if (!env.VOLC_ARK_API_KEY) throw new Error("Volcengine Ark API key is not configured");
  return {
    apiKey: env.VOLC_ARK_API_KEY,
    model: env.VOLC_ARK_MODEL || "doubao-seed-2-0-lite-260215",
    endpoint: env.VOLC_ARK_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/responses",
  };
}

export function looksLikeJiaojiaoCommand(text) {
  return COMMAND_HINT.test(String(text || ""));
}

export async function inferJiaojiaoAction(text, config, onDelta) {
  if (!looksLikeJiaojiaoCommand(text)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: "你是叫叫相机的动作控制器。仅当用户明确要求叫叫做动作时，调用 play_jiaojiao_action。比赞、夸赞用 praise；惊讶用 surprised；思考用 think；开心或微笑用 happy；害怕用 frighten；好奇用 curious。不要调用任何其他工具，不要生成任意动画名。",
            }],
          },
          { role: "user", content: [{ type: "input_text", text: String(text).slice(0, 120) }] },
        ],
        tools: [{
          type: "function",
          name: "play_jiaojiao_action",
          description: "让叫叫播放一个预置表情动作",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: { action: { type: "string", enum: ACTIONS } },
            required: ["action"],
          },
          strict: true,
        }],
        tool_choice: "auto",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Ark request failed (${response.status}): ${detail}`);
    }
    return await readSse(response, onDelta);
  } finally {
    clearTimeout(timeout);
  }
}

export const arkInternals = { ACTIONS, parseAction, readSse };

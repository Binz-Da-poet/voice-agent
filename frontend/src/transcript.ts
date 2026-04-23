import type { RealtimeItem } from "@openai/agents/realtime";

export type TranscriptLine = { role: "user" | "assistant" | "tool"; text: string };

/**
 * 履歴を画面表示用のテキスト行に落とし込みます
 */
export function historyToTranscriptLines(history: RealtimeItem[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];

  for (const item of history) {
    if (item.type === "message") {
      if (item.role === "user") {
        const texts: string[] = [];
        for (const part of item.content) {
          if (part.type === "input_text") texts.push(part.text);
          else if (part.type === "input_audio" && part.transcript) texts.push(part.transcript);
        }
        const t = texts.join(" ").trim();
        if (t) lines.push({ role: "user", text: t });
      } else if (item.role === "assistant") {
        const texts: string[] = [];
        for (const part of item.content) {
          if (part.type === "output_text") texts.push(part.text);
          else if (part.type === "output_audio" && part.transcript) {
            const tr = part.transcript;
            if (tr) texts.push(tr);
          }
        }
        const t = texts.join(" ").trim();
        if (t) lines.push({ role: "assistant", text: t });
      }
    } else if (item.type === "function_call" && item.status === "completed" && item.name) {
      const out = item.output != null && item.output !== "" ? ` → ${item.output}` : "";
      lines.push({
        role: "tool",
        text: `${item.name}(${item.arguments || ""})${out}`,
      });
    }
  }

  return lines;
}

import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { z } from "zod";

const MOCK: Record<string, string> = {
  東京: "晴れ、25度、湿度60%",
  京都: "曇り、22度、湿度70%",
  大阪: "雨、20度、湿度80%",
  Tokyo: "晴れ、25度、湿度60%",
  Kyoto: "曇り、22度、湿度70%",
  Osaka: "雨、20度、湿度80%",
};

const getWeather = tool({
  name: "get_weather",
  description:
    "都市名を指定して、その地域の天気（モック）を取得します。天気の質問には必ず使ってください。",
  parameters: z.object({
    city: z.string().describe("都市名（例: 東京、京都、大阪、または英語名）"),
  }),
  async execute({ city }) {
    const key = city.trim();
    if (MOCK[key]) {
      return `${key}の天気: ${MOCK[key]}`;
    }
    for (const [k, v] of Object.entries(MOCK)) {
      if (k.toLowerCase() === key.toLowerCase()) {
        return `${k}の天気: ${v}`;
      }
    }
    return `${key}の天気: 晴れ、23度、湿度55%（デモ用の固定値）`;
  },
});

const JAPANESE_INSTRUCTIONS = `あなたは日本の「旅行アシスタント」です。次の方針に従ってください。

- 丁寧で自然な日本語で話してください
- 回答は簡潔にしてください
- 必要な場合はツールを使ってください（天気の話題では get_weather を使う）
- 音声会話として自然な返答をしてください

加えて:
- 天気の質問では get_weather の結果を要約して丁寧に伝えてください
- 観光（おすすめの場所・移動）の質問は、あなたの知識で2〜3文程度で助言してください`;

export const travelAgent = new RealtimeAgent({
  name: "旅行アシスタント",
  instructions: JAPANESE_INSTRUCTIONS,
  tools: [getWeather],
});

/**
 * 各接続（開始ボタン）のたびに新しい RealtimeSession を作ります
 * 入力の文字起こし＋履歴向けのテキスト＋音声出力を有効化します
 */
export function createTravelSession() {
  return new RealtimeSession(travelAgent, {
    model: "gpt-realtime-1.5",
    config: {
      outputModalities: ["audio", "text"],
      audio: {
        input: {
          format: "pcm16",
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "ja",
          },
        },
        output: {
          format: "pcm16",
          voice: "coral",
        },
      },
    },
  });
}

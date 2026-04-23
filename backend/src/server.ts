import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, "..", ".env") });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = Number(process.env.PORT) || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY not found in .env");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/client-secret", async (req, res) => {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  const body = {
    session: {
      type: "realtime" as const,
      model: "gpt-realtime-1.5",
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as { value?: string; error?: { message?: string } };

    if (!response.ok) {
      const msg = data.error?.message ?? `OpenAI API error: ${response.status}`;
      res.status(response.status >= 500 ? 502 : 400).json({ error: msg });
      return;
    }

    if (!data.value) {
      res.status(502).json({ error: "No ephemeral value in response" });
      return;
    }

    res.json({ value: data.value });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

const workspaceRoot = path.resolve(process.cwd(), process.cwd().endsWith("apps/server") ? "../.." : ".");
const resolveData = (value: string) => path.resolve(workspaceRoot, value);
const defaultDataDir = process.env.NODE_ENV === "test" ? `/tmp/videosub-tests-${process.pid}` : "./data";
const isTest = process.env.NODE_ENV === "test";
const providerMode = (name: string, realProvider: string) => isTest ? "mock" : (process.env[name] ?? realProvider);
const agnesTokenSlot = Math.max(1, Number(process.env.AGNES_TOKEN_SLOT ?? 1));
const agnesTokenFile = process.env.AGNES_TOKEN_FILE;
let agnesTokenEnv: Record<string, string> = {};
if (agnesTokenFile) {
  try { agnesTokenEnv = parse(fs.readFileSync(agnesTokenFile)); }
  catch { agnesTokenEnv = {}; }
}
const agnesTokenName = agnesTokenSlot === 1 ? "AGNES_API_KEY" : `AGNES_API_KEY_${agnesTokenSlot}`;
const selectedAgnesKey = agnesTokenEnv[agnesTokenName] ?? process.env[agnesTokenName] ?? process.env.AGNES_API_KEY ?? "";

export const config = {
  port: Number(process.env.PORT ?? 3333),
  host: process.env.HOST ?? "0.0.0.0",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  workspaceRoot,
  dataDir: isTest ? defaultDataDir : resolveData(process.env.DATA_DIR ?? "./data"),
  providers: {
    codex: providerMode("CODEX_PROVIDER", "codex"),
    voice: providerMode("VOICE_PROVIDER", "elevenlabs"),
    image: providerMode("IMAGE_PROVIDER", "agnes"),
    video: providerMode("VIDEO_PROVIDER", "agnes")
  },
  codexModel: process.env.CODEX_MODEL || undefined,
  agnes: {
    apiKey: selectedAgnesKey,
    tokenSlot: agnesTokenSlot,
    tokenSource: agnesTokenFile ? "arquivo externo" : "ambiente do servidor",
    // Aceita tanto a raiz do serviço quanto a variante já terminada em /v1.
    baseUrl: (process.env.AGNES_BASE_URL ?? "https://apihub.agnes-ai.com")
      .replace(/\/v1\/?$/, "")
      .replace(/\/+$/, ""),
    imageModel: process.env.AGNES_IMAGE_MODEL ?? "agnes-image-2.1-flash",
    videoModel: process.env.AGNES_VIDEO_MODEL ?? "agnes-video-2.5-flash",
    maxClipsPerScene: Math.max(1, Number(process.env.AGNES_MAX_CLIPS_PER_SCENE ?? 4)),
    videoSeconds: Math.min(12, Math.max(4, Number(process.env.AGNES_VIDEO_SECONDS ?? 8)))
  },
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
    modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT ?? "mp3_44100_128"
  }
};

export function mediaUrl(filePath?: string) {
  if (!filePath) return undefined;
  const relative = path.relative(config.dataDir, filePath).split(path.sep).join("/");
  return `/media/${relative}`;
}

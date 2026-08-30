import fs from "node:fs/promises";
import path from "node:path";
import { Codex } from "@openai/codex-sdk";
import sharp from "sharp";
import { config } from "./config.js";
import { run } from "./command.js";
import { PlanSchema, type Project, type Scene, type ScenePlan } from "./types.js";

const planJsonSchema = {
  type: "object", additionalProperties: false, required: ["title", "summary", "scenes"],
  properties: {
    title: { type: "string" }, summary: { type: "string" },
    scenes: { type: "array", minItems: 3, maxItems: 12, items: {
      type: "object", additionalProperties: false, required: ["title", "narration", "visualPrompt", "durationHint"],
      properties: {
        title: { type: "string" }, narration: { type: "string" }, visualPrompt: { type: "string" },
        durationHint: { type: "number", minimum: 2, maximum: 30 }
      }
    }}
  }
};

function heuristicPlan(project: Project) {
  const chunks = project.content
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ])/u)
    .map((part) => part.trim()).filter(Boolean);
  const grouped: string[] = [];
  for (const chunk of chunks) {
    if (grouped.length && grouped[grouped.length - 1].length + chunk.length < 240) grouped[grouped.length - 1] += ` ${chunk}`;
    else grouped.push(chunk);
  }
  const scenes: ScenePlan[] = grouped.slice(0, 10).map((narration, index) => ({
    title: `Cena ${String(index + 1).padStart(2, "0")}`,
    narration,
    visualPrompt: `${project.settings.visualStyle}; composição clara e cinematográfica representando: ${narration}`,
    durationHint: Math.max(3, Math.min(15, Math.round(narration.split(/\s+/).length / 2.4)))
  }));
  return { title: project.title, summary: project.content.slice(0, 180), scenes };
}

export async function createPlan(project: Project) {
  if (config.providers.codex === "mock") return PlanSchema.parse(heuristicPlan(project));
  // Usa o CLI instalado pelo operador para compartilhar a sessão OAuth e evitar
  // que o binário empacotado no SDK fique defasado em relação ao modelo ativo.
  const codex = new Codex({ codexPathOverride: process.env.CODEX_PATH ?? "codex" });
  const thread = codex.startThread({
    model: config.codexModel,
    sandboxMode: "read-only",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
    networkAccessEnabled: false,
    workingDirectory: config.workspaceRoot
  });
  const prompt = `Você é roteirista, editor factual e diretor de vídeos explicativos em português do Brasil.

Transforme a entrada em um roteiro COMPLETO, não apenas repita o texto. A entrada pode ser um artigo pronto ou somente um pedido curto como “explique o que é AGI”.

Regras obrigatórias:
- corrija ortografia e interprete abreviações pelo contexto;
- se for um pedido/tema curto, desenvolva a explicação usando conhecimento consolidado;
- crie de 4 a 8 cenas com progressão: gancho, conceito, contexto, implicações e conclusão;
- cada narração deve ter 35 a 65 palavras, soar natural em voz alta e não conter instruções de direção;
- estime durationHint entre 10 e 25 segundos;
- não invente datas, números, certezas ou previsões; diferencie consenso, hipótese e incerteza;
- summary deve ser uma sinopse editorial limpa, sem links, citações, observações sobre arquivos, ferramentas ou bastidores;
- visualPrompt deve estar em inglês, descrever uma única composição cinematográfica ${project.settings.format}, sem palavras, letras, legendas, interfaces, marcas ou logotipos;
- mantenha consistência estética entre cenas: ${project.settings.visualStyle};
- idioma da narração: ${project.settings.language}.

Entrada do usuário:\n${project.content}`;
  const turn = await thread.run(prompt, { outputSchema: planJsonSchema });
  const plan = PlanSchema.parse(JSON.parse(turn.finalResponse));
  if (plan.scenes.length < 3) throw new Error("O Codex retornou poucas cenas; refaça o roteiro.");
  return plan;
}

function requireKey(value: string, envName: string) {
  if (!value) {
    throw new Error(
      `Credencial ausente: preencha ${envName} em apps/server/.env e reinicie o VideoSub com ./atualiza.sh.`,
    );
  }
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`API respondeu ${response.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function mediaUrl(payload: unknown, kind: "image" | "video"): string | undefined {
  const candidates: Array<{ url: string; path: string }> = [];
  const visit = (value: unknown, currentPath: string) => {
    if (typeof value === "string" && /^https?:\/\//.test(value)) {
      candidates.push({ url: value, path: currentPath.toLowerCase() });
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${currentPath}.${index}`));
    else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => visit(item, `${currentPath}.${key}`));
    }
  };
  visit(payload, "root");
  const extension = kind === "video" ? /\.(mp4|webm|mov)(?:[?#]|$)/i : /\.(png|jpe?g|webp)(?:[?#]|$)/i;
  const opposite = kind === "video" ? /\.(png|jpe?g|webp)(?:[?#]|$)/i : /\.(mp4|webm|mov)(?:[?#]|$)/i;
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: (extension.test(candidate.url) ? 20 : 0)
        - (opposite.test(candidate.url) ? 30 : 0)
        + (candidate.path.includes(kind) ? 8 : 0)
        + (/output|result/.test(candidate.path) ? 4 : 0)
        - (/input|source|thumbnail|cover/.test(candidate.path) ? 8 : 0),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.url;
}

async function download(url: string, destination: string, expected: "image" | "video") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar mídia (${response.status}).`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.startsWith(`${expected}/`) && contentType !== "application/octet-stream") {
    throw new Error(`A Agnes retornou ${contentType}, mas era esperado um arquivo de ${expected === "video" ? "vídeo" : "imagem"}.`);
  }
  const media = Buffer.from(await response.arrayBuffer());
  if (media.length < 1000) throw new Error("A Agnes retornou um arquivo vazio ou inválido.");
  await fs.writeFile(destination, media);
}

function palette(index: number) {
  return [["#d9e4df", "#2d6f8e"], ["#ead9c7", "#b45132"], ["#d8dee7", "#394f68"], ["#e1ddc8", "#727244"]][index % 4];
}

export async function generateVoice(scene: Scene, destination: string, voiceId?: string) {
  if (config.providers.voice === "mock") {
    const seconds = Math.max(2, scene.durationHint);
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-q:a", "7", destination]);
    return destination;
  }
  requireKey(config.elevenLabs.apiKey, "ELEVENLABS_API_KEY");
  const selectedVoice = voiceId || config.elevenLabs.voiceId;
  requireKey(selectedVoice, "ELEVENLABS_VOICE_ID");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=${encodeURIComponent(config.elevenLabs.outputFormat)}`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabs.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: scene.narration, model_id: config.elevenLabs.modelId, voice_settings: { stability: 0.55, similarity_boost: 0.75 } })
  });
  if (!response.ok) throw new Error(`ElevenLabs respondeu ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) throw new Error(`ElevenLabs retornou conteúdo inesperado: ${contentType || "sem content-type"}.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 1000) throw new Error("ElevenLabs retornou um arquivo de áudio vazio ou inválido.");
  await fs.writeFile(destination, audio);
  return destination;
}

export async function generateImage(scene: Scene, destination: string, format: Project["settings"]["format"]) {
  if (config.providers.image === "mock") {
    const [width, height] = format === "9:16" ? [1080, 1920] : format === "1:1" ? [1080, 1080] : [1920, 1080];
    const [paper, ink] = palette(scene.position);
    const title = scene.title.replace(/[<>&]/g, "");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${paper}"/><path d="M0 ${height * .73} L${width} ${height * .52} L${width} ${height} L0 ${height}Z" fill="${ink}" opacity=".16"/><circle cx="${width * .72}" cy="${height * .34}" r="${Math.min(width,height) * .2}" fill="${ink}" opacity=".2"/><text x="${width * .08}" y="${height * .17}" font-family="sans-serif" font-size="${Math.round(width * .055)}" font-weight="700" fill="#172327">${title}</text><text x="${width * .08}" y="${height * .9}" font-family="monospace" font-size="${Math.round(width * .018)}" fill="#172327">VIDEOSUB / FRAME ${String(scene.position + 1).padStart(2,"0")}</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(destination);
    return { path: destination };
  }
  requireKey(config.agnes.apiKey, "AGNES_API_KEY");
  const size = format === "9:16" ? "576x1024" : format === "1:1" ? "1024x1024" : "1024x576";
  const payload = await fetchJson(`${config.agnes.baseUrl}/v1/images/generations`, {
    method: "POST", headers: { Authorization: `Bearer ${config.agnes.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.agnes.imageModel, prompt: scene.visualPrompt, n: 1, size })
  });
  const url = mediaUrl(payload, "image");
  if (!url) throw new Error(`A Agnes não retornou uma URL de imagem reconhecível: ${JSON.stringify(payload).slice(0, 500)}`);
  await download(url, destination, "image");
  return { path: destination, sourceUrl: url };
}

export async function animateScene(scene: Scene, destination: string, format: Project["settings"]["format"]) {
  if (config.providers.video === "mock") {
    if (!scene.imagePath) throw new Error("Gere a imagem antes da animação.");
    const [width, height] = format === "9:16" ? [1080, 1920] : format === "1:1" ? [1080, 1080] : [1920, 1080];
    await run("ffmpeg", ["-y", "-loop", "1", "-i", scene.imagePath, "-t", String(scene.duration ?? scene.durationHint), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0006,1.08)':d=1:s=${width}x${height}:fps=30`, "-c:v", "libx264", "-pix_fmt", "yuv420p", destination]);
    return destination;
  }
  requireKey(config.agnes.apiKey, "AGNES_API_KEY");
  if (!scene.imageSourceUrl) throw new Error("A imagem desta cena não possui URL de origem da Agnes. Regenere a imagem em modo real antes de animar.");
  const [width, height] = format === "9:16" ? [576, 1024] : format === "1:1" ? [1024, 1024] : [1024, 576];
  const payload = await fetchJson(`${config.agnes.baseUrl}/v1/videos`, {
    method: "POST", headers: { Authorization: `Bearer ${config.agnes.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.agnes.videoModel, prompt: `${scene.visualPrompt}. Natural subtle motion, stable composition, no morphing, no text.`, image: scene.imageSourceUrl, width, height, num_frames: 121, frame_rate: 24 })
  });
  const videoId = String(payload.video_id ?? payload.id ?? "");
  if (!videoId) throw new Error("A Agnes não retornou video_id.");
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const status = await fetchJson(`${config.agnes.baseUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(config.agnes.videoModel)}`, {
      headers: { Authorization: `Bearer ${config.agnes.apiKey}` }
    });
    const url = mediaUrl(status, "video");
    if (url) { await download(url, destination, "video"); return destination; }
    if (["failed", "error"].includes(String(status.status).toLowerCase())) throw new Error(`Geração de vídeo falhou: ${JSON.stringify(status).slice(0, 500)}`);
  }
  throw new Error("Tempo limite aguardando o vídeo da Agnes.");
}

export async function providerStatus() {
  let codex = false;
  try { codex = (await run("codex", ["login", "status"])).toLowerCase().includes("logged in"); } catch { codex = false; }
  const modes = Object.values(config.providers);
  return {
    mode: modes.every((mode) => mode === "mock") ? "mock" : modes.every((mode) => mode !== "mock") ? "real" : "mixed",
    codex: { ready: config.providers.codex === "mock" || codex, auth: config.providers.codex === "mock" ? "simulado" : "OAuth local", mode: config.providers.codex },
    agnes: { ready: (config.providers.image === "mock" && config.providers.video === "mock") || Boolean(config.agnes.apiKey), imageModel: config.agnes.imageModel, videoModel: config.agnes.videoModel, mode: `${config.providers.image}/${config.providers.video}` },
    elevenLabs: { ready: config.providers.voice === "mock" || Boolean(config.elevenLabs.apiKey && config.elevenLabs.voiceId), model: config.elevenLabs.modelId, mode: config.providers.voice },
    ffmpeg: { ready: true }
  };
}

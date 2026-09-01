import fs from "node:fs/promises";
import path from "node:path";
import { Codex } from "@openai/codex-sdk";
import sharp from "sharp";
import { config } from "./config.js";
import { run } from "./command.js";
import { PlanSchema, ScenePlanSchema, type Project, type Scene, type ScenePlan, type VideoClip } from "./types.js";

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

export async function editWithPrompt(project: Project, prompt: string, scene?: Scene) {
  if (config.providers.codex === "mock") {
    if (scene) return ScenePlanSchema.parse({ ...scene, visualPrompt: `${scene.visualPrompt}; ${prompt}`, narration: prompt.toLowerCase().includes("narração") ? `${scene.narration} ${prompt}` : scene.narration });
    const plan = heuristicPlan(project);
    return PlanSchema.parse({ ...plan, scenes: project.scenes.map((item) => ({ ...item, visualPrompt: `${item.visualPrompt}; ${prompt}` })) });
  }
  const codex = new Codex({ codexPathOverride: process.env.CODEX_PATH ?? "codex" });
  const thread = codex.startThread({ model: config.codexModel, sandboxMode: "read-only", approvalPolicy: "never", skipGitRepoCheck: true, networkAccessEnabled: false, workingDirectory: config.workspaceRoot });
  if (scene) {
    const schema = planJsonSchema.properties.scenes.items;
    const turn = await thread.run(`Edite esta cena de vídeo conforme o pedido. Preserve fatos, idioma ${project.settings.language}, formato ${project.settings.format} e devolva somente a cena estruturada.\nPedido: ${prompt}\nCena atual: ${JSON.stringify({ title: scene.title, narration: scene.narration, visualPrompt: scene.visualPrompt, durationHint: scene.durationHint })}`, { outputSchema: schema });
    return ScenePlanSchema.parse(JSON.parse(turn.finalResponse));
  }
  const turn = await thread.run(`Edite o roteiro completo conforme o pedido, preservando a progressão e os fatos. Devolva o plano completo no mesmo formato.\nPedido: ${prompt}\nProjeto atual: ${JSON.stringify({ title: project.title, summary: project.summary, scenes: project.scenes.map(({ title, narration, visualPrompt, durationHint }) => ({ title, narration, visualPrompt, durationHint })) })}`, { outputSchema: planJsonSchema });
  return PlanSchema.parse(JSON.parse(turn.finalResponse));
}

export type VideoModelProfile = {
  id: string; label: string; contract: "frames" | "seconds"; minSeconds: number; maxSeconds: number;
  resolution: string; aspectRatios: string[]; maxReferences: number; supportsNegativePrompt: boolean;
};

export function videoModelProfile(model = config.agnes.videoModel): VideoModelProfile {
  if (model.includes("2.5")) return { id: model, label: model.includes("flash") ? "Agnes Video 2.5 Flash" : "Agnes Video 2.5", contract: "seconds", minSeconds: 4, maxSeconds: 12, resolution: model.includes("flash") ? "720P" : "720P–2K", aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], maxReferences: 5, supportsNegativePrompt: false };
  return { id: model, label: "Agnes Video v2.0", contract: "frames", minSeconds: 3, maxSeconds: 18, resolution: "pixels configuráveis", aspectRatios: ["16:9", "1:1", "9:16"], maxReferences: 2, supportsNegativePrompt: true };
}

export function videoStatusUrl(videoId: string, model = config.agnes.videoModel) {
  return videoModelProfile(model).contract === "seconds"
    ? `${config.agnes.baseUrl}/v1/videos/${encodeURIComponent(videoId)}`
    : `${config.agnes.baseUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`;
}

export function splitNarrationForClips(narration: string, count: number) {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  if (count <= 1 || words.length < 2) return [narration.trim()];
  const sentences = narration.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  if (sentences.length >= count) {
    const groups: string[] = [];
    let cursor = 0;
    for (let position = 0; position < count; position++) {
      const remainingBuckets = count - position;
      const remaining = sentences.slice(cursor);
      const remainingWords = remaining.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0);
      const targetWords = remainingWords / remainingBuckets;
      const selected: string[] = [];
      let selectedWords = 0;
      while (cursor < sentences.length && sentences.length - cursor > remainingBuckets - 1) {
        const sentence = sentences[cursor];
        const sentenceWords = sentence.split(/\s+/).length;
        if (selected.length && selectedWords + sentenceWords > targetWords) break;
        selected.push(sentence);
        selectedWords += sentenceWords;
        cursor++;
      }
      if (!selected.length) selected.push(sentences[cursor++]);
      groups.push(selected.join(" "));
    }
    return groups;
  }
  return Array.from({ length: count }, (_, position) => {
    const start = Math.floor(position * words.length / count);
    const end = Math.floor((position + 1) * words.length / count);
    return words.slice(start, end).join(" ");
  }).filter(Boolean);
}

export function planSceneClips(scene: Scene, strategy: Project["settings"]["clipStrategy"] = "provider"): VideoClip[] {
  const profile = videoModelProfile();
  const total = Math.max(profile.minSeconds, scene.duration ?? scene.durationHint);
  const count = strategy === "single" ? 1 : Math.min(config.agnes.maxClipsPerScene, Math.max(1, Math.ceil(total / profile.maxSeconds)));
  const narrationSegments = splitNarrationForClips(scene.narration, count);
  const shotPatterns = [
    "a concrete establishing view with a level horizon",
    "a close observational shot centered on the mechanism or action",
    "an overhead or cutaway view that reveals cause and effect",
    "a human-scale consequence shown through a specific real-world action",
    "a comparative composition with visibly different states",
    "a precise detail shot showing the evidence or result"
  ];
  return Array.from({ length: count }, (_, position) => ({
    id: crypto.randomUUID(), sceneId: scene.id, position, provider: config.providers.video, model: profile.id,
    narrationText: narrationSegments[position] ?? scene.narration,
    visualIntent: `Mostrar de forma concreta e exclusiva: ${narrationSegments[position] ?? scene.narration}`,
    prompt: `Create ${shotPatterns[position % shotPatterns.length]} that directly explains this narration beat: "${narrationSegments[position] ?? scene.narration}". This is shot ${position + 1} of ${count} and must have a unique primary subject, action, setting, and camera framing. Keep only palette, lighting, and material continuity with the scene. Upright subjects, correct gravity, level horizon, ${scene.visualPrompt.includes("9:16") ? "portrait-safe centered composition" : "balanced composition"}. Avoid generic glowing brains, robots, magic crystals, floating spheres, and decorative filler unless explicitly required by the narration. Natural stable motion, no morphing, no words, letters, captions, interface, brand or logo.`,
    targetDuration: Number(Math.min(profile.maxSeconds, Math.max(profile.minSeconds, total / count)).toFixed(2)), status: "pending" as const
  }));
}

const storyboardSchema = (count: number) => ({
  type: "object", additionalProperties: false, required: ["shots"],
  properties: {
    shots: { type: "array", minItems: count, maxItems: count, items: {
      type: "object", additionalProperties: false, required: ["primarySubject", "action", "setting", "framing", "visualIntent", "prompt"],
      properties: {
        primarySubject: { type: "string" }, action: { type: "string" }, setting: { type: "string" }, framing: { type: "string" },
        visualIntent: { type: "string" }, prompt: { type: "string" }
      }
    }}
  }
});

/** Converte os trechos temporais em planos visuais semanticamente distintos. */
export async function createStoryboardClips(project: Project, scene: Scene) {
  const clips = planSceneClips(scene, project.settings.clipStrategy);
  if (config.providers.codex === "mock" || clips.length === 1) return clips;
  const codex = new Codex({ codexPathOverride: process.env.CODEX_PATH ?? "codex" });
  const thread = codex.startThread({
    model: config.codexModel, sandboxMode: "read-only", approvalPolicy: "never",
    skipGitRepoCheck: true, networkAccessEnabled: false, workingDirectory: config.workspaceRoot
  });
  const beats = clips.map((clip, index) => ({ shot: index + 1, narration: clip.narrationText, seconds: clip.targetDuration }));
  const direction = `Você é diretor de storyboard factual para um vídeo explicativo.

Crie exatamente ${clips.length} planos VISUALMENTE DIFERENTES para a cena "${scene.title}". Cada plano deve ensinar o conteúdo do seu próprio trecho de locução, não apenas decorar ou preencher tempo.

Regras:
- primarySubject, action, setting e framing: em inglês, valores curtos e obrigatoriamente únicos entre todos os planos;
- visualIntent: em português, uma frase clara dizendo o que o espectador compreenderá e como isso aparecerá;
- prompt: em inglês, pronto para texto-para-imagem e imagem-para-vídeo;
- cada plano precisa ter assunto principal, ação, ambiente e enquadramento diferentes dos demais;
- mantenha continuidade somente por paleta, luz e materiais do estilo "${project.settings.visualStyle}";
- escolha pessoas, objetos, processos, lugares, diagramas físicos ou evidências concretas mencionados ou logicamente necessários ao trecho;
- não use cérebro brilhante, robô genérico, cristal mágico, esfera flutuante ou abstração decorativa, salvo se o texto falar explicitamente disso;
- nenhum texto, letra, número, interface, marca ou logotipo dentro da imagem;
- formato ${project.settings.format}: todos os sujeitos anatomicamente em pé, gravidade correta, horizonte nivelado, câmera nunca girada; preserve a área central segura;
- descreva movimento natural e estável, sem morphing.

Direção geral da cena (use como contexto, não copie em todos os planos): ${scene.visualPrompt}
Trechos obrigatórios: ${JSON.stringify(beats)}`;
  type StoryboardShot = { primarySubject: string; action: string; setting: string; framing: string; visualIntent: string; prompt: string };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const turn = await thread.run(attempt === 1 ? direction : "O storyboard anterior repetiu elementos. Refaça todos os planos e garanta valores distintos em primarySubject, action, setting e framing; preserve os trechos e todas as regras.", { outputSchema: storyboardSchema(clips.length) });
    const shots = (JSON.parse(turn.finalResponse) as { shots: StoryboardShot[] }).shots;
    const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ");
    const uniqueFields = (["primarySubject", "action", "setting", "framing"] as const)
      .every((field) => new Set(shots.map((shot) => normalize(shot[field]))).size === clips.length);
    if (shots.length === clips.length && uniqueFields) {
      return clips.map((clip, index) => ({ ...clip, visualIntent: shots[index].visualIntent.trim(), prompt: shots[index].prompt.trim() }));
    }
  }
  throw new Error(`O Codex repetiu assunto, ação, ambiente ou enquadramento no storyboard de “${scene.title}”. Nenhuma animação foi enviada; tente gerar o storyboard novamente.`);
}

function requireKey(value: string, envName: string) {
  if (!value) {
    throw new Error(
      `Credencial ausente: preencha ${envName} em apps/server/.env e reinicie o VideoSub com ./atualiza.sh.`,
    );
  }
}

async function fetchJson(url: string, init: RequestInit, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(12_000, 2_000 * 2 ** (attempt - 1))));
        continue;
      }
      throw Object.assign(
        new Error(`Agnes não respondeu em 30 segundos: ${error instanceof Error ? error.message : String(error)}`),
        { statusCode: 504 },
      );
    }
    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) as Record<string, unknown> : {};
    let providerMessage = text.slice(0, 600);
    try {
      const payload = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      providerMessage = typeof payload.error === "string" ? payload.error : payload.error?.message ?? payload.message ?? providerMessage;
    } catch { /* Mantém o corpo textual retornado pelo provedor. */ }
    const dailyLimit = response.status === 429 && /daily api usage limit reached/i.test(providerMessage);
    const retryable = [429, 502, 503, 504].includes(response.status) && !dailyLimit;
    if (retryable && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const requestedDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2_000 * 2 ** (attempt - 1);
      const delay = Math.min(12_000, requestedDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (dailyLimit) {
      const reset = providerMessage.match(/after \*\*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC\*\*/i);
      const availableAt = reset ? new Date(`${reset[1]}T${reset[2]}:00Z`) : undefined;
      const localTime = availableAt && !Number.isNaN(availableAt.getTime())
        ? availableAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
        : undefined;
      throw Object.assign(new Error(`A cota diária de vídeo da Agnes acabou.${localTime ? ` Tente novamente a partir de ${localTime} (horário de Brasília).` : " Aguarde a renovação diária do provedor."}`), { statusCode: 429 });
    }
    throw Object.assign(new Error(`Agnes respondeu ${response.status}: ${providerMessage}`), { statusCode: response.status });
  }
  throw Object.assign(new Error("Agnes não respondeu após as tentativas automáticas."), { statusCode: 503 });
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

export async function generateClipImage(scene: Scene, clip: VideoClip, destination: string, format: Project["settings"]["format"]) {
  return generateImage({ ...scene, position: scene.position + clip.position + 1, title: `${scene.title} · clipe ${clip.position + 1}`, visualPrompt: clip.prompt }, destination, format);
}

export async function animateScene(scene: Scene, destination: string, format: Project["settings"]["format"], clip?: Pick<VideoClip, "prompt" | "targetDuration" | "imagePath" | "imageSourceUrl" | "providerJobId">, onSubmitted?: (providerJobId: string) => void) {
  if (config.providers.video === "mock") {
    const sourceImage = clip?.imagePath ?? scene.imagePath;
    if (!sourceImage) throw new Error("Gere a imagem específica do clipe antes da animação.");
    const [width, height] = format === "9:16" ? [1080, 1920] : format === "1:1" ? [1080, 1080] : [1920, 1080];
    await run("ffmpeg", ["-y", "-loop", "1", "-i", sourceImage, "-t", String(clip?.targetDuration ?? scene.duration ?? scene.durationHint), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0006,1.08)':d=1:s=${width}x${height}:fps=30`, "-c:v", "libx264", "-pix_fmt", "yuv420p", destination]);
    return destination;
  }
  requireKey(config.agnes.apiKey, "AGNES_API_KEY");
  const sourceImageUrl = clip?.imageSourceUrl ?? scene.imageSourceUrl;
  if (!sourceImageUrl) throw new Error("A imagem específica deste clipe não possui URL de origem da Agnes. Refazer o movimento recria essa imagem.");
  const [width, height] = format === "9:16" ? [576, 1024] : format === "1:1" ? [1024, 1024] : [1024, 576];
  const profile = videoModelProfile();
  const seconds = Math.round(Math.min(profile.maxSeconds, Math.max(profile.minSeconds, clip?.targetDuration ?? config.agnes.videoSeconds)));
  const base = { model: config.agnes.videoModel, prompt: clip?.prompt ?? `${scene.visualPrompt}. Natural subtle motion, stable composition, no morphing, no text.` };
  const requestBody = profile.contract === "seconds"
    ? { ...base, mode: "keyframe", first_frame: sourceImageUrl, seconds: String(seconds), size: "720P", aspect_ratio: format }
    : { ...base, image: sourceImageUrl, width, height, num_frames: Math.min(441, Math.max(81, Math.round(seconds * 24 / 8) * 8 + 1)), frame_rate: 24 };
  let videoId = clip?.providerJobId ?? "";
  if (!videoId) {
    const payload = await fetchJson(`${config.agnes.baseUrl}/v1/videos`, {
      method: "POST", headers: { Authorization: `Bearer ${config.agnes.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    videoId = String(payload.video_id ?? payload.id ?? "");
    if (!videoId) throw new Error("A Agnes não retornou video_id.");
    onSubmitted?.(videoId);
  }
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    let status: Record<string, unknown>;
    try {
      status = await fetchJson(videoStatusUrl(videoId), {
        headers: { Authorization: `Bearer ${config.agnes.apiKey}` }
      }, 1);
    } catch (error) {
      const code = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
      if ([429, 502, 503, 504].includes(code)) continue;
      throw error;
    }
    const url = mediaUrl(status, "video");
    if (url) { await download(url, destination, "video"); return destination; }
    if (["failed", "error"].includes(String(status.status).toLowerCase())) throw new Error(`Geração de vídeo falhou: ${JSON.stringify(status).slice(0, 500)}`);
  }
  throw Object.assign(new Error(`A Agnes ainda não concluiu o vídeo ${videoId} após 10 minutos. A tarefa foi preservada e pode ser retomada.`), { statusCode: 504 });
}

export async function providerStatus() {
  let codex = false;
  try { codex = (await run("codex", ["login", "status"])).toLowerCase().includes("logged in"); } catch { codex = false; }
  const modes = Object.values(config.providers);
  return {
    mode: modes.every((mode) => mode === "mock") ? "mock" : modes.every((mode) => mode !== "mock") ? "real" : "mixed",
    codex: { ready: config.providers.codex === "mock" || codex, auth: config.providers.codex === "mock" ? "simulado" : "OAuth local", mode: config.providers.codex, resources: ["roteiro", "edição por prompt", "JSON estruturado"] },
    agnes: { ready: (config.providers.image === "mock" && config.providers.video === "mock") || Boolean(config.agnes.apiKey), imageModel: config.agnes.imageModel, videoModel: config.agnes.videoModel, mode: `${config.providers.image}/${config.providers.video}`, tokenSlot: config.agnes.tokenSlot, tokenSource: config.agnes.tokenSource, video: { ...videoModelProfile(), pollingEndpoint: videoModelProfile().contract === "seconds" ? "/v1/videos/<task_id>" : "/agnesapi?video_id=<id>", pollIntervalSeconds: 15, observedCompletionSeconds: videoModelProfile().contract === "seconds" ? 62 : undefined, maxWaitSeconds: 600, specificationSource: "videos-agnes/MODELOS.md · medição 2026-09-01" }, strategy: { name: "trechos da narração com imagem própria", maxClipsPerScene: config.agnes.maxClipsPerScene, defaultSeconds: config.agnes.videoSeconds } },
    elevenLabs: { ready: config.providers.voice === "mock" || Boolean(config.elevenLabs.apiKey && config.elevenLabs.voiceId), model: config.elevenLabs.modelId, outputFormat: config.elevenLabs.outputFormat, mode: config.providers.voice, resources: ["texto para voz", "duração real por cena"] },
    ffmpeg: { ready: true, resources: ["montagem", "legendas", "trilhas de voz e música", "mixagem"] }
  };
}

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as providers from "./providers.js";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { config, mediaUrl } from "./config.js";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { run } from "./command.js";
import { repository } from "./db.js";
import { planSceneClips, splitNarrationForClips, videoModelProfile, videoStatusUrl } from "./providers.js";
import type { Scene } from "./types.js";

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

async function plannedProject() {
  const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
    title: "Regressão", content: "Conteúdo de teste para preservar os resultados aprovados durante a edição do projeto."
  } });
  const planned = await app.inject({ method: "POST", url: `/api/projects/${created.json().id}/plan` });
  expect(planned.statusCode).toBe(200);
  return repository.get(created.json().id)!;
}

describe("Integridade e recuperação", () => {
  it("retorna 400 para dados inválidos e JSON malformado", async () => {
    for (const payload of [{ title: "", content: "curto" }, '{"title":', '{"__proto__":{"polluted":true}}']) {
      const result = await app.inject({ method: "POST", url: "/api/projects", headers: { "content-type": "application/json" }, payload });
      expect(result.statusCode).toBe(400);
      expect(result.json().error).toBeTruthy();
    }
    const project = await plannedProject();
    const invalidScene = await app.inject({ method: "PATCH", url: `/api/scenes/${project.scenes[0].id}`, payload: { narration: " " } });
    expect(invalidScene.statusCode).toBe(400);
  });

  it("não publica o banco SQLite e mantém as mídias acessíveis", async () => {
    for (const url of ["/media/videosub.db", "/media/videosub.db-wal", "/media/projects/%2e%2e/videosub.db"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
    const project = await plannedProject();
    const file = path.join(config.dataDir, "projects", project.id, "public.txt");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "mídia do projeto");
    const response = await app.inject({ method: "GET", url: mediaUrl(file)! });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("mídia do projeto");
  });

  it("bloqueia alterações e exclusão durante um trabalho ativo", async () => {
    const project = await plannedProject();
    const jobId = repository.startJob(project.id, "render");
    try {
      const requests = [
        { method: "PATCH" as const, url: `/api/projects/${project.id}`, payload: { title: "Não alterar" } },
        { method: "DELETE" as const, url: `/api/projects/${project.id}` },
        { method: "DELETE" as const, url: `/api/projects/${project.id}/music` },
        { method: "POST" as const, url: `/api/projects/${project.id}/music` },
        { method: "PATCH" as const, url: `/api/scenes/${project.scenes[0].id}`, payload: { title: "Não alterar" } }
      ];
      for (const request of requests) expect((await app.inject(request)).statusCode).toBe(409);
      expect(repository.get(project.id)?.title).toBe(project.title);
    } finally { repository.finishJob(jobId); }
  });

  it("preserva mídias ao salvar campos iguais ou alterar somente o título", async () => {
    const project = await plannedProject();
    const scene = project.scenes[0];
    repository.updateScene(scene.id, { audioPath: "/saved/voice.mp3", imagePath: "/saved/image.png", videoPath: "/saved/video.mp4", duration: 15 });
    repository.replaceClips(scene.id, planSceneClips({ ...scene, duration: 15 }, "provider"));
    repository.update(project.id, { finalVideoPath: "/saved/final.mp4", captionsPath: "/saved/captions.srt", stage: "done" });
    const edited = await app.inject({ method: "PATCH", url: `/api/scenes/${scene.id}`, payload: {
      title: "Título revisado", narration: scene.narration, visualPrompt: scene.visualPrompt, durationHint: scene.durationHint
    } });
    expect(edited.statusCode).toBe(200);
    const saved = repository.get(project.id)!;
    expect(saved.finalVideoPath).toBe("/saved/final.mp4");
    expect(saved.stage).toBe("done");
    expect(saved.scenes[0]).toMatchObject({ title: "Título revisado", audioPath: "/saved/voice.mp3", imagePath: "/saved/image.png", duration: 15 });
    expect(saved.scenes[0].clips).toHaveLength(2);
  });

  it("invalida apenas o render quando o volume muda", async () => {
    const project = await plannedProject();
    repository.updateScene(project.scenes[0].id, { audioPath: "/saved/voice.mp3", imagePath: "/saved/image.png" });
    repository.update(project.id, { captionsPath: "/saved/captions.srt", finalVideoPath: "/saved/final.mp4", stage: "done" });
    const unchanged = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { settings: { voiceVolume: 1 } } });
    expect(unchanged.json().finalVideoPath).toBe("/saved/final.mp4");
    const edited = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { settings: { voiceVolume: 0.5 } } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ stage: "render", captionsPath: "/saved/captions.srt" });
    expect(edited.json().finalVideoPath).toBeUndefined();
    expect(edited.json().scenes[0].audioPath).toBe("/saved/voice.mp3");
    expect(edited.json().scenes[0].imagePath).toBe("/saved/image.png");
  });

  it("invalida formato, voz e roteiro conforme a configuração alterada", async () => {
    const project = await plannedProject();
    const scene = project.scenes[0];
    repository.updateScene(scene.id, { audioPath: "/saved/voice.mp3", imagePath: "/saved/image.png", duration: 15 });
    repository.replaceClips(scene.id, planSceneClips({ ...scene, duration: 15 }, "provider"));
    repository.update(project.id, { captionsPath: "/saved/captions.srt", finalVideoPath: "/saved/final.mp4" });
    const formatted = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { settings: { format: "9:16" } } });
    expect(formatted.json().scenes[0].audioPath).toBe("/saved/voice.mp3");
    expect(formatted.json().scenes[0].imagePath).toBeUndefined();
    expect(formatted.json().scenes[0].clips).toHaveLength(0);
    expect(formatted.json().captionsPath).toBeUndefined();
    const voiced = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { settings: { voiceId: "new-voice" } } });
    expect(voiced.json().scenes[0].audioPath).toBeUndefined();
    const content = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, payload: { content: "Um novo conteúdo que precisa de um novo roteiro antes de gerar as mídias." } });
    expect(content.json()).toMatchObject({ stage: "content", scenes: [], summary: "" });
  });

  it("retoma somente os quadros pendentes do storyboard", async () => {
    const project = await plannedProject();
    const scene = project.scenes[0];
    repository.updateScene(scene.id, { audioPath: "/saved/voice.mp3", duration: 26 });
    const clips = planSceneClips({ ...scene, duration: 26 }, "provider");
    repository.replaceClips(scene.id, clips);
    repository.updateClip(clips[0].id, { imagePath: "/saved/approved.png", videoPath: "/saved/approved.mp4", status: "ready" });
    const result = await app.inject({ method: "POST", url: `/api/projects/${project.id}/storyboard` });
    expect(result.statusCode).toBe(200);
    const resumed = repository.get(project.id)!.scenes[0].clips;
    expect(resumed.map((clip) => clip.id)).toEqual(clips.map((clip) => clip.id));
    expect(resumed[0]).toMatchObject({ imagePath: "/saved/approved.png", videoPath: "/saved/approved.mp4" });
    expect(resumed.every((clip) => clip.imagePath)).toBe(true);
  });

  it("encerra o estado de geração após falha e libera a retomada", async () => {
    const project = await plannedProject();
    const failure = vi.spyOn(providers, "generateImage").mockRejectedValueOnce(new Error("Provedor indisponível"));
    try {
      const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/images` });
      expect(response.statusCode).toBe(500);
      expect(repository.get(project.id)!.scenes[0]).toMatchObject({ status: "error", error: "Provedor indisponível" });
      expect(repository.hasWorkingJob()).toBe(false);
    } finally { failure.mockRestore(); }
    const retry = await app.inject({ method: "POST", url: `/api/projects/${project.id}/images` });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().scenes[0].status).toBe("ready");
  });

  it("preserva a música anterior quando o novo upload é inválido", async () => {
    const project = await plannedProject();
    const voiced = await app.inject({ method: "POST", url: `/api/projects/${project.id}/voice` });
    const audio = await fs.readFile(voiced.json().scenes[0].audioPath);
    const upload = await app.inject({ method: "POST", url: `/api/projects/${project.id}/music`, headers: { "content-type": "audio/mpeg" }, payload: audio });
    expect(upload.statusCode).toBe(200);
    const musicPath = repository.get(project.id)!.musicPath!;
    const before = await fs.readdir(path.dirname(musicPath));
    const invalid = await app.inject({ method: "POST", url: `/api/projects/${project.id}/music`, headers: { "content-type": "audio/mpeg" }, payload: Buffer.alloc(2000, 1) });
    expect(invalid.statusCode).toBe(400);
    expect(repository.get(project.id)!.musicPath).toBe(musicPath);
    expect(await fs.readFile(musicPath)).toEqual(audio);
    expect(await fs.readdir(path.dirname(musicPath))).toEqual(before);
    expect(repository.hasWorkingJob()).toBe(false);
  });

  it("rejeita etapas sem roteiro sem deixar trabalho em execução", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: { title: "Sem roteiro", content: "Conteúdo válido que ainda não foi transformado em cenas." } });
    for (const stage of ["voice", "images", "storyboard", "animate", "captions", "render"]) {
      const result = await app.inject({ method: "POST", url: `/api/projects/${created.json().id}/${stage}` });
      expect(result.statusCode).toBe(409);
    }
    expect(repository.get(created.json().id)!.status).toBe("ready");
    expect(repository.hasWorkingJob()).toBe(false);
  });
});

describe("API local", () => {
  it("reporta os provedores", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().providers.codex.mode).toBe("mock");
  });

  it("cria e planeja um projeto em modo mock", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Teste", content: "Este é um conteúdo de teste suficientemente longo. Ele terá uma segunda cena para validar o roteiro."
    }});
    expect(created.statusCode).toBe(201);
    const project = created.json();
    const planned = await app.inject({ method: "POST", url: `/api/projects/${project.id}/plan` });
    expect(planned.statusCode).toBe(200);
    expect(planned.json().scenes.length).toBeGreaterThan(0);
  });

  it("aceita POST legado com JSON vazio", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Compatibilidade", content: "Conteúdo suficiente para testar uma ação enviada por um cliente antigo ainda em cache."
    }});
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${created.json().id}/plan`,
      headers: { "content-type": "application/json" },
      payload: ""
    });
    expect(response.statusCode).toBe(200);
  });

  it("invalida dependências quando uma cena é editada", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Invalidação", content: "Um conteúdo longo o bastante para validar a edição e a invalidação dos artefatos derivados."
    }});
    const id = created.json().id;
    const planned = await app.inject({ method: "POST", url: `/api/projects/${id}/plan` });
    const sceneId = planned.json().scenes[0].id;
    const voiced = await app.inject({ method: "POST", url: `/api/projects/${id}/voice` });
    expect(voiced.json().scenes[0].audioUrl).toBeTruthy();
    const edited = await app.inject({ method: "PATCH", url: `/api/scenes/${sceneId}`, payload: { narration: "Narração corrigida pelo operador." } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().scenes[0].audioUrl).toBeUndefined();
    expect(edited.json().finalVideoUrl).toBeUndefined();
  });

  it("edita uma cena por prompt e invalida seus artefatos", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: { title: "Prompt", content: "Conteúdo suficientemente longo para testar uma edição contextual feita por uma instrução em linguagem natural." } });
    const planned = await app.inject({ method: "POST", url: `/api/projects/${created.json().id}/plan` });
    const scene = planned.json().scenes[0];
    const edited = await app.inject({ method: "POST", url: `/api/projects/${created.json().id}/edit-prompt`, payload: { scope: "scene", sceneId: scene.id, prompt: "Use uma câmera mais próxima" } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().scenes[0].visualPrompt).toContain("Use uma câmera mais próxima");
    expect(edited.json().stage).toBe("plan");
    expect(edited.json().lastPromptEdit.scope).toBe("scene");
    expect(edited.json().lastPromptEdit.changedFields).toContain("direção visual");
    expect(edited.json().lastPromptEdit.invalidated).toContain("voz da cena");
  });

  it("planeja vários clipes conforme a duração e o perfil Agnes 2.5 Flash", () => {
    const scene: Scene = { id: crypto.randomUUID(), projectId: crypto.randomUUID(), position: 0, title: "Longa", narration: "Primeiro apresentamos o problema central. Depois mostramos como a solução funciona na prática. Por fim explicamos o resultado para as pessoas.", visualPrompt: "Cinematic landscape", durationHint: 26, duration: 26, status: "ready", clips: [] };
    const clips = planSceneClips(scene, "provider");
    expect(videoModelProfile("agnes-video-2.5-flash").contract).toBe("seconds");
    expect(clips).toHaveLength(3);
    expect(clips.every((clip) => clip.targetDuration >= 4 && clip.targetDuration <= 12)).toBe(true);
    expect(new Set(clips.map((clip) => clip.narrationText)).size).toBe(3);
    expect(new Set(clips.map((clip) => clip.prompt)).size).toBe(3);
    expect(clips.every((clip) => clip.prompt.includes(clip.narrationText))).toBe(true);
    expect(clips.every((clip) => !clip.prompt.startsWith(scene.visualPrompt))).toBe(true);
    expect(clips.every((clip) => clip.visualIntent.includes(clip.narrationText))).toBe(true);
    expect(splitNarrationForClips(scene.narration, 3).join(" ")).toBe(scene.narration);
    expect(videoStatusUrl("task 123", "agnes-video-2.5-flash")).toMatch(/\/v1\/videos\/task%20123$/);
    expect(videoStatusUrl("legacy", "agnes-video-v2.0")).toContain("/agnesapi?video_id=legacy");
  });

  it("invalida uma camada e todas as seguintes sem apagar as anteriores", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Camadas", content: "Conteúdo suficientemente longo para validar a reconstrução parcial do projeto a partir da camada de imagens."
    }});
    const id = created.json().id;
    await app.inject({ method: "POST", url: `/api/projects/${id}/plan` });
    await app.inject({ method: "POST", url: `/api/projects/${id}/voice` });
    const imaged = await app.inject({ method: "POST", url: `/api/projects/${id}/images` });
    expect(imaged.json().scenes[0].audioUrl).toBeTruthy();
    expect(imaged.json().scenes[0].imageUrl).toBeTruthy();
    const invalidated = await app.inject({ method: "POST", url: `/api/projects/${id}/invalidate-from`, payload: { stage: "image" } });
    expect(invalidated.statusCode).toBe(200);
    expect(invalidated.json().stage).toBe("image");
    expect(invalidated.json().scenes[0].audioUrl).toBeTruthy();
    expect(invalidated.json().scenes[0].imageUrl).toBeUndefined();
    expect(invalidated.json().scenes[0].clips).toHaveLength(0);
    expect(invalidated.json().finalVideoUrl).toBeUndefined();
  });

  it("retoma um clipe interrompido em vez de ignorar a cena", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Retomada", content: "Conteúdo suficientemente longo para validar a retomada de um clipe interrompido por indisponibilidade temporária do provedor.", settings: { animate: true, format: "1:1" }
    }});
    const id = created.json().id;
    await app.inject({ method: "POST", url: `/api/projects/${id}/plan` });
    await app.inject({ method: "POST", url: `/api/projects/${id}/voice` });
    await app.inject({ method: "POST", url: `/api/projects/${id}/images` });
    await app.inject({ method: "POST", url: `/api/projects/${id}/storyboard` });
    const scene = repository.get(id)!.scenes[0];
    const clips = scene.clips;
    repository.updateClip(clips[0].id, { status: "error", error: "Fila temporariamente cheia" });
    const resumed = await app.inject({ method: "POST", url: `/api/projects/${id}/animate` });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().scenes[0].clips.every((clip: { status: string; imageUrl?: string; videoUrl?: string }) => clip.status === "ready" && clip.imageUrl && clip.videoUrl)).toBe(true);
  }, 20_000);

  it("separa storyboard revisável da animação", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Storyboard", content: "Conteúdo suficientemente longo para gerar uma locução dividida em planos visuais próprios e verificáveis.", settings: { animate: true }
    }});
    const id = created.json().id;
    await app.inject({ method: "POST", url: `/api/projects/${id}/plan` });
    await app.inject({ method: "POST", url: `/api/projects/${id}/voice` });
    await app.inject({ method: "POST", url: `/api/projects/${id}/images` });
    const storyboard = await app.inject({ method: "POST", url: `/api/projects/${id}/storyboard` });
    expect(storyboard.statusCode).toBe(200);
    expect(storyboard.json().stage).toBe("storyboard");
    expect(storyboard.json().scenes.every((scene: { clips: { imageUrl?: string; videoUrl?: string; visualIntent: string }[] }) => scene.clips.every((clip) => clip.imageUrl && !clip.videoUrl && clip.visualIntent))).toBe(true);
  }, 20_000);

  it("persiste o identificador da tarefa do provedor para retomada", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Tarefa persistida", content: "Conteúdo suficiente para validar que a tarefa remota de vídeo sobrevive ao refresh e à reinicialização."
    }});
    const id = created.json().id;
    await app.inject({ method: "POST", url: `/api/projects/${id}/plan` });
    const scene = repository.get(id)!.scenes[0];
    const clips = planSceneClips(scene, "provider");
    repository.replaceClips(scene.id, clips);
    repository.updateClip(clips[0].id, { providerJobId: "agnes-job-123", status: "error" });
    expect(repository.get(id)!.scenes[0].clips[0].providerJobId).toBe("agnes-job-123");
  });

  it("renderiza um MP4 vertical com legendas segmentadas", async () => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: {
      title: "Render vertical",
      content: "A inteligência artificial geral é uma hipótese sobre sistemas capazes de aprender e atuar em muitos domínios diferentes, ainda sem data comprovada para existir.",
      settings: { format: "9:16", burnCaptions: true }
    }});
    const id = created.json().id;
    for (const action of ["plan", "voice", "images", "captions", "render"]) {
      const response = await app.inject({ method: "POST", url: `/api/projects/${id}/${action}` });
      expect(response.statusCode).toBe(200);
      if (action === "voice") {
        const audio = await app.inject({ method: "GET", url: response.json().scenes[0].audioUrl });
        const music = await app.inject({ method: "POST", url: `/api/projects/${id}/music`, headers: { "content-type": "audio/mpeg" }, payload: audio.rawPayload });
        expect(music.statusCode).toBe(200);
        expect(music.json().musicUrl).toMatch(/music-[\w-]+\.mp3$/);
      }
      if (action === "images") {
        const metadata = await sharp(repository.get(id)!.scenes[0].imagePath!).metadata();
        expect([metadata.width, metadata.height]).toEqual([1080, 1080]);
        const preview = await app.inject({ method: "POST", url: `/api/scenes/${response.json().scenes[0].id}/preview` });
        expect(preview.statusCode).toBe(200);
        expect(preview.json().previewUrl).toMatch(/scene-preview-01\.mp4\?v=/);
      }
      if (action === "render") {
        expect(response.json().stage).toBe("done");
        expect(response.json().finalVideoUrl).toMatch(/video-final\.mp4$/);
        const dimensions = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", repository.get(id)!.finalVideoPath!]);
        expect(dimensions).toBe("1080x1920");
      }
    }
  }, 20_000);
});

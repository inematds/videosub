import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config, mediaUrl } from "./config.js";
import { repository } from "./db.js";
import { ensureProjectDir, durationOf, renderProject, renderScenePreview, writeCaptions } from "./media.js";
import { animateScene, createPlan, createStoryboardClips, editWithPrompt, generateClipImage, generateImage, generateVoice, providerStatus } from "./providers.js";
import { CreateProjectSchema, ProjectSettingsSchema, PromptEditSchema, RebuildFromSchema, UpdateProjectSchema, UpdateSceneSchema } from "./types.js";

function present(project: NonNullable<ReturnType<typeof repository.get>>) {
  return {
    ...project,
    finalVideoUrl: mediaUrl(project.finalVideoPath),
    captionsUrl: mediaUrl(project.captionsPath),
    musicUrl: mediaUrl(project.musicPath),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      audioUrl: mediaUrl(scene.audioPath), imageUrl: mediaUrl(scene.imagePath), videoUrl: mediaUrl(scene.videoPath),
      clips: scene.clips.map((clip) => ({ ...clip, imageUrl: mediaUrl(clip.imagePath), videoUrl: mediaUrl(clip.videoPath) }))
    }))
  };
}

async function projectAction(id: string, stage: Parameters<typeof repository.update>[1]["stage"], action: (project: NonNullable<ReturnType<typeof repository.get>>) => Promise<void>) {
  const project = repository.get(id);
  if (!project) throw Object.assign(new Error("Projeto não encontrado."), { statusCode: 404 });
  if (repository.hasWorkingJob()) throw Object.assign(new Error("Já existe uma etapa em execução. Aguarde sua conclusão."), { statusCode: 409 });
  const jobId = repository.startJob(id, stage ?? "unknown");
  repository.update(id, { stage, status: "working", error: null });
  try {
    await action(repository.get(id)!);
    repository.finishJob(jobId);
    return present(repository.update(id, { stage: stage === "render" ? "done" : stage, status: "ready", error: null })!);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    repository.finishJob(jobId, message);
    repository.update(id, { stage, status: "error", error: message });
    throw error;
  }
}

function findScene(sceneId: string) {
  const project = repository.list().find((item) => item.scenes.some((scene) => scene.id === sceneId));
  return { project, scene: project?.scenes.find((scene) => scene.id === sceneId) };
}

function findClip(clipId: string) {
  for (const project of repository.list()) for (const scene of project.scenes) {
    const clip = scene.clips.find((item) => item.id === clipId);
    if (clip) return { project, scene, clip };
  }
  return {};
}

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 50_000_000 });
  // Aceita ações POST sem payload enviadas por versões anteriores da interface,
  // que declaravam JSON mesmo com o corpo vazio.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (!text.trim()) return done(null, {});
    try { done(null, JSON.parse(text)); }
    catch (error) { done(error as Error); }
  });
  for (const contentType of ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg"]) app.addContentTypeParser(contentType, { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  await app.register(cors, { origin: config.webOrigin });
  await app.register(fastifyStatic, { root: config.dataDir, prefix: "/media/", decorateReply: true });

  app.get("/api/health", async () => ({ ok: true, version: "1.09.00", providers: await providerStatus() }));
  app.get("/api/projects", async () => repository.list().map(present));
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const project = repository.get(request.params.id);
    return project ? present(project) : reply.code(404).send({ error: "Projeto não encontrado." });
  });
  app.post("/api/projects", async (request, reply) => {
    const input = CreateProjectSchema.parse(request.body);
    const settings = ProjectSettingsSchema.parse(input.settings ?? {});
    return reply.code(201).send(present(repository.create({ title: input.title, content: input.content, settings })));
  });
  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const current = repository.get(request.params.id);
    if (!current) return reply.code(404).send({ error: "Projeto não encontrado." });
    const input = UpdateProjectSchema.parse(request.body);
    const settings = input.settings ? ProjectSettingsSchema.parse({ ...current.settings, ...input.settings }) : current.settings;
    return present(repository.update(current.id, { ...input, settings })!);
  });
  app.patch<{ Params: { sceneId: string } }>("/api/scenes/:sceneId", async (request, reply) => {
    if (repository.hasWorkingJob()) return reply.code(409).send({ error: "Uma etapa está em execução. Aguarde antes de editar." });
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    const input = UpdateSceneSchema.parse(request.body);
    const narrationChanged = input.narration !== undefined || input.durationHint !== undefined;
    const visualChanged = input.visualPrompt !== undefined;
    repository.updateScene(scene.id, {
      ...input,
      ...(narrationChanged ? { audioPath: null, videoPath: null, duration: null } : {}),
      ...(visualChanged ? { imagePath: null, imageSourceUrl: null, videoPath: null } : {})
    });
    if (narrationChanged || visualChanged) repository.clearClips(scene.id);
    repository.update(project.id, { finalVideoPath: null, ...(narrationChanged ? { captionsPath: null } : {}), stage: "plan", status: "ready" });
    return present(repository.get(project.id)!);
  });
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const removed = repository.delete(request.params.id);
    return removed ? reply.code(204).send() : reply.code(404).send({ error: "Projeto não encontrado." });
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/invalidate-from", async (request, reply) => {
    const project = repository.get(request.params.id);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado." });
    if (repository.hasWorkingJob()) return reply.code(409).send({ error: "Uma etapa está em execução. Aguarde antes de refazer uma camada." });
    const { stage } = RebuildFromSchema.parse(request.body);
    const stageOrder = ["plan", "voice", "image", "storyboard", "motion", "captions", "render"] as const;
    const from = stageOrder.indexOf(stage);
    if (stage === "plan") return present(repository.update(project.id, { stage: "plan", status: "ready", error: null })!);
    for (const scene of project.scenes) {
      if (from <= stageOrder.indexOf("voice")) repository.updateScene(scene.id, { audioPath: null, duration: null });
      if (from <= stageOrder.indexOf("image")) repository.updateScene(scene.id, { imagePath: null, imageSourceUrl: null });
      if (from <= stageOrder.indexOf("storyboard")) {
        repository.updateScene(scene.id, { videoPath: null });
        repository.clearClips(scene.id);
      } else if (from <= stageOrder.indexOf("motion")) {
        repository.updateScene(scene.id, { videoPath: null });
        for (const clip of scene.clips) repository.updateClip(clip.id, { videoPath: null, providerJobId: null, actualDuration: null, status: "pending", error: null });
      }
    }
    repository.update(project.id, {
      stage,
      status: "ready",
      error: null,
      ...(from <= stageOrder.indexOf("captions") ? { captionsPath: null } : {}),
      finalVideoPath: null
    });
    return present(repository.get(project.id)!);
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/plan", async (request) => projectAction(request.params.id, "plan", async (project) => {
    const plan = await createPlan(project);
    repository.replaceScenes(project.id, plan.scenes.map((scene, position) => ({ ...scene, id: crypto.randomUUID(), position, status: "ready" as const })));
    repository.update(project.id, { summary: plan.summary, captionsPath: null, finalVideoPath: null });
  }));

  app.post<{ Params: { id: string } }>("/api/projects/:id/edit-prompt", async (request, reply) => {
    const current = repository.get(request.params.id);
    if (!current) return reply.code(404).send({ error: "Projeto não encontrado." });
    const input = PromptEditSchema.parse(request.body);
    const target = input.scope === "scene" ? current.scenes.find((item) => item.id === input.sceneId) : undefined;
    if (input.scope === "scene" && !target) return reply.code(404).send({ error: "Cena não encontrada." });
    const startedAt = new Date();
    return projectAction(current.id, "plan", async (project) => {
      const edited = await editWithPrompt(project, input.prompt, target);
      let changedFields: string[] = [];
      if (target && "narration" in edited) {
        changedFields = (["title", "narration", "visualPrompt", "durationHint"] as const)
          .filter((field) => edited[field] !== target[field])
          .map((field) => ({ title: "título", narration: "narração", visualPrompt: "direção visual", durationHint: "duração prevista" })[field]);
        repository.updateScene(target.id, { ...edited, audioPath: null, imagePath: null, imageSourceUrl: null, videoPath: null, duration: null, status: "ready", error: null });
        repository.clearClips(target.id);
      } else if ("scenes" in edited) {
        changedFields = ["roteiro completo", "estrutura das cenas"];
        repository.replaceScenes(project.id, edited.scenes.map((scene, position) => ({ ...scene, id: crypto.randomUUID(), position, status: "ready" as const, clips: [] })));
        repository.update(project.id, { title: edited.title, summary: edited.summary });
      }
      const finishedAt = new Date();
      repository.update(project.id, { captionsPath: null, finalVideoPath: null, stage: "plan", lastPromptEdit: {
        prompt: input.prompt, scope: input.scope, sceneId: target?.id, sceneTitle: target?.title,
        changedFields: changedFields.length ? changedFields : ["nenhuma alteração textual detectada"],
        invalidated: input.scope === "project" ? ["vozes", "imagens", "clipes", "legendas", "vídeo final"] : ["voz da cena", "imagem da cena", "clipes da cena", "legendas", "vídeo final"],
        startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), elapsedSeconds: Number(((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1))
      } });
    });
  });

  app.post<{ Params: { id: string }; Body: Buffer }>("/api/projects/:id/music", async (request, reply) => {
    const project = repository.get(request.params.id);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado." });
    if (!Buffer.isBuffer(request.body) || request.body.length < 1000) return reply.code(400).send({ error: "Envie um arquivo de música válido." });
    const extension = request.headers["content-type"]?.includes("wav") ? "wav" : request.headers["content-type"]?.includes("ogg") ? "ogg" : request.headers["content-type"]?.includes("mp4") ? "m4a" : "mp3";
    const destination = path.join(await ensureProjectDir(project.id), `music.${extension}`);
    await fs.promises.writeFile(destination, request.body);
    let duration: number;
    try { duration = await durationOf(destination); } catch { return reply.code(400).send({ error: "O arquivo enviado não contém áudio reconhecível." }); }
    return present(repository.update(project.id, { musicPath: destination, musicDuration: duration, finalVideoPath: null })!);
  });
  app.delete<{ Params: { id: string } }>("/api/projects/:id/music", async (request, reply) => {
    const project = repository.get(request.params.id);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado." });
    return present(repository.update(project.id, { musicPath: null, musicDuration: null, finalVideoPath: null })!);
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/voice", async (request) => projectAction(request.params.id, "voice", async (project) => {
    const dir = await ensureProjectDir(project.id);
    for (const scene of project.scenes) {
      if (scene.audioPath) continue;
      repository.updateScene(scene.id, { status: "working", error: undefined });
      try {
        const destination = path.join(dir, `voice-${String(scene.position + 1).padStart(2,"0")}.mp3`);
        await generateVoice(scene, destination, project.settings.voiceId);
        const duration = await durationOf(destination);
        repository.updateScene(scene.id, { audioPath: destination, duration, status: "ready" });
      } catch (error) {
        repository.updateScene(scene.id, { status: "error", error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
  }));

  app.post<{ Params: { id: string } }>("/api/projects/:id/images", async (request) => projectAction(request.params.id, "image", async (project) => {
    const dir = await ensureProjectDir(project.id);
    for (const scene of project.scenes) {
      if (scene.imagePath) continue;
      const destination = path.join(dir, `image-${String(scene.position + 1).padStart(2,"0")}.png`);
      repository.updateScene(scene.id, { status: "working" });
      const generated = await generateImage(scene, destination, project.settings.format);
      repository.updateScene(scene.id, { imagePath: generated.path, imageSourceUrl: generated.sourceUrl ?? null, status: "ready", error: undefined });
    }
  }));

  app.post<{ Params: { sceneId: string } }>("/api/scenes/:sceneId/image", async (request, reply) => {
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    return projectAction(project.id, "image", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      const dir = await ensureProjectDir(current.id);
      const destination = path.join(dir, `image-${String(target.position + 1).padStart(2,"0")}-${Date.now()}.png`);
      const generated = await generateImage(target, destination, current.settings.format);
      repository.updateScene(target.id, { imagePath: generated.path, imageSourceUrl: generated.sourceUrl ?? null, videoPath: null, status: "ready", error: null });
      repository.clearClips(target.id);
      repository.update(current.id, { finalVideoPath: null });
    });
  });

  app.post<{ Params: { sceneId: string } }>("/api/scenes/:sceneId/voice", async (request, reply) => {
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    return projectAction(project.id, "voice", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      const dir = await ensureProjectDir(current.id);
      const destination = path.join(dir, `voice-${String(target.position + 1).padStart(2,"0")}-${Date.now()}.mp3`);
      await generateVoice(target, destination, current.settings.voiceId);
      repository.updateScene(target.id, { audioPath: destination, videoPath: null, duration: await durationOf(destination), status: "ready", error: null });
      repository.clearClips(target.id);
      repository.update(current.id, { captionsPath: null, finalVideoPath: null });
    });
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/storyboard", async (request) => projectAction(request.params.id, "storyboard", async (project) => {
    const dir = await ensureProjectDir(project.id);
    for (const scene of project.scenes) {
      if (!scene.audioPath || !scene.duration) throw Object.assign(new Error(`Gere a voz de “${scene.title}” antes do storyboard.`), { statusCode: 409 });
      if (scene.clips.length && scene.clips.every((clip) => clip.imagePath)) continue;
      const clips = await createStoryboardClips(project, scene);
      repository.replaceClips(scene.id, clips);
      for (const clip of clips) {
        const destination = path.join(dir, `clip-frame-${String(scene.position + 1).padStart(2,"0")}-${String(clip.position + 1).padStart(2,"0")}.png`);
        repository.updateClip(clip.id, { status: "working", error: null });
        repository.touch(project.id);
        try {
          const frame = await generateClipImage(scene, clip, destination, project.settings.format);
          repository.updateClip(clip.id, { imagePath: frame.path, imageSourceUrl: frame.sourceUrl ?? null, status: "ready", error: null });
        } catch (error) {
          repository.updateClip(clip.id, { status: "error", error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
    }
  }));

  app.post<{ Params: { sceneId: string } }>("/api/scenes/:sceneId/storyboard", async (request, reply) => {
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    return projectAction(project.id, "storyboard", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      if (!target.audioPath || !target.duration) throw Object.assign(new Error("Gere a voz desta cena antes do storyboard."), { statusCode: 409 });
      const clips = await createStoryboardClips(current, target);
      repository.replaceClips(target.id, clips);
      const dir = await ensureProjectDir(current.id);
      for (const clip of clips) {
        const destination = path.join(dir, `clip-frame-${String(target.position + 1).padStart(2,"0")}-${Date.now()}-${clip.position + 1}.png`);
        repository.updateClip(clip.id, { status: "working", error: null });
        const frame = await generateClipImage(target, clip, destination, current.settings.format);
        repository.updateClip(clip.id, { imagePath: frame.path, imageSourceUrl: frame.sourceUrl ?? null, status: "ready", error: null });
      }
      repository.updateScene(target.id, { videoPath: null });
      repository.update(current.id, { finalVideoPath: null });
    });
  });

  app.post<{ Params: { clipId: string } }>("/api/clips/:clipId/image", async (request, reply) => {
    const { project, scene, clip } = findClip(request.params.clipId);
    if (!project || !scene || !clip) return reply.code(404).send({ error: "Clipe não encontrado." });
    return projectAction(project.id, "storyboard", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      const currentClip = target.clips.find((item) => item.id === clip.id)!;
      const destination = path.join(await ensureProjectDir(current.id), `clip-frame-${String(target.position + 1).padStart(2,"0")}-${Date.now()}-${currentClip.position + 1}.png`);
      repository.updateClip(currentClip.id, { status: "working", imagePath: null, imageSourceUrl: null, videoPath: null, providerJobId: null, error: null });
      try {
        const frame = await generateClipImage(target, currentClip, destination, current.settings.format);
        repository.updateClip(currentClip.id, { imagePath: frame.path, imageSourceUrl: frame.sourceUrl ?? null, status: "ready", error: null });
        repository.updateScene(target.id, { videoPath: null });
        repository.update(current.id, { finalVideoPath: null });
      } catch (error) {
        repository.updateClip(currentClip.id, { status: "error", error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/animate", async (request) => projectAction(request.params.id, "motion", async (project) => {
    const dir = await ensureProjectDir(project.id);
    for (const scene of project.scenes) {
      let clips = scene.clips;
      if (clips.length && clips.every((clip) => clip.status === "ready" && clip.videoPath)) continue;
      if (!clips.length || clips.some((clip) => !clip.imagePath)) throw Object.assign(new Error(`Revise e aprove o storyboard de “${scene.title}” antes de consumir a animação Agnes.`), { statusCode: 409 });
      for (const clip of clips) {
        if (clip.status === "ready" && clip.videoPath) continue;
        const destination = path.join(dir, `motion-${String(scene.position + 1).padStart(2,"0")}-${String(clip.position + 1).padStart(2,"0")}.mp4`);
        repository.updateClip(clip.id, { status: "working", error: null });
        repository.touch(project.id);
        try {
          const frame = { path: clip.imagePath!, sourceUrl: clip.imageSourceUrl };
          repository.updateClip(clip.id, { imagePath: frame.path, imageSourceUrl: frame.sourceUrl ?? null });
          repository.touch(project.id);
          await animateScene(scene, destination, project.settings.format, { ...clip, imagePath: frame.path, imageSourceUrl: frame.sourceUrl }, (providerJobId) => { repository.updateClip(clip.id, { providerJobId }); repository.touch(project.id); });
          repository.updateClip(clip.id, { imagePath: frame.path, imageSourceUrl: frame.sourceUrl ?? null, videoPath: destination, actualDuration: await durationOf(destination), status: "ready", error: null });
        } catch (error) {
          repository.updateClip(clip.id, { status: "error", error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
      const refreshed = repository.get(project.id)!.scenes.find((item) => item.id === scene.id)!;
      repository.updateScene(scene.id, { videoPath: refreshed.clips[0]?.videoPath ?? null, status: "ready", error: null });
    }
  }));

  app.post<{ Params: { sceneId: string } }>("/api/scenes/:sceneId/animate", async (request, reply) => {
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    return projectAction(project.id, "motion", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      const dir = await ensureProjectDir(current.id);
      const clips = target.clips;
      if (!clips.length || clips.some((clip) => !clip.imagePath)) throw Object.assign(new Error("Crie e revise o storyboard desta cena antes de animar."), { statusCode: 409 });
      for (const clip of clips) {
        const destination = path.join(dir, `motion-${String(target.position + 1).padStart(2,"0")}-${Date.now()}-${clip.position + 1}.mp4`);
        repository.updateClip(clip.id, { status: "working", error: null });
        repository.touch(current.id);
        await animateScene(target, destination, current.settings.format, clip, (providerJobId) => { repository.updateClip(clip.id, { providerJobId }); repository.touch(current.id); });
        repository.updateClip(clip.id, { videoPath: destination, actualDuration: await durationOf(destination), status: "ready" });
      }
      const refreshed = repository.get(current.id)!.scenes.find((item) => item.id === target.id)!;
      repository.updateScene(target.id, { videoPath: refreshed.clips[0]?.videoPath ?? null, status: "ready", error: null });
      repository.update(current.id, { finalVideoPath: null });
    });
  });

  app.post<{ Params: { clipId: string } }>("/api/clips/:clipId/animate", async (request, reply) => {
    const { project, scene, clip } = findClip(request.params.clipId);
    if (!project || !scene || !clip) return reply.code(404).send({ error: "Clipe não encontrado." });
    return projectAction(project.id, "motion", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      const currentClip = target.clips.find((item) => item.id === clip.id)!;
      const destination = path.join(await ensureProjectDir(current.id), `motion-${String(target.position + 1).padStart(2,"0")}-${Date.now()}-${currentClip.position + 1}.mp4`);
      if (!currentClip.imagePath) throw Object.assign(new Error("Este clipe ainda não possui quadro aprovado. Gere o quadro antes da animação."), { statusCode: 409 });
      repository.updateClip(currentClip.id, { status: "working", providerJobId: null, error: null });
      repository.touch(current.id);
      try {
        await animateScene(target, destination, current.settings.format, { ...currentClip, providerJobId: undefined }, (providerJobId) => { repository.updateClip(currentClip.id, { providerJobId }); repository.touch(current.id); });
        repository.updateClip(currentClip.id, { videoPath: destination, actualDuration: await durationOf(destination), status: "ready", error: undefined });
        if (currentClip.position === 0) repository.updateScene(target.id, { videoPath: destination });
        repository.update(current.id, { finalVideoPath: null });
      } catch (error) {
        repository.updateClip(currentClip.id, { status: "error", error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  });

  app.post<{ Params: { sceneId: string } }>("/api/scenes/:sceneId/preview", async (request, reply) => {
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    if (repository.hasWorkingJob()) return reply.code(409).send({ error: "Uma etapa está em execução. Aguarde antes de montar a prévia." });
    const jobId = repository.startJob(project.id, "scene-preview");
    try {
      const output = await renderScenePreview(project, scene);
      repository.finishJob(jobId);
      return { previewUrl: `${mediaUrl(output)}?v=${Date.now()}` };
    } catch (error) {
      repository.finishJob(jobId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/captions", async (request) => projectAction(request.params.id, "captions", async (project) => {
    const captionsPath = await writeCaptions(project);
    repository.update(project.id, { captionsPath });
  }));

  app.post<{ Params: { id: string } }>("/api/projects/:id/render", async (request) => projectAction(request.params.id, "render", async (project) => {
    const result = await renderProject(project);
    repository.update(project.id, { finalVideoPath: result.video, captionsPath: result.captions, stage: "done" });
  }));

  const webDist = path.join(config.workspaceRoot, "apps/web/dist");
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, decorateReply: false });
    app.setNotFoundHandler((request, reply) => request.url.startsWith("/api/") || request.url.startsWith("/media/")
      ? reply.code(404).send({ error: "Rota não encontrada." })
      : reply.sendFile("index.html"));
  }

  app.setErrorHandler((error, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const status = "statusCode" in normalized && typeof normalized.statusCode === "number" ? normalized.statusCode : 500;
    app.log.error(error);
    reply.code(status).send({ error: normalized.message });
  });
  return app;
}

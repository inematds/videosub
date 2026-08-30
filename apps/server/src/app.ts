import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config, mediaUrl } from "./config.js";
import { repository } from "./db.js";
import { ensureProjectDir, durationOf, renderProject, writeCaptions } from "./media.js";
import { animateScene, createPlan, generateImage, generateVoice, providerStatus } from "./providers.js";
import { CreateProjectSchema, ProjectSettingsSchema, UpdateProjectSchema, UpdateSceneSchema } from "./types.js";

function present(project: NonNullable<ReturnType<typeof repository.get>>) {
  return {
    ...project,
    finalVideoUrl: mediaUrl(project.finalVideoPath),
    captionsUrl: mediaUrl(project.captionsPath),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      audioUrl: mediaUrl(scene.audioPath), imageUrl: mediaUrl(scene.imagePath), videoUrl: mediaUrl(scene.videoPath)
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

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
  // Aceita ações POST sem payload enviadas por versões anteriores da interface,
  // que declaravam JSON mesmo com o corpo vazio.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (!text.trim()) return done(null, {});
    try { done(null, JSON.parse(text)); }
    catch (error) { done(error as Error); }
  });
  await app.register(cors, { origin: config.webOrigin });
  await app.register(fastifyStatic, { root: config.dataDir, prefix: "/media/", decorateReply: true });

  app.get("/api/health", async () => ({ ok: true, version: "1.03.04", providers: await providerStatus() }));
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
    repository.update(project.id, { finalVideoPath: null, ...(narrationChanged ? { captionsPath: null } : {}), stage: "plan", status: "ready" });
    return present(repository.get(project.id)!);
  });
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const removed = repository.delete(request.params.id);
    return removed ? reply.code(204).send() : reply.code(404).send({ error: "Projeto não encontrado." });
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/plan", async (request) => projectAction(request.params.id, "plan", async (project) => {
    const plan = await createPlan(project);
    repository.replaceScenes(project.id, plan.scenes.map((scene, position) => ({ ...scene, id: crypto.randomUUID(), position, status: "ready" as const })));
    repository.update(project.id, { summary: plan.summary, captionsPath: null, finalVideoPath: null });
  }));

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
      repository.update(current.id, { captionsPath: null, finalVideoPath: null });
    });
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/animate", async (request) => projectAction(request.params.id, "motion", async (project) => {
    const dir = await ensureProjectDir(project.id);
    for (const scene of project.scenes) {
      if (scene.videoPath) continue;
      const destination = path.join(dir, `motion-${String(scene.position + 1).padStart(2,"0")}.mp4`);
      await animateScene(scene, destination, project.settings.format);
      repository.updateScene(scene.id, { videoPath: destination, status: "ready" });
    }
  }));

  app.post<{ Params: { sceneId: string } }>("/api/scenes/:sceneId/animate", async (request, reply) => {
    const { project, scene } = findScene(request.params.sceneId);
    if (!project || !scene) return reply.code(404).send({ error: "Cena não encontrada." });
    return projectAction(project.id, "motion", async (current) => {
      const target = current.scenes.find((item) => item.id === scene.id)!;
      const dir = await ensureProjectDir(current.id);
      const destination = path.join(dir, `motion-${String(target.position + 1).padStart(2,"0")}-${Date.now()}.mp4`);
      await animateScene(target, destination, current.settings.format);
      repository.updateScene(target.id, { videoPath: destination, status: "ready", error: null });
      repository.update(current.id, { finalVideoPath: null });
    });
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

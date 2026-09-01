import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { repository } from "./db.js";
import { planSceneClips, splitNarrationForClips, videoModelProfile, videoStatusUrl } from "./providers.js";
import type { Scene } from "./types.js";

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

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
        expect(music.json().musicUrl).toMatch(/music\.mp3$/);
      }
      if (action === "images") {
        const preview = await app.inject({ method: "POST", url: `/api/scenes/${response.json().scenes[0].id}/preview` });
        expect(preview.statusCode).toBe(200);
        expect(preview.json().previewUrl).toMatch(/scene-preview-01\.mp4\?v=/);
      }
      if (action === "render") {
        expect(response.json().stage).toBe("done");
        expect(response.json().finalVideoUrl).toMatch(/video-final\.mp4$/);
      }
    }
  }, 20_000);
});

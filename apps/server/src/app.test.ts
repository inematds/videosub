import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

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
      if (action === "render") {
        expect(response.json().stage).toBe("done");
        expect(response.json().finalVideoUrl).toMatch(/video-final\.mp4$/);
      }
    }
  }, 20_000);
});

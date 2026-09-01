import { describe, expect, it } from "vitest";
import { actionFor, rebuildActions } from "./App";
import type { Project } from "./types";

const project: Project = {
  id: "p1", title: "Teste", content: "Conteúdo de teste com tamanho válido.", summary: "", stage: "content", status: "ready",
  settings: { format: "16:9", language: "pt-BR", visualStyle: "editorial", animate: false, burnCaptions: true, voiceVolume: 1, musicVolume: 0.16, clipStrategy: "provider" },
  scenes: [], createdAt: "2026-01-01", updatedAt: "2026-01-01"
};

describe("progressão do fluxo", () => {
  it("começa pela criação do roteiro", () => expect(actionFor(project)?.id).toBe("plan"));
  it("pede voz depois do roteiro", () => expect(actionFor({ ...project, scenes: [{ id: "s1", projectId: "p1", position: 0, title: "Cena", narration: "Texto", visualPrompt: "Imagem", durationHint: 3, status: "ready", clips: [] }] })?.id).toBe("voice"));
});

describe("reconstrução por camada", () => {
  it("refaz imagem e todas as camadas seguintes", () => expect(rebuildActions("image", true)).toEqual(["images", "storyboard", "animate", "captions", "render"]));
  it("preserva o storyboard ao refazer somente movimento", () => expect(rebuildActions("motion", true)).toEqual(["animate", "captions", "render"]));
  it("pula movimento quando a animação está desativada", () => expect(rebuildActions("motion", false)).toEqual(["captions", "render"]));
});

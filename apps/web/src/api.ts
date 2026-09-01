import type { Project, ProviderStatus, Settings } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `Erro ${response.status}` }));
    throw new Error(payload.error ?? `Erro ${response.status}`);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const api = {
  health: () => request<{ ok: boolean; version: string; providers: ProviderStatus }>("/api/health"),
  projects: () => request<Project[]>("/api/projects"),
  project: (id: string) => request<Project>(`/api/projects/${id}`),
  create: (input: { title: string; content: string; settings: Partial<Settings> }) => request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<Pick<Project, "title" | "content">> & { settings?: Partial<Settings> }) => request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  action: (id: string, action: "plan" | "voice" | "images" | "storyboard" | "animate" | "captions" | "render") => request<Project>(`/api/projects/${id}/${action}`, { method: "POST" }),
  invalidateFrom: (id: string, stage: "plan" | "voice" | "image" | "storyboard" | "motion" | "captions" | "render") => request<Project>(`/api/projects/${id}/invalidate-from`, { method: "POST", body: JSON.stringify({ stage }) }),
  updateScene: (sceneId: string, input: { title?: string; narration?: string; visualPrompt?: string; durationHint?: number }) => request<Project>(`/api/scenes/${sceneId}`, { method: "PATCH", body: JSON.stringify(input) }),
  regenerateImage: (sceneId: string) => request<Project>(`/api/scenes/${sceneId}/image`, { method: "POST" }),
  regenerateVoice: (sceneId: string) => request<Project>(`/api/scenes/${sceneId}/voice`, { method: "POST" }),
  regenerateMotion: (sceneId: string) => request<Project>(`/api/scenes/${sceneId}/animate`, { method: "POST" }),
  regenerateStoryboard: (sceneId: string) => request<Project>(`/api/scenes/${sceneId}/storyboard`, { method: "POST" }),
  regenerateClipImage: (clipId: string) => request<Project>(`/api/clips/${clipId}/image`, { method: "POST" }),
  regenerateClip: (clipId: string) => request<Project>(`/api/clips/${clipId}/animate`, { method: "POST" }),
  previewScene: (sceneId: string) => request<{ previewUrl: string }>(`/api/scenes/${sceneId}/preview`, { method: "POST" }),
  editPrompt: (id: string, input: { prompt: string; scope: "project" | "scene"; sceneId?: string }) => request<Project>(`/api/projects/${id}/edit-prompt`, { method: "POST", body: JSON.stringify(input) }),
  uploadMusic: (id: string, file: File) => request<Project>(`/api/projects/${id}/music`, { method: "POST", headers: { "content-type": file.type || "audio/mpeg" }, body: file }),
  removeMusic: (id: string) => request<Project>(`/api/projects/${id}/music`, { method: "DELETE" })
};

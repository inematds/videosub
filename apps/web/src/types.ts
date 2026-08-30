export type Stage = "content" | "plan" | "voice" | "image" | "motion" | "captions" | "render" | "done";
export type Status = "pending" | "working" | "ready" | "error";

export interface Settings {
  format: "16:9" | "9:16" | "1:1";
  language: string;
  visualStyle: string;
  voiceId?: string;
  animate: boolean;
  burnCaptions: boolean;
}

export interface Scene {
  id: string; projectId: string; position: number; title: string; narration: string; visualPrompt: string;
  durationHint: number; duration?: number; status: Status; error?: string;
  audioUrl?: string; imageUrl?: string; videoUrl?: string;
}

export interface Project {
  id: string; title: string; content: string; summary: string; stage: Stage; status: Status; error?: string;
  settings: Settings; scenes: Scene[]; finalVideoUrl?: string; captionsUrl?: string;
  createdAt: string; updatedAt: string;
}

export interface ProviderStatus {
  mode: "mock" | "real" | "mixed";
  codex: { ready: boolean; auth: string; mode: string };
  agnes: { ready: boolean; imageModel: string; videoModel: string; mode: string };
  elevenLabs: { ready: boolean; model: string; mode: string };
  ffmpeg: { ready: boolean };
}

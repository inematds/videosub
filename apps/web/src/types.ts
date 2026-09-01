export type Stage = "content" | "plan" | "voice" | "image" | "storyboard" | "motion" | "captions" | "render" | "done";
export type Status = "pending" | "working" | "ready" | "error";

export interface Settings {
  format: "16:9" | "9:16" | "1:1";
  language: string;
  visualStyle: string;
  voiceId?: string;
  animate: boolean;
  burnCaptions: boolean;
  voiceVolume: number;
  musicVolume: number;
  clipStrategy: "provider" | "single";
}

export interface VideoClip { id: string; sceneId: string; position: number; provider: string; model: string; narrationText: string; visualIntent: string; prompt: string; targetDuration: number; actualDuration?: number; status: Status; error?: string; imageUrl?: string; providerJobId?: string; videoUrl?: string }

export interface Scene {
  id: string; projectId: string; position: number; title: string; narration: string; visualPrompt: string;
  durationHint: number; duration?: number; status: Status; error?: string;
  audioUrl?: string; imageUrl?: string; videoUrl?: string; clips: VideoClip[];
}

export interface Project {
  id: string; title: string; content: string; summary: string; stage: Stage; status: Status; error?: string;
  settings: Settings; scenes: Scene[]; finalVideoUrl?: string; captionsUrl?: string; musicUrl?: string; musicDuration?: number;
  createdAt: string; updatedAt: string;
  lastPromptEdit?: PromptEditRecord;
}

export interface PromptEditRecord {
  prompt: string; scope: "project" | "scene"; sceneId?: string; sceneTitle?: string;
  changedFields: string[]; invalidated: string[]; startedAt: string; finishedAt: string; elapsedSeconds: number;
}

export interface ProviderStatus {
  mode: "mock" | "real" | "mixed";
  codex: { ready: boolean; auth: string; mode: string; resources: string[] };
  agnes: { ready: boolean; imageModel: string; videoModel: string; mode: string; tokenSlot: number; tokenSource: string; video: { id: string; label: string; contract: string; minSeconds: number; maxSeconds: number; resolution: string; aspectRatios: string[]; maxReferences: number; supportsNegativePrompt: boolean; pollingEndpoint: string; pollIntervalSeconds: number; observedCompletionSeconds?: number; maxWaitSeconds: number; specificationSource: string }; strategy: { name: string; maxClipsPerScene: number; defaultSeconds: number } };
  elevenLabs: { ready: boolean; model: string; outputFormat: string; mode: string; resources: string[] };
  ffmpeg: { ready: boolean; resources: string[] };
}

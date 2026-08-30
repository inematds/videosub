import { z } from "zod";

export const ProjectSettingsSchema = z.object({
  format: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  language: z.string().default("pt-BR"),
  visualStyle: z.string().default("editorial cinematográfico"),
  voiceId: z.string().optional(),
  animate: z.boolean().default(false),
  burnCaptions: z.boolean().default(true)
});

export const ScenePlanSchema = z.object({
  title: z.string().min(1),
  narration: z.string().min(1),
  visualPrompt: z.string().min(1),
  durationHint: z.number().min(2).max(30).default(6)
});

export const PlanSchema = z.object({
  title: z.string().min(1),
  summary: z.string(),
  scenes: z.array(ScenePlanSchema).min(1).max(20)
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export type Stage = "content" | "plan" | "voice" | "image" | "motion" | "captions" | "render" | "done";
export type Status = "pending" | "working" | "ready" | "error";

export interface Scene extends ScenePlan {
  id: string;
  projectId: string;
  position: number;
  status: Status;
  audioPath?: string;
  imagePath?: string;
  imageSourceUrl?: string;
  videoPath?: string;
  duration?: number;
  error?: string;
}

export interface Project {
  id: string;
  title: string;
  content: string;
  summary: string;
  stage: Stage;
  status: Status;
  settings: ProjectSettings;
  finalVideoPath?: string;
  captionsPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  scenes: Scene[];
}

export const CreateProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(20),
  settings: ProjectSettingsSchema.partial().optional()
});

export const UpdateProjectSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(20).optional(),
  settings: ProjectSettingsSchema.partial().optional()
});

export const UpdateSceneSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  narration: z.string().trim().min(1).optional(),
  visualPrompt: z.string().trim().min(1).optional(),
  durationHint: z.number().min(2).max(30).optional()
}).refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Project, ProjectSettings, Scene, Stage, Status } from "./types.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new Database(path.join(config.dataDir, "videosub.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    settings TEXT NOT NULL,
    final_video_path TEXT,
    captions_path TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    narration TEXT NOT NULL,
    visual_prompt TEXT NOT NULL,
    duration_hint REAL NOT NULL,
    duration REAL,
    status TEXT NOT NULL,
    audio_path TEXT,
    image_path TEXT,
    video_path TEXT,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT
  );
`);
db.prepare("UPDATE jobs SET status = 'error', error = 'Processo interrompido pela reinicialização', finished_at = ? WHERE status = 'working'").run(new Date().toISOString());
db.prepare("UPDATE projects SET status = 'error', error = 'Etapa interrompida pela reinicialização', updated_at = ? WHERE status = 'working'").run(new Date().toISOString());
const sceneColumns = db.prepare("PRAGMA table_info(scenes)").all() as { name: string }[];
if (!sceneColumns.some((column) => column.name === "image_source_url")) db.exec("ALTER TABLE scenes ADD COLUMN image_source_url TEXT");

type ProjectRow = {
  id: string; title: string; content: string; summary: string; stage: Stage; status: Status;
  settings: string; final_video_path: string | null; captions_path: string | null; error: string | null;
  created_at: string; updated_at: string;
};
type SceneRow = {
  id: string; project_id: string; position: number; title: string; narration: string; visual_prompt: string;
  duration_hint: number; duration: number | null; status: Status; audio_path: string | null;
  image_path: string | null; image_source_url: string | null; video_path: string | null; error: string | null;
};

function mapScene(row: SceneRow): Scene {
  return {
    id: row.id, projectId: row.project_id, position: row.position, title: row.title,
    narration: row.narration, visualPrompt: row.visual_prompt, durationHint: row.duration_hint,
    duration: row.duration ?? undefined, status: row.status, audioPath: row.audio_path ?? undefined,
    imagePath: row.image_path ?? undefined, imageSourceUrl: row.image_source_url ?? undefined,
    videoPath: row.video_path ?? undefined, error: row.error ?? undefined
  };
}

function mapProject(row: ProjectRow): Project {
  const scenes = db.prepare("SELECT * FROM scenes WHERE project_id = ? ORDER BY position").all(row.id) as SceneRow[];
  return {
    id: row.id, title: row.title, content: row.content, summary: row.summary, stage: row.stage,
    status: row.status, settings: JSON.parse(row.settings) as ProjectSettings,
    finalVideoPath: row.final_video_path ?? undefined, captionsPath: row.captions_path ?? undefined,
    error: row.error ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    scenes: scenes.map(mapScene)
  };
}

export const repository = {
  list(): Project[] {
    return (db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRow[]).map(mapProject);
  },
  get(id: string): Project | undefined {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? mapProject(row) : undefined;
  },
  create(input: { title: string; content: string; settings: ProjectSettings }): Project {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO projects (id,title,content,summary,stage,status,settings,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, input.title, input.content, "", "content", "ready", JSON.stringify(input.settings), now, now);
    return this.get(id)!;
  },
  update(id: string, fields: Partial<{ title: string; content: string; summary: string; stage: Stage; status: Status; settings: ProjectSettings; finalVideoPath: string | null; captionsPath: string | null; error: string | null }>) {
    const entries: [string, unknown][] = [];
    const mapping: Record<string, string> = { finalVideoPath: "final_video_path", captionsPath: "captions_path" };
    for (const [key, value] of Object.entries(fields)) {
      entries.push([mapping[key] ?? key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), key === "settings" ? JSON.stringify(value) : value]);
    }
    entries.push(["updated_at", new Date().toISOString()]);
    db.prepare(`UPDATE projects SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).run(...entries.map(([, value]) => value), id);
    return this.get(id);
  },
  replaceScenes(projectId: string, scenes: Omit<Scene, "projectId">[]) {
    db.transaction(() => {
      db.prepare("DELETE FROM scenes WHERE project_id = ?").run(projectId);
      const insert = db.prepare(`INSERT INTO scenes
        (id,project_id,position,title,narration,visual_prompt,duration_hint,duration,status,audio_path,image_path,image_source_url,video_path,error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const scene of scenes) insert.run(scene.id, projectId, scene.position, scene.title, scene.narration, scene.visualPrompt, scene.durationHint, scene.duration ?? null, scene.status, scene.audioPath ?? null, scene.imagePath ?? null, scene.imageSourceUrl ?? null, scene.videoPath ?? null, scene.error ?? null);
    })();
    return this.get(projectId)!;
  },
  updateScene(id: string, fields: Partial<Omit<Scene, "audioPath" | "imagePath" | "imageSourceUrl" | "videoPath" | "duration" | "error">> & { audioPath?: string | null; imagePath?: string | null; imageSourceUrl?: string | null; videoPath?: string | null; duration?: number | null; error?: string | null }) {
    const allowed: Record<string, string> = { title: "title", narration: "narration", visualPrompt: "visual_prompt", durationHint: "duration_hint", duration: "duration", status: "status", audioPath: "audio_path", imagePath: "image_path", imageSourceUrl: "image_source_url", videoPath: "video_path", error: "error" };
    const entries = Object.entries(fields).filter(([key]) => allowed[key]).map(([key, value]) => [allowed[key], value] as const);
    if (entries.length) db.prepare(`UPDATE scenes SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).run(...entries.map(([, value]) => value), id);
    const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
    return row ? mapScene(row) : undefined;
  },
  delete(id: string) {
    db.prepare("DELETE FROM scenes WHERE project_id = ?").run(id);
    return db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
  },
  hasWorkingJob() {
    return Boolean(db.prepare("SELECT 1 FROM jobs WHERE status = 'working' LIMIT 1").get());
  },
  startJob(projectId: string, kind: string) {
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO jobs (id,project_id,kind,status,created_at) VALUES (?,?,?,?,?)").run(id, projectId, kind, "working", new Date().toISOString());
    return id;
  },
  finishJob(id: string, error?: string) {
    db.prepare("UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?").run(error ? "error" : "ready", error ?? null, new Date().toISOString(), id);
  }
};

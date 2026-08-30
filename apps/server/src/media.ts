import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { run } from "./command.js";
import type { Project } from "./types.js";

export function projectDir(projectId: string) {
  return path.join(config.dataDir, "projects", projectId);
}

export async function ensureProjectDir(projectId: string) {
  const dir = projectDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function durationOf(file: string) {
  const output = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  return Number(output);
}

function srtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000);
  const secs = Math.floor(milliseconds % 60_000 / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

export async function writeCaptions(project: Project) {
  const dir = await ensureProjectDir(project.id);
  const destination = path.join(dir, "captions.srt");
  let cursor = 0;
  let cueIndex = 1;
  const maxCharacters = project.settings.format === "9:16" ? 28 : project.settings.format === "1:1" ? 36 : 44;
  const blocks = project.scenes.flatMap((scene) => {
    const duration = scene.duration ?? scene.durationHint;
    const words = scene.narration.split(/\s+/).filter(Boolean);
    const cues: string[] = [];
    let current = "";
    for (const word of words) {
      if (current && `${current} ${word}`.length > maxCharacters) { cues.push(current); current = word; }
      else current = current ? `${current} ${word}` : word;
    }
    if (current) cues.push(current);
    const cueDuration = duration / Math.max(1, cues.length);
    const sceneBlocks = cues.map((cue, index) => `${cueIndex++}\n${srtTime(cursor + index * cueDuration)} --> ${srtTime(cursor + (index + 1) * cueDuration)}\n${cue}\n`);
    cursor += duration;
    return sceneBlocks;
  });
  await fs.writeFile(destination, blocks.join("\n"), "utf8");
  return destination;
}

export async function renderProject(project: Project) {
  const dir = await ensureProjectDir(project.id);
  const normalized: string[] = [];
  const [width, height] = project.settings.format === "9:16" ? [1080, 1920] : project.settings.format === "1:1" ? [1080, 1080] : [1920, 1080];
  for (const scene of project.scenes) {
    if (!scene.audioPath || (!scene.imagePath && !scene.videoPath)) throw new Error(`A cena “${scene.title}” ainda não possui voz e visual.`);
    const output = path.join(dir, `scene-${String(scene.position + 1).padStart(2,"0")}.mp4`);
    const visualArgs = scene.videoPath ? ["-stream_loop", "-1", "-i", scene.videoPath] : ["-loop", "1", "-i", scene.imagePath!];
    await run("ffmpeg", ["-y", ...visualArgs, "-i", scene.audioPath, "-t", String(scene.duration ?? scene.durationHint),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-map", "0:v:0", "-map", "1:a:0", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
      "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p", "-shortest", output]);
    normalized.push(output);
  }
  const concatFile = path.join(dir, "concat.txt");
  await fs.writeFile(concatFile, normalized.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  const plain = path.join(dir, "video-sem-legenda.mp4");
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", plain]);
  const captions = project.captionsPath ?? await writeCaptions(project);
  const output = path.join(dir, "video-final.mp4");
  if (project.settings.burnCaptions) {
    const escaped = captions.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
    const fontSize = project.settings.format === "9:16" ? 7 : project.settings.format === "1:1" ? 14 : 20;
    const margin = project.settings.format === "9:16" ? 42 : 52;
    const sideMargin = project.settings.format === "9:16" ? 32 : 24;
    await run("ffmpeg", ["-y", "-i", plain, "-vf", `subtitles='${escaped}':original_size=${width}x${height}:force_style='FontName=DejaVu Sans,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00172227,BorderStyle=1,Outline=1.2,Shadow=0,Alignment=2,MarginV=${margin},MarginL=${sideMargin},MarginR=${sideMargin}'`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", output]);
  } else await fs.copyFile(plain, output);
  return { video: output, captions };
}

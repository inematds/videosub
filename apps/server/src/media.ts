import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { run } from "./command.js";
import type { Project, Scene } from "./types.js";

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

async function renderScene(project: Project, scene: Scene, output: string, fileStem: string) {
  const dir = await ensureProjectDir(project.id);
  const [width, height] = project.settings.format === "9:16" ? [1080, 1920] : project.settings.format === "1:1" ? [1080, 1080] : [1920, 1080];
  if (!scene.audioPath || (!scene.imagePath && !scene.videoPath && !scene.clips.some((clip) => clip.videoPath))) throw new Error(`A cena “${scene.title}” ainda não possui voz e visual.`);
  const sceneDuration = scene.duration ?? scene.durationHint;
  const readyClips = scene.clips.filter((clip) => clip.videoPath);
  if (scene.clips.length > 0 && readyClips.length !== scene.clips.length) throw new Error(`A cena “${scene.title}” ainda possui clipes em geração ou com erro.`);
  let visual = scene.videoPath;
  if (readyClips.length > 1) {
    const pieces: string[] = [];
    const plannedDuration = readyClips.reduce((sum, clip) => sum + clip.targetDuration, 0);
    for (const clip of readyClips) {
      const piece = path.join(dir, `${fileStem}-clip-${clip.position + 1}.mp4`);
      const allocation = sceneDuration * clip.targetDuration / plannedDuration;
      await run("ffmpeg", ["-y", "-stream_loop", "-1", "-i", clip.videoPath!, "-t", String(allocation), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`, "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", piece]);
      pieces.push(piece);
    }
    const visualList = path.join(dir, `${fileStem}-clips.txt`);
    await fs.writeFile(visualList, pieces.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
    visual = path.join(dir, `${fileStem}-visual.mp4`);
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", visualList, "-c", "copy", visual]);
  }
  else if (readyClips[0]?.videoPath) visual = readyClips[0].videoPath;
  const visualArgs = visual ? ["-stream_loop", "-1", "-i", visual] : ["-loop", "1", "-i", scene.imagePath!];
  await run("ffmpeg", ["-y", ...visualArgs, "-i", scene.audioPath, "-t", String(sceneDuration),
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    "-map", "0:v:0", "-map", "1:a:0", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
    "-filter:a", `volume=${project.settings.voiceVolume}`, "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p", "-shortest", output]);
  return output;
}

export async function renderScenePreview(project: Project, scene: Scene) {
  const dir = await ensureProjectDir(project.id);
  const number = String(scene.position + 1).padStart(2, "0");
  return renderScene(project, scene, path.join(dir, `scene-preview-${number}.mp4`), `scene-preview-${number}`);
}

export async function renderProject(project: Project) {
  const dir = await ensureProjectDir(project.id);
  const normalized: string[] = [];
  const [width, height] = project.settings.format === "9:16" ? [1080, 1920] : project.settings.format === "1:1" ? [1080, 1080] : [1920, 1080];
  for (const scene of project.scenes) {
    const number = String(scene.position + 1).padStart(2,"0");
    const output = path.join(dir, `scene-${number}.mp4`);
    await renderScene(project, scene, output, `scene-${number}`);
    normalized.push(output);
  }
  const concatFile = path.join(dir, "concat.txt");
  await fs.writeFile(concatFile, normalized.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  const plain = path.join(dir, "video-sem-legenda.mp4");
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", plain]);
  let mixInput = plain;
  if (project.musicPath) {
    const mixed = path.join(dir, "video-com-trilhas.mp4");
    const totalDuration = project.scenes.reduce((sum, scene) => sum + (scene.duration ?? scene.durationHint), 0);
    const fadeStart = Math.max(0, totalDuration - 2);
    await run("ffmpeg", ["-y", "-i", plain, "-stream_loop", "-1", "-i", project.musicPath, "-filter_complex", `[1:a]volume=${project.settings.musicVolume},afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart}:d=2[music];[music][0:a]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=350[ducked];[0:a][ducked]amix=inputs=2:duration=first:normalize=0[aout]`, "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(totalDuration), mixed]);
    mixInput = mixed;
  }
  const captions = project.captionsPath ?? await writeCaptions(project);
  const output = path.join(dir, "video-final.mp4");
  if (project.settings.burnCaptions) {
    const escaped = captions.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
    const fontSize = project.settings.format === "9:16" ? 30 : project.settings.format === "1:1" ? 27 : 30;
    const margin = project.settings.format === "9:16" ? 150 : project.settings.format === "1:1" ? 86 : 72;
    const sideMargin = project.settings.format === "9:16" ? 88 : project.settings.format === "1:1" ? 72 : 96;
    await run("ffmpeg", ["-y", "-i", mixInput, "-vf", `subtitles='${escaped}':original_size=${width}x${height}:force_style='FontName=DejaVu Sans,FontSize=${fontSize},Bold=1,Spacing=0.2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00172227,BackColour=&H70172227,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=${margin},MarginL=${sideMargin},MarginR=${sideMargin}'`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", output]);
  } else await fs.copyFile(mixInput, output);
  return { video: output, captions };
}

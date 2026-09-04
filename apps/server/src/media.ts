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

export async function durationOf(file: string, requiredStream?: "audio" | "video") {
  const output = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]);
  const metadata = JSON.parse(output) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !metadata.streams?.some((stream) => requiredStream ? stream.codec_type === requiredStream : stream.codec_type === "audio" || stream.codec_type === "video")) {
    throw new Error("A mídia não possui duração válida.");
  }
  return duration;
}

function srtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000);
  const secs = Math.floor(milliseconds % 60_000 / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

function assTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor(centiseconds % 360_000 / 6_000);
  const secs = Math.floor(centiseconds % 6_000 / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
}

export async function writeCaptions(project: Project) {
  const dir = await ensureProjectDir(project.id);
  const verticalEditorial = project.settings.format === "9:16";
  const destination = path.join(dir, verticalEditorial ? "captions.ass" : "captions.srt");
  let cursor = 0;
  let cueIndex = 1;
  const cuesWithTime: { index: number; start: number; end: number; text: string }[] = [];
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
    const sceneBlocks = cues.map((cue, index) => ({ index: cueIndex++, start: cursor + index * cueDuration, end: cursor + (index + 1) * cueDuration, text: cue }));
    cursor += duration;
    return sceneBlocks;
  });
  cuesWithTime.push(...blocks);
  if (verticalEditorial) {
    const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Vertical,DejaVu Sans,64,&H00FFFFFF,&H00FFFFFF,&H00172227,&H00172227,-1,0,0,0,100,100,0,0,1,4,0,8,96,96,210,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
    const events = cuesWithTime.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Vertical,,0,0,0,,${cue.text.replace(/[{}]/g, "")}`).join("\n");
    await fs.writeFile(destination, `${header}${events}\n`, "utf8");
  } else {
    await fs.writeFile(destination, cuesWithTime.map((cue) => `${cue.index}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join("\n"), "utf8");
  }
  return destination;
}

async function renderScene(project: Project, scene: Scene, output: string, fileStem: string) {
  const dir = await ensureProjectDir(project.id);
  const [width, height] = project.settings.format === "9:16" ? [1080, 1920] : project.settings.format === "1:1" ? [1080, 1080] : [1920, 1080];
  const verticalEditorial = project.settings.format === "9:16";
  const visualWidth = width;
  const visualHeight = verticalEditorial ? width : height;
  const normalizedVisualFilter = verticalEditorial
    ? `scale=${visualWidth}:${visualHeight}:force_original_aspect_ratio=increase,crop=${visualWidth}:${visualHeight},setsar=1`
    : `scale=${visualWidth}:${visualHeight}:force_original_aspect_ratio=decrease,pad=${visualWidth}:${visualHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  const canvasFilter = verticalEditorial
    ? `${normalizedVisualFilter},pad=${width}:${height}:0:${height - visualHeight}:color=0x172327,drawbox=x=0:y=${height - visualHeight - 8}:w=${width}:h=8:color=0xB94F2D:t=fill`
    : normalizedVisualFilter;
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
      await run("ffmpeg", ["-y", "-stream_loop", "-1", "-i", clip.videoPath!, "-t", String(allocation), "-vf", normalizedVisualFilter, "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", piece]);
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
    "-vf", canvasFilter,
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
  const captions = project.settings.format === "9:16" ? await writeCaptions(project) : project.captionsPath ?? await writeCaptions(project);
  const output = path.join(dir, "video-final.mp4");
  if (project.settings.burnCaptions) {
    const escaped = captions.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
    const subtitleFilter = project.settings.format === "9:16"
      ? `subtitles='${escaped}':original_size=${width}x${height}`
      : `subtitles='${escaped}':original_size=${width}x${height}:force_style='FontName=DejaVu Sans,FontSize=${project.settings.format === "1:1" ? 27 : 30},Bold=1,Spacing=0.2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00172227,BackColour=&H70172227,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=${project.settings.format === "1:1" ? 86 : 72},MarginL=${project.settings.format === "1:1" ? 72 : 96},MarginR=${project.settings.format === "1:1" ? 72 : 96}'`;
    await run("ffmpeg", ["-y", "-i", mixInput, "-vf", subtitleFilter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", output]);
  } else await fs.copyFile(mixInput, output);
  return { video: output, captions };
}

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, CircleAlert, Clapperboard, Download, FileAudio, FileText, Film, Image, Layers3, LoaderCircle, Mic2, Music2, Pencil, Play, Plus, RefreshCw, Save, Settings2, Sparkles, Subtitles, Trash2, WandSparkles, X } from "lucide-react";
import { api } from "./api";
import type { Project, ProviderStatus, Scene, Stage } from "./types";

const stages: { id: Stage; label: string; short: string; icon: typeof FileText }[] = [
  { id: "content", label: "Conteúdo", short: "Entrada", icon: FileText },
  { id: "plan", label: "Roteiro", short: "Plano", icon: WandSparkles },
  { id: "voice", label: "Voz", short: "Áudio", icon: Mic2 },
  { id: "image", label: "Imagem", short: "Quadros", icon: Image },
  { id: "storyboard", label: "Storyboard", short: "Planos", icon: Layers3 },
  { id: "motion", label: "Movimento", short: "Clipes", icon: Clapperboard },
  { id: "captions", label: "Legendas", short: "Texto", icon: Subtitles },
  { id: "render", label: "Render", short: "Montagem", icon: Film },
  { id: "done", label: "Pronto", short: "Saída", icon: Check }
];

function elapsedSince(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

function friendlyError(message: string) {
  if (!/daily api usage limit reached/i.test(message)) return message;
  const reset = message.match(/after \*\*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC\*\*/i);
  if (!reset) return "A cota diária de vídeo da Agnes acabou. Aguarde a renovação diária do provedor.";
  const availableAt = new Date(`${reset[1]}T${reset[2]}:00Z`);
  const remainingMinutes = Math.max(0, Math.ceil((availableAt.getTime() - Date.now()) / 60_000));
  const remaining = remainingMinutes ? `${Math.floor(remainingMinutes / 60)} h ${remainingMinutes % 60} min` : "menos de 1 min";
  const localTime = availableAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return `A cota diária de vídeo da Agnes acabou. Liberação prevista para ${localTime} (Brasília); faltam aproximadamente ${remaining}.`;
}

type RebuildStage = "plan" | "voice" | "image" | "storyboard" | "motion" | "captions" | "render";
type PipelineAction = "plan" | "voice" | "images" | "storyboard" | "animate" | "captions" | "render";
const rebuildLayers: { id: RebuildStage; label: string; impact: string }[] = [
  { id: "plan", label: "Roteiro em diante", impact: "roteiro, voz, imagens, storyboard, clipes, legendas e render" },
  { id: "voice", label: "Voz em diante", impact: "voz, imagens, storyboard, clipes, legendas e render" },
  { id: "image", label: "Imagem em diante", impact: "imagens, storyboard, clipes, legendas e render" },
  { id: "storyboard", label: "Storyboard em diante", impact: "planos visuais, clipes, legendas e render" },
  { id: "motion", label: "Movimento em diante", impact: "animações, legendas e render; preserva os quadros aprovados" },
  { id: "captions", label: "Legendas em diante", impact: "legendas e render" },
  { id: "render", label: "Somente render", impact: "vídeo final" }
];

export function rebuildActions(stage: RebuildStage, animate: boolean): PipelineAction[] {
  const sequence: PipelineAction[] = ["plan", "voice", "images", ...(animate ? ["storyboard" as const, "animate" as const] : []), "captions", "render"];
  const first: Record<RebuildStage, PipelineAction> = { plan: "plan", voice: "voice", image: "images", storyboard: animate ? "storyboard" : "captions", motion: animate ? "animate" : "captions", captions: "captions", render: "render" };
  return sequence.slice(sequence.indexOf(first[stage]));
}

export const actionFor = (project: Project) => {
  if (!project.scenes.length) return { id: "plan" as const, label: "Aprovar conteúdo e criar roteiro" };
  if (project.scenes.some((scene) => !scene.audioUrl)) return { id: "voice" as const, label: "Aprovar roteiro e gerar vozes" };
  if (project.scenes.some((scene) => !scene.imageUrl)) return { id: "images" as const, label: "Aprovar vozes e gerar quadros" };
  if (project.settings.animate && project.scenes.some((scene) => !scene.clips.length || scene.clips.some((clip) => !clip.imageUrl))) return { id: "storyboard" as const, label: "Criar storyboard por trecho" };
  if (project.settings.animate && project.scenes.some((scene) => scene.clips.some((clip) => !clip.videoUrl))) return { id: "animate" as const, label: "Aprovar storyboard e animar" };
  if (!project.captionsUrl) return { id: "captions" as const, label: "Aprovar cenas e preparar legendas" };
  if (!project.finalVideoUrl) return { id: "render" as const, label: "Aprovar legendas e renderizar" };
  return undefined;
};

function StatusMark({ ready, working }: { ready: boolean; working?: boolean }) {
  return <span className={`status-mark ${ready ? "is-ready" : working ? "is-working" : ""}`}>{working ? <LoaderCircle size={12} /> : ready ? <Check size={11} /> : null}</span>;
}

function PromptCommand({ project, scene, busy, onApply }: { project: Project; scene?: Scene; busy: boolean; onApply: (prompt: string, scope: "project" | "scene") => Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<"project" | "scene">("scene");
  const [startedAt, setStartedAt] = useState<number>();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { if (!startedAt) return; setElapsed(0); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250); return () => window.clearInterval(timer); }, [startedAt]);
  return <section className="prompt-workbench"><form className="prompt-command" onSubmit={async (event) => { event.preventDefault(); if (!prompt.trim()) return; if (scope === "project" && !confirm("Editar o projeto inteiro recriará o plano e invalidará todas as vozes, imagens, clipes, legendas e o vídeo final. Continuar?")) return; setStartedAt(Date.now()); try { await onApply(prompt, scope); setPrompt(""); } finally { setStartedAt(undefined); } }}>
    <WandSparkles size={17} /><label><span>Editar com prompt</span><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={scope === "scene" ? `Ex.: deixe ${scene?.title ?? "esta cena"} mais objetiva` : "Ex.: reduza o roteiro para quatro cenas"} /><small>{scope === "scene" ? "Recria os artefatos dependentes desta cena." : "Recria o plano e todos os artefatos do projeto."}</small></label>
    <select aria-label="Escopo da edição" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="scene">Cena selecionada</option><option value="project">Projeto inteiro</option></select>
    <button className="button primary" disabled={busy || !prompt.trim() || (scope === "scene" && !scene)}>{startedAt ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} {startedAt ? `${elapsed}s` : "Aplicar"}</button>
  </form>
  <div className={`prompt-receipt ${startedAt ? "working" : project.lastPromptEdit ? "complete" : "idle"}`} role="status" aria-live="polite">
    {startedAt ? <><LoaderCircle className="spin" size={16} /><div><strong>Codex está editando {scope === "scene" ? scene?.title : "o projeto inteiro"}</strong><span>Pedido enviado · {elapsed} segundos · aguarde a confirmação</span></div></> : project.lastPromptEdit ? <><Check size={16} /><div><strong>Edição concluída em {project.lastPromptEdit.elapsedSeconds.toFixed(1)} s</strong><span>{project.lastPromptEdit.scope === "scene" ? `Cena: ${project.lastPromptEdit.sceneTitle}` : "Projeto inteiro"} · Alterado: {project.lastPromptEdit.changedFields.join(", ")}</span><small>Agora regenere: {project.lastPromptEdit.invalidated.join(", ")}.</small></div></> : <><span className="receipt-dot" /><div><strong>Nenhuma edição por prompt nesta sessão</strong><span>O resultado e os próximos passos aparecerão aqui.</span></div></>}
  </div></section>;
}

function AudioTracks({ project, busy, onSettings, onMusic, onRemoveMusic }: { project: Project; busy: boolean; onSettings: (settings: Partial<Project["settings"]>) => Promise<void>; onMusic: (file: File) => Promise<void>; onRemoveMusic: () => Promise<void> }) {
  const total = project.scenes.reduce((sum, item) => sum + (item.duration ?? item.durationHint), 0);
  return <section className="track-board" aria-label="Trilhas de áudio">
    <div className="track-heading"><strong>Linha de áudio</strong><span>{total.toFixed(1)} s do primeiro quadro ao corte final</span></div>
    <div className="track-row"><span className="track-name"><Mic2 size={15} /> Voz</span><div className="track-lane">{project.scenes.map((item) => <span key={item.id} className={`voice-block ${item.audioUrl ? "ready" : ""}`} style={{ width: `${total ? (item.duration ?? item.durationHint) / total * 100 : 0}%` }} title={`${item.title}: ${(item.duration ?? item.durationHint).toFixed(1)} s`}>{item.position + 1}</span>)}</div><label className="volume">{Math.round(project.settings.voiceVolume * 100)}%<input aria-label="Volume da voz" type="range" min="0" max="2" step="0.05" value={project.settings.voiceVolume} disabled={busy} onChange={(event) => onSettings({ voiceVolume: Number(event.target.value) })} /></label></div>
    <div className="track-row"><span className="track-name"><Music2 size={15} /> Música</span><div className="track-lane">{project.musicUrl ? <span className="music-block">{project.musicDuration?.toFixed(1)} s · repete e encerra com o vídeo</span> : <span className="track-empty">Sem música — a voz permanece isolada</span>}</div><label className="volume">{Math.round(project.settings.musicVolume * 100)}%<input aria-label="Volume da música" type="range" min="0" max="0.8" step="0.02" value={project.settings.musicVolume} disabled={busy || !project.musicUrl} onChange={(event) => onSettings({ musicVolume: Number(event.target.value) })} /></label><label className="music-upload"><FileAudio size={15} /><span>{project.musicUrl ? "Trocar" : "Adicionar"}</span><input type="file" accept="audio/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onMusic(file); event.currentTarget.value = ""; }} /></label>{project.musicUrl && <button className="track-remove" title="Remover música" onClick={onRemoveMusic}><X size={14} /></button>}</div>
  </section>;
}

function ProviderPanel({ providers, project, busy, onClose, onSettings }: { providers?: ProviderStatus; project: Project; busy: boolean; onClose: () => void; onSettings: (settings: Partial<Project["settings"]>) => Promise<void> }) {
  if (!providers) return null;
  const rows = [{ name: "Codex OAuth", ready: providers.codex.ready, model: providers.codex.auth, detail: providers.codex.resources.join(" · ") }, { name: "ElevenLabs", ready: providers.elevenLabs.ready, model: providers.elevenLabs.model, detail: `${providers.elevenLabs.outputFormat} · ${providers.elevenLabs.resources.join(" · ")}` }, { name: "Agnes Imagem", ready: providers.agnes.ready, model: providers.agnes.imageModel, detail: "texto→imagem e edição" }, { name: "Agnes Vídeo", ready: providers.agnes.ready, model: providers.agnes.video.label, detail: `${providers.agnes.video.minSeconds}–${providers.agnes.video.maxSeconds}s · ${providers.agnes.video.resolution} · ${providers.agnes.video.aspectRatios.join(" / ")}` }, { name: "FFmpeg local", ready: providers.ffmpeg.ready, model: "H.264 / AAC", detail: providers.ffmpeg.resources.join(" · ") }];
  return <aside className="provider-panel" role="dialog" aria-modal="true" aria-labelledby="provider-panel-title"><div className="panel-title"><div><strong id="provider-panel-title">Provedores e estratégia</strong><span>Diagnóstico, capacidades e planejamento; credenciais ficam no servidor</span></div><button autoFocus onClick={onClose} aria-label="Fechar painel"><X size={18} /></button></div>
    <div className="provider-detail-list">{rows.map((row) => <section key={row.name}><div><span className={row.ready ? "lamp on" : "lamp"} /><strong>{row.name}</strong><small>{row.ready ? "pronto" : "configurar"}</small></div><code>{row.model}</code><p>{row.detail}</p></section>)}</div>
    <div className="strategy-settings"><strong>Estratégia dos clipes</strong><p>A duração real da voz é dividida pelo perfil do modelo. O Agnes pode criar até {providers.agnes.strategy.maxClipsPerScene} clipes por cena.</p><label>Planejamento<select value={project.settings.clipStrategy} disabled={busy} onChange={(event) => onSettings({ clipStrategy: event.target.value as "provider" | "single" })}><option value="provider">Automático pelo provedor</option><option value="single">Um clipe por narração</option></select></label><dl><div><dt>Contrato</dt><dd>{providers.agnes.video.contract === "seconds" ? "segundos (2.5)" : "quadros 8n+1 (v2.0)"}</dd></div><div><dt>Token ativo</dt><dd>Agnes #{providers.agnes.tokenSlot} · {providers.agnes.tokenSource}</dd></div><div><dt>Referências</dt><dd>até {providers.agnes.video.maxReferences} imagens</dd></div><div><dt>Duração padrão</dt><dd>{providers.agnes.strategy.defaultSeconds} s</dd></div><div><dt>Status</dt><dd>{providers.agnes.video.pollingEndpoint}</dd></div><div><dt>Consulta</dt><dd>a cada {providers.agnes.video.pollIntervalSeconds} s</dd></div><div><dt>Referência real</dt><dd>{providers.agnes.video.observedCompletionSeconds ? `${providers.agnes.video.observedCompletionSeconds} s medidos` : "sem medição"}</dd></div><div><dt>Limite local</dt><dd>{providers.agnes.video.maxWaitSeconds / 60} min por clipe</dd></div><div><dt>Fonte</dt><dd>{providers.agnes.video.specificationSource}</dd></div></dl></div>
  </aside>;
}

function NewProject({ onCreate, onCancel, canCancel, externalError }: { onCreate: (value: { title: string; content: string; format: "16:9" | "9:16" | "1:1"; style: string; animate: boolean }) => Promise<void>; onCancel: () => void; canCancel: boolean; externalError?: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [style, setStyle] = useState("editorial cinematográfico");
  const [animate, setAnimate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  return <div className="new-project-shell">
    <form className="new-project" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setFormError(undefined); try { await onCreate({ title, content, format, style, animate }); } catch (error) { setFormError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }}>
      <h1>Transforme conteúdo em vídeo, etapa por etapa.</h1>
      <p>Cole o material bruto. Você aprova roteiro, voz, imagens, movimento e legendas antes do corte final.</p>
      <label>Título do projeto<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Como funciona a energia solar" required /></label>
      <label>Conteúdo<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole aqui seu artigo, briefing, aula ou roteiro bruto..." minLength={20} required /></label>
      <div className="form-row">
        <label>Formato<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="16:9">Horizontal 16:9 · YouTube</option><option value="9:16">Vertical 9:16 · Reels/TikTok</option><option value="1:1">Quadrado 1:1</option></select></label>
        <label>Estilo visual<input value={style} onChange={(event) => setStyle(event.target.value)} /></label>
      </div>
      <label className="check-line"><input type="checkbox" checked={animate} onChange={(event) => setAnimate(event.target.checked)} /><span><strong>Animar os quadros com Agnes Video</strong><small>Opcional — imagens estáticas já produzem um MP4 completo.</small></span></label>
      {(formError || externalError) && <div className="form-error" role="alert"><CircleAlert size={16} />{formError || externalError}</div>}
      <div className="form-actions">{canCancel && <button className="button ghost" type="button" onClick={onCancel}>Cancelar</button>}<button className="button primary" disabled={busy || content.length < 20 || !title}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Abrir bancada</button></div>
    </form>
  </div>;
}

function Inspector({ project, scene, onSave, onRegenerate, onVoice, onStoryboard, onAnimate, onClipImage, onClipAnimate, onPreview, busy }: { project: Project; scene?: Scene; onSave: (value: { title: string; narration: string; visualPrompt: string; durationHint: number }) => void; onRegenerate: () => void; onVoice: () => void; onStoryboard: () => void; onAnimate: () => void; onClipImage: (clipId: string) => void; onClipAnimate: (clipId: string) => void; onPreview: () => Promise<string>; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", narration: "", visualPrompt: "", durationHint: 6 });
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const clipSignature = scene?.clips.map((clip) => `${clip.imageUrl ?? ""}:${clip.videoUrl ?? ""}`).join("|");
  useEffect(() => { if (scene) setDraft({ title: scene.title, narration: scene.narration, visualPrompt: scene.visualPrompt, durationHint: scene.durationHint }); setEditing(false); setSelectedClipId(undefined); setPreviewUrl(undefined); }, [scene?.id, scene?.audioUrl, clipSignature]);
  const selectedClip = scene?.clips.find((clip) => clip.id === selectedClipId);
  const monitorVideo = selectedClip?.videoUrl ?? previewUrl ?? scene?.videoUrl;
  const monitorImage = selectedClip?.imageUrl ?? scene?.imageUrl;
  const readyClips = scene?.clips.filter((clip) => clip.videoUrl) ?? [];
  const framedClips = scene?.clips.filter((clip) => clip.imageUrl) ?? [];
  const allClipsReady = Boolean(scene?.clips.length && readyClips.length === scene.clips.length);
  const canPreview = Boolean(scene?.audioUrl && (scene?.clips.length ? allClipsReady : scene?.videoUrl || scene?.imageUrl));
  return <aside className="inspector">
    <div className="inspector-heading"><span>{selectedClip ? `Clipe ${selectedClip.position + 1}` : previewUrl ? "Cena completa" : "Monitor"}</span><span className="frame-code">F{String((scene?.position ?? 0) + 1).padStart(2, "0")}</span></div>
    {(framedClips.length > 0 || canPreview) && <div className="monitor-tabs" aria-label="Conteúdo exibido no monitor">
      <button className={!selectedClipId && previewUrl ? "active" : ""} disabled={!canPreview || busy || previewBusy} onClick={async () => { setPreviewBusy(true); try { setPreviewUrl(await onPreview()); setSelectedClipId(undefined); } catch { /* O painel principal apresenta o erro retornado pela API. */ } finally { setPreviewBusy(false); } }}>{previewBusy ? <LoaderCircle className="spin" size={13} /> : <Clapperboard size={13} />} Cena completa</button>
      {framedClips.map((clip) => <button key={clip.id} className={selectedClipId === clip.id ? "active" : ""} aria-pressed={selectedClipId === clip.id} onClick={() => { setSelectedClipId(clip.id); setPreviewUrl(undefined); }}>{clip.videoUrl ? <Play size={12} /> : <Image size={12} />} Plano {clip.position + 1}</button>)}
    </div>}
    <div className={`monitor ${project.settings.format.replace(":", "-")}`}>
      {monitorVideo ? <video key={monitorVideo} src={monitorVideo} controls /> : monitorImage ? <img src={monitorImage} alt={selectedClip ? `Plano ${selectedClip.position + 1}: ${selectedClip.visualIntent}` : scene?.title} /> : <div className="monitor-empty"><Image size={28} strokeWidth={1.3} /><span>Quadro ainda não exposto</span></div>}
    </div>
    <div className="scene-meta">
      <span className="scene-number">CENA {String((scene?.position ?? 0) + 1).padStart(2, "0")}</span>
      {editing ? <div className="scene-editor"><label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Narração<textarea value={draft.narration} onChange={(event) => setDraft({ ...draft, narration: event.target.value })} /></label><label>Duração prevista<input type="number" min="2" max="30" value={draft.durationHint} onChange={(event) => setDraft({ ...draft, durationHint: Number(event.target.value) })} /></label></div> : <><h2>{scene?.title ?? "Selecione uma cena"}</h2><p>{scene?.narration ?? "O detalhe da cena aparece aqui para conferência."}</p></>}
      {scene?.audioUrl && <audio className="audio" src={scene.audioUrl} controls />}
    </div>
    {scene?.visualPrompt && <div className="prompt-note"><span>Direção do quadro</span>{editing ? <textarea aria-label="Direção visual da cena" value={draft.visualPrompt} onChange={(event) => setDraft({ ...draft, visualPrompt: event.target.value })} /> : <p>{scene.visualPrompt}</p>}</div>}
    {scene?.clips.length ? <div className="clip-manifest"><strong>Storyboard desta narração</strong>{scene.clips.map((clip) => <div key={clip.id} className={selectedClipId === clip.id ? "selected" : ""}>{clip.imageUrl ? <button className="clip-thumb" title={`Ver plano ${clip.position + 1}`} onClick={() => { setSelectedClipId(clip.id); setPreviewUrl(undefined); }}><img src={clip.imageUrl} alt="" /></button> : <span>{String(clip.position + 1).padStart(2,"0")}</span>}<p><b>Trecho falado · {clip.actualDuration?.toFixed(1) ?? clip.targetDuration.toFixed(1)} s</b><em>“{clip.narrationText}”</em><strong>Intenção visual</strong><small>{clip.visualIntent}</small><small>{clip.model} · {clip.videoUrl ? "animado" : clip.imageUrl ? "quadro para aprovar" : clip.status}</small></p><button title={`Refazer quadro ${clip.position + 1}`} aria-label={`Refazer quadro ${clip.position + 1}`} disabled={busy} onClick={() => onClipImage(clip.id)}><Image size={13} /></button><button title={`Animar plano ${clip.position + 1}`} aria-label={`Animar plano ${clip.position + 1}`} disabled={busy || !clip.imageUrl} onClick={() => onClipAnimate(clip.id)}><Clapperboard size={13} /></button></div>)}</div> : null}
    <div className="inspector-actions">
      {editing ? <button className="button primary full" disabled={busy} onClick={() => { onSave(draft); setEditing(false); }}><Save size={15} /> Salvar e invalidar dependências</button> : <button className="button outline full" disabled={!scene || busy} onClick={() => setEditing(true)}><Pencil size={15} /> Editar roteiro da cena</button>}
      <button className="button outline full" disabled={!scene || busy} onClick={onVoice}><RefreshCw size={15} /> Refazer voz</button>
      <button className="button outline full" disabled={!scene || busy} onClick={onRegenerate}><RefreshCw size={15} /> Refazer imagem</button>
      {project.settings.animate && <button className="button outline full" disabled={!scene?.audioUrl || busy} onClick={onStoryboard}><Layers3 size={15} /> Refazer storyboard da cena</button>}
      {project.settings.animate && <button className="button outline full" disabled={!scene?.clips.length || scene.clips.some((clip) => !clip.imageUrl) || busy} onClick={onAnimate}><Clapperboard size={15} /> Animar quadros aprovados</button>}
    </div>
  </aside>;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [selectedScene, setSelectedScene] = useState(0);
  const [providers, setProviders] = useState<ProviderStatus>();
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rebuildStage, setRebuildStage] = useState<RebuildStage>("motion");
  const [rebuildProgress, setRebuildProgress] = useState<string>();
  const [rebuilding, setRebuilding] = useState(false);
  useEffect(() => { if (!settingsOpen) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSettingsOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [settingsOpen]);

  const current = useMemo(() => projects.find((project) => project.id === currentId) ?? projects[0], [projects, currentId]);
  const scene = current?.scenes[selectedScene] ?? current?.scenes[0];
  const next = current ? actionFor(current) : undefined;
  const stageIndex = current ? stages.findIndex((stage) => stage.id === current.stage) : 0;
  const workingScene = current?.scenes.find((item) => item.status === "working" || item.clips.some((clip) => clip.status === "working"));
  const workingClip = workingScene?.clips.find((clip) => clip.status === "working");
  const totalClips = current?.scenes.reduce((sum, item) => sum + item.clips.length, 0) ?? 0;
  const completedClips = current?.scenes.reduce((sum, item) => sum + item.clips.filter((clip) => Boolean(clip.videoUrl)).length, 0) ?? 0;
  const progressElapsed = current ? elapsedSince(current.updatedAt) : "0 s";
  const effectiveBusy = busy || current?.status === "working";
  const missingProviders = providers ? [!providers.codex.ready && "Codex", !providers.elevenLabs.ready && "ElevenLabs", !providers.agnes.ready && "Agnes"].filter(Boolean) as string[] : [];

  useEffect(() => { Promise.all([api.projects(), api.health()]).then(([items, health]) => { setProjects(items); setCurrentId(items[0]?.id); setProviders(health.providers); }).catch((err) => setError(err.message)); }, []);
  const replace = (project: Project) => setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
  useEffect(() => {
    if (!current || current.status !== "working") return;
    const poll = window.setInterval(() => api.project(current.id).then((project) => setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)])).catch(() => undefined), 3000);
    return () => window.clearInterval(poll);
  }, [current?.id, current?.status]);
  const execute = async (action: "plan" | "voice" | "images" | "storyboard" | "animate" | "captions" | "render") => {
    if (!current) return;
    setBusy(true); setError(undefined);
    try { replace(await api.action(current.id, action)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); const fresh = await api.projects(); setProjects(fresh); }
    finally { setBusy(false); }
  };
  const rebuildFrom = async () => {
    if (!current) return;
    const layer = rebuildLayers.find((item) => item.id === rebuildStage)!;
    if (!confirm(`Refazer ${layer.impact} para o projeto inteiro? Os resultados atuais dessas camadas serão substituídos e os provedores configurados poderão ser cobrados.`)) return;
    const actionLabels: Record<PipelineAction, string> = { plan: "Recriando roteiro", voice: "Recriando vozes", images: "Recriando imagens", storyboard: "Criando planos por trecho", animate: "Animando quadros aprovados", captions: "Recriando legendas", render: "Montando vídeo final" };
    setBusy(true); setRebuilding(true); setError(undefined); setRebuildProgress("Preparando as camadas");
    try {
      replace(await api.invalidateFrom(current.id, rebuildStage));
      for (const action of rebuildActions(rebuildStage, current.settings.animate)) {
        setRebuildProgress(actionLabels[action]);
        replace(await api.action(current.id, action));
      }
      setRebuildProgress("Sequência concluída");
    } catch (err) {
      setRebuildProgress("Sequência interrompida");
      setError(err instanceof Error ? err.message : String(err));
      try { setProjects(await api.projects()); } catch { /* Mantém o último estado recebido. */ }
    } finally { setBusy(false); setRebuilding(false); }
  };

  if (!current || newOpen) return <NewProject externalError={error} canCancel={Boolean(current)} onCancel={() => setNewOpen(false)} onCreate={async ({ title, content, format, style, animate }) => {
    const project = await api.create({ title, content, settings: { format, visualStyle: style, animate } });
    setProjects((items) => [project, ...items]); setCurrentId(project.id); setNewOpen(false);
  }} />;

  return <div className="app-shell">
    <aside className="project-rail">
      <div className="brand"><span className="brand-mark"><Film size={19} /></span><div><strong>VideoSub</strong><span>bancada local</span></div></div>
      <button className="new-button" onClick={() => setNewOpen(true)}><Plus size={16} /> Nova produção</button>
      <select className="mobile-project-select" aria-label="Projeto atual" value={current.id} onChange={(event) => { setCurrentId(event.target.value); setSelectedScene(0); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
      <div className="rail-label">Projetos</div>
      <nav className="project-list">{projects.map((project) => <button key={project.id} className={project.id === current.id ? "active" : ""} onClick={() => { setCurrentId(project.id); setSelectedScene(0); }}><span className="project-index">{String(projects.indexOf(project) + 1).padStart(2, "0")}</span><span><strong>{project.title}</strong><small>{project.scenes.length || "—"} cenas · {project.settings.format}</small></span></button>)}</nav>
      <div className="provider-board">
        <div className="rail-label">Oficina</div>
        {[{ name: "Codex", ok: providers?.codex.ready, mode: providers?.codex.mode }, { name: "Agnes", ok: providers?.agnes.ready, mode: providers?.agnes.mode }, { name: "ElevenLabs", ok: providers?.elevenLabs.ready, mode: providers?.elevenLabs.mode }, { name: "FFmpeg", ok: providers?.ffmpeg.ready, mode: "local" }].map((item) => <div className="provider" key={item.name}><span className={item.ok ? "lamp on" : "lamp"} />{item.name}<small>{item.ok ? item.mode === "mock" ? "simulado" : "pronto" : "configurar"}</small></div>)}
        <div className="mode-stamp">MODO {providers?.mode === "mock" ? "SIMULADO" : providers?.mode === "mixed" ? "MISTO" : "REAL"}</div>
      </div>
    </aside>

    <main className="workspace">
      <header className="workspace-header">
        <div><span className="eyebrow">ORDEM #{current.id.slice(0, 6).toUpperCase()}</span><h1>{current.title}</h1></div>
        <div className="header-tools"><span>{current.settings.format}</span><span>{current.settings.language}</span><button title="Provedores e configurações" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></button></div>
      </header>

      <div className="stage-strip">{stages.map((stage, index) => { const Icon = stage.icon; const done = index < stageIndex || current.stage === "done"; const active = index === stageIndex; return <div key={stage.id} className={`stage ${active ? "active" : ""} ${done ? "done" : ""}`}><span className="stage-no">{String(index + 1).padStart(2,"0")}</span><Icon size={15} /><span><strong>{stage.label}</strong><small>{stage.short}</small></span><StatusMark ready={done} working={active && effectiveBusy} /></div>; })}</div>

      {current.scenes.length > 0 && <PromptCommand project={current} scene={scene} busy={effectiveBusy} onApply={async (prompt, scope) => { setBusy(true); setError(undefined); try { replace(await api.editPrompt(current.id, { prompt, scope, sceneId: scope === "scene" ? scene?.id : undefined })); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }} />}

      {missingProviders.length > 0 && <div className="setup-banner" role="status"><CircleAlert size={18} /><span>Validação real bloqueada: configure {missingProviders.join(" e ")} em <code>apps/server/.env</code>.</span></div>}

      {error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{friendlyError(error)}</span><button onClick={() => setError(undefined)}>fechar</button></div>}

      {!error && current.status === "error" && current.error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span><strong>Etapa interrompida.</strong> {friendlyError(current.error)} Use a ação azul abaixo para retomar do ponto salvo.</span></div>}

      {current.status === "working" && <div className="server-progress" role="status" aria-live="polite"><LoaderCircle className="spin" size={18} /><div><strong>{workingClip ? `Cena ${workingScene!.position + 1}/${current.scenes.length} · Clipe ${workingClip.position + 1}/${workingScene!.clips.length}` : `${stages[stageIndex]?.label ?? "Etapa"} em execução`}</strong><span>{workingClip?.providerJobId ? `Vídeo aceito pela Agnes há ${progressElapsed}. Referência medida: 62 s; limite: 10 min; status consultado a cada 15 s. Tarefa ${workingClip.providerJobId}.` : workingClip?.imageUrl ? `Solicitando vaga na fila há ${progressElapsed}. A tarefa ainda não foi aceita; esta fase encerra com sucesso ou erro em até cerca de 3 min 20 s.` : `Gerando o quadro específico deste clipe há ${progressElapsed}.`} A página atualiza sozinha e pode ser recarregada.</span></div></div>}

      <section className="production-sheet">
        <div className="sheet-toolbar"><div><span className="registration">FOLHA DE EXPOSIÇÃO</span><strong>{current.scenes.length ? `${current.scenes.length} cenas em revisão` : "Conteúdo recebido"}</strong></div><div className="sheet-summary">{current.summary || current.content.slice(0, 150)}</div></div>
        {current.scenes.length === 0 ? <div className="content-proof"><span>Material bruto</span><p>{current.content}</p></div> : <div className="grid-scroll"><div className="exposure-grid" style={{ "--scene-count": current.scenes.length } as React.CSSProperties}>
          <div className="row-label top">CENA</div>{current.scenes.map((item) => <button key={item.id} aria-pressed={scene?.id === item.id} aria-label={`Selecionar ${item.title}`} className={`scene-head ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><span>{String(item.position + 1).padStart(2,"0")}</span><strong>{item.title}</strong></button>)}
          <div className="row-label">ROTEIRO</div>{current.scenes.map((item) => <button key={`${item.id}-script`} aria-pressed={scene?.id === item.id} aria-label={`Revisar roteiro de ${item.title}`} className={`exposure-cell script ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><p>{item.narration}</p><StatusMark ready /></button>)}
          <div className="row-label">VOZ</div>{current.scenes.map((item) => <button key={`${item.id}-voice`} aria-pressed={scene?.id === item.id} aria-label={`Revisar voz de ${item.title}`} className={`exposure-cell ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><Mic2 size={17} /><span>{item.audioUrl ? `${(item.duration ?? item.durationHint).toFixed(1)}s` : "aguarda"}</span><StatusMark ready={Boolean(item.audioUrl)} /></button>)}
          <div className="row-label">QUADRO</div>{current.scenes.map((item) => <button key={`${item.id}-image`} aria-pressed={scene?.id === item.id} aria-label={`Revisar imagem de ${item.title}`} className={`exposure-cell image-cell ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}>{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Image size={19} />}<StatusMark ready={Boolean(item.imageUrl)} /></button>)}
          <div className="row-label">CLIP</div>{current.scenes.map((item) => { const ready = item.clips.filter((clip) => Boolean(clip.videoUrl)).length; const working = item.clips.some((clip) => clip.status === "working"); const allReady = Boolean(item.clips.length && ready === item.clips.length); return <button key={`${item.id}-motion`} aria-pressed={scene?.id === item.id} aria-label={`Revisar movimento de ${item.title}`} className={`exposure-cell ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><Clapperboard size={17} /><span>{item.clips.length ? `${ready}/${item.clips.length} clipes` : item.videoUrl ? "1 clipe pronto" : current.settings.animate ? "aguarda" : "estático"}</span><StatusMark ready={allReady || !current.settings.animate} working={working} /></button>; })}
        </div></div>}
      </section>

      <AudioTracks project={current} busy={effectiveBusy} onSettings={async (settings) => { replace(await api.update(current.id, { settings })); }} onMusic={async (file) => { setBusy(true); try { replace(await api.uploadMusic(current.id, file)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }} onRemoveMusic={async () => replace(await api.removeMusic(current.id))} />

      <section className="rebuild-bar" aria-live="polite">
        <div><Layers3 size={17} /><span><strong>Refazer camada em diante</strong><small>{rebuilding && rebuildProgress ? rebuildProgress : rebuildLayers.find((item) => item.id === rebuildStage)?.impact}</small></span></div>
        <select aria-label="Camada inicial da reconstrução" value={rebuildStage} disabled={effectiveBusy} onChange={(event) => { setRebuildStage(event.target.value as RebuildStage); setRebuildProgress(undefined); }}>{rebuildLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}</select>
        <button className="button outline" disabled={effectiveBusy || (rebuildStage !== "plan" && !current.scenes.length)} onClick={rebuildFrom}>{rebuilding ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} {rebuilding && rebuildProgress ? rebuildProgress : "Refazer projeto"}</button>
      </section>

      <footer className="command-bar" aria-live="polite">
        <div className="command-status">{workingClip && workingScene ? <><span>AGNES VIDEO EM EXECUÇÃO</span><strong>Cena {workingScene.position + 1}/{current.scenes.length} · Clipe {workingClip.position + 1}/{workingScene.clips.length}</strong><small>{completedClips} de {totalClips} clipes prontos · {progressElapsed}</small><small className="task-reference">Tarefa {workingClip.providerJobId ?? "aguardando aceite"} · atualização automática</small></> : <><span>ETAPA ATUAL</span><strong>{stages[stageIndex]?.label}</strong><small>{current.status === "error" ? "Requer atenção" : effectiveBusy ? "Processando no servidor…" : "Pronto para validar"}</small></>}</div>
        {current.finalVideoUrl ? <a className="button primary" href={current.finalVideoUrl} download><Download size={17} /> Baixar MP4</a> : next && <button className="button primary next" disabled={effectiveBusy} onClick={() => execute(next.id)}>{effectiveBusy ? <LoaderCircle className="spin" size={17} /> : <ChevronRight size={17} />} {effectiveBusy ? "Executando no servidor…" : next.label}</button>}
      </footer>
    </main>

    <Inspector project={current} scene={scene} busy={effectiveBusy}
      onSave={async (value) => { if (!scene) return; setBusy(true); try { replace(await api.updateScene(scene.id, value)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onVoice={async () => { if (!scene) return; setBusy(true); try { replace(await api.regenerateVoice(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onRegenerate={async () => { if (!scene) return; setBusy(true); setError(undefined); try { replace(await api.regenerateImage(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onStoryboard={async () => { if (!scene) return; setBusy(true); setError(undefined); try { replace(await api.regenerateStoryboard(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onAnimate={async () => { if (!scene) return; setBusy(true); try { replace(await api.regenerateMotion(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onClipImage={async (clipId) => { setBusy(true); try { replace(await api.regenerateClipImage(clipId)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onClipAnimate={async (clipId) => { setBusy(true); try { replace(await api.regenerateClip(clipId)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onPreview={async () => { if (!scene) throw new Error("Selecione uma cena."); setBusy(true); setError(undefined); try { return (await api.previewScene(scene.id)).previewUrl; } catch (err) { setError(err instanceof Error ? err.message : String(err)); throw err; } finally { setBusy(false); } }} />
    <button className="delete-project" title="Excluir projeto" onClick={async () => { if (confirm(`Excluir “${current.title}”?`)) { await api.remove(current.id); const left = projects.filter((item) => item.id !== current.id); setProjects(left); setCurrentId(left[0]?.id); } }}><Trash2 size={15} /></button>
    {settingsOpen && <><button className="panel-scrim" aria-label="Fechar painel de provedores" onClick={() => setSettingsOpen(false)} /><ProviderPanel providers={providers} project={current} busy={effectiveBusy} onClose={() => setSettingsOpen(false)} onSettings={async (settings) => replace(await api.update(current.id, { settings }))} /></>}
  </div>;
}

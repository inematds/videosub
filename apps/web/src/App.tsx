import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, CircleAlert, Clapperboard, Download, FileText, Film, Image, LoaderCircle, Mic2, Pencil, Plus, RefreshCw, Save, Sparkles, Subtitles, Trash2, WandSparkles } from "lucide-react";
import { api } from "./api";
import type { Project, ProviderStatus, Scene, Stage } from "./types";

const stages: { id: Stage; label: string; short: string; icon: typeof FileText }[] = [
  { id: "content", label: "Conteúdo", short: "Entrada", icon: FileText },
  { id: "plan", label: "Roteiro", short: "Plano", icon: WandSparkles },
  { id: "voice", label: "Voz", short: "Áudio", icon: Mic2 },
  { id: "image", label: "Imagem", short: "Quadros", icon: Image },
  { id: "motion", label: "Movimento", short: "Clipes", icon: Clapperboard },
  { id: "captions", label: "Legendas", short: "Texto", icon: Subtitles },
  { id: "render", label: "Render", short: "Montagem", icon: Film },
  { id: "done", label: "Pronto", short: "Saída", icon: Check }
];

export const actionFor = (project: Project) => {
  if (!project.scenes.length) return { id: "plan" as const, label: "Aprovar conteúdo e criar roteiro" };
  if (project.scenes.some((scene) => !scene.audioUrl)) return { id: "voice" as const, label: "Aprovar roteiro e gerar vozes" };
  if (project.scenes.some((scene) => !scene.imageUrl)) return { id: "images" as const, label: "Aprovar vozes e gerar quadros" };
  if (project.settings.animate && project.scenes.some((scene) => !scene.videoUrl)) return { id: "animate" as const, label: "Aprovar quadros e animar" };
  if (!project.captionsUrl) return { id: "captions" as const, label: "Aprovar cenas e preparar legendas" };
  if (!project.finalVideoUrl) return { id: "render" as const, label: "Aprovar legendas e renderizar" };
  return undefined;
};

function StatusMark({ ready, working }: { ready: boolean; working?: boolean }) {
  return <span className={`status-mark ${ready ? "is-ready" : working ? "is-working" : ""}`}>{working ? <LoaderCircle size={12} /> : ready ? <Check size={11} /> : null}</span>;
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
      <div className="form-kicker">Nova ordem de produção</div>
      <h1>Transforme conteúdo em vídeo, etapa por etapa.</h1>
      <p>Cole o material bruto. Você aprova roteiro, voz, imagens, movimento e legendas antes do corte final.</p>
      <label>Título do projeto<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Como funciona a energia solar" required /></label>
      <label>Conteúdo<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole aqui seu artigo, briefing, aula ou roteiro bruto..." minLength={20} required /></label>
      <div className="form-row">
        <label>Formato<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
        <label>Estilo visual<input value={style} onChange={(event) => setStyle(event.target.value)} /></label>
      </div>
      <label className="check-line"><input type="checkbox" checked={animate} onChange={(event) => setAnimate(event.target.checked)} /><span><strong>Animar os quadros com Agnes Video</strong><small>Opcional — imagens estáticas já produzem um MP4 completo.</small></span></label>
      {(formError || externalError) && <div className="form-error" role="alert"><CircleAlert size={16} />{formError || externalError}</div>}
      <div className="form-actions">{canCancel && <button className="button ghost" type="button" onClick={onCancel}>Cancelar</button>}<button className="button primary" disabled={busy || content.length < 20 || !title}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Abrir bancada</button></div>
    </form>
  </div>;
}

function Inspector({ project, scene, onSave, onRegenerate, onVoice, onAnimate, busy }: { project: Project; scene?: Scene; onSave: (value: { title: string; narration: string; visualPrompt: string; durationHint: number }) => void; onRegenerate: () => void; onVoice: () => void; onAnimate: () => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", narration: "", visualPrompt: "", durationHint: 6 });
  useEffect(() => { if (scene) setDraft({ title: scene.title, narration: scene.narration, visualPrompt: scene.visualPrompt, durationHint: scene.durationHint }); setEditing(false); }, [scene?.id]);
  return <aside className="inspector">
    <div className="inspector-heading"><span>Monitor</span><span className="frame-code">F{String((scene?.position ?? 0) + 1).padStart(2, "0")}</span></div>
    <div className={`monitor ${project.settings.format.replace(":", "-")}`}>
      {scene?.videoUrl ? <video src={scene.videoUrl} controls /> : scene?.imageUrl ? <img src={scene.imageUrl} alt={scene.title} /> : <div className="monitor-empty"><Image size={28} strokeWidth={1.3} /><span>Quadro ainda não exposto</span></div>}
    </div>
    <div className="scene-meta">
      <span className="scene-number">CENA {String((scene?.position ?? 0) + 1).padStart(2, "0")}</span>
      {editing ? <div className="scene-editor"><label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Narração<textarea value={draft.narration} onChange={(event) => setDraft({ ...draft, narration: event.target.value })} /></label><label>Duração prevista<input type="number" min="2" max="30" value={draft.durationHint} onChange={(event) => setDraft({ ...draft, durationHint: Number(event.target.value) })} /></label></div> : <><h2>{scene?.title ?? "Selecione uma cena"}</h2><p>{scene?.narration ?? "O detalhe da cena aparece aqui para conferência."}</p></>}
      {scene?.audioUrl && <audio className="audio" src={scene.audioUrl} controls />}
    </div>
    {scene?.visualPrompt && <div className="prompt-note"><span>Direção do quadro</span>{editing ? <textarea aria-label="Direção visual da cena" value={draft.visualPrompt} onChange={(event) => setDraft({ ...draft, visualPrompt: event.target.value })} /> : <p>{scene.visualPrompt}</p>}</div>}
    <div className="inspector-actions">
      {editing ? <button className="button primary full" disabled={busy} onClick={() => { onSave(draft); setEditing(false); }}><Save size={15} /> Salvar e invalidar dependências</button> : <button className="button outline full" disabled={!scene || busy} onClick={() => setEditing(true)}><Pencil size={15} /> Editar roteiro da cena</button>}
      <button className="button outline full" disabled={!scene || busy} onClick={onVoice}><RefreshCw size={15} /> Refazer voz</button>
      <button className="button outline full" disabled={!scene || busy} onClick={onRegenerate}><RefreshCw size={15} /> Refazer imagem</button>
      {project.settings.animate && <button className="button outline full" disabled={!scene?.imageUrl || busy} onClick={onAnimate}><RefreshCw size={15} /> Refazer movimento</button>}
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

  const current = useMemo(() => projects.find((project) => project.id === currentId) ?? projects[0], [projects, currentId]);
  const scene = current?.scenes[selectedScene] ?? current?.scenes[0];
  const next = current ? actionFor(current) : undefined;
  const stageIndex = current ? stages.findIndex((stage) => stage.id === current.stage) : 0;
  const missingProviders = providers ? [!providers.codex.ready && "Codex", !providers.elevenLabs.ready && "ElevenLabs", !providers.agnes.ready && "Agnes"].filter(Boolean) as string[] : [];

  useEffect(() => { Promise.all([api.projects(), api.health()]).then(([items, health]) => { setProjects(items); setCurrentId(items[0]?.id); setProviders(health.providers); }).catch((err) => setError(err.message)); }, []);
  const replace = (project: Project) => setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
  const execute = async (action: "plan" | "voice" | "images" | "animate" | "captions" | "render") => {
    if (!current) return;
    setBusy(true); setError(undefined);
    try { replace(await api.action(current.id, action)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); const fresh = await api.projects(); setProjects(fresh); }
    finally { setBusy(false); }
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
        <div className="header-tools"><span>{current.settings.format}</span><span>{current.settings.language}</span></div>
      </header>

      <div className="stage-strip">{stages.map((stage, index) => { const Icon = stage.icon; const done = index < stageIndex || current.stage === "done"; const active = index === stageIndex; return <div key={stage.id} className={`stage ${active ? "active" : ""} ${done ? "done" : ""}`}><span className="stage-no">{String(index + 1).padStart(2,"0")}</span><Icon size={15} /><span><strong>{stage.label}</strong><small>{stage.short}</small></span><StatusMark ready={done} working={active && busy} /></div>; })}</div>

      {missingProviders.length > 0 && <div className="setup-banner" role="status"><CircleAlert size={18} /><span>Validação real bloqueada: configure {missingProviders.join(" e ")} em <code>apps/server/.env</code>.</span></div>}

      {error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{error}</span><button onClick={() => setError(undefined)}>fechar</button></div>}

      <section className="production-sheet">
        <div className="sheet-toolbar"><div><span className="registration">FOLHA DE EXPOSIÇÃO</span><strong>{current.scenes.length ? `${current.scenes.length} cenas em revisão` : "Conteúdo recebido"}</strong></div><div className="sheet-summary">{current.summary || current.content.slice(0, 150)}</div></div>
        {current.scenes.length === 0 ? <div className="content-proof"><span>Material bruto</span><p>{current.content}</p></div> : <div className="grid-scroll"><div className="exposure-grid" style={{ "--scene-count": current.scenes.length } as React.CSSProperties}>
          <div className="row-label top">CENA</div>{current.scenes.map((item) => <button key={item.id} aria-pressed={scene?.id === item.id} aria-label={`Selecionar ${item.title}`} className={`scene-head ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><span>{String(item.position + 1).padStart(2,"0")}</span><strong>{item.title}</strong></button>)}
          <div className="row-label">ROTEIRO</div>{current.scenes.map((item) => <button key={`${item.id}-script`} aria-pressed={scene?.id === item.id} aria-label={`Revisar roteiro de ${item.title}`} className={`exposure-cell script ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><p>{item.narration}</p><StatusMark ready /></button>)}
          <div className="row-label">VOZ</div>{current.scenes.map((item) => <button key={`${item.id}-voice`} aria-pressed={scene?.id === item.id} aria-label={`Revisar voz de ${item.title}`} className={`exposure-cell ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><Mic2 size={17} /><span>{item.audioUrl ? `${(item.duration ?? item.durationHint).toFixed(1)}s` : "aguarda"}</span><StatusMark ready={Boolean(item.audioUrl)} /></button>)}
          <div className="row-label">QUADRO</div>{current.scenes.map((item) => <button key={`${item.id}-image`} aria-pressed={scene?.id === item.id} aria-label={`Revisar imagem de ${item.title}`} className={`exposure-cell image-cell ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}>{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Image size={19} />}<StatusMark ready={Boolean(item.imageUrl)} /></button>)}
          <div className="row-label">CLIP</div>{current.scenes.map((item) => <button key={`${item.id}-motion`} aria-pressed={scene?.id === item.id} aria-label={`Revisar movimento de ${item.title}`} className={`exposure-cell ${scene?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedScene(item.position)}><Clapperboard size={17} /><span>{item.videoUrl ? "animado" : current.settings.animate ? "aguarda" : "estático"}</span><StatusMark ready={Boolean(item.videoUrl) || !current.settings.animate} /></button>)}
        </div></div>}
      </section>

      <footer className="command-bar" aria-live="polite">
        <div><span>ETAPA ATUAL</span><strong>{stages[stageIndex]?.label}</strong><small>{current.status === "error" ? "Requer atenção" : busy ? "Processando localmente…" : "Pronto para validar"}</small></div>
        {current.finalVideoUrl ? <a className="button primary" href={current.finalVideoUrl} download><Download size={17} /> Baixar MP4</a> : next && <button className="button primary next" disabled={busy} onClick={() => execute(next.id)}>{busy ? <LoaderCircle className="spin" size={17} /> : <ChevronRight size={17} />} {busy ? "Executando…" : next.label}</button>}
      </footer>
    </main>

    <Inspector project={current} scene={scene} busy={busy}
      onSave={async (value) => { if (!scene) return; setBusy(true); try { replace(await api.updateScene(scene.id, value)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onVoice={async () => { if (!scene) return; setBusy(true); try { replace(await api.regenerateVoice(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onRegenerate={async () => { if (!scene) return; setBusy(true); setError(undefined); try { replace(await api.regenerateImage(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}
      onAnimate={async () => { if (!scene) return; setBusy(true); try { replace(await api.regenerateMotion(scene.id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }} />
    <button className="delete-project" title="Excluir projeto" onClick={async () => { if (confirm(`Excluir “${current.title}”?`)) { await api.remove(current.id); const left = projects.filter((item) => item.id !== current.id); setProjects(left); setCurrentId(left[0]?.id); } }}><Trash2 size={15} /></button>
  </div>;
}

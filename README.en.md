# VideoSub Local

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

A local MVP that turns written content into an MP4 video, keeping each step visible for review: script, voice, images, optional motion, subtitles, and rendering.

## 📖 User Guide

Complete guide (landing page + step-by-step instructions): **https://inematds.github.io/videosub/guia/en/**

## Requirements

- Node.js 22 or higher;
- pnpm 10;
- FFmpeg and FFprobe in `PATH` (FFmpeg must include the `subtitles` filter to burn subtitles into the video);
- for real mode: Codex CLI installed and authenticated (`codex login`), as well as Agnes and ElevenLabs API keys.

## Run

```bash
cp .env.example apps/server/.env
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The default configuration uses real Codex OAuth, ElevenLabs, and Agnes. Fill in `apps/server/.env` before generating voice or images. For explicit testing, each adapter can be switched individually to `mock`.

With `HOST=0.0.0.0`, the compiled application is also available on the local network at `http://IP-DA-MAQUINA:3333`. Do not forward this port to the internet: this version does not have user login.

The file must be in `apps/server/.env`, since pnpm’s filtered scripts run the server from that directory. Codex OAuth is not saved in `.env`; the server reuses the local session created by `codex login`.

## Commands

```bash
pnpm dev        # web + API in development mode
pnpm test       # UI and API tests
pnpm typecheck  # TypeScript validation
pnpm build      # production application
pnpm start      # serves API, media, and compiled web app
```

### Background Operation

```bash
./start.sh      # starts and writes PID/log to .runtime/
./stop.sh       # stops only the registered process
./atualiza.sh   # updates, validates, builds, and restarts
```

`atualiza.sh` cancels the update when it finds local changes in Git, preventing them from being overwritten.

`pnpm start` does not build the application. To run the production version, first run `pnpm build`, then `pnpm start`, and open `http://localhost:3333` (or the port defined by `PORT`).

## Configuration

The available variables are documented in [`.env.example`](./.env.example). The essential ones are:

- `CODEX_PROVIDER=codex`: uses real Codex OAuth;
- `VOICE_PROVIDER=elevenlabs`: uses real ElevenLabs voice;
- `IMAGE_PROVIDER=agnes` and `VIDEO_PROVIDER=agnes`: use real Agnes media;
- any provider can be set to `mock` only for controlled tests;
- `PORT` and `WEB_ORIGIN`: API port and origin allowed by CORS in development;
- `DATA_DIR`: SQLite database and media, resolved from the repository root;
- `CODEX_PATH` and `CODEX_MODEL`: optional Codex executable and model;
- `AGNES_*` and `ELEVENLABS_*`: credentials and models for the real providers.

The recommended video profile is `agnes-video-2.5-flash`. It works with 4–12 second clips; VideoSub uses the actual voice duration to automatically determine how many clips to generate per scene. The interface also supports local music, separate volume controls, and prompt-based script editing.

Projects are stored in `data/videosub.db` and media in `data/projects/<id>/`. The entire directory is ignored by Git.

See [the project documentation](./docs/README.md), [the planned providers](./docs/PROVEDORES-E-FERRAMENTAS-v1.01.00.md), and [the visual system](./DESIGN.md).

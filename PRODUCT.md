# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, React with Vite, Fastify, SQLite through `better-sqlite3`, local filesystem, Codex SDK, Agnes APIs, ElevenLabs, and FFmpeg.

## Users

The initial user is a single local operator validating whether supplied content can be transformed into a useful complete video. Multi-user and public SaaS concerns are intentionally deferred.

## Product Purpose

VideoSub turns supplied written content into a finished video. It structures the content into scenes, creates narration, generates scene imagery, optionally animates scenes, adds captions, renders an MP4, and exposes every intermediate result for review.

Success for the first version means completing three short videos from content to playable MP4 while preserving visible, retryable results at every stage.

## Positioning

The first version is a transparent video-generation workbench: instead of hiding generation behind one opaque action, it lets the operator inspect, edit, approve, and retry the scene plan, voice, images, animation, captions, and render independently.

## Operating Context

The product runs locally in a browser with one Node.js server. Provider configuration lives in a gitignored `.env`; Codex uses the existing local ChatGPT OAuth session. Project records live in SQLite and generated artifacts live under the local `data/projects` directory.

The primary workflow is:

1. create a project and paste content;
2. use Codex to produce an editable scene plan;
3. use ElevenLabs to produce narration;
4. use Agnes to produce images;
5. optionally use Agnes to animate selected images;
6. produce captions and compose the media with FFmpeg;
7. review and download the final MP4.

## Capabilities and Constraints

- Local-only, single-user MVP.
- No application login, billing, cloud storage, social publishing, or distributed queues.
- Codex OAuth is the initial LLM access mode; no OpenAI API key is required.
- Agnes is the initial image and video provider.
- ElevenLabs is the initial voice provider.
- FFmpeg is the local renderer.
- Every provider is isolated behind an adapter.
- Jobs run one at a time and persist their state.
- The operator must be able to review and retry each stage without losing completed artifacts.
- Output formats begin with 16:9 and 9:16 H.264/AAC MP4.

## Evidence on Hand

- Product and implementation plans exist under `docs/`.
- No production videos, brand assets, customer evidence, or performance benchmarks exist yet.
- Demonstration content in the interface must be labeled as illustrative.

## Product Principles

- Show the work at every stage.
- Preserve completed artifacts and make retry local to the failed step.
- Prefer a working local pipeline over premature platform infrastructure.
- Keep provider-specific formats outside product logic.
- Measure the quality and duration of real outputs before expanding scope.

## Accessibility & Inclusion

The web interface must support keyboard navigation, visible focus, readable contrast, semantic status messaging, and responsive use on desktop and mobile browsers.

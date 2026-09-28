# VideoSub local

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

MVP local que transforma contenido escrito en un video MP4, manteniendo cada etapa visible para su revisión: guion, voz, imágenes, movimiento opcional, subtítulos y renderizado.

## 📖 Guía de uso

Guía completa (landing + paso a paso): **https://inematds.github.io/videosub/guia/es/**

## Requisitos

- Node.js 22 o superior;
- pnpm 10;
- FFmpeg y FFprobe en el `PATH` (FFmpeg debe incluir el filtro `subtitles` para grabar subtítulos en el video);
- para el modo real: Codex CLI instalado y autenticado (`codex login`), además de las claves de Agnes y ElevenLabs.

## Ejecutar

```bash
cp .env.example apps/server/.env
pnpm install
pnpm dev
```

Abre `http://localhost:5173`. La configuración predeterminada usa Codex OAuth, ElevenLabs y Agnes reales. Completa `apps/server/.env` antes de generar voz o imágenes. Para pruebas explícitas, cada adaptador se puede cambiar individualmente a `mock`.

Con `HOST=0.0.0.0`, la aplicación compilada también queda disponible en la red local en `http://IP-DA-MAQUINA:3333`. No reenvíes ese puerto a internet: esta versión no tiene inicio de sesión de usuario.

El archivo debe estar en `apps/server/.env`, ya que los scripts filtrados de pnpm ejecutan el servidor desde ese directorio. El OAuth de Codex no se guarda en `.env`; el servidor reutiliza la sesión local creada por `codex login`.

## Comandos

```bash
pnpm dev        # web + API en modo desarrollo
pnpm test       # pruebas de la interfaz y la API
pnpm typecheck  # validación de TypeScript
pnpm build      # aplicación de producción
pnpm start      # sirve la API, los medios y la web compilada
```

### Operación en segundo plano

```bash
./start.sh      # inicia y guarda el PID/log en .runtime/
./stop.sh       # finaliza solamente el proceso registrado
./atualiza.sh   # actualiza, valida, compila y reinicia
```

`atualiza.sh` cancela la actualización cuando encuentra cambios locales en Git, para evitar sobrescribirlos.

`pnpm start` no compila la aplicación. Para ejecutar la versión de producción, primero ejecuta `pnpm build`, luego `pnpm start` y abre `http://localhost:3333` (o el puerto definido por `PORT`).

## Configuración

Las variables disponibles están documentadas en [`.env.example`](./.env.example). Las esenciales son:

- `CODEX_PROVIDER=codex`: usa el Codex OAuth real;
- `VOICE_PROVIDER=elevenlabs`: usa voz real de ElevenLabs;
- `IMAGE_PROVIDER=agnes` y `VIDEO_PROVIDER=agnes`: usan medios reales de Agnes;
- cualquier proveedor puede recibir `mock` solo en pruebas controladas;
- `PORT` y `WEB_ORIGIN`: puerto de la API y origen permitido por CORS en desarrollo;
- `DATA_DIR`: base de datos SQLite y medios, resueltos a partir de la raíz del repositorio;
- `CODEX_PATH` y `CODEX_MODEL`: ejecutable y modelo opcionales de Codex;
- `AGNES_*` y `ELEVENLABS_*`: credenciales y modelos de los proveedores reales.

El perfil de video recomendado es `agnes-video-2.5-flash`. Trabaja con clips de 4–12 segundos; VideoSub usa la duración real de la voz para decidir automáticamente cuántos clips generar por escena. La interfaz también admite música local, volúmenes separados y edición del guion mediante prompt.

Los proyectos están en `data/videosub.db` y los medios en `data/projects/<id>/`. Todo el directorio está excluido de Git.

Consulta [la documentación del proyecto](./docs/README.md), [los proveedores previstos](./docs/PROVEDORES-E-FERRAMENTAS-v1.01.00.md) y [el sistema visual](./DESIGN.md).

import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();
await app.listen({ port: config.port, host: config.host });
console.log(`VideoSub local em http://${config.host}:${config.port}`);

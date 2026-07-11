import { join } from "node:path";

import { createLocalhostApp } from "../src/app/http/httpServer.js";

const port = Number(process.env.PORT ?? 4173);
const { server } = createLocalhostApp({
  databasePath: join("data", "app.db"),
  storageRoot: "storage",
  outputRoot: "outputs",
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Localhost app: http://127.0.0.1:${port}`);
});

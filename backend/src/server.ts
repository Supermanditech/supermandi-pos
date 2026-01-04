import app from "./app";
import { ensureCoreSchema } from "./db/ensureSchema";

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

async function start(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to start the backend. See backend/.env.example.");
    process.exit(1);
  }

  try {
    await ensureCoreSchema();
  } catch (error) {
    console.error("Failed to ensure DB schema", error);
  }

  app.listen(Number(PORT), HOST, () => {
    console.log(`SuperMandi backend listening on http://${HOST}:${PORT}`);
  });
}

void start();

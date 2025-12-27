import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";

// Always load backend env from `backend/.env` (not repo root `/.env`).
// This prevents Prisma errors like missing DATABASE_URL when the process is started with a different CWD (e.g. pm2/systemd).
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    service: "SuperMandi Backend",
    time: new Date().toISOString()
  });
});

app.use("/api", apiRouter);

app.use(errorHandler);

export default app;

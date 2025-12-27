import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";

dotenv.config();

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

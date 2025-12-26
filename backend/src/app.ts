import express from "express";
import cors from "cors";

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

export default app;

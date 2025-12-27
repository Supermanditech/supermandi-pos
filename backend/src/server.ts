import app from "./app";

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(Number(PORT), HOST, () => {
  console.log(`SuperMandi backend listening on http://${HOST}:${PORT}`);
});

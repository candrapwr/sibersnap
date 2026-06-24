import "dotenv/config";
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`SiberSnap API running on port ${config.port}`);
});

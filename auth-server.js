import express from "express";
import { saveTokens } from "./utils/google-calendar.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send("Missing code or state");
  }

  try {
    await saveTokens(state, code);
    res.send("Authentication successful! You can close this window.");
  } catch (error) {
    console.error("Error saving tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

export function startAuthServer() {
  app.listen(PORT, () => {
    console.log(`Auth server listening on port ${PORT}`);
  });
}

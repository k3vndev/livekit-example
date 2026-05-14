import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

const API_KEY = process.env.LIVEKIT_API_KEY
const API_SECRET = process.env.LIVEKIT_API_SECRET

app.use(cors());
app.use(express.json());

app.get("/token", async (req, res) => {
  const { identity, room } = req.query;

  if (!identity || !room) {
    return res.status(400).json({ error: "identity and room are required" });
  }

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: String(identity),
  });

  at.addGrant({
    roomJoin: true,
    room: String(room),
  });

  const token = await at.toJwt();
  res.json({ token });
});


app.listen(port, host, () => {
  console.log(`Server running on ${host}:${port}`);
});


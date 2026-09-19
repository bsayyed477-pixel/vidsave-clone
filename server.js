const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ALLOWED_HOSTS = [
  "youtube.com", "youtu.be", "m.youtube.com",
  "tiktok.com", "vm.tiktok.com",
  "instagram.com",
];

function isAllowedUrl(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
  });
}
app.post("/api/info", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !isAllowedUrl(url)) {
    return res.status(400).json({ error: "Missing or unsupported URL" });
  }
  try {
    const output = await runYtdlp([
      "-J",
      "--no-warnings",
      "--extractor-args", "youtube:player_client=android",
      url,
    ]);
    const info = JSON.parse(output);
    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch video info" });
  }
});
app.get("/api/download", async (req, res) => {
  const { url, mode = "mp4" } = req.query;
  if (!url || !isAllowedUrl(url)) {
    return res.status(400).send("Missing or unsupported URL");
  }

  const isAudio = mode === "mp3";
  const tempName = `dl_${Date.now()}`;
  const tempDir = os.tmpdir();
  const outputTemplate = path.join(tempDir, `${tempName}.%(ext)s`);

  const args = isAudio
    ? [
        "-x", "--audio-format", "mp3",
        "--no-playlist",
        "--extractor-args", "youtube:player_client=android",
        "-o", outputTemplate,
        url,
      ]
    : [
        "-f", "best[ext=mp4]/best",
        "--no-playlist",
        "--extractor-args", "youtube:player_client=android",
        "-o", outputTemplate,
        url,
      ];

  try {
    await runYtdlp(args);

    const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(tempName));
    if (files.length === 0) {
      return res.status(500).send("Download failed: no output file");
    }
    const finalPath = path.join(tempDir, files[0]);
    const ext = isAudio ? "mp3" : "mp4";

    res.setHeader("Content-Disposition", `attachment; filename="download.${ext}"`);
    const stream = fs.createReadStream(finalPath);
    stream.pipe(res);
    stream.on("close", () => fs.unlin
(finalPath, () => {}));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).send("Download failed");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

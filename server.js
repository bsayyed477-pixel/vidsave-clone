const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const ytdlp = require("yt-dlp-exec");

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
app.post("/api/info", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !isAllowedUrl(url)) {
    return res.status(400).json({ error: "Missing or unsupported URL" });
  }
  try {
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      extractorArgs: "youtube:player_client=android",
    });
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

  try {
    const options = isAudio
      ? {
          output: outputTemplate,
          extractAudio: true,
          audioFormat: "mp3",
          noPlaylist: true,
          noCheckCertificates: true,
          extractorArgs: "youtube:player_client=android",
        }
      : {
          output: outputTemplate,
          format: "best[ext=mp4]/best",
          noPlaylist: true,
          noCheckCertificates: true,
          extractorArgs: "youtube:player_client=android",
        };

    await ytdlp(url, options);

    const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(tempName));
    if (files.length === 0) {
      return res.status(500).send("Download failed: no output file");
    }
    const finalPath = path.join(tempDir, files[0]);
    const ext = isAudio ? "mp3" : "mp4";

    res.setHeader("Content-Disposition", `attachment; filename="download.${ext}"`);
    const stream = fs.createReadStream(finalPath);
    stream.pipe(res);
    stream.on("close", () => fs.unlink(finalPath, () => {}));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).send("Download failed");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

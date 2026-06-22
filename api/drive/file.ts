import { Buffer } from "buffer";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Extract fileId robustly from URL match or query param
  const match = req.url ? req.url.match(/file\/([^\/\?]+)/) : null;
  const fileId = match ? match[1] : (req.query?.fileId || "");
  const token = (req.query?.token as string) || req.headers.authorization?.split(" ")[1];

  if (!fileId) {
    return res.status(400).send("Missing fileId parameter");
  }

  if (!token) {
    return res.status(401).send("Missing credential token");
  }

  try {
    // 1. Fetch metadata to read mimeType
    const metadataRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let mimeType = "image/png";
    if (metadataRes.ok) {
      const metadata = await metadataRes.json() as any;
      mimeType = metadata.mimeType || "image/png";
    }

    // 2. Fetch media bytes
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      const errText = await fileRes.text();
      return res.status(fileRes.status).send(`Failed to download file from GDrive: ${errText}`);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year cache
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error("Vercel Serverless File Proxy Error:", error);
    return res.status(500).send(`File downloading error: ${error.message}`);
  }
}

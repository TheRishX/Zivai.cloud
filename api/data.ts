import fs from "fs";
import path from "path";

// Support both standard container persistence path and resilient Vercel /tmp folder write support
const BASE_STORE_PATH = path.join(process.cwd(), "data-store.json");
const TMP_STORE_PATH = path.join("/tmp", "data-store.json");

let memoryCache: any = null;

function loadStore() {
  try {
    // 1. Try process.cwd() data-store.json
    if (fs.existsSync(BASE_STORE_PATH)) {
      const content = fs.readFileSync(BASE_STORE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not read BASE_STORE_PATH, trying fallback:", err);
  }

  try {
    // 2. Try Vercel /tmp persistent directory path fallback
    if (fs.existsSync(TMP_STORE_PATH)) {
      const content = fs.readFileSync(TMP_STORE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Could not read from TMP_STORE_PATH:", err);
  }

  // 3. Keep in memory cache
  if (memoryCache) {
    return memoryCache;
  }

  return null;
}

function saveStore(data: any): boolean {
  memoryCache = data;
  let saved = false;

  try {
    fs.writeFileSync(BASE_STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
    saved = true;
  } catch (err) {
    console.warn("Failed base sync write. Expected on serverless host systems. Attempting fallback to /tmp directory...", err);
  }

  try {
    fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
    saved = true;
  } catch (err) {
    console.error("Critical fallback write mismatch on /tmp directory", err);
  }

  return saved;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    const store = loadStore();
    if (store) {
      return res.status(200).json({ success: true, data: store });
    } else {
      return res.status(200).json({ success: false, message: "No stored data found" });
    }
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({ success: false, error: "Empty state provided" });
    }

    const result = saveStore(body);
    if (result) {
      return res.status(200).json({ success: true, message: "Data synced successfully" });
    } else {
      return res.status(500).json({ success: false, error: "Failed to persist database state" });
    }
  }

  return res.status(405).json({ success: false, error: "Method Not Allowed" });
}

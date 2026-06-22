export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(" ")[1];
  const searchName = req.query?.search as string || "";

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing authorization token" });
  }

  try {
    let query = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
    if (searchName) {
      const escapedName = searchName.replace(/'/g, "\\'");
      query += ` and name contains '${escapedName}'`;
    }

    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime,size,webViewLink)&pageSize=40&orderBy=createdTime%20desc`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      const error = new Error(`Failed to query Google Drive files: ${errText}`) as any;
      error.status = listRes.status;
      throw error;
    }

    const listData = await listRes.json() as any;
    return res.status(200).json({ success: true, files: listData.files || [] });
  } catch (error: any) {
    console.error("Vercel Serverless GDrive List Error:", error);
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

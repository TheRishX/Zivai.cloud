export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing authorization token" });
  }

  try {
    // 1. Search for a folder named 'ZivAi'
    const folderSearchQuery = "name = 'ZivAi' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const folderSearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!folderSearchRes.ok) {
      const errText = await folderSearchRes.text();
      throw new Error(`Failed to find ZivAi folder: ${errText}`);
    }

    const folderData = await folderSearchRes.json() as any;
    let folderId = "";

    if (folderData.files && folderData.files.length > 0) {
      folderId = folderData.files[0].id;
    } else {
      // Create the 'ZivAi' folder if it doesn't exist
      const folderCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'ZivAi',
          mimeType: 'application/vnd.google-apps.folder'
        })
      });

      if (!folderCreateRes.ok) {
        const errText = await folderCreateRes.text();
        throw new Error(`Failed to create ZivAi folder: ${errText}`);
      }

      const createdFolder = await folderCreateRes.json() as any;
      folderId = createdFolder.id;
    }

    // 2. Fetch PDF documents inside the 'ZivAi' folder
    const filesSearchQuery = `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`;
    const filesSearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesSearchQuery)}&fields=files(id,name,mimeType,createdTime,size,webViewLink)&pageSize=100&orderBy=createdTime%20desc`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!filesSearchRes.ok) {
      const errText = await filesSearchRes.text();
      throw new Error(`Failed to list files in ZivAi folder: ${errText}`);
    }

    const filesData = await filesSearchRes.json() as any;
    return res.status(200).json({ success: true, folderId, files: filesData.files || [] });
  } catch (error: any) {
    console.error("Vercel Serverless ZivAi Sync Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

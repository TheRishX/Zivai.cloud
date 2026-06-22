import { Buffer } from "buffer";

async function getOrCreateFolder(username: string, token: string): Promise<string> {
  const folderName = `${username} Screenshots Notes`;
  
  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    const error = new Error(`Failed to search for folder in Google Drive: ${errText}`) as any;
    error.status = searchRes.status;
    throw error;
  }

  const searchData = await searchRes.json() as any;
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    const error = new Error(`Failed to create screenshots folder: ${errText}`) as any;
    error.status = createRes.status;
    throw error;
  }

  const createData = await createRes.json() as any;
  return createData.id;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, error: "Missing authorization token" });
  }

  // Extract fileId from request (e.g. from query or path)
  const match = req.url ? req.url.match(/screenshots\/([^\/\?]+)/) : null;
  const fileId = match ? match[1] : (req.query?.fileId || "");

  try {
    if (req.method === "GET") {
      const username = (req.query?.username as string) || "DefaultUser";
      const folderId = await getOrCreateFolder(username, token);
      
      const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,webViewLink,size,description)&orderBy=createdTime%20desc`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        const error = new Error(`Failed to list files: ${errText}`) as any;
        error.status = listRes.status;
        throw error;
      }

      const listData = await listRes.json() as any;
      return res.status(200).json({ success: true, files: listData.files || [] });
    } 

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { username, name, mimeType, base64Data, description } = body;

      if (!base64Data) {
        return res.status(400).json({ success: false, error: "Missing base64Data image payload" });
      }

      const folderId = await getOrCreateFolder(username || "DefaultUser", token);
      const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Clean, "base64");

      const boundary = "screenshot_boundary_token_xyz_998877";
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: name || `screenshot_${Date.now()}.png`,
        parents: [folderId],
        description: description || ""
      };

      const multipartBody = Buffer.concat([
        Buffer.from(delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + delimiter + "Content-Type: " + (mimeType || "image/png") + "\r\n\r\n"),
        buffer,
        Buffer.from(close_delim)
      ]);

      const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": multipartBody.length.toString()
        },
        body: multipartBody
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        const error = new Error(`Google Drive file write failed: ${errText}`) as any;
        error.status = uploadRes.status;
        throw error;
      }

      const uploadData = await uploadRes.json() as any;
      return res.status(200).json({ success: true, file: uploadData });
    }

    if (req.method === "DELETE") {
      if (!fileId) {
        return res.status(400).json({ success: false, error: "Missing file ID for deletion" });
      }

      const deleteRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!deleteRes.ok) {
        const errText = await deleteRes.text();
        const error = new Error(`Failed to delete file: ${errText}`) as any;
        error.status = deleteRes.status;
        throw error;
      }

      return res.status(200).json({ success: true, message: "File removed successfully" });
    }

    if (req.method === "PATCH") {
      if (!fileId) {
        return res.status(400).json({ success: false, error: "Missing file ID for metadata modification" });
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { description, name } = body;

      const patchBody: any = {};
      if (description !== undefined) patchBody.description = description;
      if (name !== undefined) patchBody.name = name;

      const patchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patchBody)
      });

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        const error = new Error(`Failed to modify file metadata: ${errText}`) as any;
        error.status = patchRes.status;
        throw error;
      }

      const patchedData = await patchRes.json() as any;
      return res.status(200).json({ success: true, file: patchedData });
    }

    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  } catch (error: any) {
    console.error("Vercel Serverless Screenshot Error:", error);
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

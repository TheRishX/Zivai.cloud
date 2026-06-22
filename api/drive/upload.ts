import { Buffer } from "buffer";

async function getOrCreateSubfolder(token: string, folderName: string, parentId?: string): Promise<string> {
  const cleanName = folderName.replace(/'/g, "\\'");
  let query = `name='${cleanName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    const error = new Error(`Failed to search folder "${folderName}": ${errText}`) as any;
    error.status = searchRes.status;
    throw error;
  }

  const searchData = await searchRes.json() as any;
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    const error = new Error(`Failed to create folder "${folderName}": ${errText}`) as any;
    error.status = createRes.status;
    throw error;
  }

  const createData = await createRes.json() as any;
  return createData.id;
}

async function getOrCreateCurriculumFolder(token: string, username: string, topicName: string, subtopicName: string): Promise<string> {
  const rootId = await getOrCreateSubfolder(token, `${username} Curriculum Vault`);
  const topicId = await getOrCreateSubfolder(token, topicName, rootId);
  const subtopicId = await getOrCreateSubfolder(token, subtopicName, topicId);
  return subtopicId;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, error: "Missing authorization token" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { username, topicName, subtopicName, name, mimeType, base64Data, description } = body;

  if (!topicName || !subtopicName) {
    return res.status(400).json({ success: false, error: "Missing topicName or subtopicName category parameters" });
  }

  if (!base64Data) {
    return res.status(400).json({ success: false, error: "Missing base64Data file payload" });
  }

  try {
    const folderId = await getOrCreateCurriculumFolder(token, username || "DefaultUser", topicName, subtopicName);

    const base64Clean = base64Data.replace(/^data:.*;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");

    const boundary = "curriculum_boundary_token_993311";
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const metadata = {
      name: name || `reference_doc_${Date.now()}.pdf`,
      parents: [folderId],
      description: description || ""
    };

    const multipartBody = Buffer.concat([
      Buffer.from(delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + delimiter + "Content-Type: " + (mimeType || "application/pdf") + "\r\n\r\n"),
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
  } catch (error: any) {
    console.error("Vercel Serverless Curriculum Upload Error:", error);
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

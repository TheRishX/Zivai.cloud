import { GoogleGenAI } from "@google/genai";

let ai: any = null;
const apiKey = process.env.GEMINI_API_KEY;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function generateWithRetry(options: any, maxAttempts = 3, initialDelayMs = 1500) {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (!ai) {
        throw new Error("Gemini AI client is not configured.");
      }
      return await ai.models.generateContent(options);
    } catch (error: any) {
      lastError = error;
      const errMsg = String(error.message || "").toLowerCase();
      const errStatus = error.status || error.statusCode || error.code || 0;
      
      const isRetryable = 
        errStatus === 503 || 
        errStatus === 429 || 
        errStatus === 500 ||
        errMsg.includes("503") || 
        errMsg.includes("429") || 
        errMsg.includes("500") || 
        errMsg.includes("unavailable") || 
        errMsg.includes("demand") || 
        errMsg.includes("limit") || 
        errMsg.includes("overloaded");

      if (attempt < maxAttempts && isRetryable) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[GEMINI RETRY] Attempt ${attempt} failed with error statement: "${error.message}". Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  throw lastError;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  if (!ai) {
    return res.status(503).json({
      success: false,
      error: "Gemini AI client is not configured. Please add your GEMINI_API_KEY in Settings."
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { content, command } = body;

  if (!command) {
    return res.status(400).json({ success: false, error: "Missing command payload." });
  }

  try {
    const prompt = `You are an elite, AI-driven notepad assistant called "Notepad AI".
You receive the existing content of a study note (which may be empty, plain text, or rich HTML) and a natural language instruction or command from the user.
Your task is to modify, reformat, translate, extend, or rewrite the HTML content strictly following the user's instructions.

CRITICAL INSTRUCTIONS FOR CHECKLIST CREATION:
If the user asks to format materials into a checklist, write items as a checklist, arrange questions/list items into a checklist, or any similar checklist command, you MUST convert each item into the exact checklist HTML element template.
Checklist Item HTML Template (one per item):
<div style="margin-top: 0.35rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;" contenteditable="true">
  <input type="checkbox" style="width: 1.15rem; height: 1.15rem; border-radius: 4px; border: 1.5px solid #d1d5db; accent-color: #fbbf24; cursor: pointer; margin: 0; flex-shrink: 0;" />
  <span style="flex: 1; outline: none; margin-left: 0.25rem;">[CONTENT]</span>
</div>

Replace [CONTENT] with the text of the item, preserving any code formatting, bolding, or styles if applicable.

OTHER FORMATTING INSTRUCTIONS:
- Return ONLY valid, clean, and beautifully structured HTML tags that are safe to insert inside a contenteditable workspace (e.g. <div>, <span>, <h2>, <h3>, <ul>, <li>, <p>, <b>, <i>, <pre>, <code>).
- Keep styles inline or use standard semantic HTML tags.
- NEVER wrap your output in markdown \`\`\`html blocks or other markdown decorators. Your response must be the raw HTML string itself!
- Be direct and concise; do not add introductory phrases like "Here is your updated checklist" or concluding remarks. Jump directly into the edited HTML note content.

User's Existing HTML Content:
${content || "*(Empty note)*"}

User's Command:
"${command}"

Provide the final HTML after executing the command:`;

    const response = await generateWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    let cleanedHtml = (response.text || "").trim();

    if (cleanedHtml.startsWith("```html")) {
      cleanedHtml = cleanedHtml.substring(7);
    } else if (cleanedHtml.startsWith("```")) {
      cleanedHtml = cleanedHtml.substring(3);
    }
    if (cleanedHtml.endsWith("```")) {
      cleanedHtml = cleanedHtml.substring(0, cleanedHtml.length - 3);
    }
    cleanedHtml = cleanedHtml.trim();

    return res.status(200).json({ success: true, result: cleanedHtml });
  } catch (error: any) {
    console.error("Vercel Serverless AI Command Error:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to process AI command in note." });
  }
}

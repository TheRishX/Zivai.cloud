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
  const { content, mode } = body;

  if (!content) {
    return res.status(400).json({ success: false, error: "Missing content payload to polish." });
  }

  try {
    let prompt = "";
    if (mode === "summarize") {
      prompt = `You are an elite research note summary architect. Take the following HTML content from a technical study note and generate an elegant executive summary block. At the end, compile the absolute top "Golden Takeaways" in clean bullet-points.
      
      CRITICAL INSTRUCTION: Return ONLY clean, beautifully formatted raw HTML. Do NOT wrap your output in standard markdown \`\`\`html code blocks. Return ONLY legal HTML tags (like headings, bold, standard lists, paragraph markers) fit to be injected directly inside a contentEditable document editor div.

      Input study note content:
      ${content}
      `;
    } else if (mode === "checklist") {
      prompt = `You are a curriculum coordinator. Take this technical study notepad content and identify all implied action items, practice tasks, concepts to research, or coding projects mentioned. Restructure them into a comprehensive series of actionable checklist items.
      
      CRITICAL INSTRUCTION: Return ONLY clean raw HTML where each checklist item is formatted exactly like our system design:
      <div style="margin-top: 0.35rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;" contenteditable="true">
        <input type="checkbox" style="width: 1.15rem; height: 1.15rem; border-radius: 4px; border: 1.5px solid #d1d5db; accent-color: #fbbf24; cursor: pointer; margin: 0; flex-shrink: 0;" />
        <span style="flex: 1; outline: none; margin-left: 0.25rem;">[Core Task Title]</span>
      </div>
      Do NOT wrap your output in markdown \`\`\`html blocks. Return ONLY the raw HTML checklist list. 
      Ensure tasks cover all technical aspects mentioned.

      Input study note content:
      ${content}
      `;
    } else {
      prompt = `You are an elite, academy-level technical editor and academic editor. Review the following HTML study node. Polish any spelling or grammatical issues, organize information into balanced headings, format key terms or code keywords so they look clear using code font markers or bold text, and dramatically enhance the formatting, alignment, and structure to look extremely clean, mature, and professional. Keep all source content intact.
      
      CRITICAL INSTRUCTION: Return ONLY clean, beautifully formatted raw HTML. Do NOT wrap your output in standard markdown \`\`\`html blocks. Return ONLY raw legal HTML tags.

      Input study note content:
      ${content}
      `;
    }

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
    console.error("Vercel Serverless Note Polishing Error:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to process note alignment with AI." });
  }
}

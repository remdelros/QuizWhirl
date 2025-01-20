require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const pdf = require("pdf-parse");
const fs = require("fs").promises;
const path = require("path");
const fileUpload = require("express-fileupload");

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: "*",
  credentials: false,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true,
  })
);

// OpenAI Configuration
const openai = new OpenAI({
  apiKey:
    "sk-svcacct-GLKyyDWGNcdhT-lX1Hy-0QFIk1Qck76z3IY_LVQ_RecpXCUIThI-y71HMMV-FrT3BlbkFJgzHd6pnqGaxKPk1HpF5km_yf7td5aP9Sa9c_UCCT-OgpxUEPj096BP2TV8AyMA",
});

// PDF Storage Directory
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error("Error creating upload directory:", error);
  }
};
ensureUploadDir();

app.timeout = 240000;

app.post("/api/parse-pdf-text", async (req, res) => {
  req.setTimeout(240000);

  try {
    const { file, filename } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No data provided" });
    }

    let textContent;

    // Add detailed logging
    console.log("Received request:", {
      filenameReceived: filename,
      fileContentLength: file.length,
      sampleContent: file.substring(0, 100),
    });

    try {
      // Try to parse as PDF first
      const buffer = Buffer.from(file, "base64");
      console.log("Successfully created buffer");

      try {
        const pdfData = await pdf(buffer);
        textContent = pdfData.text;
        console.log("Successfully parsed as PDF");
      } catch (pdfError) {
        console.log("Not a PDF, treating as plain text");
        // If PDF parsing fails, treat as plain text
        textContent = buffer.toString("utf-8");
      }
    } catch (bufferError) {
      console.error("Buffer creation error:", bufferError);
      return res.status(500).json({ error: "Invalid base64 content" });
    }

    if (!textContent || textContent.trim().length === 0) {
      console.error("No text content extracted");
      return res
        .status(400)
        .json({ error: "No text content could be extracted" });
    }

    console.log("Extracted text sample:", textContent.substring(0, 100));
    console.log("Text length:", textContent.length);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a professional quiz question generator. Generate questions based on the provided text content, ensuring questions test understanding of key concepts and important details.
          Generate a valid JSON object strictly in this format. 
                    - All strings must be enclosed in double quotes.
                    - No trailing commas.
                    - Ensure proper JSON syntax.
                    If you encounter any invalid data, omit it and continue generating valid JSON only.
                    -Do not include the the triple backticks before the json response
                    :
    
    {
      "level1": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "answer": "string"
        }
      ],
      "level2": [
        {
          "question": "string",
          "answer": "string"
        }
      ],
      "level3": [
        {
          "question": "string",
          "letters": "string",
          "word": "string"
        }
      ],
      "level4": [
        {
          "id": "number"
          "question": "string",
          "answer": "string"
        }
      ]
    }
          `,
        },
        {
          role: "user",
          content: `
          
          Using the following text as source material:

        ${data.text}
    
    
    Each level should be:
    - **Level 1**: multiple-choice questions (each with 4 options).
    - **Level 2**: fill-in-the-blank questions.
    - **Level 3**: "what" questions. Each question involves presenting a scenario or concept (e.g., "What happens when a solid mixes into a liquid?"). Along with the question, provide a jumbled version of the correct answer (e.g., "VDLSSIE" as "letters" for "DISSOLVE" as "word") make the jumbled letters precise with the letters of the word.
    - **Level 4**: identification questions(put quotations on the id).

    It is imperative that there should be ten questions per level.
    `,
        },
      ],
      max_tokens: 4000,
    });

    let jsonResponse = completion.choices[0].message.content;
    jsonResponse = jsonResponse
      .replace(/json|/g, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\,(?=\s*?[\}\]])/g, "");

    let quizQuestions;
    try {
      quizQuestions = JSON.parse(jsonResponse);
      res.json(quizQuestions);
    } catch (error) {
      console.error("Invalid JSON Response:", jsonResponse);
      res.status(500).json({
        error: "Failed to parse JSON",
        details: error.message,
      });
    }
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).json({
      error: "An error occurred while generating quiz questions.",
      details: error.message,
    });
  }
});

app.get("/api/hello-world", (req, res) => {
  res.json({ message: "hello world" });
});

app.post("/api/test-post", (req, res) => {
  res.json({ message: "POST endpoint working" });
});

const server = app.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
});

module.exports = app;

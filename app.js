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
  req.setTimeout(240000); // Set timeout to handle large requests

  try {
    const { file } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No file data provided" });
    }

    console.log("Received file data.");

    const buffer = Buffer.from(file, "base64");

    let data;
    try {
      data = await pdf(buffer);
    } catch (error) {
      console.error("PDF parsing failed:", error.message);
      return res.status(400).json({ error: "Failed to parse the PDF." });
    }

    const textContent = data.text;

    if (!textContent || textContent.trim().length === 0) {
      console.error("No text content extracted.");
      return res
        .status(400)
        .json({ error: "No text content could be extracted from the PDF." });
    }

    console.log("Extracted text sample:", textContent.substring(0, 100));

    // Generate quiz questions using OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a professional quiz question generator. Generate questions based on the provided text content, ensuring questions test understanding of key concepts and important details. Generate a valid JSON object strictly in this format: 
          {
            "level1": [
              { "question": "string", 
                "options": ["string", "string", "string", "string"], 
                "answer": "string" }
            ],
            "level2": [
              { "question": "string", 
                "answer": "string" }
            ],
            "level3": [
              { "question": "string", 
                "letters": "string", 
                 "word": "string" }
            ],
            "level4": [
              { "id": "number", 
                "question": "string", 
                "answer": "string" }
            ]
          }
          `,
        },
        {
          role: "user",
          content: `
          Using the following text as source material:
          ${textContent}
          Each level should have 10 questions, testing different formats as specified.
          `,
        },
      ],
      max_tokens: 4000,
    });

    let jsonResponse = completion.choices[0].message.content.trim();

    try {
      const quizQuestions = JSON.parse(jsonResponse);
      res.json({ message: "Quiz generated successfully.", quizQuestions });
    } catch (error) {
      console.error("Invalid JSON response:", jsonResponse);
      res.status(500).json({
        error: "Failed to parse JSON response from OpenAI.",
        details: error.message,
      });
    }
  } catch (error) {
    console.error("Error during file processing:", error);
    res.status(500).json({
      error: "An error occurred while processing the file.",
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

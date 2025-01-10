// require("dotenv").config();

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
  credentials: "false",
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
    "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",
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

app.post("/api/parse-pdf-text", async (req, res) => {
  try {
    const { file, filename } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    const buffer = Buffer.from(file, "base64");
    const data = await pdf(buffer);

    console.log("PDF Text Length:", data.text.length);
    console.log("First 500 characters of text:", data.text.substring(0, 2000));

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
      max_tokens: 10000,
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

// Start Server
app.listen(PORT, () => {
  console.log(`Server running at port {PORT}`);
});

module.exports = app;

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
      return res.status(400).json({ error: "No PDF data provided" });
    }
    const isPDF = file.startsWith("JVBERi0");

    let textContent;
    if (isPDF) {
      try {
        const buffer = Buffer.from(file, "base64");
        const data = await pdf(buffer);
        textContent = data.text;
      } catch (error) {
        console.error("PDF parsing error:", error);
        return res.status(400).json({ error: "Failed to parse the PDF." });
      }
    } else {
      // If not a PDF, decode the base64 content to text
      try {
        const buffer = Buffer.from(file, "base64");
        textContent = buffer.toString("utf-8");

        console.log("=== Decoded Text Content ===");
        console.log("First 500 characters:", textContent.substring(0, 500));
      } catch (error) {
        console.error("Text decoding error:", error);
        return res
          .status(400)
          .json({ error: "Failed to decode text content." });
      }
    }

    if (!textContent || textContent.trim().length === 0) {
      return res.status(400).json({ error: "No text content found" });
    }

    console.log("Text Content Length:", textContent.length);
    console.log("First 500 characters of text:", textContent.substring(0, 500));

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a professional quiz question generator. You will generate specific questions based ONLY on the provided text content. Do not generate generic questions or questions from outside the provided text.
          Each question must be directly related to the concepts and information presented in the input text.

    Generate questions in this JSON format:
    
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
          
        Generate questions STRICTLY based on this text content ONLY. Do not include any questions about topics not mentioned in this text:\n\n${textContent}\n\nGenerate questions according to these rules:
    
    
    Each level should be:
    - **Level 1**: multiple-choice questions (each with 4 options).
    - **Level 2**: fill-in-the-blank questions.
    - **Level 3**: Create "What" questions where:
        1. Each question starts with "What" and presents a clear scenario or concept
        2. The answer must be stored in two fields:
           - "letters": contains a jumbled arrangement of the answer letters
           - "word": contains the correct answer
        3. The "letters" field MUST:
           - Use exactly the same letters as the "word" field
           - Be arranged in a different order than the "word"
           - Include all letters from the answer, no more and no less
        
        Example format in JSON:
        {
          "question": "What happens when a solid mixes into a liquid?",
          "letters": "VDLSSIE",  // Jumbled version
          "word": "DISSOLVE"     // Correct answer (contains same exact letters)
        }
    - **Level 4**: identification questions(put quotations on the id).

    It is imperative that there should be ten questions per level.
    `,
        },
      ],
      max_tokens: 4000,
    });

    console.log("\n=== Raw OpenAI Response ===");
    console.log(completion.choices[0].message.content);

    let jsonResponse = completion.choices[0].message.content;
    jsonResponse = jsonResponse
      .replace(/json|/g, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\,(?=\s*?[\}\]])/g, "");

    console.log("\n=== Cleaned JSON Response ===");
    console.log(jsonResponse);

    let quizQuestions;
    try {
      quizQuestions = JSON.parse(jsonResponse);
      console.log("\n=== Parsed Quiz Questions ===");
      console.log(JSON.stringify(quizQuestions, null, 2));

      console.log("\n=== Final Response to Frontend ===");
      console.log(JSON.stringify({ quizQuestions }, null, 2));
      res.json({ quizQuestions });
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

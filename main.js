import Together from "together-ai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";

const together = new Together({ apiKey: process.env.TOGETHER_KEY });

// Запрос к API DeepSeek
async function aiResponse(filepath) {
  const fileContent = await fs.readFile(filepath, "utf-8");

  const sys_prompt = `
You are a professional code analyst specializing in JavaScript.
Your task is to analyze the provided JavaScript code and add comments in JSDoc format.

Requirements:
- Provide concise and direct documentation without unnecessary explanations.
- Accepts only a JavaScript file as input.
- Respond only with JavaScript code (do not wrap it in code blocks like '''javascript ... ''').
- Write clear and simple comments in English, ensuring that an average developer can easily understand them.
- Include examples when necessary to illustrate usage.
- If the code is already documented, re-document it.

Your goal is to create readable and user-friendly JSDoc documentation that enhances code comprehension.
`;

  const response = await together.chat.completions.create({
    messages: [
      {
        role: "system",
        content: sys_prompt,
      },
      {
        role: "user",
        content: fileContent,
      },
    ],
    model: "deepseek-ai/DeepSeek-V3",
    max_tokens: null,
    temperature: 0.1,
    timeout: null,
    top_p: 0.5,
    top_k: 50,
  });

  const response_answer = response.choices[0].message.content;
  const data = response_answer.trim();

  // Путь для выходного файла, всегда используя ./out-js/
  const relativePath = path.relative(process.cwd(), filepath);
  const newFilePath = path.join("./out-js", relativePath);

  await fs.mkdir(path.dirname(newFilePath), { recursive: true });
  await fs.writeFile(newFilePath, data, "utf-8");
  console.log(`End comment ${filepath}`);
}

async function aiDialog() {}

// Асинхронное добавление комментариев к файлам
async function makeComments(files) {
  try {
    const promises = files.map((file) => {
      console.log(`Start comment ${file}`);
      return aiResponse(file);
    });
    await Promise.all(
      promises.map((p) =>
        p.catch((err) => console.error("Error processing file:", err))
      )
    );
  } catch (err) {
    console.error("Ошибка", err);
    throw err;
  }
  await generateDocs();
}

// Считывание файлов в массив
async function readFiles(dirpath) {
  const entries = await fs.readdir(dirpath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirpath, entry.name);
      if (entry.isDirectory()) {
        const nestedFiles = await readFiles(fullPath);
        if (nestedFiles.length === 0) {
          const newDirPath = path.join(
            "./out-js",
            path.relative(process.cwd(), fullPath)
          );
          await fs.mkdir(newDirPath, { recursive: true });
        }
        return nestedFiles;
      } else {
        return fullPath;
      }
    })
  );
  return files.flat();
}

// Гегерация документация JSdoc
async function generateDocs() {
  const command = "jsdoc -c jsdoc.json";
  await exec(command, () => {});
}

// Программа берёт файлы с указанной директории
const files = await readFiles("./inputs-js/");
await makeComments(files);

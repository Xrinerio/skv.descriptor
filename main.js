import Together from "together-ai";
import fs from "fs/promises";
import path from "path";
import tiktoken from "tiktoken";

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
  });

  const response_answer = response.choices[0].message.content;
  const data = response_answer.trim();
  const newFilePath = path.join(
    path.dirname(filepath).replace("test-js", "out-js"),
    path.basename(filepath)
  );
  await fs.mkdir(path.dirname(newFilePath), { recursive: true });
  await fs.writeFile(newFilePath, data, "utf-8");
  console.log(`End comment ${filepath}`);
}

// Асинхронное добавление комментариев к файлам
async function makeComments(files) {
  try {
    const promises = files.map((file) => {
      console.log(`Start comment ${file}`);
      aiResponse(file);
    });
    await Promise.allSettled(promises);
  } catch (err) {
    console.error("Ошибка", err);
  }
}

// Считывание файлов в массив
async function readFiles(dirpath) {
  const entries = await fs.readdir(dirpath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirpath, entry.name);
      if (entry.isDirectory()) {
        const outDirPath = fullPath.replace("test-js", "out-js");
        await fs.mkdir(outDirPath, { recursive: true });
        return await readFiles(fullPath);
      } else {
        return fullPath;
      }
    })
  );
  return files.flat();
}

const files = await readFiles("./test-js/");
//makeComments(files);

async function getTokens(filepath) {
  const encoding = tiktoken.encoding_for_model("gpt-4");
  const file = await fs.readFile(filepath, "utf-8");
  console.log(file.length);
  const tokens = encoding.encode(file);
  console.log(`Tokens - ${tokens.length}`);
}

getTokens("./test-js/systemInitBoth.js");
// вывод в аут +
// научить поправки
// cmd +-?
// макс сайз 138 строчек кода(в среднем), 3kb, 760 токенов, 2900 символов

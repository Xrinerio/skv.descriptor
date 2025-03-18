import Together from "together-ai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { createInterface } from "node:readline/promises"; // Используем промис-версию readline
import { stdin as input, stdout as output } from "node:process";

const together = new Together({ apiKey: process.env.TOGETHER_KEY });

function normalizeCode(code) {
  // Удаляем однострочные комментарии (// ...)
  code = code.replace(/\/\/.*$/gm, "");
  // Удаляем многострочные комментарии (/* ... */)
  code = code.replace(/\/\*[\s\S]*?\*\//g, "");
  // Удаляем все пробелы и переносы строк
  code = code.replace(/\s+/g, "");
  return code;
}

// Запрос к API DeepSeek
async function aiResponse(filepath) {
  const fileContent = await fs.readFile(filepath, "utf-8");

  const sysPrompt = `
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

  const messages = [
    {
      role: "system",
      content: sysPrompt,
    },
    {
      role: "user",
      content: fileContent,
    },
  ];

  const response = await together.chat.completions.create({
    messages: messages,
    model: "deepseek-ai/DeepSeek-V3",
    max_tokens: null,
    temperature: 0.1,
    timeout: null,
    top_p: 0.5,
    top_k: 50,
  });

  const data = response.choices[0].message.content.trim();

  // Путь для выходного файла, всегда используя ./out-js/
  const relativePath = path.relative(process.cwd(), filepath);
  const newFilePath = path.join("./out-js", relativePath);

  await fs.mkdir(path.dirname(newFilePath), { recursive: true });
  await fs.writeFile(newFilePath, data, "utf-8");
  console.log(`End comment ${filepath}`);
  await messages.push({
    role: "system",
    content: data,
  });
  return {
    file: filepath,
    message: messages,
  };
}

async function aiEdit(dialog) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const newmessage = await rl.question("Write edit message: ");
  rl.close();
  dialog.message.push({
    role: "user",
    content: newmessage,
  });
  console.log("Successful");

  const response = await together.chat.completions.create({
    messages: dialog.message,
    model: "deepseek-ai/DeepSeek-V3",
    max_tokens: null,
    temperature: 0.1,
    timeout: null,
    top_p: 0.5,
    top_k: 50,
  });

  const data = response.choices[0].message.content.trim();

  const relativePath = path.relative(process.cwd(), dialog.file);
  const newFilePath = path.join("./out-js", relativePath);

  await fs.writeFile(newFilePath, data, "utf-8");
  console.log(`End comment ${dialog.file}`);
}

async function startEdit(dialogs) {
  // путь к ауту сделать надо
  console.warn("Commented files(write number to edit or 0 to exit):");
  console.log("0 - exit");
  for (let i = 1; i - 1 < dialogs.length; i++) {
    console.log(
      `${i} - \x1B]8;;file://${path.resolve(
        "./out-js",
        dialogs[i - 1].file
      )}\x1B\\${dialogs[i - 1].file}\x1B]8;;\x1B\\`
    );
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const select = await rl.question("Take a number: ");
  rl.close();
  console.log(`You take - ${dialogs[select - 1].file}`);
  aiEdit(dialogs[select - 1]);
}

// Асинхронное добавление комментариев к файлам
async function makeComments(files) {
  const promises = files.map((file) => {
    console.log(`Start comment ${file}`);
    return aiResponse(file);
  });

  const messages = await Promise.all(
    promises.map((p) =>
      p.catch((err) => console.error("Error processing file:", err))
    )
  );

  await fs.writeFile(
    path.join(process.cwd(), "log-last"),
    JSON.stringify(messages, null, 4),
    "utf-8"
  );
  await generateDocs();
  startEdit(messages);
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

//todo
//проверку чтобы в окончательном файле был весь данный
//диалог
//понять куда делся таймаут

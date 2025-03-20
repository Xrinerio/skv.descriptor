import Together from "together-ai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { createInterface } from "node:readline/promises"; // Используем промис-версию readline
import { stdin as input, stdout as output } from "node:process";

const together = new Together({ apiKey: process.env.TOGETHER_KEY });

const sysPrompt = await fs.readFile("prompt.md", "utf-8");

// Запрос к API DeepSeek
async function aiResponse(filepath) {
  const fileContent = await fs.readFile(filepath, "utf-8");

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

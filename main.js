import Together from "together-ai";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { createInterface } from "node:readline/promises";
import { splitLargeFile } from "./div.js";

const together = new Together({ apiKey: process.env.KEY });

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
    timeout: null,
    temperature: 0.1,
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
  console.log("Editing...");

  const response = await together.chat.completions.create({
    messages: dialog.message,
    model: "deepseek-ai/DeepSeek-V3",
    temperature: 0.1,
    max_tokens: null,
    timeout: null,
    top_p: 0.5,
    top_k: 50,
  });

  const data = response.choices[0].message.content.trim();
  const relativePath = path.relative(process.cwd(), dialog.file);
  const newFilePath = path.join("./out-js", relativePath);

  await fs.writeFile(newFilePath, data, "utf-8");
  console.log(`End comment ${dialog.file}`);
  await generateDocs();

  dialog.message.push({
    role: "system",
    content: data,
  });

  return dialog;
}

async function startEdit(dialogs) {
  console.log(dialogs);
  while (true) {
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

    if (select == 0) {
      await fs.rm("./temp", { recursive: true, force: true });
      rl.close();
      break;
    }

    rl.close();
    console.log(`You take - ${dialogs[select - 1].file}`);

    dialogs[select - 1] = await aiEdit(dialogs[select - 1]);
  }
}

// Асинхронное добавление комментариев к файлам
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeComments(files) {
  const promises = [];

  for (let i = 0; i < files.length; i++) {
    console.log(`Start comment ${files[i]}`);

    const promise = aiResponse(files[i])
      .then((result) => result)
      .catch((err) => {
        console.error(`Error processing file: ${files[i]}`, err.message);
        return null; // Return null instead of undefined on error
      });

    promises.push(promise);

    // Enforce 6 requests per minute (pause for 1 minute after every 6 requests)
    if ((i + 1) % 6 === 0) {
      console.log("Rate limit reached, waiting for 1 minute...");
      await delay(60000); // Wait 1 minute
    }
  }

  const messages = (await Promise.all(promises)).filter((msg) => msg !== null); // Filter out null values

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
  await console.log(
    `\x1B]8;;file://${path.resolve(
      "./docs/index.html"
    )}\x1B\\Сompleted documentation\x1B]8;;\x1B\\`
  );
}

// Функция для разделения всех файлов в указанной директории
async function splitFilesInDirectory(inputDir, outputDir) {
  const files = await readFiles(inputDir);

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const relativePath = path.relative(inputDir, file);
    const tempOutputDir = path.join(outputDir, path.dirname(relativePath));

    await fs.mkdir(tempOutputDir, { recursive: true });
    await splitLargeFile(file, tempOutputDir);
  }

  console.log(`All files have been processed and saved to ${outputDir}`);
}

// Удаление папки temp, если она существует
async function removeTempDirectory() {
  const tempDir = "./temp";
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Error removing directory ${tempDir}:`, err.message);
  }
}

await removeTempDirectory();
// Пример использования функции
await splitFilesInDirectory("./inputs-js/", "./temp/");
// Программа берёт файлы с указанной директории
const files = await readFiles("./temp/");

await makeComments(files);

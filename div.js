import fs from "fs";
import path from "path";
import * as babelParser from "@babel/parser";
import { generate } from "@babel/generator";

function splitLargeFile(inputFilePath, outputDir, maxFileSize = 8192) {
  const fileContent = fs.readFileSync(inputFilePath, "utf-8");
  const ast = babelParser.parse(fileContent, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const chunks = [];
  let currentChunk = [];
  let currentChunkSize = 0;

  ast.program.body.forEach((node) => {
    const { code } = generate(node);
    const nodeSize = Buffer.byteLength(code, "utf-8");

    if (node.type === "ClassDeclaration" && nodeSize > maxFileSize) {
      const className = node.id.name;
      const classBody = node.body.body;
      let currentClassChunk = [];
      let currentClassChunkSize = 0;

      classBody.forEach((method) => {
        const { code: methodCode } = generate(method);
        const methodSize = Buffer.byteLength(methodCode, "utf-8");

        if (currentClassChunkSize + methodSize > maxFileSize) {
          if (currentClassChunk.length > 0) {
            const classChunkAst = {
              type: "ClassDeclaration",
              id: { ...node.id },
              superClass: node.superClass,
              body: {
                type: "ClassBody",
                body: currentClassChunk,
              },
            };
            chunks.push([classChunkAst]);
          }

          const methodAssignment = {
            type: "ExpressionStatement",
            expression: {
              type: "AssignmentExpression",
              operator: "=",
              left: {
                type: "MemberExpression",
                object: {
                  type: "MemberExpression",
                  object: { type: "Identifier", name: className },
                  property: { type: "Identifier", name: "prototype" },
                },
                property: { type: "Identifier", name: method.key.name },
              },
              right: {
                type: "FunctionExpression",
                id: null,
                params: method.params,
                body: method.body,
                async: method.async,
                generator: method.generator,
              },
            },
          };
          chunks.push([methodAssignment]);

          currentClassChunk = [];
          currentClassChunkSize = 0;
        } else {
          currentClassChunk.push(method);
          currentClassChunkSize += methodSize;
        }
      });

      if (currentClassChunk.length > 0) {
        const classChunkAst = {
          type: "ClassDeclaration",
          id: { ...node.id },
          superClass: node.superClass,
          body: {
            type: "ClassBody",
            body: currentClassChunk,
          },
        };
        chunks.push([classChunkAst]);
      }
    } else if (currentChunkSize + nodeSize > maxFileSize) {
      chunks.push(currentChunk);
      currentChunk = [node];
      currentChunkSize = nodeSize;
    } else {
      currentChunk.push(node);
      currentChunkSize += nodeSize;
    }
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const inputFileName = path.basename(
    inputFilePath,
    path.extname(inputFilePath)
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  chunks.forEach((chunk, index) => {
    const chunkAst = {
      type: "File",
      program: {
        type: "Program",
        body: chunk,
        sourceType: "module",
      },
    };

    const { code } = generate(chunkAst, {});
    const outputFilePath = path.join(
      outputDir,
      `${inputFileName}_${index + 1}.js`
    );
    fs.writeFileSync(outputFilePath, code, "utf-8");
    console.log(`Chunk ${index + 1} written to ${outputFilePath}`);
  });

  console.log("File splitting completed.");
}

const inputFilePath = "inputs-js/query.js";
const outputDir = "test-out/";
splitLargeFile(inputFilePath, outputDir);

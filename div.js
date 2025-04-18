import fs from "fs";
import path from "path";
import * as babelParser from "@babel/parser";
import { generate } from "@babel/generator";

export function splitLargeFile(
  inputFilePath,
  outputDir,
  maxFileSize = 1024 * 3
) {
  const fileContent = fs.readFileSync(inputFilePath, "utf-8");
  const ast = babelParser.parse(fileContent, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const chunks = [];
  let currentChunk = [];
  let currentChunkSize = 0;
  let classCreated = new Set();

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
            if (!classCreated.has(className)) {
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
              classCreated.add(className);
            } else {
              currentClassChunk.forEach((method) => {
                const { code: methodCode } = generate(method);
                const methodSize = Buffer.byteLength(methodCode, "utf-8");

                if (currentChunkSize + methodSize > maxFileSize) {
                  if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentChunkSize = 0;
                  }
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

                currentChunk.push(methodAssignment);
                currentChunkSize += methodSize;
              });

              if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
              }
            }
          }
          currentClassChunk = [];
          currentClassChunkSize = 0;
        } else {
          currentClassChunk.push(method);
          currentClassChunkSize += methodSize;
        }
      });

      if (currentClassChunk.length > 0) {
        if (!classCreated.has(className)) {
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
          classCreated.add(className);
        } else {
          currentClassChunk.forEach((method) => {
            const { code: methodCode } = generate(method);
            const methodSize = Buffer.byteLength(methodCode, "utf-8");

            if (currentChunkSize + methodSize > maxFileSize) {
              if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentChunkSize = 0;
              }
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

            currentChunk.push(methodAssignment);
            currentChunkSize += methodSize;
          });

          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
          }
        }
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
  });

  console.log("File splitting completed.");
}

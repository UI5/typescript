import fs from "fs";
import path from "path";
import ts from "typescript";
import log from "loglevel";
import { generateInterfaces } from "../../interfaceGenerationHelper";
import { getAllKnownGlobals, GlobalToModuleMapping } from "../../typeScriptEnvironment";
import { getProgramInfo } from "../../generateTSInterfacesAPI";

const testCasesDir = path.resolve(__dirname);

const standardTsConfig: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  strict: true,
  moduleResolution: ts.ModuleResolutionKind.Node16,
  esModuleInterop: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
};

describe("Single Testcases", () => {
  beforeAll(() => {
    jest.spyOn(log, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    // Restore the original console.warn method
    jest.restoreAllMocks();
  });

  fs.readdirSync(testCasesDir).forEach((testCase) => {
    const testCaseDir = path.join(testCasesDir, testCase);
    // abort if not a directory
    if (!fs.lstatSync(testCaseDir).isDirectory()) {
      return;
    }

    function parseConfig(tsConfigPath: string) {
      let config: ts.CompilerOptions;
      if (fs.existsSync(tsConfigPath)) {
        const json: unknown = ts.parseConfigFileTextToJson(tsConfigPath, fs.readFileSync(tsConfigPath).toString()).config || {};
        config = ts.parseJsonConfigFileContent(json, ts.sys, path.dirname(tsConfigPath)).options;
      } else {
        config = {...standardTsConfig};
      }
      config.baseUrl = testCaseDir;
      return config;
    }

    test(`Interface generation for ${testCase}`, async () => {
      // setup TypeScript program
      const tsConfigPath = path.join(testCaseDir, "tsconfig.json");
      const tsFiles = fs
        .readdirSync(testCaseDir)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
        .map((file) => path.join(testCaseDir, file));

      const program = ts.createProgram(tsFiles, parseConfig(tsConfigPath));
      const typeChecker = program.getTypeChecker();
      const programInfo = getProgramInfo(program, typeChecker);
      const allKnownGlobals: GlobalToModuleMapping = getAllKnownGlobals(typeChecker);

      const sourceFiles = program.getSourceFiles().filter((sourceFile) => {
        return !sourceFile.isDeclarationFile && path.basename(sourceFile.fileName) !== "library.ts";
      });

      const runGenerateInterfaces = async (
        sourceFile: ts.SourceFile,
      ): Promise<string> => {
        return new Promise((resolve) => {
          const resultProcessor = (
            sourceFileName: string,
            className: string,
            interfaceText: string,
          ) => {
            resolve(interfaceText);
          };

          generateInterfaces(
            sourceFile,
            typeChecker,
            Object.assign({}, programInfo.allKnownLocalExports, allKnownGlobals),
            resultProcessor,
          );
        });
      };

      for (const sourceFile of sourceFiles) {
        const generatedInterfaces = await runGenerateInterfaces(sourceFile);

        const expectedOutputPath = sourceFile.fileName.replace(
          /\.ts$/,
          ".gen.d.ts",
        );

        if (!fs.existsSync(expectedOutputPath)) {
          // write the generated output to the file if it does not exist
          fs.writeFileSync(expectedOutputPath, generatedInterfaces);
          console.log(`Generated output written to ${expectedOutputPath}`);
        } else {
          const expectedOutput = fs.readFileSync(expectedOutputPath, "utf-8");
          expect(generatedInterfaces).toEqual(expectedOutput);
        }
      }
    }, 15000); // typical run takes a second, so increase the 5000 ms default timeout to be safe
  });
});

const { readdirSync, readFileSync } = require("fs");
const { resolve, relative } = require("path");
const { forEach, map } = require("lodash");
const { expect } = require("chai");
const { emptyDirSync } = require("fs-extra");

const { genDtsToDir } = require("../lib/utils/dts-gen-wrapper");

describe("The OpenUI5 d.ts snapshots", async () => {
  const projectRootDir = resolve(__dirname, "..");
  const apiJsonDir = resolve(__dirname, "..", "input-sdk");
  const snapshotsDir = resolve(projectRootDir, "output-dts");
  const tempOutDir = resolve(__dirname, "./output-dts-temp");

  const apiJsonSDKFiles = readdirSync(apiJsonDir);
  // Only interested in the actual api.json files
  const relevantApiJsonSDKFiles = apiJsonSDKFiles.filter((_) => _.endsWith(".api.json"));
  const relevantDTSFiles = map(relevantApiJsonSDKFiles, (_) =>
    _.replace(".api.json", ".d.ts")
  );

  before( function () {
    this.timeout(60000);
    return genDtsToDir({ inputDir: apiJsonDir, outputDir: tempOutDir }); // return the Promise to signal the test has to wait
  });

  forEach(relevantDTSFiles, (_) => {
    it(`"${_}" is up-to-date`, () => {
      const snapshotPath = resolve(snapshotsDir, _);
      const reGenPath = resolve(tempOutDir, _);
      const snapshotText = readFileSync(snapshotPath, "UTF-8");
      const reGenText = readFileSync(reGenPath, "UTF-8");
      expect(
        snapshotText === reGenText,
        `${relative(projectRootDir, snapshotPath)} !== ${relative(
          projectRootDir,
          reGenPath
        )} you may need to run the "re-generate" script`
      ).to.be.true;
    });
  });

  after(() => {
    emptyDirSync(tempOutDir);
  });
});

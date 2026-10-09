import * as path from "path";
import { readdirSync, readFileSync, statSync } from "fs";

export function discoverTypes(): { typeRoots: string[]; types: string[] } {
  const declaredTypes = new Set<string>();
  let dir = process.cwd();
  while (true) {
    try {
      const pkg = JSON.parse(
        readFileSync(path.join(dir, "package.json"), "utf8"),
      );
      for (const deps of [pkg.dependencies, pkg.devDependencies]) {
        if (deps) {
          for (const name of Object.keys(deps)) {
            if (name.startsWith("@types/")) {
              declaredTypes.add(name.slice("@types/".length));
            }
          }
        }
      }
      break;
    } catch {
      // no package.json at this level
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const typeRoots: string[] = [];
  const types = new Set<string>();
  dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, "node_modules", "@types");
    try {
      for (const entry of readdirSync(candidate, { withFileTypes: true })) {
        if (!declaredTypes.has(entry.name)) {
          continue;
        }
        // Accept both real directories and symlinks that resolve to
        // directories (pnpm uses symlinks in node_modules).
        const isDir =
          entry.isDirectory() ||
          (entry.isSymbolicLink() &&
            statSync(path.join(candidate, entry.name)).isDirectory());
        if (isDir) {
          types.add(entry.name);
        }
      }
      typeRoots.push(candidate);
    } catch {
      // doesn't exist at this level
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { typeRoots, types: [...types] };
}

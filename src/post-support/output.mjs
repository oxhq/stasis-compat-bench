import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256File } from "../shared/io.mjs";
import { serializePostSupportArtifact } from "./artifact-privacy.mjs";

export async function readExplicitJsonInput(value, label) {
  const absolutePath = await assertRealFile(value, label);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

export async function writeExplicitPostSupportOutput(value, configuredPath, label) {
  const absolutePath = await assertFreshPostSupportOutputPath(configuredPath, label);
  const bytes = Buffer.from(serializePostSupportArtifact(value), "utf8");
  await writeFile(absolutePath, bytes, { flag: "wx" });
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(absolutePath), absolutePath)) {
    throw new Error(`${label} was not written as one real regular file`);
  }
  return Object.freeze({
    written: true,
    bytes: metadata.size,
    sha256: await sha256File(absolutePath),
  });
}

export async function assertFreshPostSupportOutputPath(configuredPath, label) {
  const absolutePath = explicitAbsolutePath(configuredPath, label);
  await assertRealDirectory(path.dirname(absolutePath), `${label} parent`);
  try {
    await lstat(absolutePath);
    throw new Error(`${label} must be one fresh path that does not exist`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return absolutePath;
}

export function requiredEnvironmentPath(name, environment = process.env) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return explicitAbsolutePath(value, name);
}

async function assertRealFile(value, label) {
  const absolutePath = explicitAbsolutePath(value, label);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(absolutePath), absolutePath)) {
    throw new Error(`${label} must be one real regular file`);
  }
  return absolutePath;
}

async function assertRealDirectory(value, label) {
  const metadata = await lstat(value);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(value), value)) {
    throw new Error(`${label} must be one real directory`);
  }
}

function explicitAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

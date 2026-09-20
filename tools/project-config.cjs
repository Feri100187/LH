"use strict";

const fs = require("node:fs");
const path = require("node:path");
const EXPECTED_LAYA_VERSION = "3.4.1";

function getProjectRoot() { return path.resolve(__dirname, ".."); }

/** Read data from the installed Electron archive; never execute code from it. */
function readAsarFile(archive, relativePath) {
    const fd = fs.openSync(archive, "r");
    try {
        const prefix = Buffer.alloc(16);
        fs.readSync(fd, prefix, 0, 16, 0);
        const headerBytes = prefix.readUInt32LE(4);
        const jsonBytes = prefix.readUInt32LE(12);
        if (jsonBytes < 2 || jsonBytes > 32 * 1024 * 1024 || jsonBytes + 8 > headerBytes)
            throw new Error(`Invalid ASAR header: ${archive}`);
        const headerBuffer = Buffer.alloc(jsonBytes);
        fs.readSync(fd, headerBuffer, 0, jsonBytes, 16);
        let entry = JSON.parse(headerBuffer.toString("utf8"));
        for (const part of relativePath.split("/")) entry = entry.files?.[part];
        if (!entry || entry.offset === undefined || !Number.isSafeInteger(entry.size))
            throw new Error(`ASAR file missing: ${relativePath}`);
        const result = Buffer.alloc(entry.size);
        fs.readSync(fd, result, 0, result.length, 8 + headerBytes + Number(entry.offset));
        return result;
    } finally { fs.closeSync(fd); }
}

function inspectLayaIde(candidate) {
    let root = path.resolve(candidate);
    if (path.extname(root).toLowerCase() === ".exe") root = path.dirname(root);
    if (path.basename(root).toLowerCase() === "resources") root = path.dirname(root);
    const executable = path.join(root, process.platform === "win32" ? "LayaAirIDE.exe" : "LayaAirIDE");
    const resources = path.join(root, "resources");
    const archive = path.join(resources, "app.asar");
    if (!fs.existsSync(executable) || !fs.existsSync(archive)) return null;
    const manifest = JSON.parse(readAsarFile(archive, "package.json").toString("utf8"));
    if (manifest.version !== EXPECTED_LAYA_VERSION)
        throw new Error(`LayaAir ${EXPECTED_LAYA_VERSION} required; found ${manifest.version} at ${root}`);
    const engineLibs = path.join(resources, "engine", "libs");
    if (!fs.existsSync(path.join(engineLibs, "laya.core.js")))
        throw new Error(`Installed LayaAir engine source is missing: ${engineLibs}`);
    return { root, executable, resources, engineLibs, version: manifest.version };
}

function resolveLayaIde({ idePath, required = false } = {}) {
    let local = {};
    const localFile = path.join(getProjectRoot(), "project.local.json");
    if (fs.existsSync(localFile)) local = JSON.parse(fs.readFileSync(localFile, "utf8"));
    const configured = idePath || process.env.LAYA_IDE_PATH || local.layaIdePath;
    if (configured) {
        const ide = inspectLayaIde(configured);
        if (!ide) throw new Error(`LayaAir IDE not found at ${configured}. Pass --ide or set LAYA_IDE_PATH.`);
        return ide;
    }
    const candidates = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]) {
        if (base) candidates.push(path.join(base, "LayaAirIDE"), path.join(base, "Programs", "LayaAirIDE"));
    }
    for (const candidate of [...new Set(candidates)]) {
        const ide = inspectLayaIde(candidate);
        if (ide) return ide;
    }
    if (required) throw new Error(`LayaAir ${EXPECTED_LAYA_VERSION} is not configured. Pass --ide <installation> or set LAYA_IDE_PATH.`);
    return null;
}

module.exports = { EXPECTED_LAYA_VERSION, getProjectRoot, resolveLayaIde, readAsarFile };

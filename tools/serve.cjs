"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const project = path.resolve(__dirname, "..");
let root = path.join(project, "release/web"), port = Number(process.env.PORT || 18765), probe = false, m01Probe = false;
for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (key === "--probe") { probe = true; continue; }
    if (key === "--m01-probe") { m01Probe = true; continue; }
    if (!["--root", "--port"].includes(key) || !process.argv[i + 1]) throw new Error(`Unknown/incomplete argument: ${key}`);
    const value = process.argv[++i];
    if (key === "--root") root = path.resolve(project, value); else port = Number(value);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be 1..65535");
if (!fs.existsSync(path.join(root, "index.html"))) throw new Error(`No built index.html at ${root}; run npm run build first.`);
const probeFile = path.join(project, "tools/testing/runtime-probe.js");
const m01File = path.join(project, "tools/testing/m01-runtime.js");
const m01Scripts = ["m01-runtime.js", "m01-routes.js", "m01-input-timing.js"]
    .map(name => ({ url: "/__baseline__/" + name, file: path.join(project, "tools/testing", name) }))
    .filter(item => fs.existsSync(item.file));
if (probe && !fs.existsSync(probeFile)) throw new Error("Baseline probe script is missing");
if (m01Probe && !fs.existsSync(m01File)) throw new Error("M0.1 probe script is missing");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
    ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };
const server = http.createServer((req, res) => {
    if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400); res.end(); return; }
    let file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (probe && pathname === "/__baseline__/runtime-probe.js") file = probeFile;
    else if (m01Probe && m01Scripts.some(item => item.url === pathname)) file = m01Scripts.find(item => item.url === pathname).file;
    else if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (error, stat) => {
        if (error || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        if (req.method === "HEAD") { res.end(); return; }
        if ((probe || m01Probe) && file === path.join(root, "index.html")) {
            // Test instrumentation exists only in this response. Build files and normal game delivery stay unchanged.
            const html = fs.readFileSync(file, "utf8");
            const scripts = (probe ? '<script defer src="/__baseline__/runtime-probe.js"></script>' : '')
                + (m01Probe ? m01Scripts.map(item => `<script defer src="${item.url}"></script>`).join("") : '');
            res.end(html.replace(/<head([^>]*)>/i, '<head$1>' + scripts));
        } else fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
    });
});
server.on("error", error => {
    console.error(error.code === "EADDRINUSE" ? `端口 ${port} 已占用；请选择另一 --port，以免误测旧版本。` : error);
    process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ url: `http://127.0.0.1:${port}`, root, probe, m01Probe }, null, 2)));

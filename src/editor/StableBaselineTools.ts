/** Editor/CLI-only commands. This class is never attached to a game scene. */
@IEditorEnv.regClass()
export class StableBaselineTools {
    static async build(requestPath: string) {
        const fs = IEditorEnv.require("fs");
        const path = IEditorEnv.require("path");
        const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
        const result: any = {
            runId: request.runId, category: "build", startedAt: new Date().toISOString(),
            project: EditorEnv.projectPath, engineVersion: EditorEnv.appVersion,
            platform: request.platform, output: request.output, status: "FAIL"
        };
        try {
            const normalize = (value: string) => path.sep === "\\" ? path.resolve(value).toLowerCase() : path.resolve(value);
            if (!request.runId || typeof request.runId !== "string") throw new Error("A fresh runId is required.");
            if (normalize(request.project) !== normalize(EditorEnv.projectPath))
                throw new Error("CLI loaded a different project than requested.");
            if (EditorEnv.appVersion !== "3.4.1") throw new Error("Only LayaAir 3.4.1 is accepted.");
            if (request.expectedEngineVersion !== "3.4.1") throw new Error("Request engine version does not match the build helper.");
            if (request.platform !== "web" && request.platform !== "single-html") throw new Error("Unsupported baseline build platform.");
            await EditorEnv.assetMgr.flushChanges();
            await EditorEnv.assetMgr.waitForAssetsReady(["Scene.ls", "LingshuiGame.ls"]);
            const task = IEditorEnv.BuildTask.start(request.platform, request.output, {
                onSetup(task) {
                    Object.assign(task.config, request.options);
                }
            });
            result.nativeStatus = await task.waitForCompletion();
            result.output = task.destPath;
            // LayaAir 3.4.1 BuildTaskStatus: Running=0, Success=1, Failed=2.
            if (result.nativeStatus !== 1) throw new Error(`Build task status ${result.nativeStatus}`);
            result.status = "PASS";
        } catch (error) {
            result.error = error instanceof Error ? error.stack : String(error);
        } finally {
            result.finishedAt = new Date().toISOString();
            fs.writeFileSync(request.result, JSON.stringify(result, null, 2), { encoding: "utf8", flag: "wx" });
        }
    }

    static async importReady(requestPath: string) {
        const fs = IEditorEnv.require("fs");
        const path = IEditorEnv.require("path");
        const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
        const result: any = { runId: request.runId, category: "asset_import", engineVersion: EditorEnv.appVersion,
            project: EditorEnv.projectPath, status: "FAIL", startedAt: new Date().toISOString() };
        try {
            const normalize = (value: string) => path.sep === "\\" ? path.resolve(value).toLowerCase() : path.resolve(value);
            if (!request.runId || normalize(request.project) !== normalize(EditorEnv.projectPath)) throw new Error("Invalid import request project/runId.");
            if (EditorEnv.appVersion !== "3.4.1") throw new Error("Only LayaAir 3.4.1 is accepted.");
            if (request.expectedEngineVersion !== "3.4.1") throw new Error("Request engine version does not match the import helper.");
            await EditorEnv.assetMgr.flushChanges();
            await EditorEnv.assetMgr.waitForAssetsReady(request.assetPaths);
            result.status = "PASS";
        } catch (error) { result.error = error instanceof Error ? error.stack : String(error); }
        result.finishedAt = new Date().toISOString();
        fs.writeFileSync(request.result, JSON.stringify(result, null, 2), { encoding: "utf8", flag: "wx" });
    }
}

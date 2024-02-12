import path from "path";
import fs from "fs/promises";
import esbuild, { BuildOptions, BuildResult } from "esbuild";
import pulumi from "@pulumi/pulumi";
import { WorkerArgs } from "../components/cloudflare//worker.js";
import { existsAsync } from "../util/fs.js";

export async function build(
  name: string,
  input: pulumi.Unwrap<WorkerArgs> & {
    links?: {
      name: string;
      value: string;
    }[];
  },
) {
  const out = path.join($cli.paths.work, "artifacts", `${name}-src`);
  const sourcemapOut = path.join($cli.paths.work, "artifacts", `${name}-map`);
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  await fs.mkdir(sourcemapOut, { recursive: true });

  if (!(await existsAsync(input.handler)))
    return {
      type: "error" as const,
      errors: [`Could not find file for handler "${input.handler}"`],
    };

  const nodejs = input.nodejs || {};
  const relative = path.relative($cli.paths.root, path.resolve(input.handler));
  const target = path.join(
    out,
    !relative.startsWith("..") && !path.isAbsolute(input.handler!)
      ? relative
      : "",
    "index.mjs",
  );

  // Rebuilt using existing esbuild context
  const links = Object.fromEntries(
    input.links?.map((item) => [item.name, item.value]) || [],
  );
  const options: BuildOptions = {
    entryPoints: [path.resolve(input.handler)],
    platform: "node",
    loader: nodejs.loader,
    keepNames: true,
    bundle: true,
    logLevel: "silent",
    define: {
      $SST_LINKS: JSON.stringify({}),
    },
    metafile: true,
    format: "esm",
    target: "esnext",
    mainFields: ["module", "main"],
    banner: {
      js: [
        `globalThis.$SST_LINKS = ${JSON.stringify(links)};`,
        nodejs.banner || "",
      ].join("\n"),
    },
    outfile: target,
    // always generate sourcemaps in local
    // never generate sourcemaps if explicitly false
    // otherwise generate sourcemaps
    sourcemap: nodejs.sourcemap === false ? false : true,
    minify: nodejs.minify,
    ...nodejs.esbuild,
  };
  const ctx = await esbuild.context(options);

  try {
    const result = await ctx.rebuild();

    ctx.dispose();

    const moveSourcemap = async () => {
      if (nodejs.sourcemap) return;

      const map = Object.keys(result.metafile?.outputs || {}).find((item) =>
        item.endsWith(".map"),
      );
      if (!map) return;

      const oldPath = path.resolve($cli.paths.work, "artifacts", map);
      const newPath = path.join(sourcemapOut, path.basename(map));
      await fs.rename(oldPath, newPath);
      return newPath;
    };

    return {
      type: "success" as const,
      handler: target,
      sourcemap: await moveSourcemap(),
    };
  } catch (ex: any) {
    const result = ex as BuildResult;
    if ("errors" in result) {
      return {
        type: "error" as const,
        errors: result.errors.flatMap((x) => [
          console.log(x.text),
          x.location?.file || "",
          console.log(x.location?.line, "│", x.location?.lineText),
        ]),
      };
    }

    return {
      type: "error" as const,
      errors: [ex.toString()],
    };
  }
}

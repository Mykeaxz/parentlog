// Build ParentLog → dist/ (prod) or dist-test/ (adds the mock PowerSchool host so Playwright can test without a permission prompt)
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const mode = process.argv[2] === "test" ? "test" : "prod";
const out = mode === "test" ? "dist-test" : "dist";

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/content`, { recursive: true });
mkdirSync(`${out}/panel`, { recursive: true });
mkdirSync(`${out}/icons`, { recursive: true });

await build({
  entryPoints: {
    background: "src/background.ts",
    "content/gmail": "src/content/gmail.ts",
    "content/outlook": "src/content/outlook.ts",
    "content/powerschool": "src/content/powerschool.ts",
    "panel/panel": "src/panel/panel.ts",
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome116",
  minify: false,
  sourcemap: false,
  logLevel: "info",
});

cpSync("src/content/mail.css", `${out}/content/mail.css`);
cpSync("src/content/powerschool.css", `${out}/content/powerschool.css`);
cpSync("src/panel/panel.html", `${out}/panel/panel.html`);
cpSync("src/panel/panel.css", `${out}/panel/panel.css`);
cpSync("icons", `${out}/icons`, { recursive: true });

const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
if (mode === "test") {
  manifest.name += " (TEST BUILD)";
  manifest.host_permissions.push("https://ps.mockdistrict.org/*");
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`built → ${out}/ (${mode})`);

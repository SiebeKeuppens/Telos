// Audits that every STATIC t('key') reference in src resolves in the English
// resources (dynamic template-literal keys are covered by browser QA).
// Run: node scripts/audit-i18n.mjs
import fs from "node:fs";

const glob = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? glob(`${d}/${e.name}`) : `${d}/${e.name}`));

const files = glob("src")
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .filter((f) => !f.includes("i18n/locales"));

const base = "src/i18n/locales/en/";
const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  );

const resources = {};
for (const ns of fs.readdirSync(base)) {
  resources[ns.replace(".json", "")] = new Set(
    flat(JSON.parse(fs.readFileSync(base + ns, "utf8"))),
  );
}

let missing = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  // A file may declare several hooks (sub-components with different
  // namespaces) — a key passes if it resolves in ANY declared ns or common.
  const declared = [...src.matchAll(/useTranslation\(\s*['"]([a-z]+)['"]/g)].map(
    (m) => m[1],
  );
  const candidates = [...new Set([...declared, "common"])];
  for (const m of src.matchAll(/[^a-zA-Z.]t\(\s*['"`]([a-zA-Z0-9_.:]+)['"`]/g)) {
    let key = m[1];
    let nss = candidates;
    if (key.includes(":")) {
      const [ns, rest] = key.split(":");
      nss = [ns];
      key = rest;
    }
    const present = (set) =>
      set && (set.has(key) || set.has(`${key}_one`) || set.has(`${key}_other`));
    if (!nss.some((ns) => present(resources[ns]))) {
      console.log(f, "MISSING", `${nss.join("|")}:${key}`);
      missing++;
    }
  }
}
console.log(missing === 0 ? "ALL STATIC KEYS RESOLVE" : `MISSING: ${missing}`);
process.exit(missing === 0 ? 0 : 1);

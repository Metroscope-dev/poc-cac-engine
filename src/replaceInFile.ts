import fs from "fs";

export function copyAndReplace(
  srcFile: string,
  dstFile: string,
  replacements: { token: string; replacement: string }[]
) {
  let data = fs.readFileSync(srcFile, "utf8");
  for (const { token, replacement } of replacements) {
    data = data.replace(token, replacement);
  }
  fs.writeFileSync(dstFile, data, "utf8");
}

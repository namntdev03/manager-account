// Sinh src/license.js từ file LICENSE để app hiển thị giấy phép ngay trong giao diện (chạy offline).
import { readFileSync, writeFileSync } from "node:fs";

const text = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
const out =
  "// Tự sinh từ LICENSE bằng scripts/sync-license.mjs - không sửa tay\n" +
  "window.APP_LICENSE = " + JSON.stringify(text) + ";\n";
writeFileSync(new URL("../src/license.js", import.meta.url), out);
console.log("Đã đồng bộ LICENSE -> src/license.js");

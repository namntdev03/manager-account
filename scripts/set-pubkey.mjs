// Ghi public key (tạo bằng `pnpm tauri signer generate`) vào src-tauri/tauri.conf.json
// Dùng: node scripts/set-pubkey.mjs [đường-dẫn-file-.pub]
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const pubPath = process.argv[2] || join(homedir(), ".tauri", "manager-account.key.pub");
const pub = readFileSync(pubPath, "utf8").trim();
if (!pub) throw new Error("File public key rỗng: " + pubPath);

const confUrl = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const conf = JSON.parse(readFileSync(confUrl, "utf8"));
conf.plugins ??= {};
conf.plugins.updater ??= {};
conf.plugins.updater.pubkey = pub;
writeFileSync(confUrl, JSON.stringify(conf, null, 2) + "\n");
console.log("Đã ghi public key vào src-tauri/tauri.conf.json");

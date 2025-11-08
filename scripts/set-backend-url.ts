import fs from "fs";
import os from "os";
import path from "path";

const port = process.argv[2] || "8000";

// Get the first non-internal IPv4 address
function getLocalNetworkIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) {
        return alias.address;
      }
    }
  }
  return "127.0.0.1";
}

const ip = getLocalNetworkIP();
const backendUrl = `http://${ip}:${port}`;
const envFile = path.resolve(process.cwd(), ".env.local");

let envContent = "";
if (fs.existsSync(envFile)) {
  envContent = fs.readFileSync(envFile, "utf-8");
  envContent = envContent.replace(/^VITE_BACKEND_URL=.*$/m, `VITE_BACKEND_URL=${backendUrl}`);
  if (!envContent.includes("VITE_BACKEND_URL=")) {
    envContent += `\nVITE_BACKEND_URL=${backendUrl}`;
  }
} else {
  envContent = `VITE_BACKEND_URL=${backendUrl}`;
}

fs.writeFileSync(envFile, envContent);
console.log(`✅ VITE_BACKEND_URL set to ${backendUrl}`);
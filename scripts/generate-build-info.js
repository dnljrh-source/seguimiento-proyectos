const fs = require("fs");
const path = require("path");

const info = {
  buildDate: new Date().toISOString(),
};

const target = path.join(__dirname, "..", "src", "build-info.json");
fs.writeFileSync(target, JSON.stringify(info, null, 2) + "\n");
console.log("build-info.json actualizado:", info.buildDate);

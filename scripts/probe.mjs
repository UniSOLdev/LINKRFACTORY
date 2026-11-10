import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: false,
  defaultViewport: { width: 1440, height: 900 },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--window-size=1440,900"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE", msg.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) console.log("HTTP", response.status(), response.url());
});
await page.goto("http://127.0.0.1:3456", { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
const info = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("[data-testid]")].map((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      id: node.getAttribute("data-testid"),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      y: Math.round(rect.y),
      hidden: style.display === "none" || rect.width === 0,
    };
  });
  return {
    canvas: !!document.querySelector("canvas"),
    map: !!document.querySelector('[data-testid="factory-map"]'),
    nodes: nodes.filter((node) => node.id?.startsWith("building") || node.id === "start-run" || node.id === "workflow-status" || node.id === "simulation-banner"),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "/tmp/linkr-probe.png" });
await browser.close();

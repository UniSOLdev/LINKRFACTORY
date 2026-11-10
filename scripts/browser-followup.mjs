import puppeteer from "puppeteer-core";

const base = "http://127.0.0.1:3456";
const media = "/cursor/stores/bc-01a1c76d-fbac-7e3f-a3ad-dffdaa5fca68/media";

async function clickVisible(page, selector) {
  const handle = await page.evaluateHandle((sel) => {
    const nodes = [...document.querySelectorAll(sel)];
    return (
      nodes.find((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      }) ?? null
    );
  }, selector);
  const element = handle.asElement();
  if (!element) throw new Error(`No visible ${selector}`);
  await element.click();
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--window-size=1440,900"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));

try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    const response = await fetch("/api/factory/reset", { method: "POST" });
    if (!response.ok) throw new Error("reset failed");
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="start-run"]');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const frame = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const box = canvas?.getBoundingClientRect();
    const buildings = [...document.querySelectorAll("[data-testid^='building-']")].map((node) => {
      const rect = node.getBoundingClientRect();
      const inside = box ? rect.x > box.x && rect.right < box.right && rect.y > box.y && rect.bottom < box.bottom : false;
      return { id: node.getAttribute("data-testid"), inside, x: Math.round(rect.x), y: Math.round(rect.y) };
    });
    return { canvas: Boolean(canvas), buildings };
  });
  console.log(JSON.stringify(frame, null, 2));
  const missing = ["intake", "research", "qualification", "creative", "approval", "outreach", "crm", "delivery"].filter(
    (id) => !frame.buildings.some((building) => building.id === `building-${id}` && building.inside),
  );
  if (missing.length) console.log("OFFSCREEN", missing.join(","));
  await page.screenshot({ path: `${media}/desktop-overview.png` });

  await clickVisible(page, '[data-testid="building-research"], [data-testid="station-chip-research"]');
  await page.waitForFunction(() => /Research Laboratory/.test(document.body.innerText));
  await page.screenshot({ path: `${media}/desktop-selected.png` });

  await clickVisible(page, '[data-testid="start-run"]');
  await page.waitForFunction(() => /running|blocked/i.test(document.querySelector('[data-testid="workflow-status"]')?.textContent ?? ""), { timeout: 10000 });
  const started = await page.evaluate(async () => {
    const body = await (await fetch("/api/factory")).json();
    return body.jobs.map((job) => `${job.kind}:${job.status}`);
  });
  console.log("started", started);
  await page.goto("about:blank");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="workflow-status"]');
  const resumed = await page.evaluate(async () => {
    const body = await (await fetch("/api/factory", { cache: "no-store" })).json();
    return { status: body.workflow.status, jobs: body.jobs.map((job) => `${job.kind}:${job.status}`), lead: body.lead?.stage };
  });
  console.log("resumed", JSON.stringify(resumed));
  if (resumed.status === "idle") throw new Error("Run did not continue on the server");
  await page.screenshot({ path: `${media}/desktop-resumed.png` });

  await clickVisible(page, '[data-testid="station-chip-creative"]');
  await clickVisible(page, '[data-testid="upgrade-station"]');
  await page.waitForFunction(() => {
    const level = [...document.querySelectorAll('[data-testid="station-level"]')].find((node) => node.getBoundingClientRect().height > 0);
    return level?.textContent?.includes("2");
  }, { timeout: 10000 });
  const upgraded = await page.evaluate(async () => {
    const body = await (await fetch("/api/factory")).json();
    const creative = body.stations.find((station) => station.id === "creative");
    const mission = body.missions.find((item) => item.id === "improve-capacity");
    return { level: creative.level, throughput: creative.throughputPerMinute, mission: Boolean(mission.completedAt), verified: creative && body.resources.every((resource) => resource.verified === false) };
  });
  console.log("upgraded", JSON.stringify(upgraded));
  if (upgraded.level !== 2 || !upgraded.mission) throw new Error("Upgrade did not change capacity");
  await page.screenshot({ path: `${media}/desktop-upgraded.png` });

  await page.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: `${media}/mobile-factory.png` });
  console.log("followup-ok");
} catch (error) {
  await page.screenshot({ path: `${media}/desktop-failure.png` }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

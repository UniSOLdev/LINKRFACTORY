import puppeteer from "puppeteer-core";

const base = process.env.LINKR_URL ?? "http://127.0.0.1:3456";
const media = "/cursor/stores/bc-01a1c76d-fbac-7e3f-a3ad-dffdaa5fca68/media";
const shots = [];

function log(message) {
  console.log(`[browser] ${message}`);
}

async function shot(page, name) {
  const path = `${media}/${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
  log(`saved ${path}`);
}

async function visibleHandle(page, selector) {
  const handle = await page.evaluateHandle((sel) => {
    const nodes = [...document.querySelectorAll(sel)];
    return (
      nodes.find((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }) ?? null
    );
  }, selector);
  const element = handle.asElement();
  if (!element) throw new Error(`No visible element for ${selector}`);
  return element;
}

async function clickVisible(page, selector) {
  const element = await visibleHandle(page, selector);
  await element.click();
}

async function waitStatus(page, text, timeout = 25000) {
  await page.waitForFunction(
    (needle) => {
      const node = document.querySelector('[data-testid="workflow-status"]');
      return node?.textContent?.toLowerCase().includes(needle);
    },
    { timeout },
    text,
  );
}

async function openFactory(page, viewport) {
  await page.setViewport(viewport);
  await page.goto(base, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector('[data-testid="simulation-banner"]');
  await page.waitForSelector("canvas, [data-testid='factory-map']", { timeout: 15000 });
  await new Promise((resolve) => setTimeout(resolve, 800));
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=1440,900",
  ],
});

const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(message.text());
});

try {
  await openFactory(page, { width: 1440, height: 900 });
  const mode = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector("canvas")),
    map: Boolean(document.querySelector("[data-testid='factory-map']")),
    buildings: [...document.querySelectorAll("[data-testid^='building-']")].map((node) => node.getAttribute("data-testid")),
  }));
  log(`view ${JSON.stringify(mode)}`);
  if (!mode.canvas && !mode.map) throw new Error("Neither WebGL nor the map rendered");
  await shot(page, "desktop-overview");

  const building = mode.buildings.includes("building-intake")
    ? "building-intake"
    : mode.buildings.find((id) => id.startsWith("building-"));
  if (!building) throw new Error("No building tap target rendered");
  await clickVisible(page, `[data-testid="${building}"]`);
  await page.waitForFunction(() => {
    const panel = [...document.querySelectorAll("[data-testid='detail-panel']")].find((node) => node.getBoundingClientRect().height > 40);
    return panel && /department|intake|research|qualify|creative|approval|outreach|crm|delivery/i.test(panel.textContent ?? "");
  });
  await shot(page, "desktop-selected");

  await clickVisible(page, '[data-testid="start-run"]');
  await waitStatus(page, "blocked", 20000);
  await shot(page, "desktop-blocked");

  await page.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await shot(page, "mobile-blocked");
  await page.setViewport({ width: 1440, height: 900 });

  await clickVisible(page, '[data-testid="resolve-block"]');
  await waitStatus(page, "awaiting approval", 25000);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="approve"]');
  await waitStatus(page, "awaiting approval", 10000);
  const stillGated = await page.evaluate(async () => {
    const response = await fetch("/api/factory", { cache: "no-store" });
    const body = await response.json();
    return {
      status: body.workflow.status,
      delivery: body.jobs.some((job) => job.kind === "delivery.complete"),
      verifiedJobs: body.jobs.filter((job) => job.outputs?.verified === true).length,
      revenue: body.resources.find((resource) => resource.id === "revenue")?.amount,
    };
  });
  log(`after reload ${JSON.stringify(stillGated)}`);
  if (stillGated.status !== "awaiting_approval" || stillGated.delivery || stillGated.verifiedJobs || stillGated.revenue !== 0) {
    throw new Error(`Approval gate did not hold: ${JSON.stringify(stillGated)}`);
  }
  await shot(page, "desktop-approval");

  await page.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await shot(page, "mobile-approval");
  await page.setViewport({ width: 1440, height: 900 });

  await clickVisible(page, '[data-testid="approve"]');
  await waitStatus(page, "completed", 15000);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="resource-revenue"]');
    return node?.textContent?.includes("4,800") || node?.textContent?.includes("4800");
  });
  const claims = await page.evaluate(() => ({
    verifiedTrue: document.querySelectorAll('[data-verified="true"]').length,
    banner: document.querySelector('[data-testid="simulation-banner"]')?.textContent ?? "",
    revenue: document.querySelector('[data-testid="resource-revenue"]')?.textContent ?? "",
    missions: [...document.querySelectorAll("[data-testid^='mission-']")].map((node) => ({
      id: node.getAttribute("data-testid"),
      done: /done/i.test(node.textContent ?? ""),
    })),
  }));
  log(`completed ${JSON.stringify(claims)}`);
  if (claims.verifiedTrue !== 0) throw new Error("A simulated result was marked verified in the DOM");
  if (!/simulated/i.test(claims.banner)) throw new Error("Simulation banner missing");
  await shot(page, "desktop-completed");

  await clickVisible(page, '[data-testid="view-toggle"]');
  await page.waitForSelector('[data-testid="factory-map"]');
  await shot(page, "desktop-map");
  await clickVisible(page, '[data-testid="view-toggle"]');
  await page.waitForSelector("canvas");

  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="reset-simulation"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error("Reset control is missing");
    button.click();
  });
  await waitStatus(page, "idle", 10000);
  await clickVisible(page, '[data-testid="start-run"]');
  await waitStatus(page, "running", 10000);
  await page.goto("about:blank");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await page.goto(base, { waitUntil: "networkidle0" });
  await waitStatus(page, "running", 10000);
  const resumed = await page.evaluate(async () => {
    const response = await fetch("/api/factory", { cache: "no-store" });
    const body = await response.json();
    return { status: body.workflow.status, lead: body.lead?.stage ?? null, jobs: body.jobs.map((job) => `${job.kind}:${job.status}`) };
  });
  log(`resumed ${JSON.stringify(resumed)}`);
  if (resumed.status === "idle") throw new Error("Server did not keep the run after the page closed");
  await shot(page, "desktop-resumed");

  const serious = pageErrors.filter((entry) => !/favicon|Download the React DevTools/i.test(entry));
  if (serious.length) log(`page errors: ${serious.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, shots, mode, resumed, claims, serious }, null, 2));
} catch (error) {
  await shot(page, "desktop-failure").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

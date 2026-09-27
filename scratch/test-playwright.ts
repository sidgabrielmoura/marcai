import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, // Mobile viewport (Pixel 7)
  });
  const page = await context.newPage();

  console.log("Navigating to login...");
  await page.goto("http://localhost:3000/login");

  console.log("Submitting PIN login...");
  await page.click('button[type="submit"]');

  console.log("Waiting for navigation after login...");
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  console.log("Current URL:", page.url());

  console.log("Navigating to /tasks...");
  await page.goto("http://localhost:3000/tasks");
  await page.waitForSelector(".trello-kanban-container", { timeout: 15000 });

  await page.waitForTimeout(1000);

  // Take screenshot of mobile view
  await page.screenshot({ path: "scratch/tasks-mobile.png", fullPage: true });
  console.log("Screenshot saved to scratch/tasks-mobile.png");

  // Inspect each column
  const columns = await page.$$(".trello-kanban-column");
  console.log(`Found ${columns.length} columns`);

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const colId = await col.getAttribute("data-column-id");
    const title = await col.$eval("h3", (el) => el.textContent?.trim());
    const cardElements = await col.$$('[data-slot="card"]');
    console.log(`\n--- Column ${i}: [${colId}] "${title}" - Cards: ${cardElements.length} ---`);

    for (let j = 0; j < cardElements.length; j++) {
      const card = cardElements[j];
      const text = await card.innerText();
      const box = await card.boundingBox();
      console.log(`  Card ${j} box:`, box);
      console.log(`  Card ${j} innerText:\n${text.split('\n').map(l => '    ' + l).join('\n')}`);
    }
  }

  // Also test desktop viewport
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scratch/tasks-desktop.png", fullPage: true });
  console.log("Screenshot saved to scratch/tasks-desktop.png");

  await browser.close();
}

main().catch(console.error);

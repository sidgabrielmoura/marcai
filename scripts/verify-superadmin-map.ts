import "dotenv/config";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/infrastructure/database/prisma";
import { encryptSession } from "../src/infrastructure/security/session";
import { secondFactorProof } from "../src/infrastructure/security/totp";
import {
  buildMapOrganizations,
  emptyMapFilters,
  filterMapOrganizations,
  getMapPins,
  groupMapPins,
} from "../src/application/superadmin/map-data";

async function readOrganizations() {
  return prisma.organization.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      locations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      _count: {
        select: {
          members: { where: { status: "ACTIVE", user: { status: "ACTIVE" } } },
          locations: true,
          processes: true,
          tasks: { where: { deletedAt: null } },
        },
      },
    },
  });
}
async function main() {
  const baseUrl =
    process.env.TAREFAI_UI_BASE_URL ??
    process.env.MARCAI_UI_BASE_URL ??
    "http://localhost:3001";
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname))
    throw new Error("Use a local server for this read-only browser audit.");
  const rows = await readOrganizations(),
    organizations = buildMapOrganizations(rows),
    pins = getMapPins(organizations),
    groups = groupMapPins(pins);
  const before = JSON.stringify(rows);
  const user = await prisma.user.findFirst({
    where: {
      platformRole: "SUPERADMIN",
      status: "ACTIVE",
      twoFactorEnabled: true,
    },
  });
  if (!user)
    throw new Error(
      "No configured superadmin available for local verification.",
    );
  const token = await encryptSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: "SUPERADMIN",
    activeMemberId: "",
    activeOrgId: "",
    secondFactorProof: secondFactorProof(user.twoFactorSecret),
  });
  const browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "gestao_session",
      value: token,
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage(),
    errors: string[] = [],
    reports: unknown[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("tmp/map-review", { recursive: true });
  try {
    await page.goto(baseUrl + "/superadmin?view=map", {
      waitUntil: "domcontentloaded",
    });
    const root = page.getByTestId("superadmin-map"),
      canvas = page.getByTestId("map-canvas"),
      markers = page.getByTestId("map-marker");
    await expect(root).toHaveAttribute(
      "data-organizations",
      String(organizations.length),
    );
    await expect(root).toHaveAttribute("data-pins", String(pins.length));
    await expect.poll(() => markers.count()).toBeGreaterThan(0);
    await expect
      .poll(() => canvas.locator(".leaflet-tile-loaded").count())
      .toBeGreaterThan(0);
    assert.equal(
      await canvas
        .locator(".leaflet-tile")
        .first()
        .evaluate((el) => getComputedStyle(el).position),
      "absolute",
      "Leaflet CSS must position tiles.",
    );
    assert.equal(
      await canvas
        .locator(".leaflet-pane")
        .first()
        .evaluate((el) => getComputedStyle(el).position),
      "absolute",
      "Leaflet panes must be positioned.",
    );
    const locationIds = await markers.evaluateAll((elements) =>
      elements.flatMap((el) =>
        (el.getAttribute("data-location-ids") ?? "").split(","),
      ),
    );
    const organizationIds = await markers.evaluateAll((elements) =>
      elements.flatMap((el) =>
        (el.getAttribute("data-organization-ids") ?? "").split(","),
      ),
    );
    assert.deepEqual(
      locationIds.sort(),
      pins.map((pin) => pin.location.id).sort(),
      "Every locatable DB unit is represented exactly once.",
    );
    assert.deepEqual(
      [...new Set(organizationIds)].sort(),
      [...new Set(pins.map((pin) => pin.organization.id))].sort(),
    );
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await expect
        .poll(() =>
          markers.evaluateAll((elements) =>
            elements.every((el) => {
              const container = el.closest(".leaflet-container");
              if (!container) return false;
              const map = container.getBoundingClientRect(),
                box = el.getBoundingClientRect();
              return (
                box.width > 0 &&
                box.height > 0 &&
                box.left >= map.left - 1 &&
                box.right <= map.right + 1 &&
                box.top >= map.top - 1 &&
                box.bottom <= map.bottom + 1
              );
            }),
          ),
        )
        .toBe(true);
      await expect(page.locator("h1")).toHaveCount(1);
      if (width < 1024)
        await expect
          .poll(() =>
            page
              .locator('.mobile-navigation [aria-current="page"]')
              .evaluate((el) => {
                const b = el.getBoundingClientRect();
                return b.left >= 0 && b.right <= innerWidth;
              }),
          )
          .toBe(true);
      await page.screenshot({
        path: "tmp/map-review/map-" + width + ".png",
        fullPage: true,
      });
      const ids = await markers.evaluateAll((elements) =>
        elements.flatMap((el) =>
          (el.getAttribute("data-location-ids") ?? "").split(","),
        ),
      );
      assert.deepEqual(ids.sort(), pins.map((pin) => pin.location.id).sort());
      reports.push({
        width,
        pins: pins.length,
        markerGroups: await markers.count(),
        allMarkersInsideMap: true,
        pageOverflow: false,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const coincident of [false, true]) {
      await page.goto(baseUrl + "/superadmin?view=map", {
        waitUntil: "domcontentloaded",
      });
      await expect.poll(() => markers.count()).toBeGreaterThan(0);
      const clusters = await canvas
        .locator('[data-marker-type="cluster"]')
        .evaluateAll((elements) =>
          elements.map((el) => ({
            ids: (el.getAttribute("data-location-ids") ?? "").split(","),
          })),
        );
      const candidate = clusters.find(
        (group) =>
          (groupMapPins(
            pins.filter((pin) => group.ids.includes(pin.location.id)),
          ).length ===
            1) ===
          coincident,
      );
      if (!candidate) continue;
      const marker = canvas
        .locator('[data-marker-type="cluster"]')
        .filter({ has: page.locator(".sa-map-pin") })
        .filter({ visible: true });
      const index = clusters.indexOf(candidate);
      const beforeZoom = Number(await canvas.getAttribute("data-zoom"));
      await marker.nth(index).press("Enter");
      await expect
        .poll(() => canvas.getAttribute("data-zoom").then(Number))
        .toBeGreaterThan(beforeZoom);
      await expect(page.getByTestId("map-popup")).toHaveCount(0);
      await expect
        .poll(() =>
          markers.evaluateAll((elements, ids) => {
            const revealed = elements.filter((el) =>
              ids.includes(el.getAttribute("data-location-ids") ?? ""),
            );
            return (
              revealed.length === ids.length &&
              revealed.every(
                (el) => el.getAttribute("data-marker-type") === "unit",
              )
            );
          }, candidate.ids),
        )
        .toBe(true);
      if (coincident) {
        await expect(page.getByTestId("map-spread-notice")).toBeVisible();
        const boxes = await canvas
          .locator('[data-spread="true"]')
          .evaluateAll((elements) =>
            elements.map((el) => {
              const b = el.getBoundingClientRect();
              return {
                left: b.left,
                right: b.right,
                top: b.top,
                bottom: b.bottom,
              };
            }),
          );
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            assert.ok(
              a.right <= b.left ||
                b.right <= a.left ||
                a.bottom <= b.top ||
                b.bottom <= a.top,
              "Expanded markers must not overlap.",
            );
          }
      }
      const ids = await markers.evaluateAll((elements) =>
        elements.flatMap((el) =>
          (el.getAttribute("data-location-ids") ?? "").split(","),
        ),
      );
      assert.deepEqual(
        ids.sort(),
        pins.map((pin) => pin.location.id).sort(),
        "Expansion preserves every registered unit.",
      );
      await page.screenshot({
        path:
          "tmp/map-review/expanded-" +
          (coincident ? "same-point" : "nearby") +
          "-1440.png",
        fullPage: true,
      });
      for (const id of candidate.ids) {
        const revealed = canvas
          .locator('[data-marker-type="unit"]')
          .filter({ visible: true })
          .and(canvas.locator('[data-location-ids="' + id + '"]'));
        await revealed.press("Space");
        await expect(page.getByTestId("map-popup")).toHaveAttribute(
          "data-location-id",
          id,
        );
        if (coincident)
          await page.screenshot({
            path: "tmp/map-review/expanded-popup-1440.png",
            fullPage: true,
          });
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("map-popup")).toHaveCount(0);
        await expect(revealed).toBeFocused();
      }
    }
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(baseUrl + "/superadmin?view=map", {
        waitUntil: "domcontentloaded",
      });
      const unit = canvas.locator('[data-marker-type="unit"]').first();
      await expect(unit).toBeVisible();
      const unitId = await unit.getAttribute("data-location-ids");
      await unit.click();
      const popup = page.getByTestId("map-popup");
      await expect(popup).toHaveAttribute("data-location-id", unitId!);
      await expect(
        popup.getByRole("button", { name: "Fechar detalhes da empresa" }),
      ).toBeFocused();
      await expect(popup.locator("dl dd")).toHaveCount(4);
      await expect
        .poll(() =>
          popup.evaluate((el) => {
            const box = el.closest(".leaflet-popup")!.getBoundingClientRect(),
              map = el.closest(".leaflet-container")!.getBoundingClientRect();
            return (
              box.left >= map.left - 1 &&
              box.right <= map.right + 1 &&
              box.top >= map.top - 1 &&
              box.bottom <= map.bottom + 1
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: "tmp/map-review/popup-" + width + ".png",
        fullPage: true,
      });
      await popup
        .getByRole("button", { name: "Fechar detalhes da empresa" })
        .click();
      await expect(popup).toHaveCount(0);
      await expect(unit).toBeFocused();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseUrl + "/superadmin?view=map", {
      waitUntil: "domcontentloaded",
    });
    if (pins.length) {
      await canvas.locator('[data-marker-type="unit"]').first().click();
      await expect(page.getByTestId("map-popup")).toBeVisible();
      const popup = page.getByTestId("map-popup");
      await expect(popup.locator("script,img,iframe")).toHaveCount(0);
      await page.screenshot({
        path: "tmp/map-review/popup-1440.png",
        fullPage: true,
      });
      const link = popup
        .getByRole("link", { name: "Ver organização", exact: true })
        .first();
      const href = await link.getAttribute("href");
      assert.ok(href?.includes("view=organizations&organization="));
      await link.click();
      await page.waitForURL("**/superadmin?view=organizations&organization=*");
      await page.goto(baseUrl + "/superadmin?view=map", {
        waitUntil: "domcontentloaded",
      });
      await expect.poll(() => markers.count()).toBeGreaterThan(0);
    }
    const state = organizations.flatMap((org) =>
      org.locations.flatMap((loc) =>
        loc.geolocation && loc.geolocation.state !== "BR"
          ? [loc.geolocation.state]
          : [],
      ),
    )[0];
    if (state) {
      await page.getByTestId("map-filter-trigger").click();
      await page.getByLabel("Estado (UF)", { exact: true }).selectOption(state);
      const expected = getMapPins(
        filterMapOrganizations(organizations, { ...emptyMapFilters, state }),
      );
      await page.screenshot({
        path: "tmp/map-review/filters-1440.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: /^Ver no mapa/ }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(root).toHaveAttribute("data-pins", String(expected.length));
      await expect
        .poll(() =>
          markers.evaluateAll((elements) =>
            elements
              .flatMap((el) =>
                (el.getAttribute("data-location-ids") ?? "").split(","),
              )
              .sort()
              .join(","),
          ),
        )
        .toBe(
          expected
            .map((pin) => pin.location.id)
            .sort()
            .join(","),
        );
      await root
        .getByRole("button", { name: "Recentralizar no Brasil", exact: true })
        .click();
      await expect(root).toHaveAttribute("data-pins", String(expected.length));
      await root
        .getByRole("button", { name: "Limpar filtros", exact: true })
        .click();
      await expect(root).toHaveAttribute("data-pins", String(pins.length));
    }
    await page
      .getByLabel("Buscar empresa, unidade ou cidade", { exact: true })
      .fill("___sem_resultado___");
    await expect(root).toHaveAttribute("data-organizations", "0");
    await expect(markers).toHaveCount(0);
    await expect(
      page.getByText("Nenhuma empresa encontrada", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/map-review/empty-1440.png",
      fullPage: true,
    });
    await root
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click();
    const city = pins.find((pin) => pin.location.geolocation.city === "Niterói")
      ?.location.geolocation.city;
    if (city) {
      await page
        .getByLabel("Buscar empresa, unidade ou cidade", { exact: true })
        .fill(city);
      const expected = getMapPins(
        filterMapOrganizations(organizations, {
          ...emptyMapFilters,
          search: city,
        }),
      );
      await expect(root).toHaveAttribute("data-pins", String(expected.length));
      await expect
        .poll(() =>
          markers.evaluateAll((elements) =>
            elements
              .flatMap((el) =>
                (el.getAttribute("data-location-ids") ?? "").split(","),
              )
              .sort()
              .join(","),
          ),
        )
        .toBe(
          expected
            .map((pin) => pin.location.id)
            .sort()
            .join(","),
        );
      await root
        .getByRole("button", { name: "Limpar filtros", exact: true })
        .click();
    }
    const org = pins[0]?.organization;
    if (org) {
      await page.goto(
        baseUrl +
          "/superadmin?view=map&organization=" +
          encodeURIComponent(org.id),
        { waitUntil: "domcontentloaded" },
      );
      await expect(root).toHaveAttribute("data-organizations", "1");
      await expect(page.locator(".sa-context")).toContainText(org.name);
      await expect(root).toHaveAttribute(
        "data-pins",
        String(getMapPins([org]).length),
      );
      await root
        .getByRole("button", { name: "Limpar filtros", exact: true })
        .click();
      await page.waitForURL("**/superadmin?view=map");
      await expect(root).toHaveAttribute("data-pins", String(pins.length));
    }
    await page.goto(baseUrl + "/superadmin?view=map&status=SUSPENDED", {
      waitUntil: "domcontentloaded",
    });
    await expect(root).toHaveAttribute(
      "data-organizations",
      String(organizations.filter((org) => org.status === "SUSPENDED").length),
    );
    await page.getByTestId("map-filter-trigger").click();
    await page
      .getByLabel("Situação da empresa", { exact: true })
      .selectOption("ALL");
    await page.getByRole("button", { name: /^Ver no mapa/ }).click();
    await expect(root).toHaveAttribute("data-pins", String(pins.length));
    await page.goto(baseUrl + "/superadmin?view=map&q=Niteroi", {
      waitUntil: "domcontentloaded",
    });
    await expect(root).toHaveAttribute(
      "data-pins",
      String(
        getMapPins(
          filterMapOrganizations(organizations, {
            ...emptyMapFilters,
            search: "Niteroi",
          }),
        ).length,
      ),
    );
    await root
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click();
    await page.waitForURL("**/superadmin?view=map");
    await expect(root).toHaveAttribute("data-pins", String(pins.length));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("map-filter-trigger").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({
      path: "tmp/map-review/filters-390.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(
        "Alguns trechos do mapa não carregaram. Verifique a conexão ou tente novamente.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect.poll(() => markers.count()).toBeGreaterThan(0);
    await page.screenshot({
      path: "tmp/map-review/tile-error-390.png",
      fullPage: true,
    });
    await page.unroute("https://tile.openstreetmap.org/**");
    await page
      .getByRole("button", { name: "Recarregar mapa", exact: true })
      .click();
    await expect
      .poll(() => canvas.locator(".leaflet-tile-loaded").count())
      .toBeGreaterThan(0);
    await expect.poll(() => markers.count()).toBeGreaterThan(0);
    assert.deepEqual(errors, [], "Map must not throw client-side exceptions.");
    const after = JSON.stringify(await readOrganizations());
    assert.equal(
      after,
      before,
      "The audit must not change organization or location records.",
    );
    const report = {
      verifiedAt: new Date().toISOString(),
      baseUrl,
      organizations: organizations.length,
      locations: rows.reduce((sum, org) => sum + org.locations.length, 0),
      locatedUnits: pins.length,
      representedOrganizations: new Set(pins.map((pin) => pin.organization.id))
        .size,
      distinctCoordinates: groups.length,
      explicitCoordinates: pins.filter(
        (pin) => pin.location.geolocation.precision === "coordinates",
      ).length,
      municipalReferences: pins.filter(
        (pin) => pin.location.geolocation.precision === "city",
      ).length,
      unlocated: organizations.flatMap((org) =>
        org.locations
          .filter((loc) => !loc.geolocation)
          .map((loc) => ({ organization: org.name, unit: loc.name })),
      ),
      records: organizations.map((org) => ({
        name: org.name,
        slug: org.slug,
        status: org.status,
        units: org.locations.map((loc) => ({
          name: loc.name,
          status: loc.status,
          address: loc.address,
          geolocation: loc.geolocation,
        })),
      })),
      readOnly: true,
      errors,
      reports,
    };
    await writeFile(
      "tmp/map-review/report.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          organizations: report.organizations,
          units: report.locations,
          representedOrganizations: report.representedOrganizations,
          locatedUnits: report.locatedUnits,
          distinctCoordinates: report.distinctCoordinates,
          explicitCoordinates: report.explicitCoordinates,
          municipalReferences: report.municipalReferences,
          viewports: reports.length,
          readOnly: true,
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

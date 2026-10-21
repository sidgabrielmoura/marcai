import {
  readManualSubscription,
  type ManualSubscription,
} from "./manual-subscription";
import {
  normalizeMapText,
  resolveAddressCoordinates,
  validCoordinates,
  type GeoLocationResult,
} from "@/infrastructure/geolocation/geocode";

export interface MapLocation {
  id: string;
  name: string;
  address: string | null;
  status: string;
  geolocation: GeoLocationResult | null;
}
export interface MapOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  daysInSystem: number;
  membersCount: number;
  locationsCount: number;
  processesCount: number;
  tasksCount: number;
  subscription: ManualSubscription | null;
  locations: MapLocation[];
}
export interface MapOrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  settings: unknown;
  locations: Array<{
    id: string;
    name: string;
    address: string | null;
    status: string;
  }>;
  _count: {
    members: number;
    locations: number;
    processes: number;
    tasks: number;
  };
}
export function buildMapOrganizations(
  rows: MapOrganizationRow[],
  now = Date.now(),
): MapOrganization[] {
  return rows.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
    daysInSystem: Math.max(
      0,
      Math.floor((now - org.createdAt.getTime()) / 86400000),
    ),
    membersCount: org._count.members,
    locationsCount: org._count.locations,
    processesCount: org._count.processes,
    tasksCount: org._count.tasks,
    subscription: readManualSubscription(org.settings),
    locations: org.locations.map((loc) => ({
      ...loc,
      geolocation: resolveAddressCoordinates(loc.address),
    })),
  }));
}
export interface MapFilters {
  search: string;
  state: string;
  branches: string;
  systemTime: string;
  created: string;
  status: string;
}
export const emptyMapFilters: MapFilters = {
  search: "",
  state: "ALL",
  branches: "ALL",
  systemTime: "ALL",
  created: "ALL",
  status: "ALL",
};

export function filterMapOrganizations(
  organizations: MapOrganization[],
  filters: MapFilters,
  now = Date.now(),
): MapOrganization[] {
  const q = normalizeMapText(filters.search);
  return organizations.flatMap((org) => {
    const count = org.locationsCount,
      days = org.daysInSystem,
      age = (now - Date.parse(org.createdAt)) / 86400000;
    if (
      (filters.branches === "0" && count !== 0) ||
      (filters.branches === "1" && count !== 1) ||
      (filters.branches === "2-3" && (count < 2 || count > 3)) ||
      (filters.branches === "4+" && count < 4)
    )
      return [];
    if (
      (filters.systemTime === "<7d" && days >= 7) ||
      (filters.systemTime === "<30d" && days >= 30) ||
      (filters.systemTime === "1-3m" && (days < 30 || days > 90)) ||
      (filters.systemTime === ">3m" && days <= 90)
    )
      return [];
    const maxAge: Record<string, number> = {
      today: 1,
      week: 7,
      month: 30,
      year: 365,
    };
    if (maxAge[filters.created] !== undefined && age > maxAge[filters.created])
      return [];
    if (
      (["ACTIVE", "SUSPENDED"].includes(filters.status) &&
        org.status !== filters.status) ||
      (filters.status === "TRIAL" && org.subscription?.status !== "TRIAL") ||
      (filters.status === "PAID" && org.subscription?.status !== "ACTIVE")
    )
      return [];
    const matchesOrg =
      !q ||
      [org.name, org.slug].some((value) => normalizeMapText(value).includes(q));
    const locations = org.locations.filter(
      (loc) =>
        (filters.state === "ALL" || loc.geolocation?.state === filters.state) &&
        (matchesOrg ||
          [
            loc.name,
            loc.address ?? "",
            loc.geolocation?.city ?? "",
            loc.geolocation?.state ?? "",
          ].some((value) => normalizeMapText(value).includes(q))),
    );
    if (
      (filters.state !== "ALL" && !locations.length) ||
      (!matchesOrg && !locations.length)
    )
      return [];
    return [{ ...org, locations }];
  });
}
export interface MapPin {
  location: MapLocation & { geolocation: GeoLocationResult };
  organization: MapOrganization;
}
export function getMapPins(organizations: MapOrganization[]): MapPin[] {
  return organizations.flatMap((organization) =>
    organization.locations.flatMap((location) => {
      const geo = location.geolocation;
      return geo && validCoordinates(geo.lat, geo.lng)
        ? [{ organization, location: { ...location, geolocation: geo } }]
        : [];
    }),
  );
}
export function groupMapPins(pins: MapPin[]): MapPin[][] {
  const groups = new Map<string, MapPin[]>();
  for (const pin of pins) {
    const { lat, lng } = pin.location.geolocation,
      key = lat.toFixed(6) + "," + lng.toFixed(6);
    const group = groups.get(key) ?? [];
    group.push(pin);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Screen-space grouping leaves every stored/reference coordinate untouched. */
export function clusterMapPins(
  pins: MapPin[],
  project: (geo: GeoLocationResult) => { x: number; y: number },
  distance = 52,
): MapPin[][] {
  const cells = new Map<
      string,
      Array<{ point: { x: number; y: number }; pins: MapPin[] }>
    >(),
    groups: MapPin[][] = [];
  for (const pin of pins) {
    const point = project(pin.location.geolocation),
      x = Math.floor(point.x / distance),
      y = Math.floor(point.y / distance);
    let match: { point: { x: number; y: number }; pins: MapPin[] } | undefined;
    for (let dx = -1; dx <= 1 && !match; dx++)
      for (let dy = -1; dy <= 1 && !match; dy++) {
        match = cells
          .get(x + dx + "," + (y + dy))
          ?.find(
            (group) =>
              Math.hypot(point.x - group.point.x, point.y - group.point.y) <
              distance,
          );
      }
    if (match) {
      match.pins.push(pin);
      continue;
    }
    const group = { point, pins: [pin] },
      key = x + "," + y;
    cells.set(key, [...(cells.get(key) ?? []), group]);
    groups.push(group.pins);
  }
  return groups;
}

/** Stop zooming when distinct locations separate; coincident pins need a visual fan. */
export function mapClusterExpansionZoom(
  pins: MapPin[],
  project: (geo: GeoLocationResult, zoom: number) => { x: number; y: number },
  currentZoom: number,
  maxZoom: number,
): number {
  const distinct = groupMapPins(pins).length;
  if (distinct <= 1) {
    const referenceZoom = pins.some(
      (pin) => pin.location.geolocation.precision === "city",
    )
      ? 13
      : 17;
    return Math.min(maxZoom, Math.max(currentZoom, referenceZoom));
  }
  for (let zoom = Math.min(currentZoom + 1, maxZoom); zoom <= maxZoom; zoom++) {
    if (clusterMapPins(pins, (geo) => project(geo, zoom)).length >= distinct)
      return zoom;
  }
  return maxZoom;
}

/** Pixel offsets for selection only. Never persist these as geographic coordinates. */
export function mapSpreadOffsets(
  count: number,
): Array<{ x: number; y: number }> {
  if (count <= 1) return [{ x: 0, y: 0 }];
  if (count === 2)
    return [
      { x: -38, y: 0 },
      { x: 38, y: 0 },
    ];
  const radius = Math.max(46, (count * 56) / (2 * Math.PI));
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

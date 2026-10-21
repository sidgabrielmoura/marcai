import assert from "node:assert/strict";
import test from "node:test";
import { resolveAddressCoordinates } from "../src/infrastructure/geolocation/geocode";
import {
  buildMapOrganizations,
  emptyMapFilters,
  filterMapOrganizations,
  getMapPins,
  groupMapPins,
  clusterMapPins,
  mapClusterExpansionZoom,
  mapSpreadOffsets,
  type MapOrganizationRow,
} from "../src/application/superadmin/map-data";

const row = (
  id: string,
  addresses: Array<string | null>,
): MapOrganizationRow => ({
  id,
  name: id,
  slug: id,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  settings: null,
  _count: { members: 1, locations: addresses.length, processes: 0, tasks: 0 },
  locations: addresses.map((address, index) => ({
    id: id + "-" + index,
    name: index === 0 ? "Matriz" : "Filial",
    address,
    status: "ACTIVE",
  })),
});
test("endereços ausentes, desconhecidos ou somente UF não recebem pino inventado", () => {
  for (const address of [
    null,
    "",
    "Endereço desconhecido",
    "SP",
    "Avenida Paulista, 1000",
  ]) {
    assert.equal(resolveAddressCoordinates(address), null);
  }
  assert.equal(
    getMapPins(
      buildMapOrganizations([
        row("sem-unidades", []),
        row("sem-endereco", [null]),
      ]),
    ).length,
    0,
  );
});
test("município vem do fim do endereço e nunca do nome de uma avenida", () => {
  const campinas = resolveAddressCoordinates(
    "Rua Rio Branco, 156 - Centro, Campinas/SP",
  )!;
  assert.equal(campinas.city, "Campinas");
  assert.equal(campinas.state, "SP");
  assert.equal(campinas.precision, "city");
  const acre = resolveAddressCoordinates(
    "Rua Central, 10 - Centro, Rio Branco/AC",
  )!;
  assert.equal(acre.state, "AC");
  assert.equal(
    resolveAddressCoordinates("Rua Central, 10 - Centro, Campinas/RJ"),
    null,
  );
});
test("centros municipais são aproximações estáveis, sem jitter por nome ou identificador", () => {
  const a = resolveAddressCoordinates(
    "Av. Paulista, 1000 - Bela Vista, São Paulo/SP",
  )!;
  const b = resolveAddressCoordinates(
    "Av. Faria Lima, 2232 - Jardim Paulistano, Sao Paulo/SP",
  )!;
  assert.equal(a.lat, b.lat);
  assert.equal(a.lng, b.lng);
  assert.equal(a.precision, "city");
});
test("coordenadas explícitas preservam o ponto, aceitam zero e rejeitam valores inválidos", () => {
  const result = resolveAddressCoordinates("@-23.123456,-46.654321")!;
  assert.equal(result.precision, "coordinates");
  assert.equal(result.lat, -23.123456);
  assert.equal(result.lng, -46.654321);
  assert.equal(resolveAddressCoordinates("0,0")?.lat, 0);
  assert.equal(resolveAddressCoordinates("@999,10, São Paulo/SP"), null);
});
test("pinos no mesmo ponto são agrupados sem perder unidades ou empresas", () => {
  const organizations = buildMapOrganizations([
    row("a", ["São Paulo/SP", "São Paulo/SP"]),
    row("b", ["São Paulo/SP"]),
  ]);
  const pins = getMapPins(organizations),
    groups = groupMapPins(pins);
  assert.equal(pins.length, 3);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 3);
  assert.equal(new Set(groups[0].map((pin) => pin.organization.id)).size, 2);
  assert.equal(organizations[0].subscription, null);
});
test("busca por filial e filtro de UF mostram somente as unidades correspondentes", () => {
  const organizations = buildMapOrganizations([
    row("beta", ["Rio de Janeiro/RJ", "Niterói/RJ", "São Paulo/SP"]),
  ]);
  const byCity = filterMapOrganizations(organizations, {
    ...emptyMapFilters,
    search: "niteroi",
  });
  assert.equal(getMapPins(byCity).length, 1);
  assert.equal(getMapPins(byCity)[0].location.geolocation.city, "Niterói");
  const byState = filterMapOrganizations(organizations, {
    ...emptyMapFilters,
    state: "SP",
  });
  assert.equal(getMapPins(byState).length, 1);
  assert.equal(getMapPins(byState)[0].location.geolocation.state, "SP");
});
test("empresa sem unidade é contabilizada e não cria sede virtual", () => {
  const org = buildMapOrganizations([row("sem", [])]);
  assert.equal(
    filterMapOrganizations(org, { ...emptyMapFilters, branches: "0" }).length,
    1,
  );
  assert.equal(getMapPins(org).length, 0);
  assert.equal(
    filterMapOrganizations(org, { ...emptyMapFilters, state: "SP" }).length,
    0,
  );
});
test("quantidade zero não usa a quantidade de localizações como fallback", () => {
  const org = buildMapOrganizations([row("org", ["São Paulo/SP"])]);
  org[0].locationsCount = 0;
  assert.equal(
    filterMapOrganizations(org, { ...emptyMapFilters, branches: "0" }).length,
    1,
  );
  assert.equal(
    filterMapOrganizations(org, { ...emptyMapFilters, branches: "1" }).length,
    0,
  );
});
test("todos os dez endereços existentes no seed têm apenas referência municipal", () => {
  const addresses = [
    "Av. Paulista, 1000 - Bela Vista, São Paulo/SP",
    "Av. Faria Lima, 2232 - Jardim Paulistano, São Paulo/SP",
    "Av. Iguatemi, 777 - Vila Brandina, Campinas/SP",
    "Av. Rio Branco, 156 - Centro, Rio de Janeiro/RJ",
    "R. Cel. Moreira César, 229 - Icaraí, Niterói/RJ",
    "R. XV de Novembro, 700 - Centro, Curitiba/PR",
    "Av. do Batel, 1868 - Batel, Curitiba/PR",
    "Av. Afonso Pena, 1500 - Savassi, Belo Horizonte/MG",
    "Av. Beira-Mar Norte, 2000 - Centro, Florianópolis/SC",
    "Av. Borges de Medeiros, 1501 - Praia de Belas, Porto Alegre/RS",
  ];
  for (const address of addresses)
    assert.equal(
      resolveAddressCoordinates(address)?.precision,
      "city",
      address,
    );
  const pins = getMapPins(buildMapOrganizations([row("seed", addresses)]));
  assert.equal(pins.length, 10);
  assert.equal(groupMapPins(pins).length, 8);
});
test("pontos próximos se agrupam na visão geral e se separam ao aproximar, sem deslocamento", () => {
  const pins = getMapPins(
    buildMapOrganizations([
      row("rj", ["@-22.9068,-43.1729", "@-22.8859,-43.1153"]),
    ]),
  );
  const original = JSON.stringify(pins);
  assert.equal(
    clusterMapPins(pins, (geo) => ({ x: geo.lng * 100, y: geo.lat * 100 }))
      .length,
    1,
  );
  assert.equal(
    clusterMapPins(pins, (geo) => ({ x: geo.lng * 10000, y: geo.lat * 10000 }))
      .length,
    2,
  );
  assert.equal(JSON.stringify(pins), original);
});
test("agrupamento não perde pinos em bordas de células de projeção", () => {
  const pins = getMapPins(
    buildMapOrganizations([row("pontos", ["@0,0.005", "@0,0.006", "@1,1"])]),
  );
  const clusters = clusterMapPins(pins, (geo) => ({
    x: geo.lng * 10000,
    y: geo.lat * 10000,
  }));
  assert.equal(clusters.length, 2);
  assert.equal(clusters.flat().length, 3);
});

test("clique no grupo escolhe o zoom em que as coordenadas diferentes se separam", () => {
  const pins = getMapPins(
    buildMapOrganizations([
      row("rj", ["@-22.9068,-43.1729", "@-22.8859,-43.1153"]),
    ]),
  );
  const project = (geo: { lat: number; lng: number }, zoom: number) => ({
    x: geo.lng * 2 ** zoom,
    y: geo.lat * 2 ** zoom,
  });
  const zoom = mapClusterExpansionZoom(pins, project, 6, 19);
  assert.ok(zoom > 6 && zoom <= 19);
  assert.equal(clusterMapPins(pins, (geo) => project(geo, zoom)).length, 2);
  assert.equal(clusterMapPins(pins, (geo) => project(geo, zoom - 1)).length, 1);
});
test("unidades coincidentes abrem em leque sem alterar suas coordenadas", () => {
  const pins = getMapPins(
    buildMapOrganizations([row("mesmo", ["São Paulo/SP", "São Paulo/SP"])]),
  );
  const before = JSON.stringify(pins);
  const zoom = mapClusterExpansionZoom(
    pins,
    (geo) => ({ x: geo.lng, y: geo.lat }),
    6,
    19,
  );
  assert.equal(zoom, 13);
  for (const count of [2, 3, 8, 20]) {
    const offsets = mapSpreadOffsets(count);
    assert.equal(offsets.length, count);
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++)
        assert.ok(
          Math.hypot(offsets[i].x - offsets[j].x, offsets[i].y - offsets[j].y) >
            48,
        );
  }
  assert.equal(JSON.stringify(pins), before);
});
test("aproximação respeita o zoom máximo inclusive para pontos quase coincidentes", () => {
  const pins = getMapPins(
    buildMapOrganizations([row("muito-perto", ["@0,0", "@0,0.000001"])]),
  );
  const zoom = mapClusterExpansionZoom(
    pins,
    (geo, z) => ({ x: geo.lng * 2 ** z, y: geo.lat * 2 ** z }),
    18,
    19,
  );
  assert.equal(zoom, 19);
});

/**
 * Local, deliberately limited municipality reference data.
 * City centers are approximate references, never street/house geocoding.
 * Unknown addresses stay unresolved; no fallback capital or artificial offsets.
 */
export interface GeoLocationResult {
  lat: number;
  lng: number;
  city: string;
  state: string;
  precision: "coordinates" | "city";
  formattedAddress: string;
}

const municipalities: Array<[string, string, number, number]> = [
  ["São Paulo", "SP", -23.5505, -46.6333],
  ["Rio de Janeiro", "RJ", -22.9068, -43.1729],
  ["Belo Horizonte", "MG", -19.9167, -43.9345],
  ["Curitiba", "PR", -25.4284, -49.2733],
  ["Florianópolis", "SC", -27.5954, -48.548],
  ["Porto Alegre", "RS", -30.0346, -51.2177],
  ["Brasília", "DF", -15.7975, -47.8919],
  ["Salvador", "BA", -12.9777, -38.5016],
  ["Recife", "PE", -8.0476, -34.877],
  ["Fortaleza", "CE", -3.7172, -38.5433],
  ["Goiânia", "GO", -16.6869, -49.2648],
  ["Vitória", "ES", -20.3155, -40.3128],
  ["Cuiabá", "MT", -15.6014, -56.0979],
  ["Campo Grande", "MS", -20.4697, -54.6201],
  ["Manaus", "AM", -3.119, -60.0217],
  ["Belém", "PA", -1.4558, -48.5044],
  ["Natal", "RN", -5.7945, -35.211],
  ["João Pessoa", "PB", -7.1195, -34.845],
  ["Maceió", "AL", -9.6658, -35.7351],
  ["Aracaju", "SE", -10.9472, -37.0731],
  ["Teresina", "PI", -5.092, -42.8038],
  ["São Luís", "MA", -2.5307, -44.3068],
  ["Porto Velho", "RO", -8.7619, -63.9039],
  ["Palmas", "TO", -10.2491, -48.3243],
  ["Rio Branco", "AC", -9.9754, -67.8249],
  ["Macapá", "AP", 0.0349, -51.0694],
  ["Boa Vista", "RR", 2.8235, -60.6758],
  ["Campinas", "SP", -22.9056, -47.0608],
  ["Santos", "SP", -23.9608, -46.3331],
  ["Ribeirão Preto", "SP", -21.1767, -47.8208],
  ["São José dos Campos", "SP", -23.2237, -45.9009],
  ["Sorocaba", "SP", -23.5015, -47.4526],
  ["Barueri", "SP", -23.5105, -46.8761],
  ["Niterói", "RJ", -22.8859, -43.1153],
  ["Uberlândia", "MG", -18.9186, -48.2772],
  ["Juiz de Fora", "MG", -21.7642, -43.3496],
  ["Londrina", "PR", -23.3045, -51.1696],
  ["Maringá", "PR", -23.4205, -51.9333],
  ["Joinville", "SC", -26.3045, -48.8487],
  ["Blumenau", "SC", -26.9194, -49.0661],
  ["Balneário Camboriú", "SC", -26.9926, -48.6347],
  ["Caxias do Sul", "RS", -29.1678, -51.1794],
];

export function normalizeMapText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function validCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function resolveAddressCoordinates(
  address: string | null | undefined,
): GeoLocationResult | null {
  const raw = address?.trim();
  if (!raw) return null;
  // Explicit coordinates must be marked (@ or brackets) or occupy the whole field.
  const number = "(-?\\d+(?:\\.\\d+)?)";
  const marked = raw.match(
    new RegExp("(?:@|\\[)\\s*" + number + "\\s*,\\s*" + number),
  );
  const standalone = raw.match(
    new RegExp("^" + number + "\\s*,\\s*" + number + "$"),
  );
  const coordinates = marked ?? standalone;
  const normalized = normalizeMapText(raw)
    .replace(/\b\d{5}-?\d{3}\b/g, "")
    .replace(/\b(?:brasil|brazil)\b/g, "")
    .replace(/[\s,;-]+$/, "")
    .trim();
  // Match a municipality at the end of the address, not a street with the same name.
  const municipality = municipalities.find(([name, uf]) => {
    const city = normalizeMapText(name);
    return new RegExp(
      "(?:^|[,;]\\s*|\\s-\\s)" +
        city +
        "(?:\\s*[/,-]\\s*" +
        uf.toLowerCase() +
        ")?$",
    ).test(normalized);
  });
  if (coordinates) {
    const lat = Number(coordinates[1]),
      lng = Number(coordinates[2]);
    if (!validCoordinates(lat, lng)) return null;
    return {
      lat,
      lng,
      city: municipality?.[0] ?? "Coordenadas cadastradas",
      state: municipality?.[1] ?? "BR",
      precision: "coordinates",
      formattedAddress: raw,
    };
  }
  if (!municipality) return null;
  const [city, state, lat, lng] = municipality;
  return { lat, lng, city, state, precision: "city", formattedAddress: raw };
}

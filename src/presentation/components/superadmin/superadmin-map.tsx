"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Map as LeafletMap,
  LayerGroup,
  LatLngBounds,
  LatLngExpression,
  Popup,
} from "leaflet";
import {
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/presentation/components/shared/empty-state";
import { PlatformButton } from "./platform-async";
import { SuperadminMapPopup } from "./superadmin-map-popup";
import {
  PlatformPanel,
  PlatformStatus,
  SuperadminModal,
} from "./superadmin-ui";
import {
  emptyMapFilters,
  filterMapOrganizations,
  getMapPins,
  clusterMapPins,
  mapClusterExpansionZoom,
  mapSpreadOffsets,
  type MapFilters,
  type MapOrganization,
  type MapPin as MapPinData,
} from "@/application/superadmin/map-data";
import "leaflet/dist/leaflet.css";

export type {
  MapOrganization,
  MapLocation,
} from "@/application/superadmin/map-data";

function text(
  parent: HTMLElement,
  tag: string,
  className: string,
  value: string,
) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  parent.appendChild(node);
  return node;
}
const filterOptions: Array<{
  key: Exclude<keyof MapFilters, "search" | "state">;
  label: string;
  options: Array<[string, string]>;
}> = [
    {
      key: "status",
      label: "Situação da empresa",
      options: [
        ["ALL", "Todas as situações"],
        ["ACTIVE", "Ativas"],
        ["SUSPENDED", "Suspensas"],
        ["TRIAL", "Em avaliação"],
        ["PAID", "Assinatura ativa"],
      ],
    },
    {
      key: "branches",
      label: "Quantidade de unidades cadastradas",
      options: [
        ["ALL", "Todas as quantidades"],
        ["0", "Sem unidades"],
        ["1", "Uma unidade"],
        ["2-3", "Duas a três unidades"],
        ["4+", "Quatro ou mais unidades"],
      ],
    },
    {
      key: "systemTime",
      label: "Tempo no sistema",
      options: [
        ["ALL", "Qualquer período"],
        ["<7d", "Menos de 7 dias"],
        ["<30d", "Menos de 30 dias"],
        ["1-3m", "De 30 a 90 dias"],
        [">3m", "Mais de 90 dias"],
      ],
    },
    {
      key: "created",
      label: "Data de cadastro",
      options: [
        ["ALL", "Todas as datas"],
        ["today", "Últimas 24 horas"],
        ["week", "Últimos 7 dias"],
        ["month", "Últimos 30 dias"],
        ["year", "Últimos 365 dias"],
      ],
    },
  ];

export function SuperadminMap({
  organizations,
  initialSearch = "",
  initialStatus = "ALL",
  hasOrganizationFilter = false,
  onClearFilters,
}: {
  organizations: MapOrganization[];
  initialSearch?: string;
  initialStatus?: string;
  hasOrganizationFilter?: boolean;
  onClearFilters?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null),
    mapRef = useRef<LeafletMap | null>(null),
    layersRef = useRef<LayerGroup | null>(null);
  const collapseRef = useRef<() => void>(() => { });
  const [selectedPopup, setSelectedPopup] = useState<{
    popup: Popup;
    host: HTMLElement;
    pin: MapPinData;
    close: () => void;
  } | null>(null);
  const [expandedCount, setExpandedCount] = useState(0);
  const leafletRef = useRef<typeof import("leaflet") | null>(null),
    boundsRef = useRef<LatLngBounds | null>(null),
    starting = useRef(false);
  const [filters, setFilters] = useState<MapFilters>({
    ...emptyMapFilters,
    search: initialSearch,
    status: initialStatus,
  }),
    [filterOpen, setFilterOpen] = useState(false);
  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState(false),
    [tileError, setTileError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const setFilter = (key: keyof MapFilters, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const filtered = useMemo(
    () => filterMapOrganizations(organizations, filters),
    [organizations, filters],
  );
  const pins = useMemo(() => getMapPins(filtered), [filtered]);
  const states = useMemo(
    () =>
      [
        ...new Set(
          organizations.flatMap((org) =>
            org.locations.flatMap((loc) =>
              loc.geolocation && loc.geolocation.state !== "BR"
                ? [loc.geolocation.state]
                : [],
            ),
          ),
        ),
      ].sort(),
    [organizations],
  );
  const activeCount = Object.entries(filters).filter(
    ([key, value]) => key !== "search" && value !== "ALL",
  ).length;
  const hasFilters =
    activeCount > 0 || !!filters.search.trim() || hasOrganizationFilter;
  const represented = new Set(pins.map((pin) => pin.organization.id)).size;
  const totalLocations = filtered.reduce(
    (sum, org) => sum + org.locations.length,
    0,
  );
  const approximate = pins.filter(
    (pin) => pin.location.geolocation.precision === "city",
  ).length;
  const pending = filtered.filter(
    (org) =>
      !org.locations.length || org.locations.some((loc) => !loc.geolocation),
  );
  const clear = () => {
    setFilters({ ...emptyMapFilters });
    onClearFilters?.();
  };

  useEffect(() => {
    if (!selectedPopup) return;
    // Leaflet measures before the React portal mounts; update its size and pan afterwards.
    selectedPopup.popup.update();
    selectedPopup.host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Fechar detalhes da empresa"]',
      )
      ?.focus({ preventScroll: true });
  }, [selectedPopup]);

  useEffect(() => {
    let cancelled = false,
      map: LeafletMap | undefined,
      observer: ResizeObserver | undefined,
      frame: number | undefined;
    starting.current = true;
    setReady(false);
    setMapError(false);
    setTileError(false);
    async function initialize() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      const container = containerRef.current;
      map = L.map(container, {
        center: [-15.78, -47.92],
        zoom: 4,
        minZoom: 2,
        maxZoom: 19,
        zoomControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });
      // Keep the public tile provider's required attribution and normal browser caching.
      const tiles = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
          maxZoom: 19,
        },
      ).addTo(map);
      tiles.on("tileerror", () => {
        if (!cancelled) setTileError(true);
      });
      L.control
        .zoom({
          position: "bottomright",
          zoomInTitle: "Aproximar",
          zoomOutTitle: "Afastar",
        })
        .addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      let lastWidth = container.clientWidth,
        lastHeight = container.clientHeight;
      observer = new ResizeObserver(([entry]) => {
        if (
          Math.abs(entry.contentRect.width - lastWidth) < 1 &&
          Math.abs(entry.contentRect.height - lastHeight) < 1
        )
          return;
        lastWidth = entry.contentRect.width;
        lastHeight = entry.contentRect.height;
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (cancelled || !map) return;
          map.invalidateSize({ pan: false, debounceMoveend: true });
          if (boundsRef.current?.isValid())
            map.fitBounds(boundsRef.current, {
              padding: [48, 48],
              maxZoom: 14,
              animate: false,
            });
        });
      });
      observer.observe(container);
      map.invalidateSize({ pan: false });
      setReady(true);
    }
    void initialize()
      .catch(() => {
        if (!cancelled) {
          map?.remove();
          mapRef.current = null;
          layersRef.current = null;
          setMapError(true);
        }
      })
      .finally(() => {
        if (!cancelled) starting.current = false;
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (mapRef.current === map) {
        mapRef.current = null;
        layersRef.current = null;
      }
      map?.remove();
    };
  }, [attempt]);

  useEffect(() => {
    const map = mapRef.current,
      L = leafletRef.current,
      layers = layersRef.current;
    if (!ready || !map || !L || !layers) return;
    let expanding = false;
    const expandedIds = new Set<string>();
    const bounds = L.latLngBounds(
      pins.map((pin) => [
        pin.location.geolocation.lat,
        pin.location.geolocation.lng,
      ]),
    );
    boundsRef.current = bounds;
    if (bounds.isValid())
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: false });
    else map.setView([-15.78, -47.92], 4, { animate: false });

    function openDetails(
      pin: MapPinData,
      position: LatLngExpression,
      element: HTMLElement | undefined,
    ) {
      if (!map || !L) return;
      map.closePopup();
      const host = document.createElement("div");
      host.style.setProperty(
        "--sa-map-popup-max-height",
        Math.max(220, map.getSize().y - 72) + "px",
      );
      const popup = L.popup({
        className: "sa-map-leaflet-popup",
        closeButton: false,
        maxWidth: 360,
        minWidth: 0,
        maxHeight: Math.max(220, map.getSize().y - 72),
        offset: L.point(0, -36),
        autoPanPadding: [16, 16],
      })
        .setLatLng(position)
        .setContent(host);
      popup.on("remove", () =>
        setSelectedPopup((current) =>
          current?.popup === popup ? null : current,
        ),
      );
      popup.openOn(map);
      setSelectedPopup({
        popup,
        host,
        pin,
        close: () => {
          map.closePopup(popup);
          element?.focus({ preventScroll: true });
        },
      });
    }

    function addMarker(
      group: MapPinData[],
      position: LatLngExpression,
      spread = false,
    ) {
      if (!map || !L || !layers) return;
      const cluster = group.length > 1;
      const names = group
        .map((pin) => pin.organization.name + " · " + pin.location.name)
        .join("; ");
      const title = cluster
        ? "Aproximar " + group.length + " unidades agrupadas: " + names
        : names;
      const bubble = document.createElement("div");
      bubble.className = cluster
        ? "sa-map-pin sa-map-pin--cluster"
        : "sa-map-pin";
      bubble.dataset.precision = group.some(
        (pin) => pin.location.geolocation.precision === "city",
      )
        ? "city"
        : "coordinates";
      bubble.dataset.status = group.every(
        (pin) =>
          pin.organization.status !== "ACTIVE" ||
          pin.location.status !== "ACTIVE",
      )
        ? "inactive"
        : "active";
      text(
        bubble,
        "span",
        "sa-map-pin-letter",
        cluster
          ? String(group.length)
          : (Array.from(group[0].organization.name)[0]?.toLocaleUpperCase(
            "pt-BR",
          ) ?? ""),
      );
      const marker = L.marker(position, {
        icon: L.divIcon({
          html: bubble,
          className: "sa-map-marker",
          iconSize: [44, 48],
          iconAnchor: [22, 44],
        }),
        title: "",
        keyboard: true,
      });
      const activate = () => {
        if (cluster) expandGroup(group);
        else openDetails(group[0], position, marker.getElement());
      };
      marker.on("click", activate);
      marker.on("keydown", (event) => {
        const original = event.originalEvent as KeyboardEvent;
        if (original.key === "Enter" || original.key === " ") {
          L.DomEvent.stop(original);
          activate();
        }
      });
      marker.addTo(layers);
      const element = marker.getElement();
      if (element) {
        element.setAttribute("aria-label", title);
        element.dataset.testid = "map-marker";
        element.dataset.markerType = cluster ? "cluster" : "unit";
        element.dataset.spread = String(spread);
        element.dataset.locationIds = group
          .map((pin) => pin.location.id)
          .join(",");
        element.dataset.organizationIds = [
          ...new Set(group.map((pin) => pin.organization.id)),
        ].join(",");
        element.dataset.locationCount = String(group.length);
      }
    }

    function renderMarkers() {
      if (!map || !L || !layers) return;
      map.closePopup();
      layers.clearLayers();
      if (containerRef.current)
        containerRef.current.dataset.zoom = String(map.getZoom());
      let spreadCount = 0;
      const groups = clusterMapPins(pins, (geo) =>
        map.project([geo.lat, geo.lng], map.getZoom()),
      );
      for (const group of groups) {
        const { lat, lng } = group[0].location.geolocation;
        if (
          group.length > 1 &&
          group.every((pin) => expandedIds.has(pin.location.id))
        ) {
          const center = map.latLngToLayerPoint([lat, lng]);
          const offsets = mapSpreadOffsets(group.length);
          group.forEach((pin, index) => {
            const position = map.layerPointToLatLng(
              center.add(L.point(offsets[index].x, offsets[index].y)),
            );
            const geo = pin.location.geolocation;
            L.polyline([[geo.lat, geo.lng], position], {
              className: "sa-map-spread-line",
              weight: 1.5,
              opacity: 0.7,
              dashArray: "3 4",
              interactive: false,
            }).addTo(layers);
            addMarker([pin], position, true);
          });
          spreadCount += group.length;
        } else addMarker(group, [lat, lng]);
      }
      setExpandedCount(spreadCount);
    }

    function expandGroup(group: MapPinData[]) {
      if (!map || !L) return;
      expandedIds.clear();
      group.forEach((pin) => expandedIds.add(pin.location.id));
      const groupBounds = L.latLngBounds(
        group.map((pin) => [
          pin.location.geolocation.lat,
          pin.location.geolocation.lng,
        ]),
      );
      const targetZoom = mapClusterExpansionZoom(
        group,
        (geo, zoom) => map.project([geo.lat, geo.lng], zoom),
        map.getZoom(),
        map.getMaxZoom(),
      );
      const fitZoom = map.getBoundsZoom(groupBounds, false, L.point(112, 112));
      const zoom = Math.min(targetZoom, Math.max(map.getZoom(), fitZoom));
      expanding = true;
      map.setView(groupBounds.getCenter(), zoom, { animate: false });
      expanding = false;
      renderMarkers();
      // The clicked cluster is replaced; keep keyboard navigation in the revealed units.
      const first = containerRef.current?.querySelector<HTMLElement>(
        '[data-marker-type="unit"][data-location-ids="' +
        CSS.escape(group[0].location.id) +
        '"]',
      );
      first?.focus({ preventScroll: true });
    }
    function collapse() {
      expandedIds.clear();
      renderMarkers();
    }
    function onZoomStart() {
      if (!expanding) expandedIds.clear();
    }
    collapseRef.current = collapse;
    renderMarkers();
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", renderMarkers);
    map.on("click", collapse);
    return () => {
      map.closePopup();
      collapseRef.current = () => { };
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", renderMarkers);
      map.off("click", collapse);
    };
  }, [pins, ready]);
  function retry() {
    if (starting.current) return;
    starting.current = true;
    setMapError(false);
    setReady(false);
    setAttempt((value) => value + 1);
  }
  const stateControl = (id: string) => (
    <Field>
      <FieldLabel htmlFor={id}>Estado (UF)</FieldLabel>
      <NativeSelect
        id={id}
        value={filters.state}
        onChange={(event) => setFilter("state", event.target.value)}
      >
        <NativeSelectOption value="ALL">Todos os estados</NativeSelectOption>
        {states.map((uf) => (
          <NativeSelectOption key={uf} value={uf}>
            {uf}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );

  return (
    <section
      className="sa-map"
      data-testid="superadmin-map"
      data-organizations={filtered.length}
      data-represented-organizations={represented}
      data-locations={totalLocations}
      data-pins={pins.length}
    >
      <PlatformPanel
        title="Localização das unidades"
        description="Clique em um grupo para aproximar e separar os pinos. Selecione uma unidade para ver os detalhes."
      >
        <div className="sa-map-toolbar">
          <FieldGroup className="sa-map-search">
            <Field>
              <FieldLabel htmlFor="map-search" className="sr-only">
                Buscar empresa, unidade ou cidade
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  id="map-search"
                  value={filters.search}
                  onChange={(event) => setFilter("search", event.target.value)}
                  placeholder="Buscar empresa ou cidade"
                />
              </InputGroup>
            </Field>
          </FieldGroup>
          <div className="sa-map-toolbar-actions">
            <PlatformButton
              variant="outline"
              onClick={() => {
                collapseRef.current();
                mapRef.current?.setView([-15.78, -47.92], 4, {
                  animate: false,
                });
              }}
              disabled={!ready}
              aria-label="Recentralizar no Brasil"
            >
              <Navigation data-icon="inline-start" />
              Brasil
            </PlatformButton>
            <PlatformButton
              variant="outline"
              onClick={() => setFilterOpen(true)}
              data-testid="map-filter-trigger"
            >
              <SlidersHorizontal data-icon="inline-start" />
              Filtros{activeCount > 0 ? " (" + activeCount + ")" : ""}
            </PlatformButton>
            {hasFilters ? (
              <PlatformButton variant="ghost" onClick={clear}>
                <X data-icon="inline-start" />
                Limpar filtros
              </PlatformButton>
            ) : null}
          </div>
        </div>
        <div className="sa-map-summary" role="status" aria-live="polite">
          <span>
            {filtered.length} {filtered.length === 1 ? "empresa" : "empresas"} ·{" "}
            {totalLocations} {totalLocations === 1 ? "unidade" : "unidades"}
          </span>
          <span>
            {represented} de {filtered.length} empresas representadas ·{" "}
            {pins.length} de {totalLocations} unidades localizadas
          </span>
          {filters.state !== "ALL" ? (
            <PlatformStatus>{filters.state}</PlatformStatus>
          ) : null}
        </div>
        <div className="sa-map-canvas-wrap">
          <div
            ref={containerRef}
            className="sa-map-canvas"
            data-testid="map-canvas"
            role="region"
            aria-label="Mapa de empresas e unidades"
          />
          {!ready && !mapError ? (
            <div className="sa-map-loading" role="status">
              <Spinner aria-hidden="true" />
              Carregando mapa…
            </div>
          ) : null}
          {mapError ? (
            <div className="sa-map-loading" role="alert">
              <span>Não foi possível carregar o mapa.</span>
              <PlatformButton variant="outline" onClick={retry}>
                Tentar novamente
              </PlatformButton>
            </div>
          ) : null}
          {ready && !pins.length ? (
            <div className="sa-map-empty">
              <EmptyState
                icon={MapPin}
                title={
                  filtered.length
                    ? "Nenhuma localização disponível"
                    : "Nenhuma empresa encontrada"
                }
                description={
                  filtered.length
                    ? "Consulte os cadastros sem localização abaixo. Não criamos pinos para endereços desconhecidos."
                    : "Ajuste a busca ou limpe os filtros para ver as empresas."
                }
              />
            </div>
          ) : null}
        </div>
        {tileError ? (
          <div className="sa-map-warning" role="alert">
            <span>
              Alguns trechos do mapa não carregaram. Verifique a conexão ou
              tente novamente.
            </span>
            <PlatformButton variant="outline" onClick={retry}>
              Recarregar mapa
            </PlatformButton>
          </div>
        ) : null}
        {expandedCount > 0 ? (
          <p
            className="sa-map-expanded"
            role="status"
            data-testid="map-spread-notice"
          >
            {expandedCount} unidades foram abertas para seleção. As linhas ligam
            os pinos à localização de referência; os endereços não foram
            alterados.
          </p>
        ) : null}
        <p className="sa-map-legend">
          Círculos numerados: clique para aproximar. Contorno contínuo:
          coordenadas informadas. Contorno pontilhado: referência municipal.
        </p>
        {pending.length > 0 ? (
          <details className="sa-map-pending" data-testid="map-pending">
            <summary>
              {pending.length}{" "}
              {pending.length === 1 ? "empresa tem" : "empresas têm"} pendências
              de localização
            </summary>
            <ul>
              {pending.map((org) => (
                <li key={org.id}>
                  <strong>{org.name}</strong>
                  <span>
                    {org.locations.length
                      ? org.locations
                        .filter((loc) => !loc.geolocation)
                        .map(
                          (loc) =>
                            loc.name +
                            ": " +
                            (!loc.address?.trim()
                              ? "endereço não informado"
                              : "endereço sem coordenadas ou município reconhecido"),
                        )
                        .join("; ")
                      : "Nenhuma unidade cadastrada."}
                  </span>
                  <a
                    href={
                      "/superadmin?view=organizations&organization=" +
                      encodeURIComponent(org.id)
                    }
                    className="sa-text-link"
                  >
                    Consultar organização
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </PlatformPanel>
      <SuperadminModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filtrar mapa"
      >
        <FieldGroup>
          {stateControl("map-state")}
          {filterOptions.map((group) => (
            <Field key={group.key}>
              <FieldLabel htmlFor={"map-" + group.key}>
                {group.label}
              </FieldLabel>
              <NativeSelect
                id={"map-" + group.key}
                value={filters[group.key]}
                onChange={(event) => setFilter(group.key, event.target.value)}
              >
                {group.options.map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ))}
        </FieldGroup>
        <div className="sa-map-filter-actions">
          <PlatformButton variant="outline" onClick={clear}>
            <RotateCcw data-icon="inline-start" />
            Limpar filtros
          </PlatformButton>
          <PlatformButton onClick={() => setFilterOpen(false)}>
            Ver no mapa ({filtered.length})
          </PlatformButton>
        </div>
      </SuperadminModal>
      {selectedPopup
        ? createPortal(
          <SuperadminMapPopup
            pin={selectedPopup.pin}
            onClose={selectedPopup.close}
          />,
          selectedPopup.host,
        )
        : null}
    </section>
  );
}

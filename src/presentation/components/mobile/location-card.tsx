"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LocationPoint } from "@/presentation/lib/media-preview";
import "maplibre-gl/dist/maplibre-gl.css";

export function LocationCard({ point }: { point: LocationPoint }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const url = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  useEffect(() => {
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    let observer: ResizeObserver | undefined;
    setFailed(false);
    void import("maplibre-gl").then(({ Map, Marker, setWorkerUrl }) => {
      if (disposed || !container.current) return;
      setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      const zoom = Math.min(18, Math.max(12, Math.log2(156543.03 * Math.max(0.000001, Math.cos(point.latitude * Math.PI / 180)) / (Math.max(point.accuracy, 10) * 4 / 160))));
      map = new Map({ container: container.current, style: "https://tiles.openfreemap.org/styles/liberty", center: [point.longitude, point.latitude], zoom, interactive: false, attributionControl: { compact: true } });
      observer = new ResizeObserver(() => map?.resize());
      observer.observe(container.current);
      const marker = document.createElement("div");
      marker.className = "employee-location-marker";
      new Marker({ element: marker }).setLngLat([point.longitude, point.latitude]).addTo(map);
      map.on("load", () => {
        if (!disposed) setFailed(false);
        if (disposed || !map || point.accuracy <= 0) return;
        const ring: number[][] = [];
        for (let step = 0; step <= 48; step++) {
          const angle = 2 * Math.PI * step / 48;
          ring.push([point.longitude + point.accuracy * Math.cos(angle) / (111320 * Math.max(0.000001, Math.cos(point.latitude * Math.PI / 180))), point.latitude + point.accuracy * Math.sin(angle) / 111320]);
        }
        map.addSource("accuracy", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } } });
        map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#247B56", "fill-opacity": 0.15 } });
        map.addLayer({ id: "accuracy-line", type: "line", source: "accuracy", paint: { "line-color": "#247B56", "line-opacity": 0.5, "line-width": 1 } });
      });
      map.on("error", () => { if (!disposed) setFailed(true); });
      map.on("idle", () => { if (!disposed && container.current) container.current.dataset.mapReady = "true"; });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; observer?.disconnect(); map?.remove(); };
  }, [point.latitude, point.longitude, point.accuracy]);
  return <div className="employee-location-card">
    <div className="employee-location-map"><div ref={container} />
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir localização no app de mapas" />
      {failed && <span className="employee-location-fallback"><MapPin />{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span>}
    </div>
    {point.accuracy > 0 && <p>Precisão de aproximadamente {Math.round(point.accuracy)} m</p>}
    <Button variant="outline" render={<a href={url} target="_blank" rel="noopener noreferrer" />}>Abrir no app de mapas</Button>
  </div>;
}

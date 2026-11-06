"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Clock3, ImageIcon, Video, Play, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cloudinaryPreview } from "@/presentation/lib/media-preview";

export type GalleryMedia = {
  id: string; kind: "image" | "video"; status: "VALID" | "REJECTED" | "DRAFT" | "SAVED";
  url?: string | null; file?: File | null; caption?: string | null; reason?: string | null;
};
const labels = { VALID: "Aceita", REJECTED: "Rejeitada", DRAFT: "Não enviada", SAVED: "Registrada" };
function StatusIcon({ status }: { status: GalleryMedia["status"] }) {
  const Icon = status === "REJECTED" ? XCircle : status === "DRAFT" ? Clock3 : CheckCircle2;
  return <Icon aria-hidden="true" />;
}

export function MediaGallery(props: { scope: string; items: GalleryMedia[]; disabled?: boolean; onRemove?: (id: string) => void }) {
  return <Gallery key={props.scope} {...props} />;
}

function Gallery({ items, disabled, onRemove }: { items: GalleryMedia[]; disabled?: boolean; onRemove?: (id: string) => void }) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const cache = useRef(new Map<string, string>());
  const flights = useRef(new Map<string, Promise<string | null>>());
  const downloads = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  const mounted = useRef(true);
  const video = useRef<HTMLVideoElement>(null);
  const swipeStart = useRef<number | null>(null);
  const index = items.findIndex(item => item.id === selected);
  const current = items[index];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; downloads.current.forEach(controller => controller.abort()); downloads.current.clear(); objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear(); cache.current.clear(); };
  }, []);

  async function ensure(item: GalleryMedia): Promise<string | null> {
    const cached = cache.current.get(item.id);
    if (cached) return cached;
    const flight = flights.current.get(item.id);
    if (flight) return flight;
    if (!item.file && !item.url) return null;
    setLoading(previous => ({ ...previous, [item.id]: true }));
    setErrors(previous => ({ ...previous, [item.id]: "" }));
    const request = (async () => {
      let url: string;
      if (item.file) {
        url = URL.createObjectURL(item.file); objectUrls.current.add(url);
      } else if (item.url!.startsWith("/api/")) {
        const controller = new AbortController();
        downloads.current.set(item.id, controller);
        const response = await fetch(item.url!, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("A comprovação está indisponível ou fora do seu acesso.");
        const blob = await response.blob();
        if (!mounted.current) return null;
        url = URL.createObjectURL(new Blob([blob], { type: item.kind === "video" ? "video/mp4" : "image/jpeg" }));
        objectUrls.current.add(url);
      } else {
        url = item.kind === "image" ? cloudinaryPreview(item.url, "image") ?? item.url! : item.url!;
      }
      if (!mounted.current) return null;
      cache.current.set(item.id, url);
      setResolved(previous => ({ ...previous, [item.id]: url }));
      return url;
    })().catch(() => {
      if (mounted.current) setErrors(previous => ({ ...previous, [item.id]: "Não foi possível abrir o arquivo. Tente novamente." }));
      return null;
    }).finally(() => {
      flights.current.delete(item.id);
      downloads.current.delete(item.id);
      if (mounted.current) setLoading(previous => ({ ...previous, [item.id]: false }));
    });
    flights.current.set(item.id, request);
    return request;
  }

  useEffect(() => { for (const item of items) if (item.file && item.kind === "image") void ensure(item); }, [items]);
  useEffect(() => { if (current) { setZoom(1); void ensure(current); } }, [current?.id]);
  const move = (delta: number) => { video.current?.pause(); const next = items[index + delta]; if (next) setSelected(next.id); };
  const close = () => { video.current?.pause(); setSelected(null); };

  return <div className="employee-media-gallery">
    <div className="employee-media-grid">{items.map((item, position) => {
      const thumbnail = cloudinaryPreview(item.url, item.kind, true) ?? (item.kind === "image" ? resolved[item.id] : null);
      const KindIcon = item.kind === "video" ? Video : ImageIcon;
      return <div key={item.id} className="employee-media-tile" data-status={item.status}>
        <button type="button" aria-label={`${item.kind === "video" ? "Vídeo" : "Foto"} ${position + 1}, ${labels[item.status]}`} onClick={() => setSelected(item.id)}>
          {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="employee-media-placeholder"><KindIcon /><small>{item.url || item.file ? "Tocar para ver" : "Indisponível"}</small></span>}
          {item.kind === "video" && <span className="employee-media-play"><Play /></span>}
          <span className="employee-media-status"><StatusIcon status={item.status} /></span>
        </button>
        {onRemove && item.status === "DRAFT" && !disabled && <button type="button" className="employee-media-remove" aria-label={`Remover ${item.kind === "video" ? "vídeo" : "foto"} ${position + 1}`} onClick={() => onRemove(item.id)}><X /></button>}
      </div>;
    })}</div>
    {items.map((item, position) => item.status === "REJECTED" && item.reason ? <p key={item.id} className="employee-media-rejection">{item.kind === "video" ? `Vídeo ${position + 1} rejeitado: ` : `Foto ${position + 1} rejeitada: `}{item.reason}</p> : null)}
    <Dialog open={!!current} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent showCloseButton={false} className="employee-media-viewer sm:max-w-xl max-w-[94vw] p-0 gap-0 border-none ring-0 overflow-hidden" onKeyDown={event => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}>
        <DialogTitle className="sr-only">Visualizar comprovação</DialogTitle>
        <DialogDescription className="sr-only">Use as setas para navegar entre os arquivos.</DialogDescription>
        {current && <>
          <header><Button variant="ghost" size="icon" aria-label="Fechar" onClick={close}><X /></Button><span>{index + 1} de {items.length}</span><span className="size-8" /></header>
          <div className="employee-media-stage" onTouchStart={event => { swipeStart.current = event.touches[0].clientX; }} onTouchEnd={event => {
            if (zoom === 1 && swipeStart.current !== null) { const delta = event.changedTouches[0].clientX - swipeStart.current; if (Math.abs(delta) > 60) move(delta > 0 ? -1 : 1); } swipeStart.current = null;
          }}>
            {loading[current.id] ? <Spinner /> : errors[current.id] ? <div role="alert"><p>{errors[current.id]}</p><Button variant="outline" onClick={() => { void ensure(current); }}>Tentar novamente</Button></div>
              : resolved[current.id] ? current.kind === "video" ? <video key={current.id} ref={video} src={resolved[current.id]} controls playsInline preload="metadata" />
                : <div className="employee-media-zoom"><img src={resolved[current.id]} alt="Foto da comprovação" onDoubleClick={() => setZoom(zoom === 1 ? 2 : 1)} style={{ width: `${zoom * 100}%`, maxWidth: "none", height: zoom === 1 ? "100%" : "auto", cursor: zoom === 1 ? "zoom-in" : "zoom-out" }} /></div>
                : <p>Arquivo indisponível</p>}
          </div>
          <footer data-status={current.status}><div><StatusIcon status={current.status} /><strong>{labels[current.status]}</strong>{current.caption && <span>· {current.caption}</span>}</div>{current.reason && <p>{current.reason}</p>}
            <div className="employee-media-controls"><Button variant="ghost" size="icon" aria-label="Arquivo anterior" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft /></Button>
              {current.kind === "image" && <><Button variant="ghost" size="icon" aria-label="Diminuir zoom" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 1))}><ZoomOut /></Button><Button variant="ghost" size="icon" aria-label="Ampliar foto" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom + 1))}><ZoomIn /></Button></>}
              <Button variant="ghost" size="icon" aria-label="Próximo arquivo" disabled={index === items.length - 1} onClick={() => move(1)}><ChevronRight /></Button></div>
          </footer>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}

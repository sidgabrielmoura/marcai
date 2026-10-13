"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Video,
  FileUp,
  FileText,
  Hash,
  PenTool,
  Navigation,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface TaskEvidenceRequirement {
  id: string;
  type: string;
  required: boolean;
  minQuantity: number;
  executionStage?: string;
  submissions: {
    id: string;
    validationStatus: string;
    attemptNumber: number;
    value: string | null;
    storageKey?: string | null;
    createdAt: string;
  }[];
}

export interface EvidenceDraft {
  file: File | null;
  value: string;
  signed: boolean;
  getSignatureBlob?: () => Promise<Blob | null>;
}

export const evidenceTypeMeta: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PHOTO: { label: "Foto de comprovação", icon: Camera },
  VIDEO: { label: "Gravação de vídeo", icon: Video },
  FILE: { label: "Anexo de arquivo", icon: FileUp },
  TEXT: { label: "Relato escrito", icon: FileText },
  NUMBER: { label: "Medição / Valor", icon: Hash },
  SIGNATURE: { label: "Assinatura digital", icon: PenTool },
  LOCATION: { label: "Localização GPS", icon: Navigation },
};

export function TaskEvidenceItem({
  taskId,
  requirement: req,
  disabled,
  draft,
  onDraftChange,
  onSuccess,
  onError,
}: {
  taskId: string;
  requirement: TaskEvidenceRequirement;
  disabled: boolean;
  draft?: EvidenceDraft;
  onDraftChange: (draft: EvidenceDraft) => void;
  onSuccess?: (msg?: string) => void;
  onError?: (err: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(draft?.value ?? "");
  const [file, setFile] = useState<File | null>(draft?.file ?? null);
  const [signed, setSigned] = useState(draft?.signed ?? false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  // ─── Câmera traseira (PHOTO) ─────────────────────────────────────────
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function openCamera() {
    setCameraError(null);
    setPhotoPreview(null);
    setFile(null);
    onDraftChange({ file: null, value: "", signed: false });
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraError(null);
  }

  function snapPhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const timestamp = Date.now();
      const capturedFile = new File([blob], `foto_evidencia_${timestamp}.jpg`, { type: "image/jpeg" });
      setFile(capturedFile);
      setPhotoPreview(URL.createObjectURL(blob));
      closeCamera();
      onDraftChange({ file: capturedFile, value: "", signed: false });
    }, "image/jpeg", 0.92);
  }

  const meta = evidenceTypeMeta[req.type] || {
    label: req.type,
    icon: FileText,
  };
  const Icon = meta.icon;

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const valid = req.submissions.filter((s) => s.validationStatus === "VALID");
  const failures = req.submissions.filter((s) => s.validationStatus === "REJECTED").length;
  const isDone = valid.length >= req.minQuantity;

  async function handleCaptureGps() {
    if (!navigator.geolocation) {
      onError?.("Este navegador não suporta geolocalização.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const val = JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setValue(val);
        onDraftChange({ file: null, value: val, signed: false });
        setBusy(false);
      },
      () => {
        onError?.("Não foi possível obter localização. Verifique as permissões de GPS.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const currentFile = draft?.file ?? file;
  const currentValue = draft?.value ?? value;
  const isSigned = draft?.signed ?? signed;

  const hasAttachedDraft =
    (req.type === "PHOTO" && (!!currentFile || !!photoPreview)) ||
    (["VIDEO", "FILE"].includes(req.type) && !!currentFile) ||
    (req.type === "SIGNATURE" && isSigned) ||
    (req.type === "LOCATION" && !!currentValue) ||
    (["TEXT", "NUMBER"].includes(req.type) && !!currentValue.trim());

  const draftMessage =
    req.type === "PHOTO"
      ? "Foto capturada — pronta para envio ao concluir"
      : ["VIDEO", "FILE"].includes(req.type)
        ? `Arquivo pronto: ${currentFile?.name || "anexado"} (${Math.round((currentFile?.size ?? 0) / 1024)} KB)`
        : req.type === "SIGNATURE"
          ? "Assinatura desenhada — pronta para envio ao concluir"
          : req.type === "LOCATION"
            ? "Localização GPS obtida — pronta para envio ao concluir"
            : req.type === "NUMBER"
              ? `Medição preenchida: ${currentValue}`
              : "Relato escrito preenchido";

  return (
    <div
      className={`p-3.5 rounded-xl border transition-colors ${isDone
        ? "bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/40"
        : hasAttachedDraft
          ? "bg-blue-50/40 border-blue-200 dark:bg-blue-950/10 dark:border-blue-900/40"
          : "bg-slate-50/60 dark:bg-muted/15 border-[var(--border-subtle)]"
        }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${isDone
              ? "bg-emerald-100 text-emerald-700"
              : hasAttachedDraft
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-700 dark:bg-muted dark:text-foreground"
              }`}
          >
            <Icon className="size-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-xs text-[var(--text-primary)]">
              {meta.label}
            </h4>
            <span className="text-[10px] text-muted-foreground">
              {req.minQuantity > 1 ? `Exige ${req.minQuantity} envios` : "Envio único"}
            </span>
          </div>
        </div>

        <Badge
          variant={isDone ? "secondary" : "outline"}
          className={`text-[10px] font-semibold ${isDone
            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
            : hasAttachedDraft
              ? "bg-blue-50 text-blue-800 border-blue-200"
              : req.required
                ? "border-amber-300 text-amber-800 bg-amber-50"
                : "text-slate-500"
            }`}
        >
          {isDone ? "Concluída" : hasAttachedDraft ? "Anexada" : req.required ? "Obrigatória" : "Opcional"}
        </Badge>
      </div>

      {valid.map((s) => (
        <p key={s.id} className="text-xs text-muted-foreground break-all my-1.5 flex items-center gap-1.5">
          <Check className="size-3 text-emerald-600 shrink-0" />
          {s.storageKey ? (
            <a
              className="underline text-blue-600 hover:text-blue-800 font-medium"
              href={`/api/evidence/${s.id}`}
            >
              Visualizar {s.value || "comprovação"}
            </a>
          ) : (
            <span>{s.value}</span>
          )}
        </p>
      ))}

      {failures > 0 && !isDone && (
        <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 my-1.5">
          {failures} envio(s) não atendido(s). Anexe uma nova comprovação.
        </p>
      )}

      {!isDone && !disabled && (
        <div className="flex flex-col gap-2.5 mt-2">
          {req.type === "PHOTO" && (
            <div className="flex flex-col gap-2">
              {/* Câmera ao vivo */}
              {cameraOpen && (
                <div className="flex flex-col gap-2">
                  {cameraError ? (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                      {cameraError}
                    </div>
                  ) : (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-h-64 object-cover"
                      />
                      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-3">
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 w-10 rounded-full bg-white text-slate-800 hover:bg-slate-100 shadow-lg p-0 cursor-pointer"
                          onClick={snapPhoto}
                        >
                          <Camera className="size-4" />
                          <span className="sr-only">Tirar foto</span>
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-xs h-8 text-slate-500 cursor-pointer"
                    onClick={closeCamera}
                  >
                    Cancelar
                  </Button>
                </div>
              )}

              {/* Preview da foto tirada */}
              {!cameraOpen && photoPreview && (
                <div className="flex flex-col gap-1.5">
                  <div className="relative rounded-xl overflow-hidden border border-emerald-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Foto capturada" className="w-full max-h-52 object-cover" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-xs h-8 text-slate-500 cursor-pointer"
                    onClick={openCamera}
                  >
                    <Camera data-icon="inline-start" className="size-3.5" />
                    Tirar nova foto
                  </Button>
                </div>
              )}

              {/* Botões de captura/anexo */}
              {!cameraOpen && !photoPreview && (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 text-xs font-semibold rounded-xl cursor-pointer"
                    onClick={openCamera}
                  >
                    <Camera data-icon="inline-start" className="size-4" />
                    Abrir câmera traseira
                  </Button>
                  <div className="relative flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground bg-surface px-2">ou selecione uma foto</span>
                  </div>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) {
                        setFile(f);
                        setPhotoPreview(URL.createObjectURL(f));
                        onDraftChange({ file: f, value: "", signed: false });
                      }
                    }}
                    className="h-9 text-xs bg-white dark:bg-card file:text-xs file:font-semibold cursor-pointer"
                  />
                </div>
              )}

              <p className="text-[10px] text-muted-foreground leading-snug">
                Tire a foto diretamente pela câmera ou anexe o arquivo comprobatório.
              </p>
            </div>
          )}

          {["VIDEO", "FILE"].includes(req.type) && (
            <div className="flex flex-col gap-1">
              <Input
                type="file"
                accept={
                  req.type === "VIDEO"
                    ? "video/mp4"
                    : "image/jpeg,image/png,image/webp,application/pdf,video/mp4"
                }
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  onDraftChange({ file: f, value: "", signed: false });
                }}
                className="h-9 text-xs bg-white dark:bg-card file:text-xs file:font-semibold cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground">
                Formatos permitidos: {req.type === "VIDEO" ? "MP4" : "JPG, PNG, WebP ou PDF"} (máx. 10 MB)
              </span>
            </div>
          )}

          {["TEXT", "NUMBER"].includes(req.type) && (
            <div className="flex flex-col gap-1">
              {req.type === "TEXT" ? (
                <Textarea
                  value={currentValue}
                  onChange={(e) => {
                    setValue(e.target.value);
                    onDraftChange({ file: null, value: e.target.value, signed: false });
                  }}
                  rows={2}
                  className="text-xs bg-white dark:bg-card"
                  placeholder="Escreva a resposta ou observação aqui..."
                />
              ) : (
                <Input
                  type="number"
                  step="any"
                  value={currentValue}
                  onChange={(e) => {
                    setValue(e.target.value);
                    onDraftChange({ file: null, value: e.target.value, signed: false });
                  }}
                  placeholder="Digite a medição numérica..."
                  className="h-9 text-xs! bg-white dark:bg-card"
                />
              )}
            </div>
          )}

          {req.type === "LOCATION" && (
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={handleCaptureGps}
                className="w-full text-xs h-9 cursor-pointer"
              >
                <Navigation data-icon="inline-start" className="size-3.5" />
                {currentValue ? "Atualizar coordenadas GPS" : "Obter localização atual"}
              </Button>
            </div>
          )}

          {req.type === "SIGNATURE" && (
            <div className="flex flex-col gap-1.5">
              <div className="border border-slate-300 dark:border-border rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={130}
                  aria-label="Área de assinatura"
                  className="touch-none w-full h-[110px] bg-white cursor-crosshair block"
                  onPointerDown={(e) => {
                    isDrawing.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ctx = e.currentTarget.getContext("2d");
                    if (ctx) {
                      ctx.beginPath();
                      ctx.moveTo(
                        ((e.clientX - rect.left) * 500) / rect.width,
                        ((e.clientY - rect.top) * 130) / rect.height
                      );
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!isDrawing.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ctx = e.currentTarget.getContext("2d");
                    if (ctx) {
                      ctx.lineWidth = 2.5;
                      ctx.strokeStyle = "#0f172a";
                      ctx.lineCap = "round";
                      ctx.lineJoin = "round";
                      ctx.lineTo(
                        ((e.clientX - rect.left) * 500) / rect.width,
                        ((e.clientY - rect.top) * 130) / rect.height
                      );
                      ctx.stroke();
                      setSigned(true);
                      onDraftChange({
                        file: null,
                        value: "",
                        signed: true,
                        getSignatureBlob: () =>
                          new Promise<Blob | null>((resolve) =>
                            canvasRef.current?.toBlob(resolve, "image/png")
                          ),
                      });
                    }
                  }}
                  onPointerUp={() => {
                    isDrawing.current = false;
                  }}
                  onPointerCancel={() => {
                    isDrawing.current = false;
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">
                  Desenhe com o dedo ou ponteiro
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-slate-500 cursor-pointer"
                  onClick={() => {
                    const ctx = canvasRef.current?.getContext("2d");
                    ctx?.clearRect(0, 0, 500, 130);
                    setSigned(false);
                    onDraftChange({ file: null, value: "", signed: false });
                  }}
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}

          {hasAttachedDraft && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs">
              <Check className="size-3.5 text-emerald-600 shrink-0 stroke-[2.5]" />
              <span className="font-medium truncate">{draftMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import type { ConnectionDTO } from "@/domain/whatsapp/contracts";

/** Owned by one mounted settings screen. Never persisted or shared between tabs. */
export class WhatsAppQrCache {
  private entries = new Map<string, { value: ConnectionDTO; timer: ReturnType<typeof setTimeout> }>();

  read(id: string, status: string, revision: number): ConnectionDTO | null {
    const saved = this.entries.get(id)?.value;
    if (!saved) return null;
    if (status !== "SCAN_QR_CODE" || saved.revision !== revision || !saved.qrExpiresAt || saved.qrExpiresAt <= Date.now()) {
      this.forget(id);
      return null;
    }
    return saved;
  }

  remember(id: string, value: ConnectionDTO) {
    this.forget(id);
    if (value.status !== "SCAN_QR_CODE" || !value.qr || !value.qrExpiresAt || value.qrExpiresAt <= Date.now()) return;
    const timer = setTimeout(() => this.forget(id), value.qrExpiresAt - Date.now());
    this.entries.set(id, { value: { ...value }, timer });
    if (this.entries.size > 20) this.forget(this.entries.keys().next().value!);
  }

  forget(id: string) {
    const saved = this.entries.get(id);
    if (saved) clearTimeout(saved.timer);
    this.entries.delete(id);
  }

  clear() {
    for (const id of this.entries.keys()) this.forget(id);
  }
}

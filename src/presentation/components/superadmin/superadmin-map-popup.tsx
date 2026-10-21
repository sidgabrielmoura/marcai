"use client";

import { ArrowUpRight, MapPin, Users, X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MapPin as MapPinData } from "@/application/superadmin/map-data";
import { PlatformButton, usePlatformActivityContext } from "./platform-async";
import { PlatformIdentity, PlatformStatus } from "./superadmin-ui";

function PopupLink({
  href,
  children,
  variant = "default",
  label,
}: {
  href: string;
  children: ReactNode;
  variant?: "default" | "outline";
  label: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null),
    activity = usePlatformActivityContext();
  const loading = !!activity?.busy && activity.activeElement === ref.current;
  return (
    <a
      ref={ref}
      href={href}
      className={buttonVariants({ variant })}
      data-slot="button"
      aria-label={label}
      aria-busy={loading || undefined}
      aria-disabled={activity?.busy || undefined}
    >
      {loading ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
      {children}
    </a>
  );
}

export function SuperadminMapPopup({
  pin,
  onClose,
}: {
  pin: MapPinData;
  onClose: () => void;
}) {
  const { organization: org, location: loc } = pin;
  const approximate = loc.geolocation.precision === "city";
  const organizationUrl =
    "/superadmin?view=organizations&organization=" + encodeURIComponent(org.id);
  const peopleUrl =
    "/superadmin?view=users&organization=" + encodeURIComponent(org.id);

  return (
    <article
      className="sa-map-popup"
      data-testid="map-popup"
      data-location-id={loc.id}
      aria-label={"Detalhes de " + org.name}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="sa-map-popup-header">
        <PlatformIdentity name={org.name} description={"/" + org.slug} />
        <PlatformButton
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Fechar detalhes da empresa"
        >
          <X />
        </PlatformButton>
      </header>
      <div className="sa-map-popup-status">
        <PlatformStatus tone={org.status === "ACTIVE" ? "success" : "danger"}>
          {org.status === "ACTIVE" ? "Empresa ativa" : "Empresa suspensa"}
        </PlatformStatus>
        {loc.status !== "ACTIVE" ? (
          <PlatformStatus tone="warning">Unidade inativa</PlatformStatus>
        ) : null}
      </div>
      <div className="sa-map-popup-body">
        <section
          className="sa-map-popup-location"
          aria-label="Unidade e endereço"
        >
          <MapPin aria-hidden="true" />
          <div>
            <h3>{loc.name}</h3>
            <p>{loc.address ?? "Endereço não informado"}</p>
          </div>
        </section>
        {approximate ? null : (
          <p className="sa-map-popup-precision">
            "Localização pelas coordenadas informadas no cadastro."
          </p>
        )}
        <dl className="sa-map-popup-facts">
          <div>
            <dt>Pessoas</dt>
            <dd>{org.membersCount}</dd>
          </div>
          <div>
            <dt>Unidades</dt>
            <dd>{org.locationsCount}</dd>
          </div>
          <div>
            <dt>Plano</dt>
            <dd>{org.subscription?.planName ?? "Sem assinatura"}</dd>
          </div>
          <div>
            <dt>Cadastro</dt>
            <dd>
              {new Date(org.createdAt).toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
              <span>{org.daysInSystem} dias no sistema</span>
            </dd>
          </div>
        </dl>
      </div>
      <footer className="sa-map-popup-actions">
        <PopupLink href={organizationUrl} label="Ver organização">
          Ver organização
          <ArrowUpRight data-icon="inline-end" />
        </PopupLink>
        <PopupLink variant="outline" href={peopleUrl} label="Pessoas">
          <Users data-icon="inline-start" />
          <span className="sa-map-popup-people-label">Pessoas</span>
        </PopupLink>
      </footer>
    </article>
  );
}

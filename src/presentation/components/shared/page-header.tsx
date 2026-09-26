import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  greeting?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}
export function PageHeader({
  title,
  greeting,
  subtitle,
  backHref,
  backLabel = "Voltar",
  action,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {backHref && (
        <Link href={backHref} className="page-back">
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      )}
      <div className="page-heading-row">
        <div className="page-heading-copy">
          {greeting && <p className="page-greeting">{greeting}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {(action || actions) && (
          <div className="page-actions">{action || actions}</div>
        )}
      </div>
      {children && <div className="page-header-extra">{children}</div>}
    </header>
  );
}

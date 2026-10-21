"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowUpRight, Building2, MoreVertical } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformButton as Button, usePlatformActivityContext } from "./platform-async";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "../shared/modal";
import { cn } from "@/lib/utils";

export function SuperadminModal(props: ComponentProps<typeof Modal>) {
  const activity = usePlatformActivityContext();
  return (
    <Modal {...props} onClose={() => { if (!activity?.locked()) props.onClose(); }} className={cn(props.className, "superadmin-dialog")} />
  );
}

export function PlatformPage({
  children,
  subscriptions = false,
  tab,
  onTabChange,
}: {
  children: ReactNode;
  subscriptions?: boolean;
  tab?: string;
  onTabChange?: (value: string) => void;
}) {
  return subscriptions && tab && onTabChange ? (
    <Tabs className="superadmin-page" value={tab} onValueChange={onTabChange}>
      {children}
    </Tabs>
  ) : (
    <div className="superadmin-page">{children}</div>
  );
}

export function PlatformStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <Badge variant="outline" className="sa-status" data-tone={tone}>
      {children}
    </Badge>
  );
}

export function PlatformPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("sa-panel", className)}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PlatformMetric({
  label,
  value,
  description,
  href,
  featured,
}: {
  label: string;
  value: number;
  description: string;
  href: string;
  featured?: boolean;
}) {
  return (
    <Card className={cn("sa-metric", featured && "sa-metric--featured")}>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardAction>
          <a
            href={href}
            className="sa-metric-link"
            aria-label={`Ver ${label.toLocaleLowerCase("pt-BR")}`}
          >
            <ArrowUpRight size={17} />
          </a>
        </CardAction>
      </CardHeader>
      <CardContent>
        <strong>{value.toLocaleString("pt-BR")}</strong>
        <p>{description}</p>
      </CardContent>
    </Card>
  );
}

export function PlatformIdentity({
  name,
  description,
  initials,
}: {
  name: string;
  description?: ReactNode;
  initials?: string;
}) {
  return (
    <div className="sa-identity">
      <Avatar className="sa-avatar">
        <AvatarFallback>{initials || <Building2 size={18} />}</AvatarFallback>
      </Avatar>
      <div>
        <strong title={name}>{name}</strong>
        {description && <div className="sa-secondary">{description}</div>}
      </div>
    </div>
  );
}

export function PlatformActions({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "sa-action-btn size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--canvas)] transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer",
        )}
        aria-label={`Ações de ${label}`}
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlatformTable({
  label,
  columns,
  children,
}: {
  label: string;
  columns: string[];
  children: ReactNode;
}) {
  return (
    <Table className="sa-table" aria-label={label}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead scope="col" key={column}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export function PlatformQuota({
  label,
  count,
  limit,
}: {
  label: string;
  count: number;
  limit: number | null;
}) {
  const exceeded = limit !== null && count > limit;
  const percent =
    limit === null
      ? null
      : limit === 0
        ? count > 0
          ? 100
          : 0
        : Math.min(100, Math.round((count / limit) * 100));
  return (
    <div className="sa-quota" data-exceeded={exceeded || undefined}>
      <div>
        <span>{label}</span>
        <strong>
          {count} <span>{limit === null ? "/ sem limite" : `/ ${limit}`}</span>
        </strong>
      </div>
      {percent !== null && (
        <Progress
          value={percent}
          aria-label={`${label}: ${count} de ${limit}${exceeded ? ", acima do limite" : ""}`}
        />
      )}
    </div>
  );
}

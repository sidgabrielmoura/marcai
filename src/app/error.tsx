"use client";

import Link from "next/link";
import { Brand } from "@/presentation/components/shared/brand";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-canvas">
      <Card className="w-full max-w-md text-center p-8 bg-[var(--surface)] rounded-[18px] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] ring-0">
        <div className="flex justify-center mb-6">
          <Brand />
        </div>
        <CardHeader className="p-0 gap-2 mb-6">
          <CardTitle className="text-[var(--text-primary)]">
            <h1 className="text-[length:var(--type-page-title)] font-extrabold">Não foi possível carregar esta página.</h1>
          </CardTitle>
          <CardDescription className="text-[length:var(--type-body)] text-[var(--text-secondary)] leading-relaxed">
            Tente novamente para continuar de onde parou.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 flex flex-wrap gap-3 justify-center">
          <Button
            onClick={reset}
            className="h-11 px-5 rounded-[14px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[length:var(--type-body)] shadow-none"
          >
            Tentar novamente
          </Button>
          <Button
            variant="outline"
            render={<Link href="/" />}
            nativeButton={false}
            className="h-11 px-5 rounded-[14px] font-semibold text-[length:var(--type-body)] shadow-none"
          >
            Voltar ao início
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

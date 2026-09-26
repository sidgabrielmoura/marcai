import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/presentation/components/shared/brand";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-[var(--canvas)]">
      <Card className="w-full max-w-md text-center p-8 bg-[var(--surface)] rounded-[18px] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] ring-0">
        <div className="flex justify-center mb-6">
          <Brand />
        </div>
        <CardHeader className="p-0 gap-2">
          <p className="text-[length:var(--type-body)] font-medium text-[var(--text-secondary)]">
            Página não encontrada
          </p>
          <CardTitle className="text-[var(--text-primary)]">
            <h1 className="text-[length:var(--type-page-title)] font-extrabold">Vamos voltar ao caminho certo.</h1>
          </CardTitle>
          <CardDescription className="text-[length:var(--type-body)] text-[var(--text-secondary)] leading-relaxed mb-4">
            Este endereço não está disponível. Volte ao início para continuar
            sua operação.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Button
            render={<Link href="/" />}
            nativeButton={false}
            className="h-11 px-5 rounded-[14px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[length:var(--type-body)] shadow-none"
          >
            <ArrowLeft data-icon="inline-start" />
            Voltar ao início
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

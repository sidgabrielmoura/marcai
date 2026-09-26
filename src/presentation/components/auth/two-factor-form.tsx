"use client";

import { useActionState } from "react";
import Link from "next/link";
import { verifySecondFactorAction } from "@/presentation/actions/two-factor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function TwoFactorForm({ secret }: { secret: string | null }) {
  const [state, action, pending] = useActionState(verifySecondFactorAction, {});
  return <div className="flex flex-col gap-5">
    {secret && <div className="flex flex-col gap-3">
      <ol className="list-decimal pl-5 space-y-2 text-sm"><li>Abra seu aplicativo autenticador e escolha adicionar uma conta por chave.</li><li>Use o nome Marcai, selecione códigos baseados em tempo e copie a chave abaixo.</li><li>Digite o código de seis dígitos para confirmar a ativação.</li></ol>
      <Field><FieldLabel htmlFor="totp-secret">Chave de configuração</FieldLabel><Input id="totp-secret" readOnly value={secret} className="font-mono text-sm" onFocus={e => e.currentTarget.select()} /></Field>
      <p className="text-sm text-muted-foreground">Guarde a chave em um local seguro para recuperar seu autenticador.</p>
    </div>}
    <form action={action} className="flex flex-col gap-4">
      <Field><FieldLabel htmlFor="totp-code">Código do autenticador</FieldLabel><Input id="totp-code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} placeholder="000000" required autoFocus /></Field>
      {state.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Verificando…" : secret ? "Ativar e acessar" : "Verificar e acessar"}</Button>
      <Button nativeButton={false} variant="ghost" render={<Link href="/login" />}>Voltar ao login</Button>
    </form>
  </div>;
}

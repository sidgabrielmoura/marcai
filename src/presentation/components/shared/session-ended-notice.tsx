"use client";

import { useEffect, useState } from "react";

export function SessionEndedNotice() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "session-replaced") setNotice("Outro dispositivo conectou-se à sua conta. Sua sessão neste dispositivo foi encerrada por segurança.");
    else if (reason === "session-ended") setNotice("Sua sessão foi encerrada ou expirou. Entre novamente para continuar.");
  }, []);
  return notice ? (
    <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
      {notice}
    </div>
  ) : null;
}

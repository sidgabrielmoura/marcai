export function Brand({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="brand-lockup justify-center" title="marcaí">
        <img
          src="/brand-icon-sem-fundo.svg"
          alt="marcaí"
          className="w-8 h-8 object-contain"
        />
      </span>
    );
  }

  return (
    <span className="brand-lockup">
      <span className="flex items-center text-green-950">
        <img
          src="/brand-icon-sem-fundo.svg"
          alt=""
          className="w-8 h-8 object-contain mr-0.5"
        />
        <span>
          arcaí<span className="brand-dot">.</span>
        </span>
      </span>
    </span>
  );
}

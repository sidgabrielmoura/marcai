export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup">
      {!compact && (
        <span>
          marcaí<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}

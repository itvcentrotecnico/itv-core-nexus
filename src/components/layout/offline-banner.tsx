import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Aviso fixo de ausência de conexão. Não há operação offline: o sistema
 * apenas informa que os dados podem não estar disponíveis.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const atualizar = () => setOffline(!navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-3 py-2 text-center text-xs font-medium text-destructive-foreground"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      Sem conexão. Alguns recursos podem não estar disponíveis.
    </div>
  );
}

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISPENSADO_KEY = "itv:pwa-install-dispensado";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Sugestão discreta de instalação; some de vez quando o usuário recusa. */
export function InstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISPENSADO_KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setEvento(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!evento) return null;

  function dispensar() {
    localStorage.setItem(DISPENSADO_KEY, "1");
    setEvento(null);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    localStorage.setItem(DISPENSADO_KEY, "1");
    setEvento(null);
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-80">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Download className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold text-foreground">Instalar Gestão ITV</span>
        <span className="block text-xs text-muted-foreground">
          Use como aplicativo neste dispositivo.
        </span>
      </span>
      <button
        type="button"
        onClick={instalar}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        Instalar
      </button>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

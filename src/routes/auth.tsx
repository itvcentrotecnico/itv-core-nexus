import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";
import logoColor from "@/assets/itv-logo-color.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content: "Acesso ao sistema interno de gestão da ITV Centro Técnico.",
      },
      { property: "og:title", content: "Entrar — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Acesso ao sistema interno de gestão da ITV Centro Técnico.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: sessionLoading } = useSession();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && isAuthenticated) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [sessionLoading, isAuthenticated, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(
            signInError.message === "Invalid login credentials"
              ? "E-mail ou senha incorretos."
              : "Não foi possível entrar. Verifique seus dados e tente novamente.",
          );
          return;
        }
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      // Recuperação de senha
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError("Não foi possível enviar o e-mail de recuperação. Tente novamente.");
        return;
      }
      setNotice("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
      setMode("login");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (notice) toast.success(notice);
  }, [notice]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logoColor.url} alt="ITV Centro Técnico" className="mx-auto h-16 w-auto" />
          <h1 className="mt-5 font-display text-xl font-bold text-foreground">GESTÃO ITV</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Sistema interno de gestão
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-card-foreground">
            {mode === "login" ? "Acessar o sistema" : "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Use seu e-mail e senha para entrar."
              : "Informe seu e-mail para receber o link de redefinição."}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="voce@itv.com.br"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === "login" ? "Entrar" : "Enviar link de recuperação"}
            </button>
          </form>

          <div className="mt-4 space-y-2 text-center text-sm">
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                }}
                className="block w-full text-muted-foreground transition-colors hover:text-foreground"
              >
                Esqueci minha senha
              </button>
            )}
            {mode !== "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="block w-full text-muted-foreground transition-colors hover:text-foreground"
              >
                Voltar para o login
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sistema interno — acesso restrito a colaboradores autorizados.
          <br />
          O cadastro é feito somente por convite do administrador.
        </p>
      </div>
    </div>
  );
}

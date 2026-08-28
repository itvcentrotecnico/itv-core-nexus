import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  cpfValido,
  MARCAS_TV,
  maskCEP,
  maskCPF,
  maskTelefone,
  somenteDigitos,
} from "@/lib/coletas";
import { OrigemPicker } from "@/components/coletas/origem-picker";
import { ORIGEM_VAZIA, useOrigens, validarOrigem, type OrigemValor } from "@/lib/origens";
import logoColor from "@/assets/itv-logo-color.png.asset.json";

export const Route = createFileRoute("/cadastro-coleta/$token")({
  head: () => ({
    meta: [
      { title: "Ficha de Cadastro — Coleta de TV | ITV Centro Técnico" },
      { name: "description", content: "Preencha seus dados para agendarmos a coleta ou entrega da sua TV. Leva menos de 1 minuto." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Ficha de Cadastro — Coleta de TV" },
      { property: "og:description", content: "Preencha seus dados para agendarmos a coleta ou entrega da sua TV." },
    ],
  }),
  component: CadastroColetaPage,
});

interface Abertura {
  ok: boolean;
  erro?: string;
  tipo?: "coleta" | "entrega";
  cliente_nome?: string;
  whatsapp?: string;
  pedir_origem?: boolean;
}

const ERROS: Record<string, string> = {
  expirado: "Este link expirou. Solicite um novo link à ITV.",
  usado: "Este link já foi utilizado. Solicite um novo link à ITV.",
  invalido: "Link inválido. Solicite um novo link à ITV.",
  nome: "Informe seu nome completo.",
  cpf: "CPF inválido.",
  whatsapp: "Informe um WhatsApp válido.",
  endereco: "Informe rua, número e bairro.",
  origem: "Informe como você conheceu a ITV.",
  origem_detalhe: "Informe qual foi a origem.",
};

function CadastroColetaPage() {
  const { token } = Route.useParams();

  const [abertura, setAbertura] = useState<Abertura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [condominio, setCondominio] = useState("");
  const [torre, setTorre] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Manaus");
  const [referencia, setReferencia] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [localNegado, setLocalNegado] = useState(false);
  const [mapsUrlManual, setMapsUrlManual] = useState("");
  const [marca, setMarca] = useState("");
  const [polegadas, setPolegadas] = useState("");
  const [obsTv, setObsTv] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [origem, setOrigem] = useState<OrigemValor>(ORIGEM_VAZIA);
  const { data: origens } = useOrigens();

  useEffect(() => {
    void supabase
      .rpc("coletas_publico_abrir" as never, { p_token: token } as never)
      .then(({ data, error }) => {
        if (error) setAbertura({ ok: false, erro: "invalido" });
        else {
          const r = data as unknown as Abertura;
          setAbertura(r);
          if (r.ok) {
            setNome(r.cliente_nome ?? "");
            setWhatsapp(maskTelefone(r.whatsapp ?? ""));
          }
        }
        setCarregando(false);
      });
  }, [token]);

  // Preenchimento automático pelo CEP, com fallback manual em caso de falha.
  useEffect(() => {
    const d = somenteDigitos(cep);
    if (d.length !== 8) return;
    let cancelado = false;
    void fetch(`https://viacep.com.br/ws/${d}/json/`)
      .then((r) => r.json())
      .then((j: { logradouro?: string; bairro?: string; localidade?: string; erro?: boolean }) => {
        if (cancelado || j.erro) return;
        if (j.logradouro) setRua((v) => v || j.logradouro!);
        if (j.bairro) setBairro((v) => v || j.bairro!);
        if (j.localidade) setCidade(j.localidade);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [cep]);

  function usarLocalizacao() {
    if (!navigator.geolocation) {
      setLocalNegado(true);
      return;
    }
    setBuscandoLocal(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(7)), lng: Number(pos.coords.longitude.toFixed(7)) });
        setLocalNegado(false);
        setBuscandoLocal(false);
      },
      () => {
        setLocalNegado(true);
        setBuscandoLocal(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function enviar() {
    setErro(null);
    if (!nome.trim()) return setErro(ERROS["nome"] ?? null);
    if (!cpfValido(cpf)) return setErro(ERROS["cpf"] ?? null);
    if (somenteDigitos(whatsapp).length < 10) return setErro(ERROS["whatsapp"] ?? null);
    if (!rua.trim() || !numero.trim() || !bairro.trim()) return setErro(ERROS["endereco"] ?? null);
    if (abertura?.pedir_origem) {
      const erroOrigem = validarOrigem(origem, origens);
      if (erroOrigem) return setErro(erroOrigem);
    }
    if (!confirmado) return setErro("Confirme que os dados estão corretos.");

    setEnviando(true);
    const { data, error } = await supabase.rpc("coletas_publico_enviar" as never, {
      p_token: token,
      p_dados: {
        cliente_nome: nome,
        cpf,
        whatsapp,
        telefone_alternativo: telefone2 || null,
        cep,
        rua,
        numero,
        complemento,
        condominio,
        torre_bloco: torre,
        apartamento,
        bairro,
        cidade,
        referencia,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        maps_url: mapsUrlManual || null,
        marca_tv: marca,
        polegadas: polegadas || null,
        observacao_tv: obsTv,
        origem_id: origem.origem_id,
        origem_detalhe: origem.detalhe,
        indicado_por_nome: origem.indicado_nome,
      },
    } as never);
    setEnviando(false);

    if (error) return setErro("Não foi possível enviar. Tente novamente.");
    const r = data as unknown as { ok: boolean; erro?: string };
    if (!r.ok) return setErro(ERROS[r.erro ?? "invalido"] ?? "Não foi possível enviar.");
    setEnviado(true);
  }

  if (carregando) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!abertura?.ok) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src={logoColor.url} alt="ITV Centro Técnico" className="h-12 w-auto" />
        <h1 className="font-display text-xl font-bold text-foreground">Link indisponível</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{ERROS[abertura?.erro ?? "invalido"]}</p>
      </main>
    );
  }

  if (enviado) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src={logoColor.url} alt="ITV Centro Técnico" className="h-12 w-auto" />
        <CheckCircle2 className="size-14 text-primary" />
        <h1 className="font-display text-xl font-bold text-foreground">Cadastro enviado!</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Recebemos seus dados. Nossa equipe entrará em contato para confirmar o horário da{" "}
          {abertura.tipo === "entrega" ? "entrega" : "coleta"}.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/30 pb-16">
      <header className="bg-card px-5 py-5 text-center shadow-sm">
        <img src={logoColor.url} alt="ITV Centro Técnico" className="mx-auto h-10 w-auto" />
        <h1 className="mt-3 font-display text-lg font-bold text-foreground">
          Ficha de Cadastro — {abertura.tipo === "entrega" ? "Entrega" : "Coleta"} de TV
        </h1>
        <p className="text-xs text-muted-foreground">Leva menos de 1 minuto.</p>
      </header>

      <div className="mx-auto max-w-lg space-y-5 px-4 py-5">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-sm font-bold text-foreground">Seus dados</h2>
          <div>
            <label className={labelClass} htmlFor="c-nome">Nome completo *</label>
            <input id="c-nome" className={`${inputClass} h-12`} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-cpf">CPF *</label>
            <input id="c-cpf" className={`${inputClass} h-12`} inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-zap">WhatsApp *</label>
            <input id="c-zap" className={`${inputClass} h-12`} inputMode="numeric" placeholder="(92) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(maskTelefone(e.target.value))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-tel2">Telefone alternativo</label>
            <input id="c-tel2" className={`${inputClass} h-12`} inputMode="numeric" value={telefone2} onChange={(e) => setTelefone2(maskTelefone(e.target.value))} />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-sm font-bold text-foreground">Endereço</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="c-cep">CEP</label>
              <input id="c-cep" className={`${inputClass} h-12`} inputMode="numeric" value={cep} onChange={(e) => setCep(maskCEP(e.target.value))} />
            </div>
            <div>
              <label className={labelClass} htmlFor="c-num">Número *</label>
              <input id="c-num" className={`${inputClass} h-12`} value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="c-rua">Rua *</label>
            <input id="c-rua" className={`${inputClass} h-12`} value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="c-bairro">Bairro *</label>
            <input id="c-bairro" className={`${inputClass} h-12`} value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="c-cidade">Cidade</label>
              <input id="c-cidade" className={`${inputClass} h-12`} value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="c-compl">Complemento</label>
              <input id="c-compl" className={`${inputClass} h-12`} value={complemento} onChange={(e) => setComplemento(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="c-cond">Condomínio</label>
              <input id="c-cond" className={`${inputClass} h-12`} value={condominio} onChange={(e) => setCondominio(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="c-torre">Torre / Bloco</label>
              <input id="c-torre" className={`${inputClass} h-12`} value={torre} onChange={(e) => setTorre(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="c-ap">Apartamento</label>
              <input id="c-ap" className={`${inputClass} h-12`} value={apartamento} onChange={(e) => setApartamento(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="c-ref">Ponto de referência</label>
            <input id="c-ref" className={`${inputClass} h-12`} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-sm font-bold text-foreground">Localização</h2>
          <Button type="button" className="h-12 w-full" onClick={usarLocalizacao} disabled={buscandoLocal}>
            {buscandoLocal ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MapPin className="mr-2 size-4" />}
            Usar minha localização atual
          </Button>
          {coords && (
            <p className="text-xs text-primary">Localização registrada ({coords.lat}, {coords.lng}).</p>
          )}
          {localNegado && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Sem problema — você pode colar o link do Google Maps ou seguir apenas com o endereço.
              </p>
              <input
                className={`${inputClass} h-12`}
                placeholder="Colar link do Google Maps"
                value={mapsUrlManual}
                onChange={(e) => setMapsUrlManual(e.target.value)}
              />
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-sm font-bold text-foreground">Dados da TV</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="c-marca">Marca</label>
              <select id="c-marca" className={`${inputClass} h-12`} value={marca} onChange={(e) => setMarca(e.target.value)}>
                <option value="">Selecione</option>
                {MARCAS_TV.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="c-pol">Polegadas</label>
              <input id="c-pol" className={`${inputClass} h-12`} inputMode="numeric" value={polegadas} onChange={(e) => setPolegadas(somenteDigitos(e.target.value).slice(0, 3))} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="c-obs">Observação da TV</label>
            <Textarea id="c-obs" rows={2} value={obsTv} onChange={(e) => setObsTv(e.target.value)} />
          </div>
        </section>

        {abertura.pedir_origem && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold text-foreground">Só mais uma coisa</h2>
            <OrigemPicker valor={origem} onChange={setOrigem} />
          </section>
        )}

        <label className="flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <input type="checkbox" className="mt-0.5 size-5" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
          <span>Confirmo que os dados informados estão corretos.</span>
        </label>

        <p className="text-[11px] text-muted-foreground">
          Seus dados são usados apenas para realizar a {abertura.tipo === "entrega" ? "entrega" : "coleta"} da sua TV e ficam
          protegidos no sistema interno da ITV Centro Técnico.
        </p>

        {erro && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

        <Button className="h-14 w-full text-base" onClick={enviar} disabled={enviando}>
          {enviando && <Loader2 className="mr-2 size-4 animate-spin" />} Enviar cadastro
        </Button>
      </div>
    </main>
  );
}

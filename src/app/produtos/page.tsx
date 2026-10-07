"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ModalAviso from "@/components/ModalAviso";

interface Empresa {
  id: string;
  razao_social: string;
}

interface Familia {
  id: string;
  empresa_id: string;
  nome_familia: string;
}

interface Produto {
  id: string;
  empresa_id: string;
  familia_id: string | null;
  fty_no: string;
  referencia_interna: string | null;
  descricao: string;
  ean_13: string | null;
  ean_barras: string | null;
  data_fabricacao: string | null; // Adicionado aqui
  lote: string | null;            // Adicionado aqui
  usa_pilha: boolean;
  contem_ima: boolean;
  partes_pequenas: boolean;
  metal: boolean;
  restritivo_0_3_anos: boolean;
  idade_minima: string | null;
  empresas: { razao_social: string } | null;
  inmetro_familias: { nome_familia: string; status: string | null; data_validade: string | null } | null;
}

// ALGORITMO GERADOR DE EAN-13 BRASILEIRO (789) VÁLIDO
function gerarEan13Valido(): string {
  const prefixo = "789"; // Prefixo GS1 do Brasil
  let codigo12 = prefixo;
  
  // Gera mais 9 dígitos aleatórios para completar 12
  for (let i = 0; i < 9; i++) {
    codigo12 += Math.floor(Math.random() * 10).toString();
  }
  
  // Calcula o Dígito Verificador (13º dígito) usando regra GS1
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    const digito = parseInt(codigo12[i]);
    // Posições ímpares (0, 2, 4...) peso 1. Posições pares (1, 3, 5...) peso 3.
    soma += i % 2 === 1 ? digito * 3 : digito * 1;
  }
  
  const resto = soma % 10;
  const digitoVerificador = resto === 0 ? 0 : 10 - resto;
  
  return codigo12 + digitoVerificador.toString();
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // ID se for edição
  const [error, setError] = useState<string | null>(null);

  // Estados dos Filtros Inteligentes
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("");
  const [filtroFamilia, setFiltroFamilia] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  // Estado do Modal Bonitão
  const [modalAviso, setModalAviso] = useState<{
    isOpen: boolean;
    tipo?: "perigo" | "alerta" | "sucesso" | "info";
    titulo: string;
    mensagem: string;
    onConfirmar?: () => void;
  }>({ isOpen: false, titulo: "", mensagem: "" });

  // Estado do formulário
  const [formData, setFormData] = useState({
    empresa_id: "",
    familia_id: "",
    fty_no: "",
    referencia_interna: "",
    descricao: "",
    ean_13: "",
    ean_barras: "",
    data_fabricacao: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`, // Formato padrão MM/AAAA
    lote: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,            // Formato padrão MM/AAAA
    usa_pilha: false,
    contem_ima: false,
    partes_pequenas: false,
    metal: false,
    restritivo_0_3_anos: false,
    idade_minima: "+3 anos",
  });

  async function carregarDados() {
    setLoading(true);

    // Carrega produtos, empresas e famílias de certificação em paralelo
    const [prodResult, empResult, famResult] = await Promise.all([
      supabase
        .from("produtos")
        .select("*, empresas(razao_social), inmetro_familias(nome_familia, status, data_validade)")
        .order("created_at"),
      supabase
        .from("empresas")
        .select("id, razao_social")
        .order("razao_social"),
      supabase
        .from("inmetro_familias")
        .select("id, empresa_id, nome_familia")
        .order("nome_familia")
    ]);

    const { data: prodData, error: prodError } = prodResult;
    const { data: empData, error: empError } = empResult;
    const { data: famData, error: famError } = famResult;

    if (!prodError && prodData) setProdutos(prodData as any);
    if (!empError && empData) setEmpresas(empData);
    if (!famError && famData) setFamilias(famData);

    setLoading(false);
  }

  useEffect(() => {
    carregarDados();

    // Captura o importador vindo pelo clique na Home (?empresa=...)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const empresaParam = params.get("empresa");
      if (empresaParam) {
        setFiltroEmpresa(empresaParam);
      }
    }
  }, []);

  // Filtra as famílias do Inmetro baseando-se na empresa selecionada
  const familiasFiltradas = familias.filter(
    (f) => f.empresa_id === formData.empresa_id
  );

  // Monitora mudança de empresa para setar a primeira família disponível e evitar vazamento multi-tenant
  useEffect(() => {
    // 1. Filtra as famílias locais pertinentes à empresa selecionada internamente no efeito
    const filtradas = familias.filter((f) => f.empresa_id === formData.empresa_id);

    // 2. Verifica se a família selecionada atualmente está dentro desta lista filtrada
    const familiaPertenceAEmpresa = filtradas.some((f) => f.id === formData.familia_id);

    // 3. Se não pertencer (ou se a empresa mudou), mantém limpo como sem registro
    if (!familiaPertenceAEmpresa) {
      setFormData((prev) => ({ ...prev, familia_id: "" }));
    }
  }, [formData.empresa_id, familias]); // Apenas empresa_id e a lista bruta de familias controlam o ciclo de disparo

  // Modo de cadastro limpo
  function handleNovo() {
    setEditingId(null);
    const dataAtualString = `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
    setFormData({
      empresa_id: "",
      familia_id: "",
      fty_no: "",
      referencia_interna: "",
      descricao: "",
      ean_13: "",
      ean_barras: "",
      data_fabricacao: dataAtualString, // Inicializa com a data sugerida
      lote: dataAtualString,            // Inicializa com o lote sugerido
      usa_pilha: false,
      contem_ima: false,
      partes_pequenas: false,
      metal: false,
      restritivo_0_3_anos: false,
      idade_minima: "+3 anos",
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Modo edição preenchido
  function handleEditar(prod: Produto) {
    setEditingId(prod.id);
    setFormData({
      empresa_id: prod.empresa_id,
      familia_id: prod.familia_id || "",
      fty_no: prod.fty_no,
      referencia_interna: prod.referencia_interna || "",
      descricao: prod.descricao,
      ean_13: prod.ean_13 || "",
      ean_barras: prod.ean_barras || "",
      data_fabricacao: prod.data_fabricacao || "", // Resgata o valor salvo
      lote: prod.lote || "",                       // Resgata o valor salvo
      usa_pilha: prod.usa_pilha,
      contem_ima: prod.contem_ima,
      partes_pequenas: prod.partes_pequenas,
      metal: prod.metal,
      restritivo_0_3_anos: prod.restritivo_0_3_anos,
      idade_minima: prod.idade_minima || "+3 anos",
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Deletar Produto com Card Elegante
  function handleExcluir(id: string, fty_no: string) {
    setModalAviso({
      isOpen: true,
      tipo: "perigo",
      titulo: "Excluir Produto",
      mensagem: `Deseja mesmo excluir o produto "${fty_no}" do catálogo base?`,
      onConfirmar: async () => {
        setModalAviso((prev) => ({ ...prev, isOpen: false }));
        const { error: deleteError } = await supabase
          .from("produtos")
          .delete()
          .eq("id", id);

        if (deleteError) {
          setModalAviso({
            isOpen: true,
            tipo: "alerta",
            titulo: "Erro ao Excluir",
            mensagem: "Não foi possível excluir o produto. Verifique as dependências.",
          });
        } else {
          await carregarDados();
        }
      },
    });
  }

  // Salvar ou Atualizar
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // MÁGICA: Se o campo do EAN-13 estiver vazio no cadastro, gera um válido automático
    let eanFinal = formData.ean_13.trim();
    if (!eanFinal && !editingId) {
      eanFinal = gerarEan13Valido();
    }

    if (editingId) {
      // MODO EDICAO
      const { error: updateError } = await supabase
        .from("produtos")
        .update({
          empresa_id: formData.empresa_id,
          familia_id: formData.familia_id || null,
          fty_no: formData.fty_no,
          referencia_interna: formData.referencia_interna.trim() || null,
          descricao: formData.descricao,
          ean_13: eanFinal || null,
          ean_barras: formData.ean_barras.trim() || null,
          data_fabricacao: formData.data_fabricacao.trim() || null, // Adicionado aqui
          lote: formData.lote.trim() || null,                       // Adicionado aqui
          usa_pilha: formData.usa_pilha,
          contem_ima: formData.contem_ima,
          partes_pequenas: formData.partes_pequenas,
          metal: formData.metal,
          restritivo_0_3_anos: formData.restritivo_0_3_anos,
          idade_minima: formData.idade_minima || null,
        })
        .eq("id", editingId);

      if (updateError) {
        setError("Erro ao atualizar produto. Verifique se o FTY NO está duplicado.");
        setSaving(false);
      } else {
        setIsModalOpen(false);
        await carregarDados();
        setSaving(false);
      }
    } else {
      // MODO CADASTRO
      const { error: insertError } = await supabase.from("produtos").insert([
        {
          empresa_id: formData.empresa_id,
          familia_id: formData.familia_id || null,
          fty_no: formData.fty_no,
          referencia_interna: formData.referencia_interna.trim() || null,
          descricao: formData.descricao,
          ean_13: eanFinal,
          ean_barras: formData.ean_barras.trim() || null,
          data_fabricacao: formData.data_fabricacao.trim() || null, // Adicionado aqui
          lote: formData.lote.trim() || null,                       // Adicionado aqui
          usa_pilha: formData.usa_pilha,
          contem_ima: formData.contem_ima,
          partes_pequenas: formData.partes_pequenas,
          metal: formData.metal,
          restritivo_0_3_anos: formData.restritivo_0_3_anos,
          idade_minima: formData.idade_minima || null,
        },
      ]);

      if (insertError) {
        if (insertError.code === "23505") {
          setError("Este código FTY NO já está cadastrado para este importador.");
        } else {
          setError("Erro ao cadastrar produto.");
        }
        setSaving(false);
      } else {
        setIsModalOpen(false);
        await carregarDados();
        setSaving(false);
      }
    }
  }

  // --- LÓGICA DE FILTRAGEM & COMPLIANCE EM MEMÓRIA ---
  const hojeString = new Date().toISOString().split("T")[0];

  // Contagem de produtos em risco (sem registro ou com certificado vencido)
  const produtosEmRisco = produtos.filter((prod) => {
    if (!prod.familia_id || !prod.inmetro_familias) return true;
    if (prod.inmetro_familias.status === "Vencido" || prod.inmetro_familias.status === "Sem Registro") return true;
    if (prod.inmetro_familias.data_validade && prod.inmetro_familias.data_validade < hojeString) return true;
    return false;
  });

  // Contagem de produtos sem Referência do Importador
  const produtosSemRef = produtos.filter((prod) => !prod.referencia_interna);

  // Famílias para o select de filtro (se uma empresa estiver filtrada, lista só as dela)
  const familiasParaFiltro = filtroEmpresa
    ? familias.filter((f) => f.empresa_id === filtroEmpresa)
    : familias;

  // Aplicação dos filtros sobre a lista
  const produtosExibidos = produtos.filter((prod) => {
    if (filtroEmpresa && prod.empresa_id !== filtroEmpresa) return false;
    if (filtroFamilia && prod.familia_id !== filtroFamilia) return false;

    if (filtroStatus === "sem_ref") return !prod.referencia_interna;

    const ehSemRegistro = !prod.familia_id || !prod.inmetro_familias || prod.inmetro_familias.status === "Sem Registro";
    const ehVencido = Boolean(
      prod.inmetro_familias?.status === "Vencido" ||
      (prod.inmetro_familias?.data_validade && prod.inmetro_familias.data_validade < hojeString)
    );

    if (filtroStatus === "sem_registro") return ehSemRegistro;
    if (filtroStatus === "vencidos") return ehVencido;
    if (filtroStatus === "em_risco") return ehSemRegistro || ehVencido;
    if (filtroStatus === "em_dia") return !ehSemRegistro && !ehVencido;

    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Catálogo de Produtos</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie itens importados, códigos de barras e regras de rotulagem.
          </p>
        </div>
        <button
          onClick={handleNovo}
          disabled={empresas.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-2 disabled:opacity-50 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Novo Produto</span>
        </button>
      </div>

      {/* PAINEL DE MONITORAMENTO E DIAGNÓSTICO */}
      {!loading && (produtosEmRisco.length > 0 || produtosSemRef.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CARD DE ALERTA: INMETRO */}
          {produtosEmRisco.length > 0 && (
            <div className="relative rounded-2xl bg-white border border-red-200/90 shadow-[0_2px_10px_rgba(239,68,68,0.04)] p-4 flex flex-col justify-between gap-3 overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-2xl" />
              
              <div className="flex items-start gap-3.5 pl-1.5">
                <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200/70 px-2 py-0.5 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      Inmetro
                    </span>
                    <h4 className="text-xs font-bold text-slate-800">
                      {produtosEmRisco.length} {produtosEmRisco.length > 1 ? "itens com pendência" : "item com pendência"}
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Produtos sem registro ou vencidos bloqueiam etiquetas e exportação.
                  </p>
                </div>
              </div>

              {filtroStatus !== "em_risco" && (
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setFiltroStatus("em_risco")}
                    className="group inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800 transition py-0.5 px-2 rounded-lg hover:bg-red-50"
                  >
                    <span>Ver pendentes</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CARD DE ALERTA: SEM REFERÊNCIA */}
          {produtosSemRef.length > 0 && (
            <div className="relative rounded-2xl bg-white border border-amber-200/90 shadow-[0_2px_10px_rgba(245,158,11,0.04)] p-4 flex flex-col justify-between gap-3 overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-2xl" />
              
              <div className="flex items-start gap-3.5 pl-1.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Cadastro
                    </span>
                    <h4 className="text-xs font-bold text-slate-800">
                      {produtosSemRef.length} {produtosSemRef.length > 1 ? "itens sem Referência" : "item sem Referência"}
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Itens sem código interno usarão o código da fábrica chinesa na etiqueta.
                  </p>
                </div>
              </div>

              {filtroStatus !== "sem_ref" && (
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setFiltroStatus("sem_ref")}
                    className="group inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 transition py-0.5 px-2 rounded-lg hover:bg-amber-50"
                  >
                    <span>Ver itens</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CARD DE FILTROS INTELIGENTES */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filtros de Catálogo</h2>
          </div>
          {(filtroEmpresa || filtroFamilia || filtroStatus !== "todos") && (
            <button
              onClick={() => {
                setFiltroEmpresa("");
                setFiltroFamilia("");
                setFiltroStatus("todos");
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition w-fit"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Filtro por Importador */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Importador
            </label>
            <select
              value={filtroEmpresa}
              onChange={(e) => {
                setFiltroEmpresa(e.target.value);
                setFiltroFamilia("");
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition"
            >
              <option value="">Todos os Importadores</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.razao_social}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filtro por Família */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Família Inmetro
            </label>
            <select
              value={filtroFamilia}
              onChange={(e) => setFiltroFamilia(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition"
            >
              <option value="">Todas as Famílias</option>
              {familiasParaFiltro.map((fam) => (
                <option key={fam.id} value={fam.id}>
                  {fam.nome_familia}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Filtro por Situação / Compliance */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Situação Inmetro
            </label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition font-medium"
            >
              <option value="todos">Todos os Produtos</option>
              <option value="em_risco">Em Risco (Sem Registro ou Vencidos)</option>
              <option value="sem_registro">Apenas Sem Registro</option>
              <option value="vencidos">Apenas Certificado Vencido</option>
              <option value="em_dia">Em Dia (Certificados Válidos)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Carregando produtos...
          </div>
        ) : produtosExibidos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Importador</th>
                  <th className="py-3.5 px-6">Código (FTY NO)</th>
                  <th className="py-3.5 px-6">EAN-13</th>
                  <th className="py-3.5 px-6">Descrição Comercial</th>
                  <th className="py-3.5 px-6">Família Inmetro</th>
                  <th className="py-3.5 px-6">Sinalizadores Legais</th>
                  <th className="py-3.5 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {produtosExibidos.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      {prod.empresas?.razao_social ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 tracking-wide uppercase">
                          {prod.empresas.razao_social.trim().split(" ")[0]}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Não vinculado</span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs font-bold text-blue-600">
                      <span className="bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                        {prod.fty_no}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-mono text-slate-500 text-xs">{prod.ean_13 || "Sem EAN"}</td>
                    <td className="py-3.5 px-6 text-slate-700 font-medium max-w-[280px] truncate" title={prod.descricao}>
                      {prod.descricao}
                    </td>
                    <td className="py-4 px-6 text-slate-500 text-xs">
                      {prod.inmetro_familias?.nome_familia ? (
                        <span className="font-medium text-slate-700">{prod.inmetro_familias.nome_familia}</span>
                      ) : (
                        <span className="text-amber-600 font-semibold bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full text-[11px]">
                          Sem Registro
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {prod.usa_pilha && (
                          <span className="bg-purple-50 text-purple-700 border border-purple-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Pilha
                          </span>
                        )}
                        {prod.contem_ima && (
                          <span className="bg-red-50 text-red-700 border border-red-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Ímã
                          </span>
                        )}
                        {prod.partes_pequenas && (
                          <span className="bg-orange-50 text-orange-700 border border-orange-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Partes Peq.
                          </span>
                        )}
                        {prod.metal && (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Metal
                          </span>
                        )}
                        {prod.restritivo_0_3_anos && (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            0-3 Anos
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleEditar(prod)}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(prod.id, prod.fty_no)}
                        className="text-red-500 hover:text-red-700 font-semibold text-xs bg-red-50 hover:bg-red-100/70 border border-red-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400 text-sm">
            {produtos.length === 0 
              ? "Nenhum produto cadastrado até o momento." 
              : "Nenhum produto encontrado para os filtros selecionados."}
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 overflow-y-auto max-h-[92vh] animate-in fade-in zoom-in duration-150">
            {/* Header com destaque */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {editingId ? "Editar Produto" : "Novo Produto"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Defina os parâmetros cadastrais e as regras de compliance alfandegário.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-semibold">{error}</div>
              )}

              {/* SEÇÃO 1: REGULATÓRIO & CÓDIGOS CHAVE */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3.5">
                <span className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  1. Vínculo Regulatório & Códigos
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Importador Responsável *
                    </label>
                    <select
                      required
                      value={formData.empresa_id}
                      onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition"
                    >
                      <option value="">Selecione o importador...</option>
                      {empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.razao_social}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Família Certificada (Inmetro)
                    </label>
                    <select
                      value={formData.familia_id}
                      onChange={(e) => setFormData({ ...formData, familia_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition"
                    >
                      <option value="">Sem Registro (Opcional)</option>
                      {familiasFiltradas.map((fam) => (
                        <option key={fam.id} value={fam.id}>
                          {fam.nome_familia}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Código da Fábrica (Item / FTY NO) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fty_no}
                      onChange={(e) => setFormData({ ...formData, fty_no: e.target.value })}
                      placeholder="Ex: 3117"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition font-mono font-bold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Ref. do Importador (Inmetro / Interna)
                    </label>
                    <input
                      type="text"
                      value={formData.referencia_interna}
                      onChange={(e) => setFormData({ ...formData, referencia_interna: e.target.value })}
                      placeholder="Ex: STN-080124-24"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition font-mono font-semibold bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: DADOS DO PRODUTO & ETIQUETAGEM */}
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    Descrição Comercial (Nome na Etiqueta) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Ex: BONECA SEREIA COM LUZ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Código de Barras EAN-13 (Brasil)
                    </label>
                    <input
                      type="text"
                      value={formData.ean_13}
                      onChange={(e) => setFormData({ ...formData, ean_13: e.target.value })}
                      placeholder="Deixe vazio para gerar automaticamente"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Código Exterior (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.ean_barras}
                      onChange={(e) => setFormData({ ...formData, ean_barras: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Faixa Etária
                    </label>
                    <input
                      type="text"
                      value={formData.idade_minima || ""}
                      onChange={(e) => setFormData({ ...formData, idade_minima: e.target.value })}
                      placeholder="Ex: 3 anos"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Data Fabricação
                    </label>
                    <input
                      type="text"
                      value={formData.data_fabricacao}
                      onChange={(e) => setFormData({ ...formData, data_fabricacao: e.target.value })}
                      placeholder="MM/AAAA"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 outline-none font-mono font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Lote
                    </label>
                    <input
                      type="text"
                      value={formData.lote}
                      onChange={(e) => setFormData({ ...formData, lote: e.target.value })}
                      placeholder="MM/AAAA"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 outline-none font-mono font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 3: SINALIZADORES DE SEGURANÇA JURÍDICA */}
              <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
                <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  2. Avisos Legais de Segurança Obrigatórios
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2.5 text-slate-800 text-xs font-semibold cursor-pointer select-none bg-white p-2.5 rounded-xl border border-amber-100 hover:border-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={formData.usa_pilha}
                      onChange={(e) => setFormData({ ...formData, usa_pilha: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Pilha / Bateria</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-800 text-xs font-semibold cursor-pointer select-none bg-white p-2.5 rounded-xl border border-amber-100 hover:border-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={formData.contem_ima}
                      onChange={(e) => setFormData({ ...formData, contem_ima: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Ímã</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-800 text-xs font-semibold cursor-pointer select-none bg-white p-2.5 rounded-xl border border-amber-100 hover:border-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={formData.partes_pequenas}
                      onChange={(e) => setFormData({ ...formData, partes_pequenas: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Partes Pequenas</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-800 text-xs font-semibold cursor-pointer select-none bg-white p-2.5 rounded-xl border border-amber-100 hover:border-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={formData.metal}
                      onChange={(e) => setFormData({ ...formData, metal: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Fechos Metálicos</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-rose-900 text-xs font-bold cursor-pointer select-none bg-rose-50/80 p-2.5 rounded-xl border border-rose-200 col-span-1 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={formData.restritivo_0_3_anos}
                      onChange={(e) => setFormData({ ...formData, restritivo_0_3_anos: e.target.checked })}
                      className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4"
                    />
                    <span>Restritivo para menores de 3 anos (Exibe Selo Gráfico 0-3)</span>
                  </label>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-sm hover:shadow-md transition disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar Produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CARD ELEGANTE DE CONFIRMAÇÃO / AVISO */}
      <ModalAviso
        isOpen={modalAviso.isOpen}
        tipo={modalAviso.tipo}
        titulo={modalAviso.titulo}
        mensagem={modalAviso.mensagem}
        textoConfirmar="Sim, Excluir"
        textoCancelar="Cancelar"
        onConfirmar={modalAviso.onConfirmar}
        onCancelar={() => setModalAviso((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
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

    // 3. Se não pertencer (ou se a empresa mudou), redireciona o vínculo de forma segura
    if (!familiaPertenceAEmpresa) {
      if (filtradas.length > 0) {
        setFormData((prev) => ({ ...prev, familia_id: filtradas[0].id }));
      } else {
        setFormData((prev) => ({ ...prev, familia_id: "" }));
      }
    }
  }, [formData.empresa_id, familias]); // Apenas empresa_id e a lista bruta de familias controlam o ciclo de disparo

  // Modo de cadastro limpo
  function handleNovo() {
    setEditingId(null);
    const dataAtualString = `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
    setFormData({
      empresa_id: empresas[0]?.id || "",
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

      {/* BANNER DE ALERTA DE COMPLIANCE */}
      {!loading && produtosEmRisco.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-red-50/60 border border-red-200 shadow-[0_2px_12px_rgba(239,68,68,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 bg-red-100 text-red-600 rounded-xl border border-red-200/80 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-900">
                {produtosEmRisco.length} produto{produtosEmRisco.length > 1 ? "s" : ""} com pendência de Inmetro
              </h4>
              <p className="text-xs text-red-700/80 mt-0.5">
                Itens sem registro ou com certificado vencido bloqueiam a geração das etiquetas e a exportação para o Excel.
              </p>
            </div>
          </div>
          {filtroStatus !== "em_risco" && (
            <button
              onClick={() => setFiltroStatus("em_risco")}
              className="text-xs font-bold text-red-700 bg-red-100/80 hover:bg-red-200 border border-red-200 px-3.5 py-2 rounded-xl transition flex-shrink-0 self-start sm:self-auto"
            >
              Filtrar produtos em risco
            </button>
          )}
        </div>
      )}

      {/* BANNER DE AVISO: SEM REFERÊNCIA DO IMPORTADOR */}
      {!loading && produtosSemRef.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200 shadow-[0_2px_12px_rgba(245,158,11,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl border border-amber-200 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                {produtosSemRef.length} produto{produtosSemRef.length > 1 ? "s" : ""} sem Referência do Importador (Ref)
              </h4>
              <p className="text-xs text-amber-700/80 mt-0.5">
                Itens sem o código interno da empresa usarão o código da fábrica chinesa como padrão na etiqueta.
              </p>
            </div>
          </div>
          {filtroStatus !== "sem_ref" && (
            <button
              onClick={() => setFiltroStatus("sem_ref")}
              className="text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3.5 py-2 rounded-xl transition flex-shrink-0 self-start sm:self-auto"
            >
              Filtrar sem Referência
            </button>
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
                    <td className="py-4 px-6 font-semibold text-slate-800">
                      {prod.empresas?.razao_social || "Não vinculado"}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs font-bold text-blue-600">
                      <span className="bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                        {prod.fty_no}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-mono text-slate-500 text-xs">{prod.ean_13 || "Sem EAN"}</td>
                    <td className="py-4 px-6 text-slate-700 font-medium">{prod.descricao}</td>
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
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-5 overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? "Editar Produto" : "Novo Produto"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Cadastre o item com seus parâmetros de compliance.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">{error}</div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Importador */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Importador *
                  </label>
                  <select
                    required
                    value={formData.empresa_id}
                    onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  >
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.razao_social}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Família Inmetro */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Família Inmetro.
                  </label>
                  <select
                    value={formData.familia_id}
                    onChange={(e) => setFormData({ ...formData, familia_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
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

              {/* 3. Códigos: Ref Interna e Código do Fornecedor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Ref. do Importador
                  </label>
                  <input
                    type="text"
                    value={formData.referencia_interna}
                    onChange={(e) => setFormData({ ...formData, referencia_interna: e.target.value })}
                    placeholder="Ex: STN-080124-24"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Código Fábrica (Item / FTY) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fty_no}
                    onChange={(e) => setFormData({ ...formData, fty_no: e.target.value })}
                    placeholder="Ex: 3117"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-mono font-semibold"
                  />
                </div>
              </div>

              {/* 4 e 5. Códigos de Barras Pareados */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Código de Barras (Brasil)
                  </label>
                  <input
                    type="text"
                    value={formData.ean_13}
                    onChange={(e) => setFormData({ ...formData, ean_13: e.target.value })}
                    placeholder="automático"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Código de Barras (Exterior)
                  </label>
                  <input
                    type="text"
                    value={formData.ean_barras}
                    onChange={(e) => setFormData({ ...formData, ean_barras: e.target.value })}
                    placeholder="pode ficar vazio"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-mono"
                  />
                </div>
              </div>

              {/* 6. Descrição */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Descrição Comercial do Produto *
                </label>
                <input
                  type="text"
                  required
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Ex: BONECA SEREIA COM LUZ"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-medium"
                />
              </div>

              {/* 7, 8 e 9. Faixa Etária, Data Fabricação e Lote */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Faixa Etária
                  </label>
                  <input
                    type="text"
                    value={formData.idade_minima || ""}
                    onChange={(e) => setFormData({ ...formData, idade_minima: e.target.value })}
                    placeholder="Ex: +3 anos"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Data de Fabricação
                  </label>
                  <input
                    type="text"
                    value={formData.data_fabricacao}
                    onChange={(e) => setFormData({ ...formData, data_fabricacao: e.target.value })}
                    placeholder="Ex: 08/2026"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Lote de Importação
                  </label>
                  <input
                    type="text"
                    value={formData.lote}
                    onChange={(e) => setFormData({ ...formData, lote: e.target.value })}
                    placeholder="Ex: 08/2026"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  />
                </div>
              </div>

              {/* 10. SINALIZADORES DE SEGURANÇA */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Sinalizadores de Segurança (Avisos Legais Obrigatórios)
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.usa_pilha}
                      onChange={(e) => setFormData({ ...formData, usa_pilha: e.target.checked })}
                      className="rounded-md text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="font-medium">Contém Pilha / Bateria</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.contem_ima}
                      onChange={(e) => setFormData({ ...formData, contem_ima: e.target.checked })}
                      className="rounded-md text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="font-medium">Contém Ímã</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.partes_pequenas}
                      onChange={(e) => setFormData({ ...formData, partes_pequenas: e.target.checked })}
                      className="rounded-md text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="font-medium">Contém Partes Pequenas</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.metal}
                      onChange={(e) => setFormData({ ...formData, metal: e.target.checked })}
                      className="rounded-md text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="font-medium">Contém Fechos Metálicos</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950 col-span-1 sm:col-span-2 border-t border-slate-200/80 pt-2.5 mt-1">
                    <input
                      type="checkbox"
                      checked={formData.restritivo_0_3_anos}
                      onChange={(e) => setFormData({ ...formData, restritivo_0_3_anos: e.target.checked })}
                      className="rounded-md text-rose-600 focus:ring-rose-500 h-4 w-4"
                    />
                    <span className="text-rose-700 font-semibold text-xs">Restritivo para menores de 3 anos (Selo 0-3 Obrigatório)</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm hover:shadow transition disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar"}
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
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ModalAviso from "@/components/ModalAviso";
// Helper para formatar data YYYY-MM-DD para DD/MM/YYYY sem sofrer desvios de fuso horário (timezone offset)
function formatarDataSemOffset(dataString: string | null | undefined): string {
  if (!dataString) return "";
  const partes = dataString.split("T")[0].split("-");
  if (partes.length !== 3) return dataString;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

// Helper de Compliance: Calcula o status real com base na data de hoje
function obterStatusDinamico(dataValidade: string | null | undefined, statusSalvo: string) {
  if (statusSalvo === "Sem Registro") {
    return { rotulo: "Sem Registro", classe: "bg-slate-100 text-slate-700" };
  }
  if (!dataValidade) {
    return { rotulo: statusSalvo || "Sem Registro", classe: "bg-slate-100 text-slate-700" };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const partes = dataValidade.split("T")[0].split("-");
  const dataVal = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));

  const diffTempo = dataVal.getTime() - hoje.getTime();
  const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { rotulo: "Vencido", classe: "bg-red-100 text-red-800" };
  }
  if (diffDias <= 30) {
    return { rotulo: `Vence em ${diffDias}d`, classe: "bg-amber-100 text-amber-800" };
  }
  return { rotulo: "Ativo", classe: "bg-emerald-100 text-emerald-800" };
}

interface Empresa {
  id: string;
  razao_social: string;
}

interface Certificado {
  id: string;
  empresa_id: string;
  nome_familia: string;
  numero_registro: string;
  data_emissao: string;
  data_validade: string;
  status: string;
  ocp_nome: string | null;   // Adicionado aqui
  ocp_numero: string | null; // Adicionado aqui
  empresas: { razao_social: string } | null;
}

export default function CertificadosPage() {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // Guarda o ID se for edição
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
    nome_familia: "",
    numero_registro: "",
    data_emissao: "",
    data_validade: "",
    status: "Ativo",
    ocp_nome: "brics",    // Adicionado aqui com valor padrão
    ocp_numero: "0098",   // Adicionado aqui com valor padrão
  });

  async function carregarDados() {
    setLoading(true);

    // Carrega certificados e empresas em paralelo
    const [certResult, empResult] = await Promise.all([
      supabase
        .from("inmetro_familias")
        .select("*, empresas(razao_social)")
        .order("created_at"),
      supabase
        .from("empresas")
        .select("id, razao_social")
        .order("razao_social")
    ]);

    const { data: certData, error: certError } = certResult;
    const { data: empData, error: empError } = empResult;

    if (!certError && certData) setCertificados(certData as any);
    if (!empError && empData) {
      setEmpresas(empData);
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  // Abre o modal em modo de cadastro
  function handleNovo() {
    setEditingId(null);
    setFormData({
      empresa_id: empresas[0]?.id || "",
      nome_familia: "",
      numero_registro: "",
      data_emissao: "",
      data_validade: "",
      status: "Ativo",
      ocp_nome: "brics",    // Adicionado aqui
      ocp_numero: "0098",   // Adicionado aqui
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Abre o modal preenchido em modo de edição
  function handleEditar(cert: Certificado) {
    setEditingId(cert.id);
    setFormData({
      empresa_id: cert.empresa_id,
      nome_familia: cert.nome_familia,
      numero_registro: cert.numero_registro,
      data_emissao: cert.data_emissao,
      data_validade: cert.data_validade,
      status: cert.status,
      ocp_nome: cert.ocp_nome || "brics",    // Adicionado aqui
      ocp_numero: cert.ocp_numero || "0098", // Adicionado aqui
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Função para deletar certificado com Card Elegante
  function handleExcluir(id: string, nome_familia: string) {
    setModalAviso({
      isOpen: true,
      tipo: "perigo",
      titulo: "Excluir Certificado",
      mensagem: `Deseja mesmo excluir o certificado da família "${nome_familia}"?\n\nOs produtos vinculados a esse certificado passarão a constar como 'Sem Registro'.`,
      onConfirmar: async () => {
        setModalAviso((prev) => ({ ...prev, isOpen: false }));
        const { error: deleteError } = await supabase
          .from("inmetro_familias")
          .delete()
          .eq("id", id);

        if (deleteError) {
          setModalAviso({
            isOpen: true,
            tipo: "alerta",
            titulo: "Erro ao Excluir",
            mensagem: "Não foi possível excluir o certificado. Verifique os vínculos.",
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

    if (editingId) {
      // MODO EDICAO
      const { error: updateError } = await supabase
        .from("inmetro_familias")
        .update({
          empresa_id: formData.empresa_id,
          nome_familia: formData.nome_familia,
          numero_registro: formData.numero_registro,
          data_emissao: formData.data_emissao,
          data_validade: formData.data_validade,
          status: formData.status,
          ocp_nome: formData.ocp_nome.trim() || null,     // Adicionado aqui
          ocp_numero: formData.ocp_numero.trim() || null, // Adicionado aqui
        })
        .eq("id", editingId);

      if (updateError) {
        setError("Erro ao atualizar certificado. Verifique os dados.");
        setSaving(false);
      } else {
        setIsModalOpen(false);
        await carregarDados();
        setSaving(false);
      }
    } else {
      // MODO CADASTRO
      const { error: insertError } = await supabase
        .from("inmetro_familias")
        .insert([formData]);

      if (insertError) {
        setError("Erro ao cadastrar certificado. Verifique os dados.");
        setSaving(false);
      } else {
        setIsModalOpen(false);
        await carregarDados();
        setSaving(false);
      }
    }
  }

  // --- LÓGICA DE FILTRAGEM & ALERTAS EM MEMÓRIA ---
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Identifica certificados vencidos ou vencendo em 30 dias
  const certificadosEmRisco = certificados.filter((cert) => {
    if (cert.status === "Sem Registro" || cert.status === "Vencido") return true;
    if (!cert.data_validade) return true;
    const partes = cert.data_validade.split("T")[0].split("-");
    const dataVal = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    const diffDias = Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diffDias <= 30;
  });

  // Lista única de famílias para o select de filtro
  const familiasDisponiveis = Array.from(
    new Set(
      certificados
        .filter((c) => !filtroEmpresa || c.empresa_id === filtroEmpresa)
        .map((c) => c.nome_familia)
    )
  );

  // Aplicação dos 3 filtros em tempo real
  const certificadosExibidos = certificados.filter((cert) => {
    if (filtroEmpresa && cert.empresa_id !== filtroEmpresa) return false;
    if (filtroFamilia && cert.nome_familia !== filtroFamilia) return false;

    if (filtroStatus !== "todos") {
      const statusObj = obterStatusDinamico(cert.data_validade, cert.status);
      if (filtroStatus === "em_risco") {
        return statusObj.rotulo === "Vencido" || statusObj.rotulo.startsWith("Vence em");
      }
      if (filtroStatus === "vencido") return statusObj.rotulo === "Vencido";
      if (filtroStatus === "vencendo") return statusObj.rotulo.startsWith("Vence em");
      if (filtroStatus === "ativo") return statusObj.rotulo === "Ativo";
      if (filtroStatus === "sem_registro") return statusObj.rotulo === "Sem Registro";
    }

    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Certificados</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie as famílias certificadas e monitore os prazos de validade.
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
          <span>Novo Certificado</span>
        </button>
      </div>

      {/* BANNER DE ALERTA DE COMPLIANCE */}
      {!loading && certificadosEmRisco.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-red-50/60 border border-red-200 shadow-[0_2px_12px_rgba(239,68,68,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 bg-red-100 text-red-600 rounded-xl border border-red-200/80 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-900">
                {certificadosEmRisco.length} certificado{certificadosEmRisco.length > 1 ? "s" : ""} requer{certificadosEmRisco.length > 1 ? "em" : "e"} atenção
              </h4>
              <p className="text-xs text-red-700/80 mt-0.5">
                Certificados vencidos ou a 30 dias do prazo impedem a etiquetagem e desembaraço das cargas.
              </p>
            </div>
          </div>
          {filtroStatus !== "em_risco" && (
            <button
              onClick={() => setFiltroStatus("em_risco")}
              className="text-xs font-bold text-red-700 bg-red-100/80 hover:bg-red-200 border border-red-200 px-3.5 py-2 rounded-xl transition flex-shrink-0 self-start sm:self-auto"
            >
              Filtrar certificados em risco
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
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filtros de Certificados</h2>
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
              Família de Produtos
            </label>
            <select
              value={filtroFamilia}
              onChange={(e) => setFiltroFamilia(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition"
            >
              <option value="">Todas as Famílias</option>
              {familiasDisponiveis.map((fam, idx) => (
                <option key={idx} value={fam}>
                  {fam}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Filtro por Situação / Compliance */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Situação do Certificado
            </label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition font-medium"
            >
              <option value="todos">Todos os Status</option>
              <option value="em_risco">Em Risco (Vencidos ou Vencendo)</option>
              <option value="vencendo">Vencendo nos Próximos 30d</option>
              <option value="vencido">Apenas Vencidos</option>
              <option value="ativo">Apenas Ativos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Certificados */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Carregando certificados...
          </div>
        ) : certificadosExibidos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Importador</th>
                  <th className="py-3.5 px-6">Família de Produtos</th>
                  <th className="py-3.5 px-6">Nº do Registro</th>
                  <th className="py-3.5 px-6">Validade</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {certificadosExibidos.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-semibold text-slate-800">
                      {cert.empresas?.razao_social || "Não vinculado"}
                    </td>
                    <td className="py-4 px-6 text-slate-700 font-medium">{cert.nome_familia}</td>
                    <td className="py-4 px-6 text-slate-600 font-mono text-xs">{cert.numero_registro}</td>
                    <td className="py-4 px-6 text-slate-500 text-xs">
                      {formatarDataSemOffset(cert.data_validade)}
                    </td>
                    <td className="py-4 px-6">
                      {(() => {
                        const statusAtual = obterStatusDinamico(cert.data_validade, cert.status);
                        return (
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${statusAtual.classe}`}
                          >
                            {statusAtual.rotulo}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleEditar(cert)}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(cert.id, cert.nome_familia)}
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
            {certificados.length === 0
              ? "Nenhum certificado cadastrado para nenhuma família."
              : "Nenhum certificado encontrado para os filtros selecionados."}
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-6 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? "Editar Certificado" : "Novo Certificado"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Vincule a família de produtos ao registro do Inmetro.</p>
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

              {/* 1. Dropdown de Importadores */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Importador Dono do Certificado *
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

              {/* 2. Família */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Nome da Família de Produtos *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome_familia}
                  onChange={(e) => setFormData({ ...formData, nome_familia: e.target.value })}
                  placeholder="Ex: Bonecas de plástico"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 3. Nº do Registro */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Nº do Registro (Inmetro) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.numero_registro}
                    onChange={(e) => setFormData({ ...formData, numero_registro: e.target.value })}
                    placeholder="Ex: 009870/2022"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-mono"
                  />
                </div>

                {/* 4. Status do Registro */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Status do Registro
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Em Processo">Em Processo</option>
                    <option value="Vencido">Vencido</option>
                    <option value="Sem Registro">Sem Registro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 5. Data de Emissão */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Data de Emissão *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.data_emissao}
                    onChange={(e) => setFormData({ ...formData, data_emissao: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  />
                </div>

                {/* 6. Data de Validade */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Data de Validade *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.data_validade}
                    onChange={(e) => setFormData({ ...formData, data_validade: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  />
                </div>
              </div>

              {/* 7. Dropdown de OCPs Padronizadas do Inmetro */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Organismo de Certificação (OCP do Selo) *
                </label>
                <select
                  required
                  value={`${formData.ocp_nome}|${formData.ocp_numero}`}
                  onChange={(e) => {
                    const [nome, numero] = e.target.value.split("|");
                    setFormData({ ...formData, ocp_nome: nome, ocp_numero: numero });
                  }}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                >
                  <option value="brics|0098">BRICS (OCP 0098)</option>
                  <option value="sgs|0040">SGS (OCP 0040)</option>
                  <option value="falcao bauer|0003">FALCÃO BAUER (OCP 0003)</option>
                  <option value="tuv r.|0004">TÜV RHEINLAND (OCP 0004)</option>
                  <option value="ul|0110">UL TESTTECH (OCP 0110)</option>
                  <option value="iqb|0006">IQB (OCP 0006)</option>
                </select>
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
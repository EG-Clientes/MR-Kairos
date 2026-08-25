"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
// Helper para formatar data YYYY-MM-DD para DD/MM/YYYY sem sofrer desvios de fuso horário (timezone offset)
function formatarDataSemOffset(dataString: string | null | undefined): string {
  if (!dataString) return "";
  const partes = dataString.split("T")[0].split("-");
  if (partes.length !== 3) return dataString;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
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

  // Função para deletar certificado
  async function handleExcluir(id: string, nome_familia: string) {
    const confirmar = confirm(
      `Deseja mesmo excluir o certificado da família "${nome_familia}"?\n\nOs produtos vinculados a esse certificado passarão a constar como 'Sem Registro'.`
    );

    if (!confirmar) return;

    const { error: deleteError } = await supabase
      .from("inmetro_familias")
      .delete()
      .eq("id", id);

    if (deleteError) {
      alert("Erro ao excluir certificado.");
    } else {
      await carregarDados(); // Atualiza a lista na tela
    }
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

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Certificados Inmetro</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie as famílias de produtos certificadas de cada importador.
          </p>
        </div>
        <button
          onClick={handleNovo}
          disabled={empresas.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-4 py-2.5 rounded-lg shadow-sm transition flex items-center space-x-2 disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Novo Certificado</span>
        </button>
      </div>

      {/* Tabela de Certificados */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        {loading ? (
          <div className="text-center py-12 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Carregando certificados...
          </div>
        ) : certificados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Importador</th>
                  <th className="pb-3">Família</th>
                  <th className="pb-3">Nº Registro</th>
                  <th className="pb-3">Validade</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {certificados.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/30">
                    <td className="py-4 font-semibold text-slate-700">
                      {cert.empresas?.razao_social || "Não vinculado"}
                    </td>
                    <td className="py-4 text-slate-600">{cert.nome_familia}</td>
                    <td className="py-4 text-slate-500 font-mono">{cert.numero_registro}</td>
                    <td className="py-4 text-slate-500">
                      {formatarDataSemOffset(cert.data_validade)}
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          cert.status === "Ativo"
                            ? "bg-emerald-100 text-emerald-800"
                            : cert.status === "Vencido"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {cert.status}
                      </span>
                    </td>
                    <td className="py-4 text-right space-x-3">
                      <button
                        onClick={() => handleEditar(cert)}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(cert.id, cert.nome_familia)}
                        className="text-red-500 hover:text-red-700 font-semibold text-xs"
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
          <div className="text-center py-12 text-slate-500 italic">
            Nenhum certificado cadastrado para nenhuma família.
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? "Editar Certificado" : "Novo Certificado"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg font-medium">{error}</div>
              )}

              {/* Dropdown de Importadores */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Importador Dono do Certificado *
                </label>
                <select
                  required
                  value={formData.empresa_id}
                  onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 outline-none"
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.razao_social}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nome da Família de Produtos *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome_familia}
                  onChange={(e) => setFormData({ ...formData, nome_familia: e.target.value })}
                  placeholder="Ex: Bonecas de plástico"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Nº do Registro (Inmetro) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.numero_registro}
                    onChange={(e) => setFormData({ ...formData, numero_registro: e.target.value })}
                    placeholder="Ex: 009870/2022"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Status do Registro
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 outline-none"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Em Processo">Em Processo</option>
                    <option value="Vencido">Vencido</option>
                    <option value="Sem Registro">Sem Registro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Data de Emissão *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.data_emissao}
                    onChange={(e) => setFormData({ ...formData, data_emissao: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Data de Validade *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.data_validade}
                    onChange={(e) => setFormData({ ...formData, data_validade: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Dropdown Inteligente de OCPs Padronizadas do Inmetro */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Organismo de Certificação (OCP do Selo) *
                </label>
                <select
                  required
                  value={`${formData.ocp_nome}|${formData.ocp_numero}`}
                  onChange={(e) => {
                    const [nome, numero] = e.target.value.split("|");
                    setFormData({ ...formData, ocp_nome: nome, ocp_numero: numero });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 outline-none"
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
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ModalAviso from "@/components/ModalAviso";

interface Empresa {
  id: string;
  razao_social: string;
  cnpj: string;
  endereco: string | null;
  sac_email: string | null;
  logo_url: string | null;
  created_at: string;
}

export default function ImportadoresPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // Guarda o ID se for edição
  const [error, setError] = useState<string | null>(null);

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
    razao_social: "",
    cnpj: "",
    endereco: "",
    sac_email: "",
    logo_url: "",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null); // Armazena o arquivo de imagem selecionado localmente no computador

  async function buscarEmpresas() {
    setLoading(true);
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .order("razao_social");

    if (error) {
      console.error("Erro ao buscar empresas:", error);
    } else if (data) {
      setEmpresas(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    buscarEmpresas();
  }, []);

  // Abre o modal em modo de cadastro
  function handleNovo() {
    setEditingId(null);
    setLogoFile(null); // Limpa seleção de arquivo
    setFormData({
      razao_social: "",
      cnpj: "",
      endereco: "",
      sac_email: "",
      logo_url: "",
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Abre o modal preenchido em modo de edição
  function handleEditar(empresa: Empresa) {
    setEditingId(empresa.id);
    setLogoFile(null); // Limpa seleção de arquivo
    setFormData({
      razao_social: empresa.razao_social,
      cnpj: empresa.cnpj,
      endereco: empresa.endereco || "",
      sac_email: empresa.sac_email || "",
      logo_url: empresa.logo_url || "",
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Função para deletar importador com Card Elegante
  function handleExcluir(id: string, nome: string) {
    setModalAviso({
      isOpen: true,
      tipo: "perigo",
      titulo: "Excluir Importador",
      mensagem: `Deseja mesmo excluir o importador "${nome}"?\n\nIsso apagará permanentemente todos os produtos e certificados vinculados a ele!`,
      onConfirmar: async () => {
        setModalAviso((prev) => ({ ...prev, isOpen: false }));
        const { error: deleteError } = await supabase
          .from("empresas")
          .delete()
          .eq("id", id);

        if (deleteError) {
          setModalAviso({
            isOpen: true,
            tipo: "alerta",
            titulo: "Erro ao Excluir",
            mensagem: "Não foi possível excluir o importador. Verifique as dependências.",
          });
        } else {
          await buscarEmpresas();
        }
      },
    });
  }

  // Salvar ou Atualizar com suporte a Upload de Arquivo do Computador
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const razaoSocialSanitizada = formData.razao_social.trim();
    const cnpjSanitizado = formData.cnpj.trim();
    const sacEmailSanitizado = formData.sac_email.trim() || null;
    const enderecoSanitizado = formData.endereco.trim() || null;
    let logoUrlFinal = formData.logo_url.trim() || null;

    // 1. Lógica de Upload do Arquivo para o Supabase Storage (se houver novo arquivo selecionado)
    if (logoFile) {
      try {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `logos-empresas/${fileName}`;

        // Faz o upload para o bucket 'logos' no Supabase
        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(filePath, logoFile);

        if (uploadError) {
          throw new Error("Falha ao subir imagem para o Storage: " + uploadError.message);
        }

        // Recupera a URL pública gerada para salvar no banco
        const { data: { publicUrl } } = supabase.storage
          .from("logos")
          .getPublicUrl(filePath);

        logoUrlFinal = publicUrl;
      } catch (err: any) {
        setError(err.message || "Erro no upload do arquivo.");
        setSaving(false);
        return;
      }
    }

    // 2. Gravação das informações no Banco de Dados
    if (editingId) {
      // MODO EDICAO
      const { error: updateError } = await supabase
        .from("empresas")
        .update({
          razao_social: razaoSocialSanitizada,
          cnpj: cnpjSanitizado,
          endereco: enderecoSanitizado,
          sac_email: sacEmailSanitizado,
          logo_url: logoUrlFinal,
        })
        .eq("id", editingId);

      if (updateError) {
        if (updateError.code === "23505") {
          setError("Este CNPJ já está cadastrado para outro importador.");
        } else {
          setError("Erro ao atualizar dados. Verifique os campos ou o CNPJ.");
        }
        setSaving(false);
      } else {
        setIsModalOpen(false);
        await buscarEmpresas();
        setSaving(false);
      }
    } else {
      // MODO CADASTRO
      const { error: insertError } = await supabase
        .from("empresas")
        .insert([
          {
            razao_social: razaoSocialSanitizada,
            cnpj: cnpjSanitizado,
            endereco: enderecoSanitizado,
            sac_email: sacEmailSanitizado,
            logo_url: logoUrlFinal,
          },
        ]);

      if (insertError) {
        if (insertError.code === "23505") {
          setError("Este CNPJ já está cadastrado para outro importador.");
        } else {
          setError("Erro ao salvar importador.");
        }
        setSaving(false);
      } else {
        setIsModalOpen(false);
        await buscarEmpresas();
        setSaving(false);
      }
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Importadores</h1>
          <p className="text-slate-500 text-sm mt-1">
            Cadastre e gerencie as empresas importadoras ativas no sistema.
          </p>
        </div>
        <button
          onClick={handleNovo}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-2 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Novo Importador</span>
        </button>
      </div>

      {/* Tabela de Empresas */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Carregando empresas...
          </div>
        ) : empresas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Logo</th>
                  <th className="py-3.5 px-6">Razão Social</th>
                  <th className="py-3.5 px-6">CNPJ</th>
                  <th className="py-3.5 px-6">E-mail SAC</th>
                  <th className="py-3.5 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {empresas.map((empresa) => (
                  <tr key={empresa.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6">
                      {empresa.logo_url ? (
                        <div className="w-10 h-10 rounded-xl border border-slate-200 bg-white p-1 flex items-center justify-center shadow-xs">
                          <img
                            src={empresa.logo_url}
                            alt="Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                          {empresa.razao_social.substring(0, 2)}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-800">{empresa.razao_social}</td>
                    <td className="py-4 px-6 text-slate-500 font-mono text-xs">{empresa.cnpj}</td>
                    <td className="py-4 px-6 text-slate-500 text-xs">{empresa.sac_email || "Não informado"}</td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => handleEditar(empresa)}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(empresa.id, empresa.razao_social)}
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
            Nenhum importador cadastrado. Clique no botão acima para adicionar.
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO/EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-6 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? "Editar Importador" : "Novo Importador"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Preencha as informações cadastrais da empresa.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">{error}</div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Razão Social *
                </label>
                <input
                  type="text"
                  required
                  value={formData.razao_social}
                  onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                  placeholder="Ex: STONE IMPORT LTDA"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    CNPJ *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    placeholder="Ex: 00.000.000/0001-00"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    E-mail SAC
                  </label>
                  <input
                    type="email"
                    value={formData.sac_email}
                    onChange={(e) => setFormData({ ...formData, sac_email: e.target.value })}
                    placeholder="Ex: sac@empresa.com.br"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={formData.endereco}
                  onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                  placeholder="Rua, Número, Bairro, Cidade - Estado"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Logomarca da Empresa (PNG / JPG)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setLogoFile(file);
                  }}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-white file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 outline-none cursor-pointer"
                />
                {formData.logo_url && !logoFile && (
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Logo atual preservada no servidor. Escolha outro arquivo apenas se desejar alterá-la.</p>
                )}
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
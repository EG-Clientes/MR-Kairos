"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  inmetro_familias: { nome_familia: string } | null;
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

  // Estado do formulário
  const [formData, setFormData] = useState({
    empresa_id: "",
    familia_id: "",
    fty_no: "",
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
        .select("*, empresas(razao_social), inmetro_familias(nome_familia)")
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

  // Deletar Produto
  async function handleExcluir(id: string, fty_no: string) {
    const confirmar = confirm(
      `Deseja mesmo excluir o produto "${fty_no}" do catálogo?`
    );

    if (!confirmar) return;

    const { error: deleteError } = await supabase
      .from("produtos")
      .delete()
      .eq("id", id);

    if (deleteError) {
      alert("Erro ao excluir produto.");
    } else {
      await carregarDados();
    }
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

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Produtos</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie o catálogo de produtos de cada importador e configure os alertas de rotulagem.
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
          <span>Novo Produto</span>
        </button>
      </div>

      {/* Lista de Produtos */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        {loading ? (
          <div className="text-center py-12 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Carregando produtos...
          </div>
        ) : produtos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Importador</th>
                  <th className="pb-3">Código (FTY NO)</th>
                  <th className="pb-3">EAN-13</th>
                  <th className="pb-3">Descrição</th>
                  <th className="pb-3">Inmetro Vinc.</th>
                  <th className="pb-3">Sinalizadores (Avisos)</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {produtos.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50/30">
                    <td className="py-4 font-semibold text-slate-700">
                      {prod.empresas?.razao_social || "Não vinculado"}
                    </td>
                    <td className="py-4 font-mono text-blue-600">{prod.fty_no}</td>
                    <td className="py-4 font-mono text-slate-500 text-xs">{prod.ean_13 || "Sem EAN"}</td>
                    <td className="py-4 text-slate-600">{prod.descricao}</td>
                    <td className="py-4 text-slate-500">
                      {prod.inmetro_familias?.nome_familia || (
                        <span className="text-amber-500 text-xs font-medium">Sem Registro</span>
                      )}
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1">
                        {prod.usa_pilha && (
                          <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[10px] font-semibold px-2 py-0.5 rounded">
                            Pilha
                          </span>
                        )}
                        {prod.contem_ima && (
                          <span className="bg-red-50 text-red-700 border border-red-100 text-[10px] font-semibold px-2 py-0.5 rounded">
                            Ímã
                          </span>
                        )}
                        {prod.partes_pequenas && (
                          <span className="bg-orange-50 text-orange-700 border border-orange-100 text-[10px] font-semibold px-2 py-0.5 rounded">
                            Peças Peq.
                          </span>
                        )}
                        {prod.metal && (
                          <span className="bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-semibold px-2 py-0.5 rounded">
                            Metal
                          </span>
                        )}
                        {prod.restritivo_0_3_anos && (
                          <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-semibold px-2 py-0.5 rounded">
                            0-3 Anos
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 text-right space-x-3">
                      <button
                        onClick={() => handleEditar(prod)}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(prod.id, prod.fty_no)}
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
            Nenhum produto cadastrado até o momento.
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full p-6 space-y-5 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? "Editar Produto" : "Novo Produto"}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Importador */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Importador *
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

                {/* Família Inmetro */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Família Inmetro Vinc.
                  </label>
                  <select
                    value={formData.familia_id}
                    onChange={(e) => setFormData({ ...formData, familia_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 outline-none"
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

              {/* Código do Fornecedor em destaque em linha inteira */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Código do Fornecedor (FTY NO) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.fty_no}
                  onChange={(e) => setFormData({ ...formData, fty_no: e.target.value })}
                  placeholder="Ex: 3117"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>

              {/* Códigos de barras pareados em 2 colunas com placeholders limpos e padronizados */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Código de Barras (Brasil)
                  </label>
                  <input
                    type="text"
                    value={formData.ean_13}
                    onChange={(e) => setFormData({ ...formData, ean_13: e.target.value })}
                    placeholder="automático"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Código de Barras (Exterior)
                  </label>
                  <input
                    type="text"
                    value={formData.ean_barras}
                    onChange={(e) => setFormData({ ...formData, ean_barras: e.target.value })}
                    placeholder="pode ficar vazio"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Descrição Comercial do Produto *
                </label>
                <input
                  type="text"
                  required
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Ex: BONECA SEREIA COM LUZ"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Faixa Etária Indicada
                  </label>
                  <input
                    type="text"
                    value={formData.idade_minima || ""}
                    onChange={(e) => setFormData({ ...formData, idade_minima: e.target.value })}
                    placeholder="Ex: +3 anos"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Data de Fabricação
                  </label>
                  <input
                    type="text"
                    value={formData.data_fabricacao}
                    onChange={(e) => setFormData({ ...formData, data_fabricacao: e.target.value })}
                    placeholder="Ex: 08/2026"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Lote de Importação
                  </label>
                  <input
                    type="text"
                    value={formData.lote}
                    onChange={(e) => setFormData({ ...formData, lote: e.target.value })}
                    placeholder="Ex: 08/2026"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* SINALIZADORES DE SEGURANÇA */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Sinalizadores de Segurança (Avisos Legais)
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.usa_pilha}
                      onChange={(e) => setFormData({ ...formData, usa_pilha: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Pilha / Bateria</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.contem_ima}
                      onChange={(e) => setFormData({ ...formData, contem_ima: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Ímã</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.partes_pequenas}
                      onChange={(e) => setFormData({ ...formData, partes_pequenas: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Partes Pequenas</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={formData.metal}
                      onChange={(e) => setFormData({ ...formData, metal: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Contém Fechos Metálicos</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-slate-700 text-sm cursor-pointer hover:text-slate-950 col-span-1 sm:col-span-2 border-t border-slate-200/60 pt-2 mt-1">
                    <input
                      type="checkbox"
                      checked={formData.restritivo_0_3_anos}
                      onChange={(e) => setFormData({ ...formData, restritivo_0_3_anos: e.target.checked })}
                      className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4"
                    />
                    <span className="text-rose-700 font-medium">Restritivo para menores de 3 anos (Selo 0-3)</span>
                  </label>
                </div>
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
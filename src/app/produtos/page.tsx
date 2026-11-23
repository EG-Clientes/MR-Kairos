"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ModalAviso from "@/components/ModalAviso";
import ExcelJS from "exceljs";

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
  restritivo_0_4_anos?: boolean;
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
  const [buscaNome, setBuscaNome] = useState<string>("");
  // Gera lista completa de colunas de A até AZ (cobre planilhas de até 52 colunas)
  const OPCOES_COLUNAS_EXCEL = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => "A" + c),
  ];

  // Estados do Modal Lean de Importação em Lote via Excel
  const [isModalExcelOpen, setIsModalExcelOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelEmpresaId, setExcelEmpresaId] = useState<string>("");
  const [linhaInicio, setLinhaInicio] = useState<string>("");
  const [colunaCodigo, setColunaCodigo] = useState<string>("");
  const [colunaDescricao, setColunaDescricao] = useState<string>("");
  const [colunaEan, setColunaEan] = useState<string>("");
  const [colunaFamilia, setColunaFamilia] = useState<string>("");
  const [colunaIdade, setColunaIdade] = useState<string>("");
  const [colunaRestricao, setColunaRestricao] = useState<string>("");
  const [importandoExcel, setImportandoExcel] = useState(false);

  // Estados da Seleção em Massa Dinâmica
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [familiaLoteId, setFamiliaLoteId] = useState<string>("");
  const [vinculandoLote, setVinculandoLote] = useState(false);

  // Identificação inteligente de Multi-Tenant na seleção
  const produtosSelecionadosObjetos = produtos.filter((p) => selecionados.includes(p.id));
  const empresasUnicas = Array.from(new Set(produtosSelecionadosObjetos.map((p) => p.empresa_id)));
  const ehMesmaEmpresa = empresasUnicas.length === 1;
  const empresaUnicaId = ehMesmaEmpresa ? empresasUnicas[0] : null;
  const familiasParaLote = empresaUnicaId
    ? familias.filter((f) => f.empresa_id === empresaUnicaId)
    : [];

  // Alternar seleção de um item individual
  function toggleSelecionarItem(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Alternar "Selecionar Todos" os produtos que estão visíveis na tela
  function toggleSelecionarTodos() {
    const idsVisiveis = produtosExibidos.map((p) => p.id);
    const todosJaMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.includes(id));

    if (todosJaMarcados) {
      // Remove da seleção apenas os que estão na tela
      setSelecionados((prev) => prev.filter((id) => !idsVisiveis.includes(id)));
    } else {
      // Adiciona todos os visíveis na seleção sem duplicar
      setSelecionados((prev) => Array.from(new Set([...prev, ...idsVisiveis])));
    }
  }

  // Ação de vincular no banco via Supabase
  async function handleVincularFamiliaLote() {
    if (!familiaLoteId || selecionados.length === 0 || !ehMesmaEmpresa) return;

    setVinculandoLote(true);
    try {
      const { error } = await supabase
        .from("produtos")
        .update({ familia_id: familiaLoteId })
        .in("id", selecionados);

      if (error) throw error;

      setModalAviso({
        isOpen: true,
        tipo: "sucesso",
        titulo: "Vínculo em Lote Concluído!",
        mensagem: `${selecionados.length} produto(s) foram vinculados à família Inmetro com sucesso.`,
      });

      setSelecionados([]);
      setFamiliaLoteId("");
      await carregarDados();
    } catch (err: any) {
      setModalAviso({
        isOpen: true,
        tipo: "perigo",
        titulo: "Erro no Vínculo em Lote",
        mensagem: err.message || "Não foi possível vincular os certificados.",
      });
    } finally {
      setVinculandoLote(false);
    }
  }

  // Estados dos Avisos Customizados & Gaveta Lateral
  const [avisosCustom, setAvisosCustom] = useState<{ id: string; empresa_id: string | null; titulo: string; texto_aviso: string }[]>([]);
  const [abaGerenciador, setAbaGerenciador] = useState(false);
  const [novoAvisoTitulo, setNovoAvisoTitulo] = useState("");
  const [novoAvisoTexto, setNovoAvisoTexto] = useState("");
  const [editandoAvisoId, setEditandoAvisoId] = useState<string | null>(null);

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
    restritivo_0_4_anos: false,
    idade_minima: "+3 anos",
    avisos_extras: [] as any[],
  });

  async function carregarDados() {
    setLoading(true);

    const buscarTodosProdutos = async () => {
      const acumulados: any[] = [];
      let pagina = 0;
      const tamanhoPagina = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("produtos")
          .select("*, empresas(razao_social), inmetro_familias(nome_familia, status, data_validade)")
          .order("created_at")
          .range(pagina * tamanhoPagina, (pagina + 1) * tamanhoPagina - 1);
        if (error) return { data: null, error };
        if (!data || data.length === 0) break;
        acumulados.push(...data);
        if (data.length < tamanhoPagina) break;
        pagina++;
      }
      return { data: acumulados, error: null };
    };

    // Carrega produtos (paginado >1000), empresas, famílias e avisos customizados em paralelo
    const [prodResult, empResult, famResult, avisosResult] = await Promise.all([
      buscarTodosProdutos(),
      supabase
        .from("empresas")
        .select("id, razao_social")
        .order("razao_social"),
      supabase
        .from("inmetro_familias")
        .select("id, empresa_id, nome_familia")
        .order("nome_familia"),
      supabase
        .from("avisos_customizados")
        .select("*")
        .order("created_at")
    ]);

    const { data: prodData, error: prodError } = prodResult;
    const { data: empData, error: empError } = empResult;
    const { data: famData, error: famError } = famResult;

    if (!prodError && prodData) setProdutos(prodData as any);
    if (!empError && empData) setEmpresas(empData);
    if (!famError && famData) setFamilias(famData);
    if (avisosResult.data) setAvisosCustom(avisosResult.data as any);

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
    setAbaGerenciador(false);
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
      restritivo_0_4_anos: false,
      idade_minima: "+3 anos",
      avisos_extras: [],
    });
    setError(null);
    setIsModalOpen(true);
  }

  // Modo edição preenchido
  function handleEditar(prod: Produto) {
    setEditingId(prod.id);
    setAbaGerenciador(false);
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
      restritivo_0_4_anos: Boolean(prod.restritivo_0_4_anos),
      idade_minima: prod.idade_minima || "+3 anos",
      avisos_extras: (prod as any).avisos_extras || [],
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
          restritivo_0_4_anos: formData.restritivo_0_4_anos,
          idade_minima: formData.idade_minima || null,
          avisos_extras: formData.avisos_extras,
        })
        .eq("id", editingId);

      if (updateError) {
        setError("Erro ao atualizar produto. Verifique se já existe um produto idêntico cadastrado.");
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
          restritivo_0_4_anos: formData.restritivo_0_4_anos,
          idade_minima: formData.idade_minima || null,
          avisos_extras: formData.avisos_extras,
        },
      ]);

      if (insertError) {
        if (insertError.code === "23505") {
          setError("Este produto (mesmo código, descrição e EAN) já está cadastrado para este importador.");
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

  // Processamento em Lote com Auto-Match de Família Inmetro e Baseline de Segurança
  async function handleImportarExcelProdutos(e: React.FormEvent) {
    e.preventDefault();

    if (!excelFile) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Arquivo Obrigatório",
        mensagem: "Selecione o arquivo Excel (.xlsx ou .xlsm) contendo os produtos.",
      });
      return;
    }

    if (!excelEmpresaId) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Importador Obrigatório",
        mensagem: "Selecione a qual importador estes produtos pertencem.",
      });
      return;
    }

    const linhaNum = parseInt(linhaInicio.trim(), 10);
    if (!linhaInicio.trim() || isNaN(linhaNum) || linhaNum < 1) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Linha Inicial Obrigatória",
        mensagem: "Informe o número da linha onde começam os produtos na planilha (Ex: 21) antes de processar.",
      });
      return;
    }

    if (!colunaCodigo) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Coluna do Código Obrigatória",
        mensagem: "Selecione qual coluna contém o Código do Produto (Ref / FTY).",
      });
      return;
    }

    if (!colunaDescricao || colunaDescricao === "NONE") {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Coluna da Descrição Obrigatória",
        mensagem: "Por favor, selecione qual coluna da planilha contém a Descrição Comercial do produto.",
      });
      return;
    }

    setImportandoExcel(true);

    try {
      const buffer = await excelFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error("Nenhuma aba encontrada na planilha.");
      }

      // 1. Busca produtos existentes desse importador para travar duplicidades (Código + Descrição + EAN)
      const { data: prodsExistentes, error: errProd } = await supabase
        .from("produtos")
        .select("fty_no, descricao, ean_13")
        .eq("empresa_id", excelEmpresaId);

      if (errProd) throw new Error("Erro ao consultar catálogo existente: " + errProd.message);

      const chavesExistentes3 = new Set(
        (prodsExistentes || []).map((p) => {
          const cod = (p.fty_no || "").trim().toUpperCase();
          const desc = (p.descricao || "").trim().toUpperCase();
          const ean = (p.ean_13 || "").replace(/["'\s-]/g, "").trim().toUpperCase();
          return `${cod}:::${desc}:::${ean}`;
        })
      );

      const chavesExistentes2 = new Set(
        (prodsExistentes || []).map((p) => {
          const cod = (p.fty_no || "").trim().toUpperCase();
          const desc = (p.descricao || "").trim().toUpperCase();
          return `${cod}:::${desc}`;
        })
      );

      // 2. Busca famílias cadastradas desse importador para o Auto-Match
      const { data: famsExistentes, error: errFam } = await supabase
        .from("inmetro_familias")
        .select("id, codigo_ocp, nome_familia")
        .eq("empresa_id", excelEmpresaId);

      if (errFam) throw new Error("Erro ao consultar famílias Inmetro: " + errFam.message);

      // Mapa duplo: acha família tanto pelo Nº (ex: "1") quanto pelo Nome
      const mapaFamilias = new Map<string, string>();
      (famsExistentes || []).forEach((f) => {
        if (f.codigo_ocp) mapaFamilias.set(f.codigo_ocp.trim().toUpperCase(), f.id);
        if (f.nome_familia) mapaFamilias.set(f.nome_familia.trim().toUpperCase(), f.id);
      });

      // Helper seguro contra fórmulas e nulos
      const extrairTextoSeguro = (celula: ExcelJS.Cell | null | undefined): string => {
        if (!celula) return "";
        try {
          const val = celula.value;
          if (val === null || val === undefined) return "";
          if (typeof val === "object") {
            if ("result" in val) return val.result !== null && val.result !== undefined ? String(val.result).trim() : "";
            if (Array.isArray((val as any).richText)) return (val as any).richText.map((t: any) => t.text || "").join("").trim();
            if ("text" in val) return String((val as any).text || "").trim();
          }
          return String(val).trim();
        } catch {
          return "";
        }
      };

      const numLinhaCorte = linhaInicio.trim() ? parseInt(linhaInicio.trim(), 10) : null;
      const processadosNestaPlanilha = new Set<string>();
      const novosProdutos: any[] = [];
      let totalIgnorados = 0;
      let totalVinculadosComInmetro = 0;

      const mesAnoAtual = `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;

      worksheet.eachRow((row, rowNumber) => {
        if (numLinhaCorte !== null && !isNaN(numLinhaCorte)) {
          if (rowNumber < numLinhaCorte) return;
        }

        const rawCodigo = extrairTextoSeguro(row.getCell(colunaCodigo));
        if (!rawCodigo) return;

        // Lista negra de cabeçalhos
        const cabecalhosIgnorar = ["ITEM", "REF", "FTY", "CÓDIGO", "CODIGO", "REFERÊNCIA", "MODELO", "PRODUTO"];
        if (cabecalhosIgnorar.includes(rawCodigo.trim().toUpperCase())) return;

        // Descrição comercial
        let rawDesc = colunaDescricao && colunaDescricao !== "NONE"
          ? extrairTextoSeguro(row.getCell(colunaDescricao))
          : rawCodigo;
        if (!rawDesc) rawDesc = rawCodigo;

        // Código de barras: só aceita se tiver exatamente 13 dígitos numéricos; caso contrário gera GS1 Brasil 789 automático
        let rawEan = colunaEan && colunaEan !== "NONE"
          ? extrairTextoSeguro(row.getCell(colunaEan))
          : "";
        const eanDigitos = rawEan ? rawEan.replace(/["'\s-]/g, "").trim() : "";
        const eanLimpo = /^\d{13}$/.test(eanDigitos) ? eanDigitos : "";
        const eanNorm = eanLimpo.toUpperCase();
        const codNorm = rawCodigo.trim().toUpperCase();
        const descNorm = rawDesc.trim().toUpperCase();

        // Se a linha trouxer EAN, trava pelos 3 campos (Código + Descrição + EAN).
        // Se não trouxer EAN, trava por 2 campos (Código + Descrição).
        const chaveUnica = eanNorm
          ? `${codNorm}:::${descNorm}:::${eanNorm}`
          : `${codNorm}:::${descNorm}`;

        const jaExisteNoBanco = eanNorm
          ? chavesExistentes3.has(chaveUnica)
          : chavesExistentes2.has(chaveUnica);

        // Trava anti-duplicidade
        if (jaExisteNoBanco || processadosNestaPlanilha.has(chaveUnica)) {
          totalIgnorados++;
          return;
        }

        processadosNestaPlanilha.add(chaveUnica);

        const eanFinal = eanLimpo || gerarEan13Valido();

        // CASAMENTO AUTOMÁTICO COM INMETRO (Coluna C da BRICS)
        let familiaIdFinal: string | null = null;
        if (colunaFamilia && colunaFamilia !== "NONE") {
          const rawFam = extrairTextoSeguro(row.getCell(colunaFamilia)).toUpperCase();
          if (mapaFamilias.has(rawFam)) {
            familiaIdFinal = mapaFamilias.get(rawFam)!;
            totalVinculadosComInmetro++;
          }
        }

        // Leitura opcional da Faixa Etária (ex: +4 anos, 0+, +3 anos)
        let idadeFinal = "+3 anos";
        if (colunaIdade && colunaIdade !== "NONE") {
          const rawIdade = extrairTextoSeguro(row.getCell(colunaIdade)).trim();
          if (rawIdade && !/^(NA|NÃO APLICÁVEL|NAO APLICAVEL|-)$/i.test(rawIdade)) {
            if (/^(\+?0+|0+\+?|\+?0\s*ano|TODAS AS IDADES)/i.test(rawIdade)) {
              idadeFinal = "0+";
            } else {
              idadeFinal = rawIdade;
            }
          }
        }

        // Leitura opcional da Restrição Etária (0-3, 0-4 ou Sem restrição)
        let partesPequenasFinal = true;
        let restritivo03Final = true;
        let restritivo04Final = false;

        if (colunaRestricao && colunaRestricao !== "NONE") {
          const rawRestr = extrairTextoSeguro(row.getCell(colunaRestricao)).trim();
          if (rawRestr) {
            if (/SEM\s*RESTRI|^N[ÃA]O$|^N[ÃA]O\s*APLIC|^NA$/i.test(rawRestr)) {
              partesPequenasFinal = false;
              restritivo03Final = false;
              restritivo04Final = false;
            } else if (/0\s*[-–aA]\s*4|MENOR(ES)?\s*(DE)?\s*4/i.test(rawRestr)) {
              partesPequenasFinal = true;
              restritivo03Final = false;
              restritivo04Final = true;
            } else if (/0\s*[-–aA]\s*3|MENOR(ES)?\s*(DE)?\s*3|^SIM$/i.test(rawRestr)) {
              partesPequenasFinal = true;
              restritivo03Final = true;
              restritivo04Final = false;
            }
          }
        }

        // Injeta produto com o Baseline Padrão Ouro de Segurança (respeitando idade/restrição se mapeadas)
        novosProdutos.push({
          empresa_id: excelEmpresaId,
          familia_id: familiaIdFinal,
          fty_no: rawCodigo,
          referencia_interna: rawCodigo,
          descricao: rawDesc.toUpperCase(),
          ean_13: eanFinal,
          ean_barras: null,
          data_fabricacao: mesAnoAtual,
          lote: mesAnoAtual,
          usa_pilha: false,
          contem_ima: false,
          partes_pequenas: partesPequenasFinal,
          metal: false,
          restritivo_0_3_anos: restritivo03Final,
          restritivo_0_4_anos: restritivo04Final,
          idade_minima: idadeFinal,
          avisos_extras: [],
        });
      });

      if (novosProdutos.length === 0) {
        setImportandoExcel(false);
        setIsModalExcelOpen(false);
        setModalAviso({
          isOpen: true,
          tipo: "alerta",
          titulo: "Nenhum Produto Novo",
          mensagem: totalIgnorados > 0
            ? `Todos os ${totalIgnorados} produto(s) lidos desta planilha já estavam cadastrados no catálogo ou repetidos na planilha e foram ignorados com segurança.`
            : "Nenhum produto válido foi identificado a partir da linha indicada.",
        });
        return;
      }

      // Insere produtos em lote no banco
      const { error: insertError } = await supabase.from("produtos").insert(novosProdutos);
      if (insertError) throw new Error("Erro ao salvar produtos no banco: " + insertError.message);

      await carregarDados();
      setIsModalExcelOpen(false);
      setExcelFile(null);

      setModalAviso({
        isOpen: true,
        tipo: "sucesso",
        titulo: "Importação Concluída com Sucesso!",
        mensagem: `• ${novosProdutos.length} novo(s) produto(s) cadastrado(s).\n• ${totalVinculadosComInmetro} já amarrado(s) automaticamente à sua Família Inmetro.\n• ${totalIgnorados} produto(s) já existiam no catálogo ou estavam repetidos na planilha e foram ignorados com segurança.`,
      });
    } catch (err: any) {
      console.error("Erro na importação de produtos:", err);
      setModalAviso({
        isOpen: true,
        tipo: "perigo",
        titulo: "Erro na Importação",
        mensagem: err.message || "Ocorreu um erro ao processar a planilha de produtos.",
      });
    } finally {
      setImportandoExcel(false);
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
    if (buscaNome.trim()) {
      const termo = buscaNome.toLowerCase();
      const bateDescricao = prod.descricao.toLowerCase().includes(termo);
      const bateFty = prod.fty_no.toLowerCase().includes(termo);
      if (!bateDescricao && !bateFty) return false;
    }

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
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* Botão Novo: Importar Planilha de Produtos */}
          <button
            onClick={() => {
              setExcelFile(null);
              setExcelEmpresaId(filtroEmpresa || "");
              setIsModalExcelOpen(true);
            }}
            disabled={empresas.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Importar Planilha</span>
          </button>

          {/* Botão Manual Original (100% intacto) */}
          <button
            onClick={handleNovo}
            disabled={empresas.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Novo Produto</span>
          </button>
        </div>
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
          {(filtroEmpresa || filtroFamilia || filtroStatus !== "todos" || buscaNome) && (
            <button
              onClick={() => {
                setFiltroEmpresa("");
                setFiltroFamilia("");
                setFiltroStatus("todos");
                setBuscaNome("");
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition w-fit"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 1. Busca por Nome ou Código */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Buscar Produto
            </label>
            <div className="relative">
              <input
                type="text"
                value={buscaNome}
                onChange={(e) => setBuscaNome(e.target.value)}
                placeholder="Nome ou código FTY..."
                className="w-full pl-8 pr-7 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition font-medium"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {buscaNome && (
                <button
                  onClick={() => setBuscaNome("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 2. Filtro por Importador */}
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

          {/* 3. Filtro por Família */}
          <div className="min-w-0">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Família Inmetro
            </label>
            <select
              value={filtroFamilia}
              onChange={(e) => setFiltroFamilia(e.target.value)}
              className="w-full max-w-full truncate px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:border-blue-500 outline-none transition"
            >
              <option value="">Todas as Famílias</option>
              {familiasParaFiltro.map((fam) => (
                <option key={fam.id} value={fam.id} title={fam.nome_familia}>
                  {fam.nome_familia.length > 60 ? `${fam.nome_familia.slice(0, 60)}...` : fam.nome_familia}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Filtro por Situação / Compliance */}
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
                  <th className="py-3.5 pl-5 pr-2 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        produtosExibidos.length > 0 &&
                        produtosExibidos.every((p) => selecionados.includes(p.id))
                      }
                      onChange={toggleSelecionarTodos}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer align-middle"
                      title="Selecionar / Desmarcar todos os visíveis"
                    />
                  </th>
                  <th className="py-3.5 px-6">Importador</th>
                  <th className="py-3.5 px-6">Código (FTY NO)</th>
                  <th className="py-3.5 px-6">EAN-13</th>
                  <th className="py-3.5 px-6">Descrição Comercial</th>
                  <th className="py-3.5 px-6">Família Inmetro</th>
                  <th className="py-3.5 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {produtosExibidos.map((prod) => (
                  <tr
                    key={prod.id}
                    className={`transition-colors ${
                      selecionados.includes(prod.id)
                        ? "bg-blue-50/50 hover:bg-blue-50/70"
                        : "hover:bg-slate-50/60"
                    }`}
                  >
                    <td className="py-3.5 pl-5 pr-2 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selecionados.includes(prod.id)}
                        onChange={() => toggleSelecionarItem(prod.id)}
                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer align-middle"
                      />
                    </td>
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
                    <td className="py-3.5 px-6 text-slate-700 text-xs font-medium">
                      {prod.inmetro_familias?.nome_familia ? (
                        <span className="leading-relaxed block">{prod.inmetro_familias.nome_familia}</span>
                      ) : (
                        <span className="text-amber-600 font-semibold bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap">
                          Sem Registro
                        </span>
                      )}
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

                  <div className="min-w-0">
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Família Certificada (Inmetro)
                    </label>
                    <select
                      value={formData.familia_id}
                      onChange={(e) => setFormData({ ...formData, familia_id: e.target.value })}
                      className="w-full max-w-full truncate px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 outline-none transition"
                    >
                      <option value="">Sem Registro (Opcional)</option>
                      {familiasFiltradas.map((fam) => (
                        <option key={fam.id} value={fam.id} title={fam.nome_familia}>
                          {fam.nome_familia.length > 60 ? `${fam.nome_familia.slice(0, 60)}...` : fam.nome_familia}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Código / Ref / FTY  *
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
                      Ref. do Importador
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

              {/* SEÇÃO 3: SINALIZADORES DE SEGURANÇA JURÍDICA COM SLIDE NATIVO */}
              <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3 overflow-hidden relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                    2. Avisos Legais de Segurança Obrigatórios
                  </span>
                  <button
                    type="button"
                    onClick={() => setAbaGerenciador(!abaGerenciador)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 px-2.5 py-1 rounded-lg transition shadow-xs flex items-center gap-1"
                  >
                    <span>{abaGerenciador ? "← Voltar às Flags" : "+ Gerenciar Flags"}</span>
                  </button>
                </div>

                {/* CONTAINER DO SLIDE SUAVE ESTILO CELULAR */}
                <div className="relative overflow-hidden min-h-[140px]">
                  
                  {/* TELA A: Checkboxes de Seleção (Padrões + Customizadas) */}
                  <div className={`transition-all duration-300 ease-in-out ${abaGerenciador ? "-translate-x-full opacity-0 pointer-events-none absolute w-full" : "translate-x-0 opacity-100"}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

                      {/* Renderiza as flags adicionadas dinamicamente */}
                      {avisosCustom
                        .filter((av) => !av.empresa_id || av.empresa_id === formData.empresa_id)
                        .map((aviso) => {
                          const estaMarcado = formData.avisos_extras?.some((x: any) => (typeof x === "string" ? x === aviso.id : x.id === aviso.id));
                          return (
                            <label key={aviso.id} className="flex items-center space-x-2.5 text-slate-800 text-xs font-semibold cursor-pointer select-none bg-white p-2.5 rounded-xl border border-blue-200 hover:border-blue-400 transition">
                              <input
                                type="checkbox"
                                checked={estaMarcado}
                                onChange={(e) => {
                                  const novoArr = e.target.checked
                                    ? [...(formData.avisos_extras || []).filter((x: any) => (typeof x === "string" ? x !== aviso.id : x.id !== aviso.id)), { id: aviso.id, texto_aviso: aviso.texto_aviso }]
                                    : (formData.avisos_extras || []).filter((x: any) => (typeof x === "string" ? x !== aviso.id : x.id !== aviso.id));
                                  setFormData({ ...formData, avisos_extras: novoArr });
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                              />
                              <span className="truncate">{aviso.titulo}</span>
                            </label>
                          );
                        })}

                      {/* Selo 0-3 Anos protegido */}
                      <label className="flex items-center space-x-2.5 text-rose-900 text-xs font-bold cursor-pointer select-none bg-rose-50/80 p-2.5 rounded-xl border border-rose-200 col-span-1 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={formData.restritivo_0_3_anos}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              restritivo_0_3_anos: e.target.checked,
                              ...(e.target.checked ? { restritivo_0_4_anos: false } : {}),
                            })
                          }
                          className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4"
                        />
                        <span>Restritivo para menores de 3 anos (Exibe Selo Gráfico 0-3)</span>
                      </label>

                      {/* Selo 0-4 Anos protegido */}
                      <label className="flex items-center space-x-2.5 text-rose-900 text-xs font-bold cursor-pointer select-none bg-rose-50/80 p-2.5 rounded-xl border border-rose-200 col-span-1 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={formData.restritivo_0_4_anos}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              restritivo_0_4_anos: e.target.checked,
                              ...(e.target.checked ? { restritivo_0_3_anos: false } : {}),
                            })
                          }
                          className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4"
                        />
                        <span>Restritivo para menores de 4 anos (Exibe Selo Gráfico 0-4)</span>
                      </label>
                    </div>
                  </div>

                  {/* TELA B: Gerenciador de Criação / Exclusão de Flags */}
                  <div className={`transition-all duration-300 ease-in-out ${!abaGerenciador ? "translate-x-full opacity-0 pointer-events-none absolute w-full" : "translate-x-0 opacity-100"}`}>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={novoAvisoTitulo}
                          onChange={(e) => setNovoAvisoTitulo(e.target.value)}
                          placeholder="Nome do Checkbox (ex: Contém Borda Cortante)"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                        />
                        <textarea
                          rows={2}
                          value={novoAvisoTexto}
                          onChange={(e) => setNovoAvisoTexto(e.target.value)}
                          placeholder="Texto legal oficial que será carimbado na etiqueta..."
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 outline-none focus:border-blue-500 resize-none font-medium"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!novoAvisoTitulo.trim() || !novoAvisoTexto.trim()) return;
                            if (editandoAvisoId) {
                              await supabase.from("avisos_customizados").update({ titulo: novoAvisoTitulo.trim(), texto_aviso: novoAvisoTexto.trim() }).eq("id", editandoAvisoId);
                            } else {
                              await supabase.from("avisos_customizados").insert([{ empresa_id: formData.empresa_id || null, titulo: novoAvisoTitulo.trim(), texto_aviso: novoAvisoTexto.trim() }]);
                            }
                            setNovoAvisoTitulo("");
                            setNovoAvisoTexto("");
                            setEditandoAvisoId(null);
                            const { data } = await supabase.from("avisos_customizados").select("*").order("created_at");
                            if (data) setAvisosCustom(data);
                          }}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                        >
                          {editandoAvisoId ? "Salvar Alteração do Aviso" : "+ Cadastrar Novo Aviso"}
                        </button>
                      </div>

                      {/* Lista de flags gerenciáveis */}
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pt-2 border-t border-slate-100">
                        {avisosCustom.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic text-center py-2">Nenhum aviso personalizado cadastrado.</p>
                        ) : (
                          avisosCustom.map((av) => (
                            <div key={av.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200/70 text-xs">
                              <span className="font-bold text-slate-800 truncate max-w-[220px]">{av.titulo}</span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditandoAvisoId(av.id);
                                    setNovoAvisoTitulo(av.titulo);
                                    setNovoAvisoTexto(av.texto_aviso);
                                  }}
                                  className="text-blue-600 font-bold hover:underline"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await supabase.from("avisos_customizados").delete().eq("id", av.id);
                                    setAvisosCustom((prev) => prev.filter((item) => item.id !== av.id));
                                  }}
                                  className="text-red-500 font-bold hover:underline"
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

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

      {/* BARRA FLUTUANTE DINÂMICA DE AÇÕES EM LOTE */}
      {selecionados.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-4xl px-4 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Lado Esquerdo: Contagem e Identificação */}
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-white text-xs font-black px-3 py-1.5 rounded-xl shadow-xs">
                {selecionados.length} {selecionados.length === 1 ? "item selecionado" : "itens selecionados"}
              </span>

              {ehMesmaEmpresa ? (
                <div className="text-xs text-slate-300">
                  Importador:{" "}
                  <strong className="text-white uppercase font-bold">
                    {empresas.find((e) => e.id === empresaUnicaId)?.razao_social}
                  </strong>
                </div>
              ) : (
                <div className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Múltiplos importadores selecionados. Filtre por importador.</span>
                </div>
              )}
            </div>

            {/* Lado Direito: Ações */}
            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
              {ehMesmaEmpresa && (
                <>
                  <select
                    value={familiaLoteId}
                    onChange={(e) => setFamiliaLoteId(e.target.value)}
                    className="bg-slate-800 text-white border border-slate-700 text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500 font-medium w-full max-w-xs truncate"
                  >
                    <option value="">- Selecione o Certificado -</option>
                    {familiasParaLote.map((fam) => (
                      <option key={fam.id} value={fam.id} title={fam.nome_familia}>
                        {fam.nome_familia.length > 55 ? `${fam.nome_familia.slice(0, 55)}...` : fam.nome_familia}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleVincularFamiliaLote}
                    disabled={!familiaLoteId || vinculandoLote}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {vinculandoLote ? (
                      <span>Vinculando...</span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Aplicar em Lote</span>
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelecionados([]);
                  setFamiliaLoteId("");
                }}
                className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-slate-800 transition"
              >
                Limpar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* NOVO MODAL LEAN: IMPORTAÇÃO EM LOTE DE PRODUTOS */}
      {isModalExcelOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-5 overflow-y-auto max-h-[92vh] animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">Importar Catálogo de Produtos</h3>
                  <p className="text-xs text-slate-500">Cadastre brinquedos em lote e amarre automaticamente ao Inmetro.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalExcelOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleImportarExcelProdutos} className="space-y-4">
              {/* 1. Seleção do Importador */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Importador Dono destes Produtos *
                </label>
                <select
                  required
                  value={excelEmpresaId}
                  onChange={(e) => setExcelEmpresaId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-semibold focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 outline-none transition"
                >
                  <option value="">-- Selecione o Importador --</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.razao_social}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Upload do Arquivo (.xlsx ou .xlsm) */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
                <input
                  type="file"
                  id="excel-prod-upload"
                  accept=".xlsx, .xlsm, .xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setExcelFile(f);
                  }}
                  className="hidden"
                />
                <label htmlFor="excel-prod-upload" className="cursor-pointer flex flex-col items-center space-y-2">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {excelFile ? excelFile.name : "Clique e Adicione seu Excel"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Lê automaticamente os dados da primeira aba</p>
                  </div>
                </label>
              </div>

              {/* 3. Mapeamento Enxuto (Apenas os 4 campos vitais + Linha) */}
              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">
                    Mapeamento de Colunas
                  </span>
                  
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border transition-colors ${
                      !linhaInicio.trim()
                        ? "bg-blue-50/90 border-blue-300 shadow-2xs"
                        : "bg-emerald-50/60 border-emerald-200"
                    }`}
                  >
                    <label className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wider whitespace-nowrap">
                      Iniciar na Linha
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={linhaInicio}
                      onChange={(e) => setLinhaInicio(e.target.value)}
                      placeholder="..."
                      className="w-24 px-2 py-1 border border-blue-300 rounded-lg text-xs bg-white text-slate-900 font-mono font-extrabold text-center outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Código do Produto */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Código / Ref / FTY *
                    </label>
                    <select
                      value={colunaCodigo}
                      onChange={(e) => setColunaCodigo(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      {OPCOES_COLUNAS_EXCEL.map((col) => (
                        <option key={col} value={col}>Coluna {col}</option>
                      ))}
                    </select>
                  </div>

                  {/* Descrição */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Descrição Comercial *
                    </label>
                    <select
                      value={colunaDescricao}
                      onChange={(e) => setColunaDescricao(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      {OPCOES_COLUNAS_EXCEL.map((col) => (
                        <option key={col} value={col}>Coluna {col}</option>
                      ))}
                    </select>
                  </div>

                  {/* EAN-13 */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Código de Barras (EAN-13)
                    </label>
                    <select
                      value={colunaEan}
                      onChange={(e) => setColunaEan(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      <option value="NONE">Nenhuma (Gerar EAN-13 automático)</option>
                      {OPCOES_COLUNAS_EXCEL.map((col) => (
                        <option key={col} value={col}>Coluna {col}</option>
                      ))}
                    </select>
                  </div>

                  {/* Vínculo Inmetro (Coluna C) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nº da Família Inmetro (Vínculo)
                    </label>
                    <select
                      value={colunaFamilia}
                      onChange={(e) => setColunaFamilia(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                    >
                      <option value="">-- Selecione a Coluna --</option>
                      <option value="NONE">Nenhuma (Deixar sem registro)</option>
                      {OPCOES_COLUNAS_EXCEL.map((col) => (
                        <option key={col} value={col}>Coluna {col}</option>
                      ))}
                    </select>
                  </div>

                  {/* Indicação de Faixa Etária (Opcional) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Indicação de Faixa Etária
                    </label>
                    <select
                      value={colunaIdade}
                      onChange={(e) => setColunaIdade(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                    >
                      <option value="">-- Opcional (Padrão +3 anos) --</option>
                      <option value="NONE">Nenhuma (Usar padrão +3 anos)</option>
                      {OPCOES_COLUNAS_EXCEL.map((col) => (
                        <option key={col} value={col}>Coluna {col}</option>
                      ))}
                    </select>
                  </div>

                  {/* Restrição Etária 0-3 / 0-4 / Sem restrição (Opcional) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Restrição Etária (0-3 / 0-4)
                    </label>
                    <select
                      value={colunaRestricao}
                      onChange={(e) => setColunaRestricao(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                    >
                      <option value="">-- Opcional (Padrão 0-3) --</option>
                      <option value="NONE">Nenhuma (Usar padrão 0-3)</option>
                      {OPCOES_COLUNAS_EXCEL.map((col) => (
                        <option key={col} value={col}>Coluna {col}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-slate-700 pt-1">
                  * Os produtos nascerão com as proteções padrão de brinquedos (0-3 anos ativo). Ajustes pontuais podem ser feitos na edição individual.
                </p>
              </div>

              {/* Botões */}
              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalExcelOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importandoExcel || !excelFile || !excelEmpresaId}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm hover:shadow-md transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {importandoExcel ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      <span>Importando Produtos...</span>
                    </>
                  ) : (
                    <span>Processar e Cadastrar</span>
                  )}
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
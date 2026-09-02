"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import JsBarcode from "jsbarcode";
import ModalAviso from "@/components/ModalAviso";

interface ProdutoDB {
  id: string;
  fty_no: string;
  descricao: string;
  ean_13: string | null;
  ean_barras: string | null;
  data_fabricacao: string | null;
  lote: string | null;
  usa_pilha: boolean;
  contem_ima: boolean;
  partes_pequenas: boolean;
  metal: boolean;
  restritivo_0_3_anos: boolean;
  idade_minima: string | null;
  empresas: {
    razao_social: string;
    cnpj: string;
    endereco: string | null;
    sac_email: string | null;
    logo_url: string | null;
  } | null;
  inmetro_familias: {
    nome_familia: string;
    numero_registro: string;
    ocp_nome: string | null;
    ocp_numero: string | null;
    status: string | null;
    data_validade: string | null;
  } | null;
}

interface ItemNaoCadastrado {
  linha: number;
  fty_no: string;
  descricao: string;
}

interface EmpresaOption {
  id: string;
  razao_social: string;
}

interface FamiliaOption {
  id: string;
  empresa_id: string;
  nome_familia: string;
}

export default function LiquidificadorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [colunaFty, setColunaFty] = useState<string>("A"); // Padrão da planilha da China
  const [colunaEtiqueta, setColunaEtiqueta] = useState<string>("C"); // Padrão da etiqueta
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [naoCadastrados, setNaoCadastrados] = useState<ItemNaoCadastrado[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  // Estados para o Cadastro Rápido em 1 Clique
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [familias, setFamilias] = useState<FamiliaOption[]>([]);
  const [empresaLote, setEmpresaLote] = useState<string>("");
  const [familiaLote, setFamiliaLote] = useState<string>("");
  const [salvandoLote, setSalvandoLote] = useState(false);

  // Estado do Modal Bonitão
  const [modalAviso, setModalAviso] = useState<{
    isOpen: boolean;
    tipo?: "perigo" | "alerta" | "sucesso" | "info";
    titulo: string;
    mensagem: string;
  }>({ isOpen: false, titulo: "", mensagem: "" });


  // Carrega empresas e famílias cadastradas ao carregar a página
  async function carregarAuxiliares() {
    const [empRes, famRes] = await Promise.all([
      supabase.from("empresas").select("id, razao_social").order("razao_social"),
      supabase.from("inmetro_familias").select("id, empresa_id, nome_familia").order("nome_familia"),
    ]);
    if (empRes.data) {
      setEmpresas(empRes.data);
      if (empRes.data.length > 0) setEmpresaLote(empRes.data[0].id);
    }
    if (famRes.data) setFamilias(famRes.data);
  }

  // Monitora mudança de empresa para filtrar famílias pertinentes
  const familiasFiltradas = familias.filter((f) => f.empresa_id === empresaLote);

  // Carrega importadores ao abrir a tela
  useState(() => {
    carregarAuxiliares();
  });

  // Gerador de EAN-13 GS1 Brasil automático para produtos novos
  function gerarEanAutomatico(): string {
    let codigo = "789";
    for (let i = 0; i < 9; i++) {
      codigo += Math.floor(Math.random() * 10).toString();
    }
    let soma = 0;
    for (let i = 0; i < 12; i++) {
      const d = parseInt(codigo[i]);
      soma += i % 2 === 1 ? d * 3 : d * 1;
    }
    const resto = soma % 10;
    const dv = resto === 0 ? 0 : 10 - resto;
    return codigo + dv.toString();
  }

  // Função mágica do 1-Clique: Cadastra todos os itens pendentes no banco e roda a geração
  async function handleCadastrarLoteEContinuar() {
    if (!empresaLote) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Importador Obrigatório",
        mensagem: "Selecione um importador para vincular os novos produtos antes de continuar.",
      });
      return;
    }

    setSalvandoLote(true);

    try {
      const novosRegistros = naoCadastrados.map((item) => ({
        empresa_id: empresaLote,
        familia_id: familiaLote || null,
        fty_no: item.fty_no,
        descricao: item.descricao,
        ean_13: gerarEanAutomatico(),
        data_fabricacao: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
        lote: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
        usa_pilha: false,
        contem_ima: false,
        partes_pequenas: true,
        metal: false,
        restritivo_0_3_anos: true,
        idade_minima: "+3 anos",
      }));

      const { error } = await supabase.from("produtos").insert(novosRegistros);

      if (error) {
        throw new Error("Erro ao cadastrar produtos em lote: " + error.message);
      }

      setIsAlertOpen(false);
      setSalvandoLote(false);
      
      // Roda o processamento imediatamente!
      await processarPlanilha();
    } catch (err: any) {
      setModalAviso({
        isOpen: true,
        tipo: "perigo",
        titulo: "Erro no Cadastro",
        mensagem: err.message || "Ocorreu um erro ao cadastrar os produtos em lote.",
      });
      setSalvandoLote(false);
    }
  }

  // Helper de desenho de etiqueta térmica 10x15cm em alta resolução (1200x800px)
  async function renderizarEtiquetaParaBuffer(prod: ProdutoDB): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Fundo Branco e Borda Fina de Contorno
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

      // 1. TOPO: RAZÃO SOCIAL DA EMPRESA
      ctx.fillStyle = "#000000";
      ctx.font = "900 34px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(prod.empresas?.razao_social || "STONE IMPORTADORA", canvas.width / 2, 55);

      ctx.beginPath();
      ctx.moveTo(20, 75);
      ctx.lineTo(canvas.width - 20, 75);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 2. CENTRO: AVISOS LEGAIS + SELO 0-3
      const avisos: string[] = [];
      if (prod.partes_pequenas) {
        avisos.push("ATENÇÃO! NÃO RECOMENDÁVEL PARA CRIANÇAS MENORES DE 3 (TRÊS) ANOS POR CONTER PARTE(S) PEQUENA(S) QUE PODE(M) SER ENGOLIDA(S) OU ASPIRADA(S).");
      }
      if (prod.metal) {
        avisos.push("ATENÇÃO! ESTA EMBALAGEM CONTÉM FECHOS METÁLICOS. RETIRAR O BRINQUEDO DA EMBALAGEM ANTES DE ENTREGAR À CRIANÇA.");
      }
      if (prod.usa_pilha) {
        avisos.push("ATENÇÃO! AS PILHAS NÃO RECARREGÁVEIS NÃO DEVEM SER RECARREGADAS. NÃO MISTURAR PILHAS NOVAS COM USADAS.");
      }
      if (prod.contem_ima) {
        avisos.push("CUIDADO: CONTÉM ÍMÃ(ES). A INGESTÃO DE ÍMÃ(ES) PODE CAUSAR LESÕES GRAVES E ATÉ FATAIS.");
      }

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.font = "bold 20px Arial, sans-serif";

      let yPos = 110;
      const margemTexto = prod.restritivo_0_3_anos ? 1000 : 1140;

      avisos.forEach((aviso) => {
        // Quebra automática de linhas longas
        const palavras = aviso.split(" ");
        let linha = "";
        palavras.forEach((palavra) => {
          const teste = linha + palavra + " ";
          if (ctx.measureText(teste).width > margemTexto) {
            ctx.fillText(linha, canvas.width / 2 - (prod.restritivo_0_3_anos ? 50 : 0), yPos);
            linha = palavra + " ";
            yPos += 26;
          } else {
            linha = teste;
          }
        });
        if (linha) {
          ctx.fillText(linha, canvas.width / 2 - (prod.restritivo_0_3_anos ? 50 : 0), yPos);
          yPos += 28;
        }
      });

      ctx.font = "900 22px Arial, sans-serif";
      ctx.fillText(`INDICADO PARA CRIANÇAS MAIORES DE ${prod.idade_minima || "3 ANOS"}.`, canvas.width / 2 - (prod.restritivo_0_3_anos ? 50 : 0), yPos + 10);
      ctx.font = "bold 18px Arial, sans-serif";
      ctx.fillText("GUARDAR PARA EVENTUAIS CONSULTAS.", canvas.width / 2 - (prod.restritivo_0_3_anos ? 50 : 0), yPos + 36);

      // Selo 0-3 Anos (Círculo vermelho com corte diagonal)
      if (prod.restritivo_0_3_anos) {
        const cx = 1070;
        const cy = 200;
        const r = 65;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.lineWidth = 12;
        ctx.strokeStyle = "#dc2626";
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = "900 38px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("0-3", cx, cy + 12);

        // Faixa diagonal de proibição
        ctx.beginPath();
        ctx.moveTo(cx - 45, cy - 45);
        ctx.lineTo(cx + 45, cy + 45);
        ctx.lineWidth = 10;
        ctx.strokeStyle = "#dc2626";
        ctx.stroke();
      }

      // Linha divisória rodapé
      ctx.beginPath();
      ctx.moveTo(20, 480);
      ctx.lineTo(canvas.width - 20, 480);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 3. RODAPÉ ESQUERDO: DADOS DO PRODUTO E IMPORTADOR
      ctx.textAlign = "left";
      ctx.fillStyle = "#000000";
      ctx.font = "900 22px Arial, sans-serif";
      ctx.fillText(prod.descricao.substring(0, 50).toUpperCase(), 30, 515);

      ctx.font = "bold 18px Arial, sans-serif";
      ctx.fillText(`Ref: ${prod.fty_no} | Item: ${prod.fty_no}`, 30, 545);
      ctx.fillText(`Código de barras: ${prod.ean_13 || "N/A"}`, 30, 573);
      ctx.fillText(`Importador: ${prod.empresas?.razao_social || "STONE IMPORTADORA"}`, 30, 601);
      ctx.fillText(`Endereço: ${prod.empresas?.endereco || "Endereço comercial"}`, 30, 629);
      ctx.fillText(`Fabricação: ${prod.data_fabricacao || "08/2026"} | Lote: ${prod.lote || "08/2026"}`, 30, 657);
      ctx.fillText(`CNPJ: ${prod.empresas?.cnpj || "00.000.000/0001-00"} | Origem: China`, 30, 685);
      ctx.fillText(`SAC: ${prod.empresas?.sac_email || "sac@empresa.com.br"}`, 30, 713);

      // 4. RODAPÉ DIREITO: CÓDIGO DE BARRAS + SELO INMETRO
      const barcodeCanvas = document.createElement("canvas");
      const codigoLimpo = (prod.ean_barras || prod.ean_13 || "7890000000000").replace(/["'\s-]/g, "");

      try {
        JsBarcode(barcodeCanvas, codigoLimpo, {
          format: "EAN13",
          displayValue: true,
          fontSize: 20,
          height: 60,
          margin: 0,
        });
        ctx.drawImage(barcodeCanvas, 770, 505, 380, 115);
      } catch (e) {
        console.error("Erro no barcode:", e);
      }

      // Bloco do Selo Inmetro / OCP
      if (prod.inmetro_familias) {
        const bx = 770;
        const by = 640;
        const bw = 380;
        const bh = 135;

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.font = "bold 16px Arial, sans-serif";
        ctx.fillText("Segurança", bx + 15, by + 30);
        ctx.font = "900 24px Arial, sans-serif";
        ctx.fillText((prod.inmetro_familias.ocp_nome || "BRICS").toUpperCase(), bx + 15, by + 65);
        ctx.font = "bold 16px Arial, sans-serif";
        ctx.fillText(`OCP ${prod.inmetro_familias.ocp_numero || "0098"}`, bx + 15, by + 100);

        // Bloco INMETRO à direita
        ctx.strokeRect(bx + 190, by + 15, 175, 45);
        ctx.font = "900 24px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("INMETRO", bx + 277, by + 46);

        ctx.font = "900 15px Arial, sans-serif";
        ctx.fillText(`REGISTRO ${prod.inmetro_familias.numero_registro}`, bx + 277, by + 95);
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(blob);
      }, "image/png");
    });
  }

  // Função Principal de Processamento do Raio-X & Geração
  async function processarPlanilha() {
    if (!file) return;

    setLoading(true);
    setStatusMsg("Lendo arquivo Excel enviado...");
    setNaoCadastrados([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        setModalAviso({
          isOpen: true,
          tipo: "alerta",
          titulo: "Planilha Vazia",
          mensagem: "Nenhuma aba encontrada no arquivo Excel enviado.",
        });
        setLoading(false);
        return;
      }

      // 1. Coleta inteligente: Ignora cabeçalhos chineses e lê apenas os produtos reais
      setStatusMsg("Fazendo o Raio-X e cruzando itens com o banco...");
      const itensPlanilha: { linha: number; fty_no: string; descricao: string }[] = [];
      let comecouProdutos = false;

      worksheet.eachRow((row, rowNumber) => {
        const cellFty = row.getCell(colunaFty).text?.trim();
        const cellDesc = row.getCell("D").text?.trim() || row.getCell("B").text?.trim() || "PRODUTO IMPORTADO";

        // Detecta a linha do cabeçalho oficial (ex: onde está escrito FTY NO ou ITEM)
        if (!comecouProdutos) {
          if (cellFty && cellFty.toUpperCase().includes("FTY")) {
            comecouProdutos = true;
          }
          return;
        }

        // Ignora linhas vazias ou de totalizadores (TOTAL / SUM)
        if (cellFty && !cellFty.toUpperCase().includes("TOTAL") && !cellFty.toUpperCase().includes("SUM")) {
          itensPlanilha.push({
            linha: rowNumber,
            fty_no: cellFty,
            descricao: cellDesc,
          });
        }
      });

      if (itensPlanilha.length === 0) {
        setModalAviso({
          isOpen: true,
          tipo: "alerta",
          titulo: "Nenhum Produto Encontrado",
          mensagem: `Nenhum código de produto (FTY) foi localizado na Coluna ${colunaFty}.\n\nVerifique se selecionou a coluna correta no painel de controle.`,
        });
        setLoading(false);
        return;
      }

      // 2. Busca todos os produtos no banco que batem com esses códigos
      const ftyList = itensPlanilha.map((i) => i.fty_no);
      const { data: produtosBanco, error: prodError } = await supabase
        .from("produtos")
        .select(`
          *,
          empresas(razao_social, cnpj, endereco, sac_email, logo_url),
          inmetro_familias(nome_familia, numero_registro, ocp_nome, ocp_numero, status, data_validade)
        `)
        .in("fty_no", ftyList);

      if (prodError) {
        throw new Error("Erro ao consultar catálogo no banco: " + prodError.message);
      }

      const produtosMap = new Map<string, ProdutoDB>();
      (produtosBanco || []).forEach((p: any) => {
        produtosMap.set(p.fty_no.trim().toUpperCase(), p);
      });

      // 3. Checagem de Risco Zero: Identifica itens não cadastrados
      const faltantes: ItemNaoCadastrado[] = [];
      itensPlanilha.forEach((item) => {
        if (!produtosMap.has(item.fty_no.trim().toUpperCase())) {
          faltantes.push(item);
        }
      });

      // Se houver produtos faltando, trava o processo e avisa o operador
      if (faltantes.length > 0) {
        setNaoCadastrados(faltantes);
        setIsAlertOpen(true);
        setLoading(false);
        setStatusMsg("");
        return;
      }

      // 4. Injeção calibrada das Etiquetas nas células
      setStatusMsg("Limpando etiquetas antigas e inserindo as novas em alta definição...");

      const colIndex = colunaEtiqueta.toUpperCase().charCodeAt(0) - 65;

      // FAXINA INTELIGENTE: Remove qualquer etiqueta velha da Coluna C preservando as fotos da Coluna B
      if ((worksheet as any)._media) {
        (worksheet as any)._media = (worksheet as any)._media.filter((m: any) => {
          const colOrigem = Math.floor(m.range?.tl?.col ?? (m.range?.tl as any)?.nativeCol ?? -1);
          return colOrigem !== colIndex;
        });
      }

      // Enquadra a coluna das fotos (B) para ficarem ajustadas e centralizadas
      worksheet.getColumn("B").width = 24;

      // Largura ideal da coluna de etiquetas (32)
      worksheet.getColumn(colunaEtiqueta).width = 32;

      for (const item of itensPlanilha) {
        const prod = produtosMap.get(item.fty_no.trim().toUpperCase());
        if (!prod) continue;

        const imgBuffer = await renderizarEtiquetaParaBuffer(prod);

        const imageId = workbook.addImage({
          buffer: imgBuffer,
          extension: "png",
        });

        // Altura quadrada harmônica (110pt) combinando com a foto da China
        worksheet.getRow(item.linha).height = 110;

        // Injeção com medidas exatas em pixels (225x140px) para NUNCA distorcer
        worksheet.addImage(imageId, {
          tl: { col: colIndex + 0.04, row: item.linha - 1 + 0.04 },
          ext: { width: 225, height: 140 },
        });
      }

      // 5. Gera o arquivo final e inicia o Download
      setStatusMsg("Finalizando e preparando download...");
      const outputBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([outputBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ETIQUETAS_${file.name}`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      setStatusMsg("Planilha gerada e baixada com sucesso!");
    } catch (err: any) {
      console.error("Erro no processamento do Excel:", err);
      setModalAviso({
        isOpen: true,
        tipo: "perigo",
        titulo: "Falha no Processamento",
        mensagem: "Erro ao processar o arquivo Excel: " + (err.message || err),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Importador de Excel</h1>
          <p className="text-slate-500 text-sm mt-1">
            Processe a planilha e receba o arquivo com todas as etiquetas embutidas.
          </p>
        </div>
      </div>

      {/* Box de Instrução e Operação */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Painel de Upload e Configuração */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] space-y-6">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Carregar Planilha do Fornecedor (.xlsx)
          </h2>

          {/* Área de Drag & Drop / Seleção de Arquivo */}
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-blue-500 transition-colors bg-slate-50/50">
            <input
              type="file"
              id="excel-upload"
              accept=".xlsx, .xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                }
              }}
              className="hidden"
            />
            <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center space-y-3">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-xs">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {file ? file.name : "Clique para selecionar ou arraste o arquivo Excel aqui"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Formatos aceitos: .xlsx da fábrica chinesa</p>
              </div>
            </label>
          </div>

          {/* Seletores de Colunas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Coluna do Código (FTY NO) *
              </label>
              <select
                value={colunaFty}
                onChange={(e) => setColunaFty(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-semibold"
              >
                {["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((col) => (
                  <option key={col} value={col}>
                    Coluna {col}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Onde está o código do produto na planilha original.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Coluna para Colar a Etiqueta *
              </label>
              <select
                value={colunaEtiqueta}
                onChange={(e) => setColunaEtiqueta(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-semibold"
              >
                {["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map((col) => (
                  <option key={col} value={col}>
                    Coluna {col}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Coluna que receberá as imagens geradas.</p>
            </div>
          </div>

          {/* Botão de Processar */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 font-medium">
              {statusMsg && (
                <span className="flex items-center space-x-2 text-blue-600 font-semibold animate-pulse">
                  <span>{statusMsg}</span>
                </span>
              )}
            </div>

            <button
              onClick={processarPlanilha}
              disabled={!file || loading}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Processando Lote...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Executar Raio-X e Gerar Excel</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card Lateral de Orientações & Compliance */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.1)] space-y-4 border border-slate-800">
            <div className="flex items-center space-x-2 text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-bold uppercase tracking-wider">Como funciona</h3>
            </div>
            <ul className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">•</span>
                <span><strong>Fotos preservadas:</strong> As imagens já existentes da China não são apagadas nem corrompidas.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">•</span>
                <span><strong>Raio-X de Segurança:</strong> Se houver produto novo sem cadastro, o sistema avisa na hora para evitar multas.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">•</span>
                <span><strong>Download automático:</strong> Ao concluir, a planilha final é baixada pronta para reenvio à China.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* MODAL INTELIGENTE DE CADASTRO EM 1 CLIQUE */}
      {isAlertOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center space-x-3 text-amber-600 border-b border-slate-100 pb-4">
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Cadastrar Itens em 1 Clique</h3>
                <p className="text-xs text-slate-400">Identificamos {naoCadastrados.length} novos produtos nesta planilha.</p>
              </div>
            </div>

            {/* Painel de Seleção para o Lote */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Importador Dono do Lote *
                </label>
                <select
                  value={empresaLote}
                  onChange={(e) => setEmpresaLote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:border-blue-500 outline-none font-medium"
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.razao_social}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Família Inmetro (Opcional)
                </label>
                <select
                  value={familiaLote}
                  onChange={(e) => setFamiliaLote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:border-blue-500 outline-none font-medium"
                >
                  <option value="">Sem Registro Inmetro</option>
                  {familiasFiltradas.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.nome_familia}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lista Resumida */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Produtos que serão cadastrados ({naoCadastrados.length}):
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2.5 bg-white">
                {naoCadastrados.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-none">
                    <span className="font-mono font-bold text-blue-600">FTY {item.fty_no}</span>
                    <span className="text-[11px] text-slate-500 truncate max-w-[200px]">{item.descricao}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ações */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsAlertOpen(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleCadastrarLoteEContinuar}
                disabled={salvandoLote}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
              >
                {salvandoLote ? (
                  <span>Cadastrando e Gerando...</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Cadastrar Todos ({naoCadastrados.length}) e Gerar Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARD ELEGANTE DE AVISOS / ALERTAS */}
      <ModalAviso
        isOpen={modalAviso.isOpen}
        tipo={modalAviso.tipo}
        titulo={modalAviso.titulo}
        mensagem={modalAviso.mensagem}
        onCancelar={() => setModalAviso((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
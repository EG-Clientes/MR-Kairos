"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import JsBarcode from "jsbarcode";
import ModalAviso from "@/components/ModalAviso";
import { PDFDocument } from "pdf-lib";

interface ProdutoDB {
  id: string;
  fty_no: string;
  referencia_interna?: string | null;
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
  restritivo_0_4_anos?: boolean;
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
    codigo_ocp: string | null;
    status: string | null;
    data_validade: string | null;
  } | null;
}

interface ItemNaoCadastrado {
  linha: number;
  fty_no: string;
  descricao: string;
  ean_13?: string;
  idade_minima: string;
  partes_pequenas: boolean;
  restritivo_0_3_anos: boolean;
  restritivo_0_4_anos: boolean;
}

interface EmpresaOption {
  id: string;
  razao_social: string;
}

interface FamiliaOption {
  id: string;
  empresa_id: string;
  nome_familia: string;
  numero_registro: string;
}

export default function LiquidificadorPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [colunaFty, setColunaFty] = useState<string>(""); // Selecionável pelo operador
  const [colunaDescricao, setColunaDescricao] = useState<string>(""); // Opcional (ajuda no desempate de Ref repetida)
  const [colunaEan, setColunaEan] = useState<string>(""); // Opcional (desempate preciso por código de barras)
  const [colunaIdade, setColunaIdade] = useState<string>(""); // Opcional (Faixa Etária)
  const [colunaRestricao, setColunaRestricao] = useState<string>(""); // Opcional (Restrição 0-3 / 0-4)
  const [colunaEtiqueta, setColunaEtiqueta] = useState<string>(""); // Coluna que receberá as imagens
  const [linhaInicio, setLinhaInicio] = useState<string>(""); // Linha inicial onde começam os dados reais
  const [loading, setLoading] = useState(false);

  // Controle das Abas de Modalidade da Carga
  const [modoEtiqueta, setModoEtiqueta] = useState<"padrao" | "concessao">("padrao");
  // Gera lista completa de colunas de A até AZ (52 colunas)
  const OPCOES_COLUNAS_EXCEL = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => "A" + c),
  ];
  const [termoConcessao, setTermoConcessao] = useState<string>("007/2026");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [naoCadastrados, setNaoCadastrados] = useState<ItemNaoCadastrado[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  // Estados para o Cadastro Rápido em 1 Clique e Seleção da Carga
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [familias, setFamilias] = useState<FamiliaOption[]>([]);
  const [avisosCustom, setAvisosCustom] = useState<{ id: string; texto_aviso: string }[]>([]);
  const [empresaLote, setEmpresaLote] = useState<string>("");
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>("");
  const [familiaLote, setFamiliaLote] = useState<string>("");
  const [salvandoLote, setSalvandoLote] = useState(false);

  // Estado do Modal Bonitão com suporte a botões de decisão
  const [modalAviso, setModalAviso] = useState<{
    isOpen: boolean;
    tipo?: "perigo" | "alerta" | "sucesso" | "info";
    titulo: string;
    mensagem: string;
    textoConfirmar?: string;
    textoCancelar?: string;
    onConfirmar?: () => void;
    onCancelar?: () => void;
  }>({ isOpen: false, titulo: "", mensagem: "" });


  // Carrega empresas e famílias cadastradas ao carregar a página
  async function carregarAuxiliares() {
    const [empRes, famRes, avisosRes] = await Promise.all([
      supabase.from("empresas").select("id, razao_social").order("razao_social"),
      supabase.from("inmetro_familias").select("id, empresa_id, nome_familia, numero_registro").order("nome_familia"),
      supabase.from("avisos_customizados").select("id, texto_aviso"),
    ]);
    if (empRes.data) {
      setEmpresas(empRes.data);
    }
    if (famRes.data) setFamilias(famRes.data);
    if (avisosRes.data) setAvisosCustom(avisosRes.data);
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

  // Função de Cadastro em Lote com Trava de Compliance
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
      const familiaIdFinal = familiasFiltradas.some((f) => f.id === familiaLote) ? familiaLote : null;

      const novosRegistros = naoCadastrados.map((item) => ({
        empresa_id: empresaLote,
        familia_id: familiaIdFinal,
        fty_no: item.fty_no,
        descricao: item.descricao,
        ean_13: item.ean_13 && /^\d{13}$/.test(item.ean_13) ? item.ean_13 : gerarEanAutomatico(),
        data_fabricacao: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
        lote: `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
        usa_pilha: false,
        contem_ima: false,
        partes_pequenas: item.partes_pequenas,
        metal: false,
        restritivo_0_3_anos: item.restritivo_0_3_anos,
        restritivo_0_4_anos: item.restritivo_0_4_anos,
        idade_minima: item.idade_minima,
      }));

      const { error } = await supabase.from("produtos").insert(novosRegistros);

      if (error) {
        throw new Error("Erro ao cadastrar produtos em lote: " + error.message);
      }

      setIsAlertOpen(false);
      setSalvandoLote(false);
      setFamiliaLote("");

      // Aviso de Compliance: Se já vinculou certificado, segue no fluxo; se ficou sem registro, orienta revisar no catálogo
      setModalAviso({
        isOpen: true,
        tipo: "sucesso",
        titulo: "Produtos Cadastrados com Sucesso!",
        mensagem: familiaIdFinal
          ? `${novosRegistros.length} produtos foram adicionados ao catálogo com EAN-13 gerados e já vinculados ao certificado Inmetro selecionado.\n\nClique em "Gerar Excel" novamente para baixar sua planilha com as etiquetas.`
          : `${novosRegistros.length} produtos foram adicionados ao catálogo com EAN-13 gerados automaticamente.\n\nRecomendamos acessar o Catálogo de Produtos para vincular as Famílias/Certificados Inmetro antes do envio à China.`,
        onConfirmar: () => {
          setModalAviso((prev) => ({ ...prev, isOpen: false }));
          if (!familiaIdFinal) {
            router.push("/produtos");
          }
        },
      });
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

  // Helper para gerar apresentação em PDF formato Slide PowerPoint (16:9)
  async function baixarApresentacaoPdf(
    etiquetas: { prodId: string; fty_no: string; buffer: ArrayBuffer }[],
    nomeArquivoOriginal: string
  ) {
    try {
      setStatusMsg("Gerando apresentação em PDF das etiquetas...");
      const pdfDoc = await PDFDocument.create();

      // Dimensões do Slide PowerPoint Widescreen 16:9 (960 x 540 pt)
      const slideWidth = 960;
      const slideHeight = 540;

      // Tamanho da etiqueta centralizada no slide (com proporção perfeita de 1200x800)
      const labelWidth = 660;
      const labelHeight = 440;
      const xPos = (slideWidth - labelWidth) / 2;
      const yPos = (slideHeight - labelHeight) / 2;

      // Cache pelo ID único do produto (evita repetir arte errada quando há mesma Ref)
      const cachePng = new Map<string, any>();

      for (let i = 0; i < etiquetas.length; i++) {
        const item = etiquetas[i];
        const page = pdfDoc.addPage([slideWidth, slideHeight]);

        let imgPng = cachePng.get(item.prodId);
        if (!imgPng) {
          imgPng = await pdfDoc.embedPng(item.buffer);
          cachePng.set(item.prodId, imgPng);
        }

        page.drawImage(imgPng, {
          x: xPos,
          y: yPos,
          width: labelWidth,
          height: labelHeight,
        });

        // Libera a thread do navegador a cada página para não travar a aba do Chrome
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(pdfBlob);
      const anchorPdf = document.createElement("a");
      anchorPdf.href = pdfUrl;
      const nomeLimpo = nomeArquivoOriginal.replace(/\.[^/.]+$/, "");
      anchorPdf.download = `APRESENTACAO_${nomeLimpo}.pdf`;
      anchorPdf.click();
      window.URL.revokeObjectURL(pdfUrl);

      setStatusMsg("Apresentação em PDF baixada com sucesso!");
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      setModalAviso({
        isOpen: true,
        tipo: "perigo",
        titulo: "Erro no PDF",
        mensagem: "Ocorreu um erro ao gerar a apresentação em PDF: " + (err.message || err),
      });
    }
  }

  // Helper de desenho de etiqueta térmica 10x15cm em alta resolução (1200x800px) idêntica à tela de Etiquetas
  async function renderizarEtiquetaParaBuffer(prod: ProdutoDB): Promise<ArrayBuffer> {
    // 1. Carregamento assíncrono da logo para garantir fidelidade visual
    const logoImg: HTMLImageElement | null = await new Promise((res) => {
      if (!prod.empresas?.logo_url) return res(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = prod.empresas.logo_url;
    });

    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Fundo Branco puro (sem bordas pretas invasivas)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- 1. TOPO: LOGO CENTRALIZADA (Apenas no Modo Padrão) ---
      if (modoEtiqueta === "padrao") {
        if (logoImg) {
          const maxH = 80;
          const maxW = 380;
          const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
          const lw = logoImg.width * ratio;
          const lh = logoImg.height * ratio;
          ctx.drawImage(logoImg, (canvas.width - lw) / 2, 35, lw, lh);
        } else {
          ctx.fillStyle = "#000000";
          ctx.font = "900 38px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(prod.empresas?.razao_social || "IMPORTADORA", canvas.width / 2, 80);
        }
      }

      // --- 2. CENTRO: AVISOS LEGAIS + SELO 0-3 DESCE NO 63% ---
      const avisos: string[] = [];
      if (prod.partes_pequenas) {
        avisos.push("ATENÇÃO! NÃO RECOMENDÁVEL PARA CRIANÇAS MENORES DE 3 (TRÊS) ANOS POR CONTER PARTE(S) PEQUENA(S) QUE PODEM SER ENGOLIDA(S) OU ASPIRADA(S).");
      }
      if (prod.metal) {
        avisos.push("ATENÇÃO! ESTA EMBALAGEM CONTÉM FECHOS METÁLICOS. RETIRAR O BRINQUEDO DA EMBALAGEM ANTES DE ENTREGAR À CRIANÇA.");
      }
      if (prod.usa_pilha) {
        avisos.push("ATENÇÃO! ESTE BRINQUEDO DEVE SER MONTADO POR UM ADULTO ANTES DE SER ENTREGUE À CRIANÇA. AS BATERIAS DEVEM SER RETIRADAS DO BRINQUEDO ANTES DE SEREM RECARREGADAS; AS PILHAS NÃO RECARREGÁVEIS NÃO DEVEM SER RECARREGADAS; SÓ DEVEM SER USADAS PILHAS OU BATERIAS DO TIPO RECOMENDADO OU UM SIMILAR; AS PILHAS DEVEM SER COLOCADAS RESPEITANDO A POLARIDADE; AS PILHAS DESCARREGADAS DEVEM SER RETIRADAS DO BRINQUEDO; OS TERMINAIS DE UMA PILHA OU BATERIA NÃO DEVEM SER COLOCADOS EM CURTO-CIRCUITO.");
      }
      if (prod.contem_ima) {
        avisos.push("CUIDADO: CONTÉM ÍMÃ(ES). A INGESTÃO OU ASPIRAÇÃO DE ÍMÃ(ES) PODE CAUSAR LESÕES GRAVES E ATÉ FATAIS.");
      }

      // Puxa os avisos extras dinâmicos criados no catálogo
      const extras = (prod as any).avisos_extras;
      if (Array.isArray(extras)) {
        extras.forEach((item: any) => {
          if (typeof item === "string" && item.trim()) {
            // Busca o texto oficial correspondente a esse ID
            const avisoEncontrado = avisosCustom.find((a) => a.id === item.trim());
            if (avisoEncontrado) {
              avisos.push(avisoEncontrado.texto_aviso.trim());
            } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.trim())) {
              avisos.push(item.trim());
            }
          } else if (item?.texto_aviso) {
            avisos.push(item.texto_aviso.trim());
          }
        });
      }

      // Auto-scale dinâmico em 5 marchas (idêntico à tela de visualização térmica)
      const totalChars = avisos.reduce((acc, t) => acc + t.length, 0);
      let fontSize = 19;
      let lineH = 25;
      let espacoParagrafo = 4;

      if (totalChars > 750) {
        fontSize = 13.5;
        lineH = 17;
        espacoParagrafo = 1.5;
      } else if (totalChars > 550) {
        fontSize = 14.5;
        lineH = 19;
        espacoParagrafo = 2;
      } else if (totalChars > 400) {
        fontSize = 16;
        lineH = 21;
        espacoParagrafo = 3;
      } else if (totalChars > 200) {
        fontSize = 17.5;
        lineH = 23;
        espacoParagrafo = 3.5;
      }

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;

      let yPos = 145;
      const margemTexto = 840; // Dá o respiro exato para o selo na direita

      avisos.forEach((aviso) => {
        const palavras = aviso.split(" ");
        let linha = "";
        palavras.forEach((palavra) => {
          const teste = linha + palavra + " ";
          if (ctx.measureText(teste).width > margemTexto) {
            ctx.fillText(linha, 520, yPos);
            linha = palavra + " ";
            yPos += lineH;
          } else {
            linha = teste;
          }
        });
        if (linha) {
          ctx.fillText(linha, 520, yPos);
          yPos += lineH + espacoParagrafo;
        }
      });

      const idadeLimpa = ((prod.idade_minima || "3 ANOS").replace(/\+/g, "").replace(/\s+/g, " ").trim() || "3 ANOS").toUpperCase();
      const idadeFormatada = /^\d+$/.test(idadeLimpa) ? `${idadeLimpa} ANOS` : idadeLimpa;
      const textoIdade = /^(\+?0+|0+\+?|\+?0\s*ANO|TODAS AS IDADES)/i.test((prod.idade_minima || "").trim())
        ? "INDICADO PARA TODAS AS IDADES"
        : `INDICADO PARA CRIANÇAS MAIORES DE ${idadeFormatada}.`;
      ctx.font = `900 ${fontSize + 2}px Arial, Helvetica, sans-serif`;
      ctx.fillText(textoIdade, 520, yPos + 6);
      ctx.font = `bold ${fontSize - 1}px Arial, Helvetica, sans-serif`;
      ctx.fillText("GUARDAR PARA EVENTUAIS CONSULTAS", 520, yPos + lineH + 6);

      // --- SELO 0-3 / 0-4 ANOS (Geometria SVG Oficial com carinha triste, posicionado no 66% e à direita) ---
      if (prod.restritivo_0_3_anos || prod.restritivo_0_4_anos) {
        const cx = 1080;
        const cy = 385; // 66% do bloco central
        const r = 70;

        ctx.save();
        // Círculo Vermelho
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.lineWidth = 13;
        ctx.strokeStyle = "#DC2626";
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.stroke();

        // Barra Diagonal Vermelha
        ctx.beginPath();
        ctx.moveTo(cx - 48, cy - 48);
        ctx.lineTo(cx + 48, cy + 48);
        ctx.lineWidth = 13;
        ctx.lineCap = "round";
        ctx.stroke();

        // Texto "0-3" ou "0-4"
        ctx.fillStyle = "#000000";
        ctx.font = "bold 34px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          prod.restritivo_0_4_anos && !prod.restritivo_0_3_anos ? "0-4" : "0-3",
          cx - 24,
          cy + 28
        );

        // Rostinho do bebê
        const bx = cx + 30;
        const by = cy - 20;
        ctx.beginPath();
        ctx.arc(bx, by, 22, 0, 2 * Math.PI);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = "#000000";
        ctx.stroke();

        // Topete
        ctx.beginPath();
        ctx.moveTo(bx - 1.5, by - 22);
        ctx.bezierCurveTo(bx - 4.5, by - 30, bx + 4.5, by - 30, bx + 1.5, by - 22);
        ctx.stroke();

        // Olhinhos
        ctx.beginPath();
        ctx.arc(bx - 6, by - 3, 2.5, 0, 2 * Math.PI);
        ctx.arc(bx + 6, by - 3, 2.5, 0, 2 * Math.PI);
        ctx.fill();

        // Nariz em L
        ctx.beginPath();
        ctx.moveTo(bx, by - 1);
        ctx.lineTo(bx, by + 5);
        ctx.lineTo(bx - 3, by + 5);
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Boquinha Triste
        ctx.beginPath();
        ctx.arc(bx, by + 16, 7, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // --- 3. RODAPÉ EM 3 COLUNAS ALINHADAS ---
      const quebrarLinhasFooter = (texto: string, maxWidth: number): string[] => {
        if (ctx.measureText(texto).width <= maxWidth) return [texto];
        const palavras = texto.split(" ");
        const linhas: string[] = [];
        let atual = "";
        palavras.forEach((p) => {
          const teste = atual ? `${atual} ${p}` : p;
          if (ctx.measureText(teste).width <= maxWidth) {
            atual = teste;
          } else {
            if (atual) linhas.push(atual);
            atual = p;
          }
        });
        if (atual) linhas.push(atual);
        return linhas;
      };

      ctx.textAlign = "left";
      ctx.fillStyle = "#000000";

      ctx.font = "900 19px Arial, Helvetica, sans-serif";
      const linhasDesc = quebrarLinhasFooter(prod.descricao.toUpperCase(), 485);

      ctx.font = "bold 15px Arial, Helvetica, sans-serif";
      const impTexto = `Importador: ${prod.empresas?.razao_social || "IMPORTADORA"}`;
      const linhasImp = quebrarLinhasFooter(impTexto, 490);

      // Mantém 100% idêntico quando cabe em 1 linha; só compacta se quebrar linha para nunca cortar abaixo de 800px
      const linhasExtrasFooter = (linhasDesc.length - 1) + (linhasImp.length - 1);
      const footerY = linhasExtrasFooter >= 2 ? 515 : linhasExtrasFooter === 1 ? 522 : 530;
      const passoTitulo = linhasExtrasFooter >= 2 ? 21 : 22;
      const passoMedio = linhasExtrasFooter >= 2 ? 18 : linhasExtrasFooter === 1 ? 20 : 22;
      const passoFim = linhasExtrasFooter >= 2 ? 18 : linhasExtrasFooter === 1 ? 19 : 20;

      // COLUNA 1: DADOS JURÍDICOS (Esquerda, máx 490px para nunca encostar no código de barras)
      ctx.font = "900 19px Arial, Helvetica, sans-serif";
      let dy = footerY;
      linhasDesc.forEach((linha, idx) => {
        ctx.fillText(linha, 35, dy);
        dy += idx < linhasDesc.length - 1 ? passoTitulo : (linhasExtrasFooter >= 2 ? 21 : 24);
      });

      ctx.font = "bold 15px Arial, Helvetica, sans-serif";
      ctx.fillText(`Ref: ${prod.referencia_interna || prod.fty_no}   Item: ${prod.fty_no}`, 35, dy);
      dy += passoMedio;
      ctx.fillText(`Código de barras: ${prod.ean_13 || "N/A"}`, 35, dy);
      dy += passoMedio;

      linhasImp.forEach((linha, idx) => {
        ctx.fillText(linha, 35, dy);
        dy += idx < linhasImp.length - 1 ? 17 : passoMedio;
      });

      // Endereço (com quebra inteligente se passar de 410px)
      ctx.font = "14px Arial, Helvetica, sans-serif";
      const endTexto = `Endereço: ${prod.empresas?.endereco || "Não informado"}`;
      if (ctx.measureText(endTexto).width > 410) {
        const palavrasEnd = endTexto.split(" ");
        let l1 = "", l2 = "";
        palavrasEnd.forEach((p) => {
          if (ctx.measureText(l1 + p + " ").width < 415 && !l2) l1 += p + " ";
          else l2 += p + " ";
        });
        ctx.fillText(l1, 35, dy);
        dy += linhasExtrasFooter >= 2 ? 17 : 19;
        ctx.fillText(l2, 35, dy);
      } else {
        ctx.fillText(endTexto, 35, dy);
      }
      dy += passoMedio;

      ctx.font = "bold 14px Arial, Helvetica, sans-serif";
      const fabStr = prod.data_fabricacao || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const loteStr = prod.lote || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      ctx.fillText(`Fabricação: ${fabStr}`, 35, dy);
      dy += passoFim;
      ctx.fillText(`Lote: ${loteStr}`, 35, dy);
      dy += passoFim;
      ctx.fillText(`CNPJ: ${prod.empresas?.cnpj || ""}`, 35, dy);
      dy += passoFim;
      ctx.fillText("Origem: China", 35, dy);
      dy += passoFim;
      ctx.fillText(`SAC: ${prod.empresas?.sac_email || ""}`, 35, dy);

      // Linha legal do Termo de Concessão (Exclusiva do Modo Concessão)
      if (modoEtiqueta === "concessao") {
        dy += passoFim;
        ctx.font = "900 13px Arial, Helvetica, sans-serif";
        ctx.fillText(`CERTIFICADO POR E CONCESSÃO CEDIDA TERMO ${termoConcessao || "007/2026"}`, 35, dy);
      }

      // COLUNA 2: CÓDIGO DE BARRAS (Centralizado no Rodapé)
      if (prod.ean_13) {
        const barcodeCanvas = document.createElement("canvas");
        const codigoLimpo = (prod.ean_barras || prod.ean_13).replace(/["'\s-]/g, "");
        try {
          JsBarcode(barcodeCanvas, codigoLimpo, {
            format: "EAN13",
            displayValue: true,
            fontSize: 16,
            height: 48,
            margin: 0,
            background: "transparent",
            lineColor: "#000000",
          });
          ctx.drawImage(barcodeCanvas, 545, 620, 275, 105);
        } catch (e) {
          console.error("Erro ao gerar barcode:", e);
        }
      }

      // COLUNA 3: SELO OFICIAL INMETRO / OCP (Quadrado perfeito 230x230px, 100% idêntico à tela)
      if (prod.inmetro_familias) {
        const ix = 930;
        const iy = 525;
        const iw = 230;
        const ih = 230;

        ctx.save();
        // Moldura arredondada perfeitamente quadrada (proporção 1:1)
        ctx.strokeStyle = "#d4d4d4";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(ix, iy, iw, ih, 24);
        ctx.stroke();

        // Título Segurança
        ctx.fillStyle = "#000000";
        ctx.font = "900 23px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Segurança", ix + iw / 2, iy + 36);

        // Sub-bloco BRICS (Lado Esquerdo)
        const bricsX = ix + 56;
        ctx.textAlign = "center";
        ctx.font = "600 27px 'Century Gothic', Arial, sans-serif";
        ctx.fillText("brics", bricsX, iy + 106);

        // Apaga o pingo natural do 'i' para dar lugar à curva oficial
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bricsX - 2, iy + 83, 6, 8);

        // 5 esferas compactas oficiais: pico no 'c' e a 5ª terminando suave antes de passar do 's'
        ctx.fillStyle = "#000000";
        [
          { x: bricsX + 0.5, y: iy + 88.5, r: 1.3 },
          { x: bricsX + 5.5, y: iy + 86.6, r: 1.7 },
          { x: bricsX + 10.8, y: iy + 85.5, r: 2.2 },
          { x: bricsX + 16.0, y: iy + 86.6, r: 1.7 },
          { x: bricsX + 20.8, y: iy + 88.5, r: 1.3 },
        ].forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
          ctx.fill();
        });

        ctx.font = "bold 12.5px Arial, Helvetica, sans-serif";
        const textoOcp = `OCP ${prod.inmetro_familias.ocp_numero || "0098"}`;
        ctx.fillText(textoOcp, bricsX, iy + 142);

        // Sub-bloco INMETRO (Altura máxima oficial e palavra 100% contida na barra)
        const inmx = ix + 138;
        const inmy = iy + 62;
        ctx.fillStyle = "#000000";
        // Barra Superior
        ctx.fillRect(inmx, inmy, 64, 8.5);
        // Barra Inferior (mais alta, igual à proporção da cliente)
        ctx.fillRect(inmx, inmy + 59, 64, 8.5);
        // Triângulo Superior Preto (Corpo mais encorpado e gordinho)
        ctx.beginPath();
        ctx.moveTo(inmx + 23, inmy + 8.5);
        ctx.lineTo(inmx + 46, inmy + 8.5);
        ctx.lineTo(inmx + 46, inmy + 41);
        ctx.fill();
        // Triângulo Inferior Preto (Corpo mais encorpado e gordinho)
        ctx.beginPath();
        ctx.moveTo(inmx + 18, inmy + 26.5);
        ctx.lineTo(inmx + 18, inmy + 59);
        ctx.lineTo(inmx + 41, inmy + 59);
        ctx.fill();

        // Risquinhos finos oficiais de ponta a ponta (levemente suavizados/mais claros)
        ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
        ctx.fillRect(inmx + 18, inmy + 7.5, 0.75, 20);
        ctx.fillRect(inmx + 45.25, inmy + 40, 0.75, 20);
        ctx.fillStyle = "#000000";

        // Fonte em 13px com respiro calibrado levemente mais abaixo do selo
        ctx.font = "900 italic 13px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("INMETRO", inmx + 32, inmy + 81);

        // Rodapé: REGISTRO + Número
        ctx.font = "bold 12.5px Arial, Helvetica, sans-serif";
        ctx.fillText("REGISTRO", ix + iw / 2, iy + 182);
        ctx.font = "900 17px Arial, Helvetica, sans-serif";
        ctx.fillText(prod.inmetro_familias.numero_registro, ix + iw / 2, iy + 205);

        ctx.restore();
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
  async function processarPlanilha(ignorarAvisoRef = false) {
    if (!file) return;

    // Trava de Segurança: Obriga a escolher o Importador e as colunas obrigatórias
    if (!empresaSelecionada) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Importador Obrigatório",
        mensagem: "Por favor, selecione qual Importador é dono desta carga antes de processar a planilha.",
      });
      return;
    }

    const linhaNum = parseInt(linhaInicio.trim(), 10);
    if (!linhaInicio.trim() || isNaN(linhaNum) || linhaNum < 1) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Linha Inicial Obrigatória",
        mensagem: "Informe o número da linha onde começam os produtos na planilha (Ex: 21) antes de gerar.",
      });
      return;
    }

    if (!colunaFty || !colunaEtiqueta) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Colunas Obrigatórias",
        mensagem: "Selecione a Coluna do Código (FTY) e a Coluna da Etiqueta antes de gerar a planilha.",
      });
      return;
    }

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
      const itensPlanilha: {
        linha: number;
        fty_no: string;
        descricao: string;
        ean_13: string;
        idade_minima: string;
        partes_pequenas: boolean;
        restritivo_0_3_anos: boolean;
        restritivo_0_4_anos: boolean;
      }[] = [];
      let comecouProdutos = false;

      // Helper à prova de balas contra fórmulas nulas do Excel
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

      worksheet.eachRow((row, rowNumber) => {
        // Se você digitou a linha de início (ex: 21), ignora 100% de tudo antes dela
        if (numLinhaCorte !== null && !isNaN(numLinhaCorte)) {
          if (rowNumber < numLinhaCorte) return;
        }

        const cellFty = extrairTextoSeguro(row.getCell(colunaFty));

        // Captura a descrição opcional (usada para desempate de Ref repetida ou cadastro novo)
        let cellDesc = (colunaDescricao && colunaDescricao !== "NONE")
          ? extrairTextoSeguro(row.getCell(colunaDescricao))
          : "";

        // Se por acaso a descrição capturada for puramente numérica (ex: quantidade de caixa 220), descarta
        if (cellDesc && /^\d+$/.test(cellDesc)) {
          cellDesc = "";
        }

        // Captura o EAN opcional (só aceita 13 dígitos numéricos; texto inválido como "Código de barras" vira vazio para gerar 789 automático)
        const rawCellEan = (colunaEan && colunaEan !== "NONE")
          ? extrairTextoSeguro(row.getCell(colunaEan)).replace(/["'\s-]/g, "").trim()
          : "";
        const cellEan = /^\d{13}$/.test(rawCellEan) ? rawCellEan : "";

        // Filtro anti-ruído: ignora linhas de endereço/contato corporativo da fábrica chinesa
        const termosDescarte = ["ADD:", "TEL:", "FAX:", "ROOM", "STREET", "ROAD", "BUILDING", "EMAIL:"];
        const ehRuidoCorporativo = cellFty && (
          cellFty.length > 40 || 
          termosDescarte.some((termo) => cellFty.toUpperCase().includes(termo))
        );

        // Se você digitou a linha inicial (ex: 21), pula a detecção de cabeçalho e lê direto!
        // Se deixou em branco, aí sim ele busca o cabeçalho automaticamente
        if (numLinhaCorte === null || isNaN(numLinhaCorte)) {
          if (!comecouProdutos) {
            const termosCabecalho = ["FTY", "ITEM", "REF", "ART", "NO.", "MODEL", "品名", "序号"];
            const ehCabecalho = cellFty && !ehRuidoCorporativo && termosCabecalho.some((termo) => cellFty.toUpperCase().includes(termo));
            if (ehCabecalho) {
              comecouProdutos = true;
            }
            return;
          }
        }

        // Ignora linhas vazias, totalizadores (TOTAL / SUM / TT) ou rodapés de contato
        const ehTotalizador = cellFty && (
          cellFty.toUpperCase().includes("TOTAL") ||
          cellFty.toUpperCase().includes("SUM") ||
          cellFty.toUpperCase() === "TT"
        );

        if (cellFty && !ehTotalizador && !ehRuidoCorporativo) {
          // Leitura opcional da Faixa Etária (ex: +4 anos, 0+, +3 anos, 3+)
          let idadeFinal = "+3 anos";
          if (colunaIdade && colunaIdade !== "NONE") {
            const rawIdade = extrairTextoSeguro(row.getCell(colunaIdade)).trim();
            if (rawIdade && !/^(NA|NÃO APLICÁVEL|NAO APLICAVEL|-)$/i.test(rawIdade)) {
              if (/^(\+?0+|0+\+?|\+?0\s*ano|TODAS AS IDADES)/i.test(rawIdade)) {
                idadeFinal = "0+";
              } else {
                const idadeLimpa = rawIdade.replace(/\+/g, "").replace(/\s+/g, " ").trim();
                idadeFinal = /^\d+$/.test(idadeLimpa) ? `${idadeLimpa} anos` : idadeLimpa;
              }
            }
          }

          // Leitura opcional da Restrição Etária (0-3, 0-4, restrição em meses ou Sem restrição)
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
              } else if (/MES(ES)?|M[EÊ]S|\b\d+\s*M\b/i.test(rawRestr)) {
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

          itensPlanilha.push({
            linha: rowNumber,
            fty_no: cellFty,
            descricao: cellDesc,
            ean_13: cellEan,
            idade_minima: idadeFinal,
            partes_pequenas: partesPequenasFinal,
            restritivo_0_3_anos: restritivo03Final,
            restritivo_0_4_anos: restritivo04Final,
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

      // 2. Busca todos os produtos deste importador no banco (paginado para nunca travar no limite de 1000)
      const produtosBanco: any[] = [];
      let pagina = 0;
      const tamanhoPagina = 1000;
      while (true) {
        const { data: loteProd, error: prodError } = await supabase
          .from("produtos")
          .select(`
            *,
            empresas(razao_social, cnpj, endereco, sac_email, logo_url),
            inmetro_familias(nome_familia, numero_registro, ocp_nome, ocp_numero, codigo_ocp, status, data_validade)
          `)
          .eq("empresa_id", empresaSelecionada)
          .range(pagina * tamanhoPagina, (pagina + 1) * tamanhoPagina - 1);

        if (prodError) {
          throw new Error("Erro ao consultar catálogo no banco: " + prodError.message);
        }
        if (!loteProd || loteProd.length === 0) break;
        produtosBanco.push(...loteProd);
        if (loteProd.length < tamanhoPagina) break;
        pagina++;
      }

      // Agrupa em lista por FTY NO para suportar múltiplos produtos com a mesma referência
      const produtosPorFty = new Map<string, ProdutoDB[]>();
      produtosBanco.forEach((p: any) => {
        const chave = (p.fty_no || "").trim().toUpperCase();
        if (!chave) return;
        const lista = produtosPorFty.get(chave) || [];
        lista.push(p);
        produtosPorFty.set(chave, lista);
      });

      const limparEan = (val?: string | null) => (val || "").replace(/["'\s-]/g, "").trim().toUpperCase();
      const normTexto = (val?: string | null) => (val || "").trim().toUpperCase().replace(/\s+/g, " ");

      // Resolvedor inteligente: nunca mistura campos de produtos diferentes
      const resolverProduto = (item: { linha: number; fty_no: string; descricao: string; ean_13: string }) => {
        const candidatos = produtosPorFty.get(item.fty_no.trim().toUpperCase()) || [];
        if (candidatos.length === 0) return { prod: null as ProdutoDB | null, ambiguo: false };
        if (candidatos.length === 1) return { prod: candidatos[0], ambiguo: false };

        // Há mais de 1 produto com o mesmo código FTY: desempata por EAN e/ou Descrição
        let pool = candidatos;
        if (item.ean_13) {
          const eanNorm = limparEan(item.ean_13);
          const porEan = pool.filter(
            (c) => limparEan(c.ean_13) === eanNorm || limparEan(c.ean_barras) === eanNorm
          );
          if (porEan.length === 1) return { prod: porEan[0], ambiguo: false };
          if (porEan.length > 1) pool = porEan;
        }

        if (item.descricao) {
          const descNorm = normTexto(item.descricao);
          const porDescExata = pool.filter((c) => normTexto(c.descricao) === descNorm);
          if (porDescExata.length === 1) return { prod: porDescExata[0], ambiguo: false };

          if (porDescExata.length === 0) {
            const porDescParcial = pool.filter((c) => {
              const cd = normTexto(c.descricao);
              return cd && (cd.includes(descNorm) || descNorm.includes(cd));
            });
            if (porDescParcial.length === 1) return { prod: porDescParcial[0], ambiguo: false };
          }
        }

        return { prod: null as ProdutoDB | null, ambiguo: true };
      };

      // 3. Checagem de Risco Zero: Identifica itens não cadastrados ou ambíguos
      const faltantes: ItemNaoCadastrado[] = [];
      const faltantesChaves = new Set<string>();
      const linhasAmbiguas: string[] = [];
      const itensResolvidos: { linha: number; fty_no: string; prod: ProdutoDB }[] = [];

      itensPlanilha.forEach((item) => {
        const { prod, ambiguo } = resolverProduto(item);
        if (ambiguo) {
          linhasAmbiguas.push(`Linha ${item.linha} (${item.fty_no})`);
        } else if (!prod) {
          const chaveFaltante = `${item.fty_no.trim().toUpperCase()}:::${normTexto(item.descricao)}:::${limparEan(item.ean_13)}`;
          if (!faltantesChaves.has(chaveFaltante)) {
            faltantesChaves.add(chaveFaltante);
            faltantes.push({
              linha: item.linha,
              fty_no: item.fty_no,
              descricao: item.descricao || item.fty_no || "PRODUTO IMPORTADO",
              ean_13: item.ean_13 || undefined,
              idade_minima: item.idade_minima,
              partes_pequenas: item.partes_pequenas,
              restritivo_0_3_anos: item.restritivo_0_3_anos,
              restritivo_0_4_anos: item.restritivo_0_4_anos,
            });
          }
        } else {
          itensResolvidos.push({ linha: item.linha, fty_no: item.fty_no, prod });
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

      // Se houver referência repetida sem EAN/Descrição suficiente para desempatar, nunca chuta
      if (linhasAmbiguas.length > 0) {
        setModalAviso({
          isOpen: true,
          tipo: "alerta",
          titulo: "Referência Repetida Precisa de Desempate",
          mensagem: `As linhas abaixo usam um código que possui mais de um produto cadastrado no catálogo:\n\n${linhasAmbiguas.slice(0, 10).join(", ")}${linhasAmbiguas.length > 10 ? `... e mais ${linhasAmbiguas.length - 10} linha(s)` : ""}\n\nMapeie a Coluna do EAN-13 e/ou a Coluna da Descrição no painel (ou preencha na planilha) para o sistema identificar exatamente qual produto é de cada linha.`,
        });
        setLoading(false);
        setStatusMsg("");
        return;
      }

      // TRAVA DURA DE COMPLIANCE: Bloqueia geração se houver produtos sem Inmetro ou com certificado vencido
      const hojeIso = new Date().toISOString().split("T")[0];
      const produtosSemInmetro: string[] = [];

      itensResolvidos.forEach(({ fty_no, prod }) => {
        // 1. Bloqueia se o produto não tem família vinculada no banco
        if (!prod || !(prod as any).familia_id || !prod.inmetro_familias || !prod.inmetro_familias.numero_registro) {
          produtosSemInmetro.push(fty_no);
        }
        // 2. Bloqueia se o certificado vinculado estiver vencido ou marcado como sem registro
        else if (
          prod.inmetro_familias.status === "Vencido" ||
          prod.inmetro_familias.status === "Sem Registro" ||
          (prod.inmetro_familias.data_validade && prod.inmetro_familias.data_validade < hojeIso)
        ) {
          produtosSemInmetro.push(`${fty_no} (Certificado Vencido)`);
        }
      });

      if (produtosSemInmetro.length > 0) {
        setModalAviso({
          isOpen: true,
          tipo: "perigo",
          titulo: "Geração Bloqueada: ALERTA",
          mensagem: `Existem ${produtosSemInmetro.length} produto(s) nesta planilha sem Certificado Inmetro válido vinculado:\n\n${produtosSemInmetro.slice(0, 10).join(", ")}${produtosSemInmetro.length > 10 ? `... e mais ${produtosSemInmetro.length - 10} itens` : ""}\n\nVincule a Família Inmetro no Catálogo de Produtos antes de gerar a planilha para a China.`,
        });
        setLoading(false);
        setStatusMsg("");
        return;
      }

      // ETAPA 3 DO FUNIL: Controle Interno (Ref. do Importador - Aviso Amigável)
      const itensSemRef = itensResolvidos.filter((i) => !i.prod.referencia_interna);

      if (itensSemRef.length > 0 && ignorarAvisoRef !== true) {
        setLoading(false);
        setStatusMsg("");
        setModalAviso({
          isOpen: true,
          tipo: "alerta",
          titulo: "Produtos sem Ref. do Importador",
          mensagem: `Identificamos ${itensSemRef.length} produto(s) sem a Referência do Importador.\n\nDeseja ir ao Catálogo preencher ou deseja Gerar Agora mesmo assim usando o código da fábrica?`,
          textoConfirmar: "Gerar Agora",
          textoCancelar: "Ir ao Catálogo",
          onConfirmar: () => {
            setModalAviso((prev) => ({ ...prev, isOpen: false }));
            processarPlanilha(true); // Dispara a geração direta!
          },
          onCancelar: () => {
            setModalAviso((prev) => ({ ...prev, isOpen: false }));
            router.push("/produtos");
          },
        });
        return;
      }

      // 4. Injeção calibrada das Etiquetas nas células
      setStatusMsg("Limpando etiquetas antigas e inserindo as novas em alta definição...");

      const colEtqUpper = colunaEtiqueta.toUpperCase().trim();
      const colIndex = colEtqUpper.length === 1
        ? colEtqUpper.charCodeAt(0) - 65
        : (colEtqUpper.charCodeAt(0) - 64) * 26 + (colEtqUpper.charCodeAt(1) - 65);

      // FAXINA INTELIGENTE PADRÃO GIT: Remove apenas etiquetas antigas da coluna alvo, preservando fotos e a árvore do Excel
      if ((worksheet as any)._media) {
        (worksheet as any)._media = (worksheet as any)._media.filter((m: any) => {
          const colOrigem = Math.floor(m.range?.tl?.col ?? (m.range?.tl as any)?.nativeCol ?? -1);
          return colOrigem !== colIndex;
        });
      }

      // Largura ideal apenas da coluna de etiquetas (não altera a coluna B nem outras colunas)
      worksheet.getColumn(colunaEtiqueta).width = 32;

      // Array isolado apenas para armazenar as imagens para o PDF (não afeta o Excel)
      const etiquetasParaPdf: { prodId: string; fty_no: string; buffer: ArrayBuffer }[] = [];

      for (const item of itensResolvidos) {
        const prod = item.prod;

        // Usa os dados oficiais 100% casados no Supabase (nunca mistura título de outro item)
        const imgBuffer = await renderizarEtiquetaParaBuffer(prod);

        // Guarda cópia em memória para caso a cliente queira o PDF
        etiquetasParaPdf.push({
          prodId: prod.id,
          fty_no: item.fty_no,
          buffer: imgBuffer,
        });

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

      // Remove os modelos corrompidos de dropdowns e formatações das abas chinesas
      // Isso impede o ExcelJS de gerar XML inválido e blinda o arquivo contra a exclusão das imagens
      workbook.worksheets.forEach((ws: any) => {
        ws.dataValidations = { model: {} };
        ws.conditionalFormatting = [];
        ws.conditionalFormattings = [];
      });

      const outputBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([outputBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const nomeBase = file.name.replace(/\.[^/.]+$/, "");
      anchor.download = `ETIQUETAS_${nomeBase}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      const semRefContagem = itensResolvidos.filter((i) => !i.prod.referencia_interna).length;

      if (semRefContagem > 0) {
        setStatusMsg(`Planilha baixada! Aviso: ${semRefContagem} item(ns) sem Ref usaram o código de fábrica.`);
      } else {
        setStatusMsg("Planilha gerada e baixada com sucesso!");
      }

      // MODAL PÓS-DOWNLOAD: Pergunta se deseja baixar a apresentação em PDF
      const nomeArquivoAtual = file.name;
      setModalAviso({
        isOpen: true,
        tipo: "sucesso",
        titulo: "Planilha Baixada com Sucesso!",
        mensagem: "O arquivo Excel foi baixado perfeitamente.\n\nDeseja fazer o download da apresentação em PDF com todas as etiquetas geradas?",
        textoConfirmar: "Baixar PDF de Apresentação",
        textoCancelar: "Não, apenas Excel",
        onConfirmar: async () => {
          // Muda o texto imediatamente no clique para a cliente ver o feedback
          setModalAviso((prev) => ({
            ...prev,
            textoConfirmar: "Gerando PDF...",
          }));
          // Respiro de 60ms para o navegador pintar a alteração visual antes de processar o PDF
          await new Promise((resolve) => setTimeout(resolve, 60));
          await baixarApresentacaoPdf(etiquetasParaPdf, nomeArquivoAtual);
          setModalAviso((prev) => ({ ...prev, isOpen: false }));
        },
        onCancelar: () => {
          setModalAviso((prev) => ({ ...prev, isOpen: false }));
        },
      });
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
      <div className="pb-3 border-b border-slate-200/60 space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Importador de Excel</h1>
          <p className="text-slate-500 text-sm mt-1">
            Processe a planilha e receba o arquivo com todas as etiquetas embutidas.
          </p>
        </div>

        {/* Seletor de Modo 100% Simétrico */}
        <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 gap-1">
          <button
            type="button"
            onClick={() => setModoEtiqueta("padrao")}
            className={`h-8 px-4 text-xs font-bold rounded-lg transition-all duration-150 ${
              modoEtiqueta === "padrao"
                ? "bg-blue-900 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-900"
            }`}
          >
            Modelo Padrão Direto (Com Logotipo)
          </button>
          <button
            type="button"
            onClick={() => setModoEtiqueta("concessao")}
            className={`h-8 px-4 text-xs font-bold rounded-lg transition-all duration-150 ${
              modoEtiqueta === "concessao"
                ? "bg-sky-500 text-white shadow-xs"
                : "text-slate-600 hover:text-sky-600"
            }`}
          >
            Modelo Concessão (Termo Cedido)
          </button>
        </div>
      </div>

      {/* Box de Instrução e Operação */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Painel de Upload e Configuração */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] space-y-6">
          <div className="border-b border-slate-100 pb-3.5">
            <h2 className="text-base font-bold text-slate-900">
              Configuração da Planilha
            </h2>
          </div>

          {/* 1. SELETOR DE IMPORTADOR DA CARGA */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Importador Dono da Carga *
              </label>
              <select
                value={empresaSelecionada}
                onChange={(e) => {
                  setEmpresaSelecionada(e.target.value);
                  setEmpresaLote(e.target.value);
                  setFamiliaLote("");
                }}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition font-semibold"
              >
                <option value="">-- Selecione o Importador Dono da Carga --</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.razao_social}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Garante que as etiquetas sejam geradas exclusivamente com os dados desta empresa.</p>
            </div>

            {/* Campo do Termo de Concessão (Exclusivo do Modo Concessão) */}
            {modoEtiqueta === "concessao" && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider">
                  Nº do Termo de Concessão Cedida *
                </label>
                <input
                  type="text"
                  value={termoConcessao}
                  onChange={(e) => setTermoConcessao(e.target.value)}
                  placeholder="Ex: 007/2026"
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white text-blue-900 font-mono font-bold focus:border-blue-600 outline-none"
                />
                <p className="text-[11px] text-blue-700/80">Este termo será carimbado em todas as etiquetas geradas nesta planilha.</p>
              </div>
            )}
          </div>

          {/* Área de Drag & Drop / Seleção de Arquivo */}
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-blue-500 transition-colors bg-slate-50/50">
            <input
              type="file"
              id="excel-upload"
              accept=".xlsx, .xlsm, .xls"
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
                  {file ? file.name : "Clique e Adicione seu Excel"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Formatos aceitos: .xlsx ou .xlsm</p>
              </div>
            </label>
          </div>

          {/* Mapeamento de Colunas Padronizado (Suporte total de A até AZ) */}
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
              {/* Código / Ref / FTY */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Código / Ref / FTY *
                </label>
                <select
                  value={colunaFty}
                  onChange={(e) => setColunaFty(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                >
                  <option value="">-- Selecione a Coluna --</option>
                  {OPCOES_COLUNAS_EXCEL.map((col) => (
                    <option key={col} value={col}>
                      Coluna {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Coluna da Etiqueta Gerada */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Coluna da Etiqueta Gerada *
                </label>
                <select
                  value={colunaEtiqueta}
                  onChange={(e) => setColunaEtiqueta(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                >
                  <option value="">-- Selecione a Coluna --</option>
                  {OPCOES_COLUNAS_EXCEL.map((col) => (
                    <option key={col} value={col}>
                      Coluna {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descrição Comercial */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Descrição Comercial
                </label>
                <select
                  value={colunaDescricao}
                  onChange={(e) => setColunaDescricao(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                >
                  <option value="">-- Opcional --</option>
                  <option value="NONE">Nenhuma (Não possui)</option>
                  {OPCOES_COLUNAS_EXCEL.map((col) => (
                    <option key={col} value={col}>
                      Coluna {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Código de Barras (EAN-13) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Código de Barras (EAN-13)
                </label>
                <select
                  value={colunaEan}
                  onChange={(e) => setColunaEan(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-semibold outline-none"
                >
                  <option value="">-- Opcional --</option>
                  <option value="NONE">Nenhuma (Não possui)</option>
                  {OPCOES_COLUNAS_EXCEL.map((col) => (
                    <option key={col} value={col}>
                      Coluna {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Indicação de Faixa Etária */}
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
                    <option key={col} value={col}>
                      Coluna {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Restrição Etária (0-3 / 0-4) */}
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
                    <option key={col} value={col}>
                      Coluna {col}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-[10px] text-slate-700 pt-1">
              * Produtos novos nascerão com as proteções padrão de brinquedos (0-3 anos ativo). Ajustes pontuais podem ser feitos na edição individual.
            </p>
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
              onClick={() => processarPlanilha(false)}
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
                  <span>Gerar Excel</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Cockpit de Conferência do Importador Selecionado */}
        <div className="lg:col-span-4 space-y-4">
          {(() => {
            const empAtiva = empresas.find((e) => e.id === empresaSelecionada);
            const totalFamilias = familias.filter((f) => f.empresa_id === empresaSelecionada).length;

            return (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${empAtiva ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Conferência da Carga
                    </h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${empAtiva ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400"}`}>
                    {empAtiva ? "Pronto" : "Aguardando"}
                  </span>
                </div>

                {empAtiva ? (
                  <div className="space-y-4">
                    {/* Identificação do Importador */}
                    <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Empresa Vinculada
                      </span>
                      <p className="text-sm font-extrabold text-slate-900 leading-tight">
                        {empAtiva.razao_social}
                      </p>
                    </div>

                    {/* Resumo de Configuração e Modalidade */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Modalidade
                        </span>
                        <p className={`text-xs font-extrabold mt-0.5 ${modoEtiqueta === "padrao" ? "text-blue-900" : "text-sky-600"}`}>
                          {modoEtiqueta === "padrao" ? "Padrão Direto" : "Concessão"}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Famílias Ativas
                        </span>
                        <p className="text-xs font-extrabold text-slate-900 mt-0.5">
                          {totalFamilias} {totalFamilias === 1 ? "família" : "famílias"}
                        </p>
                      </div>
                    </div>

                    {modoEtiqueta === "concessao" && (
                      <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-200/80">
                        <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block">
                          Termo Aplicado na Etiqueta
                        </span>
                        <p className="text-xs font-mono font-black text-sky-950 mt-0.5">
                          TERMO {termoConcessao || "007/2026"}
                        </p>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100">
                      As etiquetas serão carimbadas com as regras e certificados exclusivos desta empresa.
                    </p>
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-slate-600">Nenhum importador selecionado</p>
                    <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto">
                      Selecione o dono da carga ao lado para checar os dados antes de processar.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
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
                <p className="text-xs text-slate-600">Identificamos {naoCadastrados.length} novos produtos nesta planilha.</p>
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
                  onChange={(e) => {
                    setEmpresaLote(e.target.value);
                    setFamiliaLote("");
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:border-blue-500 outline-none font-medium"
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.razao_social}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Registro Inmetro (Opcional — Caso todos sejam iguais)
                </label>
                <select
                  value={familiaLote}
                  onChange={(e) => setFamiliaLote(e.target.value)}
                  className="w-full max-w-full truncate px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:border-blue-500 outline-none font-medium"
                >
                  <option value="">Nenhum (Cadastrar sem registro Inmetro)</option>
                  {familiasFiltradas.map((fam) => {
                    const labelCompleta = `${fam.numero_registro} — ${fam.nome_familia}`;
                    return (
                      <option key={fam.id} value={fam.id} title={labelCompleta}>
                        {labelCompleta.length > 65 ? `${labelCompleta.slice(0, 65)}...` : labelCompleta}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Exibe apenas certificados do importador selecionado. Se a planilha tiver certificados diferentes, deixe em "Nenhum".
                </p>
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
        textoConfirmar={modalAviso.textoConfirmar}
        textoCancelar={modalAviso.textoCancelar}
        onConfirmar={modalAviso.onConfirmar}
        onCancelar={modalAviso.onCancelar || (() => setModalAviso((prev) => ({ ...prev, isOpen: false })))}
      />
    </div>
  );
}
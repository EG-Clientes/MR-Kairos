"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import JsBarcode from "jsbarcode";
import ModalAviso from "@/components/ModalAviso";

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
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [colunaFty, setColunaFty] = useState<string>("A"); // Padrão da planilha da China
  const [colunaEtiqueta, setColunaEtiqueta] = useState<string>("C"); // Padrão da etiqueta
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [naoCadastrados, setNaoCadastrados] = useState<ItemNaoCadastrado[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  // Estados para o Cadastro Rápido em 1 Clique e Seleção da Carga
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [familias, setFamilias] = useState<FamiliaOption[]>([]);
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
    const [empRes, famRes] = await Promise.all([
      supabase.from("empresas").select("id, razao_social").order("razao_social"),
      supabase.from("inmetro_familias").select("id, empresa_id, nome_familia").order("nome_familia"),
    ]);
    if (empRes.data) {
      setEmpresas(empRes.data);
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
      const novosRegistros = naoCadastrados.map((item) => ({
        empresa_id: empresaLote,
        familia_id: null,
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
        idade_minima: "3 anos",
      }));

      const { error } = await supabase.from("produtos").insert(novosRegistros);

      if (error) {
        throw new Error("Erro ao cadastrar produtos em lote: " + error.message);
      }

      setIsAlertOpen(false);
      setSalvandoLote(false);

      // Aviso de Compliance: Dá a opção de revisar no catálogo ou gerar agora
      setModalAviso({
        isOpen: true,
        tipo: "sucesso",
        titulo: "Produtos Cadastrados com Sucesso!",
        mensagem: `${novosRegistros.length} produtos foram adicionados ao catálogo com EAN-13 gerados automaticamente.\n\nRecomendamos acessar o Catálogo de Produtos para vincular as Famílias/Certificados Inmetro antes do envio à China.`,
        onConfirmar: () => {
          setModalAviso((prev) => ({ ...prev, isOpen: false }));
          router.push("/produtos");
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

      // --- 1. TOPO: LOGO CENTRALIZADA OU RAZÃO SOCIAL ---
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

      // Auto-scale dinâmico idêntico à tela de Etiquetas
      const totalChars = avisos.reduce((acc, t) => acc + t.length, 0);
      let fontSize = 19;
      let lineH = 25;
      if (totalChars > 450) {
        fontSize = 15;
        lineH = 20;
      } else if (totalChars > 200) {
        fontSize = 17;
        lineH = 23;
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
          yPos += lineH + 3;
        }
      });

      const idadeFormatada = (prod.idade_minima || "3 ANOS").replace(/^\+/, "").trim();
      ctx.font = `900 ${fontSize + 2}px Arial, Helvetica, sans-serif`;
      ctx.fillText(`INDICADO PARA CRIANÇAS MAIORES DE ${idadeFormatada}.`, 520, yPos + 6);
      ctx.font = `bold ${fontSize - 1}px Arial, Helvetica, sans-serif`;
      ctx.fillText("GUARDAR PARA EVENTUAIS CONSULTAS", 520, yPos + lineH + 6);

      // --- SELO 0-3 ANOS (Geometria SVG Oficial com carinha triste, posicionado no 63%) ---
      if (prod.restritivo_0_3_anos) {
        const cx = 1065;
        const cy = 370; // 63% do bloco central
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

        // Texto "0-3"
        ctx.fillStyle = "#000000";
        ctx.font = "bold 34px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("0-3", cx - 24, cy + 28);

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
      const footerY = 530;

      // COLUNA 1: DADOS JURÍDICOS (Esquerda, máx 490px)
      ctx.textAlign = "left";
      ctx.fillStyle = "#000000";
      ctx.font = "900 19px Arial, Helvetica, sans-serif";
      ctx.fillText(prod.descricao.toUpperCase(), 35, footerY);

      ctx.font = "bold 15px Arial, Helvetica, sans-serif";
      let dy = footerY + 24;
      ctx.fillText(`Ref: ${prod.referencia_interna || prod.fty_no}   Item: ${prod.fty_no}`, 35, dy);
      dy += 22;
      ctx.fillText(`Código de barras: ${prod.ean_13 || "N/A"}`, 35, dy);
      dy += 22;
      ctx.fillText(`Importador: ${prod.empresas?.razao_social || "IMPORTADORA"}`, 35, dy);
      dy += 22;

      // Endereço (com quebra inteligente se passar de 480px)
      ctx.font = "14px Arial, Helvetica, sans-serif";
      const endTexto = `Endereço: ${prod.empresas?.endereco || "Não informado"}`;
      if (ctx.measureText(endTexto).width > 480) {
        const palavrasEnd = endTexto.split(" ");
        let l1 = "", l2 = "";
        palavrasEnd.forEach((p) => {
          if (ctx.measureText(l1 + p + " ").width < 470 && !l2) l1 += p + " ";
          else l2 += p + " ";
        });
        ctx.fillText(l1, 35, dy);
        dy += 19;
        ctx.fillText(l2, 35, dy);
      } else {
        ctx.fillText(endTexto, 35, dy);
      }
      dy += 22;

      ctx.font = "bold 14px Arial, Helvetica, sans-serif";
      const fabStr = prod.data_fabricacao || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const loteStr = prod.lote || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      ctx.fillText(`Fabricação: ${fabStr}`, 35, dy);
      dy += 20;
      ctx.fillText(`Lote: ${loteStr}`, 35, dy);
      dy += 20;
      ctx.fillText(`CNPJ: ${prod.empresas?.cnpj || ""}`, 35, dy);
      dy += 20;
      ctx.fillText("Origem: China", 35, dy);
      dy += 20;
      ctx.fillText(`SAC: ${prod.empresas?.sac_email || ""}`, 35, dy);

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

      // COLUNA 3: SELO OFICIAL INMETRO / OCP (Direita, 280x200px idêntico à tela)
      if (prod.inmetro_familias) {
        const ix = 865;
        const iy = 535;
        const iw = 295;
        const ih = 210;

        ctx.save();
        // Moldura arredondada com borda cinza suave (neutral-300)
        ctx.strokeStyle = "#d4d4d4";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(ix, iy, iw, ih, 26);
        ctx.stroke();

        // Título Segurança
        ctx.fillStyle = "#000000";
        ctx.font = "900 23px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Segurança", ix + iw / 2, iy + 34);

        // Sub-bloco BRICS (Lado Esquerdo)
        const bricsX = ix + 65;
        ctx.textAlign = "center";
        ctx.font = "900 28px Arial, Helvetica, sans-serif";
        ctx.fillText("brics", bricsX, iy + 92);

        // 4 esferas curvas sobre o 'i' da marca BRICS
        ctx.beginPath();
        ctx.arc(bricsX - 3.5, iy + 73, 2.2, 0, 2 * Math.PI);
        ctx.arc(bricsX - 1.5, iy + 70, 2.6, 0, 2 * Math.PI);
        ctx.arc(bricsX + 1, iy + 68, 3, 0, 2 * Math.PI);
        ctx.arc(bricsX + 3.5, iy + 71, 2.2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = "bold 13px Arial, Helvetica, sans-serif";
        ctx.fillText(`OCP ${prod.inmetro_familias.ocp_numero || "0098"}`, bricsX, iy + 115);

        // Sub-bloco INMETRO (Geometria Oficial com Pilares Maciços)
        const inmx = ix + 175;
        const inmy = iy + 62;
        ctx.fillStyle = "#000000";
        // Barra Superior
        ctx.fillRect(inmx, inmy, 68, 9);
        // Barra Inferior
        ctx.fillRect(inmx, inmy + 48, 68, 9);
        // Pilar Superior
        ctx.beginPath();
        ctx.moveTo(inmx + 22, inmy + 9);
        ctx.lineTo(inmx + 47, inmy + 9);
        ctx.lineTo(inmx + 47, inmy + 36);
        ctx.fill();
        // Pilar Inferior
        ctx.beginPath();
        ctx.moveTo(inmx + 21, inmy + 23);
        ctx.lineTo(inmx + 21, inmy + 48);
        ctx.lineTo(inmx + 46, inmy + 48);
        ctx.fill();

        ctx.font = "900 italic 15px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("INMETRO", inmx + 34, inmy + 71);

        // Rodapé: REGISTRO + Número
        ctx.font = "bold 13px Arial, Helvetica, sans-serif";
        ctx.fillText("REGISTRO", ix + iw / 2, iy + 165);
        ctx.font = "900 17px Arial, Helvetica, sans-serif";
        ctx.fillText(prod.inmetro_familias.numero_registro, ix + iw / 2, iy + 188);

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

    // Trava de Segurança: Obriga a escolher o Importador da carga
    if (!empresaSelecionada) {
      setModalAviso({
        isOpen: true,
        tipo: "alerta",
        titulo: "Importador Obrigatório",
        mensagem: "Por favor, selecione qual Importador é dono desta carga antes de processar a planilha.",
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
      const itensPlanilha: { linha: number; fty_no: string; descricao: string }[] = [];
      let comecouProdutos = false;

      worksheet.eachRow((row, rowNumber) => {
        const cellFty = row.getCell(colunaFty).text?.trim();

        // Inteligência na Descrição: se a coluna do código for B (planilha chinesa), a descrição é o próprio nome da B
        let cellDesc = "";
        if (colunaFty.toUpperCase() === "B") {
          cellDesc = cellFty || "PRODUTO IMPORTADO";
        } else {
          cellDesc = row.getCell("D").text?.trim() || row.getCell("B").text?.trim() || cellFty || "PRODUTO IMPORTADO";
        }

        // Se por acaso a descrição capturada for puramente numérica (ex: quantidade de caixa 220), usa o código do produto
        if (cellDesc && /^\d+$/.test(cellDesc) && cellFty) {
          cellDesc = cellFty;
        }

        // Filtro anti-ruído: ignora linhas de endereço/contato corporativo da fábrica chinesa
        const termosDescarte = ["ADD:", "TEL:", "FAX:", "ROOM", "STREET", "ROAD", "BUILDING", "EMAIL:"];
        const ehRuidoCorporativo = cellFty && (
          cellFty.length > 40 || 
          termosDescarte.some((termo) => cellFty.toUpperCase().includes(termo))
        );

        // Detecta a linha do cabeçalho oficial de forma flexível (FTY, ITEM, REF, ART, NO, ou termos chineses)
        if (!comecouProdutos) {
          const termosCabecalho = ["FTY", "ITEM", "REF", "ART", "NO.", "MODEL", "品名", "序号"];
          const ehCabecalho = cellFty && !ehRuidoCorporativo && termosCabecalho.some((termo) => cellFty.toUpperCase().includes(termo));
          if (ehCabecalho) {
            comecouProdutos = true;
          }
          return;
        }

        // Ignora linhas vazias, totalizadores (TOTAL / SUM / TT) ou rodapés de contato
        const ehTotalizador = cellFty && (
          cellFty.toUpperCase().includes("TOTAL") ||
          cellFty.toUpperCase().includes("SUM") ||
          cellFty.toUpperCase() === "TT"
        );

        if (cellFty && !ehTotalizador && !ehRuidoCorporativo) {
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

      // 2. Busca todos os produtos no banco que batem com esses códigos para este importador
      const ftyList = itensPlanilha.map((i) => i.fty_no);
      let queryProdutos = supabase
        .from("produtos")
        .select(`
          *,
          empresas(razao_social, cnpj, endereco, sac_email, logo_url),
          inmetro_familias(nome_familia, numero_registro, ocp_nome, ocp_numero, status, data_validade)
        `)
        .in("fty_no", ftyList);

      if (empresaSelecionada) {
        queryProdutos = queryProdutos.eq("empresa_id", empresaSelecionada);
      }

      const { data: produtosBanco, error: prodError } = await queryProdutos;

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

      // TRAVA DURA DE COMPLIANCE: Bloqueia geração se houver produtos sem Inmetro ou com certificado vencido
      const hojeIso = new Date().toISOString().split("T")[0];
      const produtosSemInmetro: string[] = [];

      itensPlanilha.forEach((item) => {
        const prod = produtosMap.get(item.fty_no.trim().toUpperCase());
        
        // 1. Bloqueia se o produto não tem família vinculada no banco
        if (!prod || !(prod as any).familia_id || !prod.inmetro_familias || !prod.inmetro_familias.numero_registro) {
          produtosSemInmetro.push(item.fty_no);
        } 
        // 2. Bloqueia se o certificado vinculado estiver vencido ou marcado como sem registro
        else if (
          prod.inmetro_familias.status === "Vencido" ||
          prod.inmetro_familias.status === "Sem Registro" ||
          (prod.inmetro_familias.data_validade && prod.inmetro_familias.data_validade < hojeIso)
        ) {
          produtosSemInmetro.push(`${item.fty_no} (Certificado Vencido)`);
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
      const itensSemRef = itensPlanilha.filter(
        (i) => !produtosMap.get(i.fty_no.trim().toUpperCase())?.referencia_interna
      );

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

      const semRefContagem = itensPlanilha.filter(
        (i) => !produtosMap.get(i.fty_no.trim().toUpperCase())?.referencia_interna
      ).length;

      if (semRefContagem > 0) {
        setStatusMsg(`Planilha baixada! Aviso: ${semRefContagem} item(ns) sem Ref usaram o código de fábrica.`);
      } else {
        setStatusMsg("Planilha gerada e baixada com sucesso!");
      }
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
            Configuração da Carga e Planilha (.xlsx)
          </h2>

          {/* 1. SELETOR DE IMPORTADOR DA CARGA */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Importador Dono da Carga *
            </label>
            <select
              value={empresaSelecionada}
              onChange={(e) => {
                setEmpresaSelecionada(e.target.value);
                setEmpresaLote(e.target.value);
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
                <p className="text-xs text-slate-600">Identificamos {naoCadastrados.length} novos produtos nesta planilha.</p>
              </div>
            </div>

            {/* Painel de Seleção para o Lote */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
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
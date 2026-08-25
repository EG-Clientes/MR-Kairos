"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import JsBarcode from "jsbarcode";

interface Produto {
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
  } | null;
}

export default function GeradorEtiquetasPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Referência para o elemento SVG do código de barras
  const barcodeRef = useRef<SVGSVGElement>(null);

  // ÚNICO Efeito para renderizar o código de barras localmente via JsBarcode
  useEffect(() => {
    const codigoParaDesenho = produtoSelecionado?.ean_barras || produtoSelecionado?.ean_13;

    if (codigoParaDesenho && barcodeRef.current) {
      // HIGIENIZAÇÃO: Remove automaticamente aspas duplas, aspas simples, espaços ou traços do código
      const codigoLimpo = codigoParaDesenho.replace(/["'\s-]/g, "");

      try {
        JsBarcode(barcodeRef.current, codigoLimpo, {
          format: "EAN13",
          displayValue: true,
          fontSize: 14,
          height: 38,
          margin: 0,
          background: "transparent",
          lineColor: "#000000",
        });
      } catch (err) {
        console.error("Erro ao gerar o código de barras EAN-13 localmente:", err);
      }
    }
  }, [produtoSelecionado]);

  // Carrega os produtos com todas as suas relações de empresas e certificados
  async function carregarProdutos() {
    setLoading(true);
    const { data, error } = await supabase
      .from("produtos")
      .select(`
        *,
        empresas(razao_social, cnpj, endereco, sac_email, logo_url),
        inmetro_familias(nome_familia, numero_registro, ocp_nome, ocp_numero)
      `)
      .order("descricao");

    if (!error && data) {
      setProdutos(data as any);
      if (data.length > 0) {
        setProdutoSelecionado(data[0] as any);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  // Lógica para montar os Avisos Legais baseando-se nas Flags do Produto
  function gerarTextosDeAtencao(prod: Produto) {
    const textos: string[] = [];

    if (prod.partes_pequenas) {
      textos.push(
        "ATENÇÃO! NÃO RECOMENDÁVEL PARA CRIANÇAS MENORES DE 3 (TRÊS) ANOS POR CONTER PARTE(S) PEQUENA(S) QUE PODEM SER ENGOLIDA(S) OU ASPIRADA(S)."
      );
    }
    if (prod.metal) {
      textos.push(
        "ATENÇÃO! ESTA EMBALAGEM CONTÉM FECHOS METÁLICOS. RETIRAR O BRINQUEDO DA EMBALAGEM ANTES DE ENTREGAR À CRIANÇA."
      );
    }
    if (prod.usa_pilha) {
      textos.push(
        "ATENÇÃO! ESTE BRINQUEDO DEVE SER MONTADO POR UM ADULTO ANTES DE SER ENTREGUE À CRIANÇA. AS BATERIAS DEVEM SER RETIRADAS DO BRINQUEDO ANTES DE SEREM RECARREGADAS; AS PILHAS NÃO RECARREGÁVEIS NÃO DEVEM SER RECARREGADAS; SÓ DEVEM SER USADAS PILHAS OU BATERIAS DO TIPO RECOMENDADO OU UM SIMILAR; AS PILHAS DEVEM SER COLOCADAS RESPEITANDO A POLARIDADE; AS PILHAS DESCARREGADAS DEVEM SER RETIRADAS DO BRINQUEDO; OS TERMINAIS DE UMA PILHA OU BATERIA NÃO DEVEM SER COLOCADOS EM CURTO-CIRCUITO."
      );
    }
    if (prod.contem_ima) {
      textos.push(
        "CUIDADO: CONTÉM ÍMÃ(ES). A INGESTÃO OU ASPIRAÇÃO DE ÍMÃ(ES) PODE CAUSAR LESÕES GRAVES E ATÉ FATAIS."
      );
    }

    return textos;
  }

  const avisos = produtoSelecionado ? gerarTextosDeAtencao(produtoSelecionado) : [];

  // Algoritmo de Auto-Scale de Compliance: calcula o tamanho do texto para auto-ajustar a fonte
  const totalCaracteresAvisos = avisos.reduce((acc, texto) => acc + texto.length, 0);
  let classTamanhoFonte = "text-[8px] leading-tight";
  
  if (totalCaracteresAvisos > 450) {
    classTamanhoFonte = "text-[6px] leading-[1.1]"; // Fonte menor para textos muito longos
  } else if (totalCaracteresAvisos > 200) {
    classTamanhoFonte = "text-[7px] leading-tight"; // Fonte média
  }

  return (
    <div className="space-y-8 print:p-0">
      {/* Cabeçalho de Controle - Ocultado na Impressão */}
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Gerar Etiquetas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Selecione um produto cadastrado para visualizar e imprimir a etiqueta de compliance.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!produtoSelecionado}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg shadow-sm transition flex items-center space-x-2 disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Imprimir Etiqueta</span>
        </button>
      </div>

      {/* Grid de Operação - Ocultado na Impressão */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block">
        {/* Lado Esquerdo: Seleção do Produto (Escondido na impressão) */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Selecione o Produto
          </h2>

          {loading ? (
            <div className="text-center py-6 text-slate-500 text-sm">Carregando catálogo...</div>
          ) : produtos.length > 0 ? (
            <div className="space-y-2">
              {produtos.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => setProdutoSelecionado(prod)}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                    produtoSelecionado?.id === prod.id
                      ? "border-blue-500 bg-blue-50/50 text-blue-900 font-semibold"
                      : "border-slate-100 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <p className="font-medium">{prod.descricao}</p>
                  <p className="text-xs text-slate-400 mt-1 font-mono">FTY NO: {prod.fty_no}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic">Nenhum produto cadastrado.</p>
          )}
        </div>

        {/* Lado Direito: Visualizador da Etiqueta (Tamanho Real 10x15cm em Proporção) */}
        <div className="lg:col-span-2 flex justify-center print:p-0 print:m-0">
          {produtoSelecionado ? (
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm print:shadow-none print:border-none print:p-0">
              <p className="text-xs text-slate-400 font-semibold mb-4 text-center print:hidden">
                Visualização Real (Ajustado para Impressora Térmica 10x15cm)
              </p>

              {/* A ETIQUETA REAL (Desenhada idêntica ao PowerPoint) */}
              <div className="print-label w-[450px] h-[300px] border border-slate-800 bg-white p-4 flex flex-col justify-between text-[10px] text-slate-900 leading-tight select-none">
                
                {/* Header: Logo do Importador */}
                <div className="flex flex-col items-center border-b border-slate-200 pb-1.5">
                  {produtoSelecionado.empresas?.logo_url ? (
                    <img
                      src={produtoSelecionado.empresas.logo_url}
                      alt="Logo"
                      className="h-7 object-contain mb-0.5"
                    />
                  ) : (
                    <span className="font-bold text-sm text-slate-800 tracking-wider">
                      {produtoSelecionado.empresas?.razao_social}
                    </span>
                  )}
                </div>

                {/* Bloco do Meio: Avisos Legais Inteligentes e Ícone 0-3 */}
                <div className="flex-1 flex items-center justify-between py-2 space-x-2">
                  <div className={`flex-1 text-center font-bold ${classTamanhoFonte} text-slate-800 space-y-1 max-h-[140px] overflow-hidden`}>
                    {avisos.map((aviso, i) => (
                      <p key={i}>{aviso}</p>
                    ))}
                    <p className="uppercase text-slate-900 font-extrabold tracking-wide mt-1">
                      INDICADO PARA CRIANÇAS MAIORES DE {produtoSelecionado.idade_minima || "3 ANOS"}.
                    </p>
                    <p className="uppercase text-slate-800 font-semibold">
                      GUARDAR PARA EVENTUAIS CONSULTAS.
                    </p>
                  </div>

                  {/* Ícone Redondo 0-3 Anos Condicional */}
                  {produtoSelecionado.restritivo_0_3_anos && (
                    <div className="w-14 h-14 border-4 border-red-600 rounded-full flex flex-col items-center justify-center font-bold text-slate-900 leading-none relative flex-shrink-0 bg-white">
                      <span className="text-[14px]">0-3</span>
                      {/* Linha Diagonal Proibitiva Vermelha */}
                      <div className="absolute w-full h-[3px] bg-red-600 rotate-45 top-1/2 left-0 -translate-y-1/2"></div>
                    </div>
                  )}
                </div>

                {/* Rodapé: Dados do Produto e Inmetro */}
                <div className="border-t border-slate-200 pt-1.5 grid grid-cols-3 gap-2 items-end">
                  {/* Coluna 1: Dados Jurídicos (Idênticos ao PowerPoint) */}
                  <div className="col-span-2 space-y-0.5 text-[6.5px] text-slate-700 font-medium leading-normal">
                    <p className="font-extrabold text-slate-900 text-[8px] uppercase tracking-wide">
                      {produtoSelecionado.descricao}
                    </p>
                    <p>
                      <span className="font-bold">Ref:</span> {produtoSelecionado.fty_no} | <span className="font-bold">Item:</span> {produtoSelecionado.fty_no}
                    </p>
                    <p>
                      <span className="font-bold">Código de barras:</span> {produtoSelecionado.ean_13}
                    </p>
                    <p>
                      <span className="font-bold">Importador:</span> {produtoSelecionado.empresas?.razao_social}
                    </p>
                    <p className="truncate">
                      <span className="font-bold">Endereço:</span> {produtoSelecionado.empresas?.endereco || "Não informado"}
                    </p>
                    <p>
                      <span className="font-bold">Fabricação:</span> {produtoSelecionado.data_fabricacao || (() => {
                        const d = new Date();
                        return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                      })()}
                    </p>
                    <p>
                      <span className="font-bold">Lote:</span> {produtoSelecionado.lote || (() => {
                        const d = new Date();
                        return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                      })()}
                    </p>
                    <p>
                      <span className="font-bold">CNPJ:</span> {produtoSelecionado.empresas?.cnpj}
                    </p>
                    <p>
                      <span className="font-bold">Origem:</span> China
                    </p>
                    <p>
                      <span className="font-bold">SAC:</span> {produtoSelecionado.empresas?.sac_email}
                    </p>
                  </div>

                  {/* Coluna 2: Código de Barras e Inmetro */}
                  <div className="flex flex-col items-end space-y-1">
                    {/* Código de barras dinâmico gerado localmente em SVG */}
                    {produtoSelecionado.ean_13 ? (
                      <svg 
                        ref={barcodeRef} 
                        className="h-7 w-24 object-contain"
                      ></svg>
                    ) : (
                      <div className="h-7 w-24 bg-slate-50 flex items-center justify-center text-[6px] text-slate-400 border border-dashed border-slate-200 rounded">
                        Sem EAN
                      </div>
                    )}

                    {/* Selo do Inmetro no Layout Exato */}
                    {produtoSelecionado.inmetro_familias ? (
                      <div className="border border-slate-400 p-1 rounded flex items-center space-x-1 bg-white flex-shrink-0 w-28 justify-between">
                        <div className="text-[5px] font-bold text-slate-800 leading-tight">
                          <p>Segurança</p>
                          <p className="text-[7px] font-extrabold text-slate-900 leading-none my-0.5 uppercase">
                            {produtoSelecionado.inmetro_familias.ocp_nome || "brics"}
                          </p>
                          <p>
                            OCP {produtoSelecionado.inmetro_familias.ocp_numero || "0098"}
                          </p>
                        </div>
                        <div className="flex flex-col items-center">
                          {/* Símbolo do Inmetro estilizado em CSS */}
                          <div className="border border-slate-900 px-1 py-0.5 font-black text-[6px] tracking-tighter leading-none bg-white">
                            INMETRO
                          </div>
                          <p className="text-[4.5px] text-slate-800 font-extrabold mt-1 text-center tracking-tighter leading-none">
                            REGISTRO {produtoSelecionado.inmetro_familias.numero_registro}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[6px] font-bold text-amber-500 border border-amber-200 bg-amber-50 px-1 py-0.5 rounded">
                        Sem Registro Inmetro
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-sm italic py-24">
              Selecione um produto para gerar a etiqueta.
            </div>
          )}
        </div>
      </div>

      {/* ESTILO CSS DE IMPRESSÃO INJETADO NATIVAMENTE (BURLA COMPILADORES E NAVEGADORES) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Torna invisível absolutamente tudo na página */
          body * {
            visibility: hidden !important;
          }
          /* Torna visível APENAS a etiqueta e os textos/imagens que estão dentro dela */
          .print-label, .print-label * {
            visibility: visible !important;
          }
          /* Destaca a etiqueta do layout do site e cola ela no topo da folha térmica de impressão */
          .print-label {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 450px !important;
            height: 300px !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}} />
    </div>
  );
}
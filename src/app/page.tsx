import Link from "next/link";
import { supabase } from "@/lib/supabase";

// Força a Vercel a nunca cachear e sempre buscar dados em tempo real no Supabase
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // CONSULTAS EM PARALELO AO SUPABASE (Busca única otimizada sem gargalo de rede)
  const [empresaResult, certificadoResult, produtoResult] = await Promise.all([
    supabase
      .from("empresas")
      .select("id, razao_social, cnpj, logo_url")
      .order("razao_social"),

    supabase
      .from("inmetro_familias")
      .select("id, empresa_id, nome_familia, numero_registro, data_validade, status, empresas(razao_social)")
      .order("data_validade", { ascending: true }),

    supabase
      .from("produtos")
      .select("id, empresa_id, familia_id, referencia_interna")
  ]);

  const { data: empresas } = empresaResult;
  const { data: certificados } = certificadoResult;
  const { data: produtos } = produtoResult;

  // --- CÁLCULOS DE COMPLIANCE E INTELIGÊNCIA EM MEMÓRIA ---
  const listaCertificados = certificados || [];
  const listaProdutos = produtos || [];
  const listaEmpresas = empresas || [];

  // Identifica certificados vencidos ou vencendo nos próximos 30 dias
  const certificadosEmRisco = listaCertificados.filter((cert) => {
    if (cert.status === "Sem Registro" || cert.status === "Vencido") return true;
    if (!cert.data_validade) return true;
    const partes = cert.data_validade.split("T")[0].split("-");
    const dataVal = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    const diffDias = Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diffDias <= 30;
  });

  // Produtos que precisam de atenção (sem referência ou sem certificado)
  const produtosPendentes = listaProdutos.filter((p) => !p.referencia_interna || !p.familia_id);

  // Mapeamento operacional por importador
  const resumoEmpresas = listaEmpresas.map((emp) => {
    const totalProd = listaProdutos.filter((p) => p.empresa_id === emp.id).length;
    const certsEmpresa = listaCertificados.filter((c) => c.empresa_id === emp.id);
    const temRisco = certsEmpresa.some((cert) => {
      if (cert.status === "Sem Registro" || cert.status === "Vencido") return true;
      if (!cert.data_validade) return true;
      const partes = cert.data_validade.split("T")[0].split("-");
      const dataVal = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
      return Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
    });

    return {
      ...emp,
      totalProdutos: totalProd,
      totalCertificados: certsEmpresa.length,
      temRisco,
    };
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Torre de Controle</h1>
          <p className="text-slate-500 text-sm mt-1">Visão geral em tempo real de compliance alfandegário, cargas e rotulagem.</p>
        </div>
        <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200/80 px-3.5 py-1.5 rounded-full shadow-xs w-fit">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-emerald-700 text-xs font-bold tracking-wide">Banco de Dados Ativo</span>
        </div>
      </div>

      {/* BARRA DE AÇÕES RÁPIDAS (Atalhos Diários) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/excel"
          className="bg-white hover:bg-blue-50/50 p-4 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:border-blue-300 transition-all duration-200 flex items-center space-x-3.5 group"
        >
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform duration-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Processar Planilha China</h4>
            <p className="text-[11px] text-slate-400">Embutir etiquetas no Excel</p>
          </div>
        </Link>

        <Link
          href="/etiquetas"
          className="bg-white hover:bg-blue-50/50 p-4 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:border-blue-300 transition-all duration-200 flex items-center space-x-3.5 group"
        >
          <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform duration-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">Imprimir Etiquetas Individuais</h4>
            <p className="text-[11px] text-slate-400">Padrão 10x15cm para impressora</p>
          </div>
        </Link>

        <Link
          href="/certificados"
          className="bg-white hover:bg-blue-50/50 p-4 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:border-blue-300 transition-all duration-200 flex items-center space-x-3.5 group"
        >
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform duration-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">Gerenciar Certificados</h4>
            <p className="text-[11px] text-slate-400">Validades e registros Inmetro</p>
          </div>
        </Link>
      </div>

      {/* CARDS DE MÉTRICAS EXECUTIVAS (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Importadores */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-all duration-200 flex items-center justify-between group">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Importadores</p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{listaEmpresas.length}</h3>
            <p className="text-[11px] text-slate-400 font-medium">Empresas ativas</p>
          </div>
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/80 group-hover:scale-105 transition-transform duration-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        {/* Card 2: Alerta Inmetro */}
        <div className={`p-6 rounded-2xl border transition-all duration-200 flex items-center justify-between group ${
          certificadosEmRisco.length > 0
            ? "bg-red-50/40 border-red-200 shadow-[0_2px_12px_rgba(239,68,68,0.08)]"
            : "bg-white border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
        }`}>
          <div className="space-y-1">
            <p className={`text-xs font-bold uppercase tracking-wider ${certificadosEmRisco.length > 0 ? "text-red-500" : "text-slate-400"}`}>
              Certificados em Risco
            </p>
            <h3 className={`text-3xl font-extrabold tracking-tight ${certificadosEmRisco.length > 0 ? "text-red-600 animate-pulse" : "text-slate-800"}`}>
              {certificadosEmRisco.length}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">Vencidos ou em 30d</p>
          </div>
          <div className={`p-3.5 rounded-xl border group-hover:scale-105 transition-transform duration-200 ${
            certificadosEmRisco.length > 0 ? "bg-red-100 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-600 border-emerald-100"
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Produtos Cadastrados */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-all duration-200 flex items-center justify-between group">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Produtos Cadastrados</p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{listaProdutos.length}</h3>
            <p className="text-[11px] text-slate-400 font-medium">Itens no catálogo</p>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80 group-hover:scale-105 transition-transform duration-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        </div>

        {/* Card 4: Pendências no Catálogo */}
        <div className={`p-6 rounded-2xl border transition-all duration-200 flex items-center justify-between group ${
          produtosPendentes.length > 0
            ? "bg-amber-50/40 border-amber-200 shadow-[0_2px_12px_rgba(245,158,11,0.06)]"
            : "bg-white border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
        }`}>
          <div className="space-y-1">
            <p className={`text-xs font-bold uppercase tracking-wider ${produtosPendentes.length > 0 ? "text-amber-600" : "text-slate-400"}`}>
              Itens c/ Pendência
            </p>
            <h3 className={`text-3xl font-extrabold tracking-tight ${produtosPendentes.length > 0 ? "text-amber-700" : "text-slate-800"}`}>
              {produtosPendentes.length}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">Sem Ref ou Sem Inmetro</p>
          </div>
          <div className={`p-3.5 rounded-xl border group-hover:scale-105 transition-transform duration-200 ${
            produtosPendentes.length > 0 ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-100"
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        </div>
      </div>

      {/* RADAR DE VALIDADE INMETRO (Certificados Críticos) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Radar de Validade Inmetro (Urgências D-30)</h2>
            <p className="text-slate-400 text-xs mt-0.5">Certificados que impedem desembaraço alfandegário se expirarem.</p>
          </div>
          <Link
            href="/certificados"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-3 py-1.5 rounded-lg transition"
          >
            Ver Todos os Certificados
          </Link>
        </div>

        {certificadosEmRisco.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Importador</th>
                  <th className="py-3 px-6">Família de Produtos</th>
                  <th className="py-3 px-6">Nº Registro</th>
                  <th className="py-3 px-6">Situação</th>
                  <th className="py-3 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {certificadosEmRisco.slice(0, 5).map((cert) => {
                  let diasRestantes: number | null = null;
                  if (cert.data_validade) {
                    const partes = cert.data_validade.split("T")[0].split("-");
                    const dataVal = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
                    diasRestantes = Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                  }

                  const ehVencido = cert.status === "Vencido" || (diasRestantes !== null && diasRestantes < 0);

                  return (
                    <tr key={cert.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6 font-semibold text-slate-800">
                        {cert.empresas?.razao_social || "Não vinculado"}
                      </td>
                      <td className="py-4 px-6 text-slate-700 font-medium">{cert.nome_familia}</td>
                      <td className="py-4 px-6 text-slate-500 font-mono text-xs">{cert.numero_registro}</td>
                      <td className="py-4 px-6">
                        {ehVencido ? (
                          <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                            Vencido
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                            Vence em {diasRestantes}d
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Link
                          href="/certificados"
                          className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-2.5 py-1 rounded-md transition"
                        >
                          <span>Renovar</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center bg-emerald-50/30">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2.5 border border-emerald-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-slate-800">Compliance Inmetro 100% Regular</h4>
            <p className="text-xs text-slate-500 mt-0.5">Nenhum certificado vencido ou a vencer nos próximos 30 dias. Cargas liberadas.</p>
          </div>
        )}
      </div>

      {/* TABELA DE IMPORTADORES (Hub Consolidado com Status) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Importadores Vinculados</h2>
            <p className="text-slate-400 text-xs mt-0.5">Empresas e situação operacional consolidada.</p>
          </div>
          <Link 
            href="/importadores" 
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-3 py-1.5 rounded-lg transition"
          >
            Gerenciar Empresas
          </Link>
        </div>

        {resumoEmpresas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Empresa</th>
                  <th className="py-3 px-6">CNPJ</th>
                  <th className="py-3 px-6">Catálogo</th>
                  <th className="py-3 px-6">Certificados</th>
                  <th className="py-3 px-6">Status Geral</th>
                  <th className="py-3 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {resumoEmpresas.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        {emp.logo_url ? (
                          <img src={emp.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded-lg border border-slate-200 p-0.5" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-100 uppercase">
                            {emp.razao_social.substring(0, 2)}
                          </div>
                        )}
                        <span className="font-semibold text-slate-800">{emp.razao_social}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-mono text-xs">{emp.cnpj}</td>
                    <td className="py-4 px-6 text-slate-700 font-medium">
                      {emp.totalProdutos} produto{emp.totalProdutos !== 1 ? "s" : ""}
                    </td>
                    <td className="py-4 px-6 text-slate-700 font-medium">
                      {emp.totalCertificados} família{emp.totalCertificados !== 1 ? "s" : ""}
                    </td>
                    <td className="py-4 px-6">
                      {emp.temRisco ? (
                        <span className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                          Atenção Inmetro
                        </span>
                      ) : (
                        <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                          Compliance 100%
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link 
                        href={`/produtos?empresa=${emp.id}`} 
                        className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md transition"
                      >
                        <span>Ver Catálogo</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-sm">
            Nenhum importador cadastrado até o momento.
          </div>
        )}
      </div>
    </div>
  );
}
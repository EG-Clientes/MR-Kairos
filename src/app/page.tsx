import { supabase } from "@/lib/supabase";

export default async function Home() {
  // 1. Calcula a faixa de data dos próximos 30 dias para o alerta do Inmetro
  const hoje = new Date();
  const hojeString = hoje.toISOString().split("T")[0]; // YYYY-MM-DD
  
  const limiteVencimento = new Date();
  limiteVencimento.setDate(hoje.getDate() + 30); // Soma 30 dias
  const limiteString = limiteVencimento.toISOString().split("T")[0];

  // 2. CONSULTAS EM PARALELO AO SUPABASE (Otimização para evitar cascata/delay de rede)
  const [empresaResult, certificadoResult, produtoResult] = await Promise.all([
    supabase
      .from("empresas")
      .select("razao_social, cnpj")
      .order("razao_social"),
    
    supabase
      .from("inmetro_familias")
      .select("*", { count: "exact", head: true })
      .lte("data_validade", limiteString), // Correção de Compliance: Busca tanto os já vencidos quanto os que estão para vencer em 30 dias
    
    supabase
      .from("produtos")
      .select("*", { count: "exact", head: true })
  ]);

  const { data: empresas, error: empError } = empresaResult;
  const { count: certificadosVencendo, error: certError } = certificadoResult;
  const { count: totalProdutos, error: prodError } = produtoResult;

  if (empError || certError || prodError) {
    console.error("Erro ao carregar métricas do dashboard:", { empError, certError, prodError });
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Visão geral em tempo real de importadores, certificados e rotulagem.</p>
        </div>
        <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200/80 px-3.5 py-1.5 rounded-full shadow-sm w-fit">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-emerald-700 text-xs font-bold tracking-wide">Banco de Dados Ativo</span>
        </div>
      </div>

      {/* CARDS DE MÉTRICAS RÁPIDAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Importadores */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-all duration-200 flex items-center justify-between group">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Importadores Ativos</p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{empresas?.length || 0}</h3>
            <p className="text-[11px] text-slate-400 font-medium">Empresas cadastradas</p>
          </div>
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-105 transition-transform duration-200 border border-blue-100/80">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        {/* Card 2: Alerta Inmetro */}
        <div className={`p-6 rounded-2xl border transition-all duration-200 flex items-center justify-between group ${
          certificadosVencendo && certificadosVencendo > 0
            ? "bg-red-50/40 border-red-200 shadow-[0_2px_12px_rgba(239,68,68,0.08)] hover:shadow-[0_4px_20px_rgba(239,68,68,0.12)]"
            : "bg-white border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)]"
        }`}>
          <div className="space-y-1">
            <p className={`text-xs font-bold uppercase tracking-wider ${certificadosVencendo && certificadosVencendo > 0 ? "text-red-500" : "text-slate-400"}`}>
              Certificados em Risco
            </p>
            <h3 className={`text-3xl font-extrabold tracking-tight ${certificadosVencendo && certificadosVencendo > 0 ? "text-red-600 animate-pulse" : "text-slate-800"}`}>
              {certificadosVencendo || 0}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">Vencidos ou vencendo em 30d</p>
          </div>
          <div className={`p-3.5 rounded-xl group-hover:scale-105 transition-transform duration-200 border ${
            certificadosVencendo && certificadosVencendo > 0
              ? "bg-red-100 text-red-600 border-red-200"
              : "bg-slate-50 text-slate-400 border-slate-100"
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Produtos Cadastrados */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-all duration-200 flex items-center justify-between group">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Produtos no Catálogo</p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{totalProdutos || 0}</h3>
            <p className="text-[11px] text-slate-400 font-medium">Itens prontos para etiquetagem</p>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-105 transition-transform duration-200 border border-indigo-100/80">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        </div>
      </div>

      {/* TABELA DE IMPORTADORES */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Importadores Vinculados</h2>
            <p className="text-slate-400 text-xs mt-0.5">Empresas ativas cadastradas na operação.</p>
          </div>
          <a 
            href="/importadores" 
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 border border-blue-100 px-3 py-1.5 rounded-lg transition"
          >
            Ver Todos
          </a>
        </div>

        {empresas && empresas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Razão Social</th>
                  <th className="py-3 px-6">CNPJ</th>
                  <th className="py-3 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {empresas.map((empresa, index) => (
                  <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-semibold text-slate-800">{empresa.razao_social}</td>
                    <td className="py-4 px-6 text-slate-500 font-mono text-xs">{empresa.cnpj}</td>
                    <td className="py-4 px-6 text-right">
                      <a 
                        href="/importadores" 
                        className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md transition"
                      >
                        <span>Gerenciar</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
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
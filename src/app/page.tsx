import { supabase } from "@/lib/supabase";

export default async function Home() {
  // 1. Calcula a faixa de data dos próximos 30 dias para o alerta do Inmetro
  const hoje = new Date();
  const hojeString = hoje.toISOString().split("T")[0]; // YYYY-MM-DD
  
  const limiteVencimento = new Date();
  limiteVencimento.setDate(hoje.getDate() + 30); // Soma 30 dias
  const limiteString = limiteVencimento.toISOString().split("T")[0];

  // 2. CONSULTAS AO VIVO NO SUPABASE

  // Busca as empresas cadastradas
  const { data: empresas, error: empError } = await supabase
    .from("empresas")
    .select("razao_social, cnpj")
    .order("razao_social");

  // Conta quantos Certificados vencem nos próximos 30 dias (Alerta)
  const { count: certificadosVencendo, error: certError } = await supabase
    .from("inmetro_familias")
    .select("*", { count: "exact", head: true })
    .lte("data_validade", limiteString)
    .gte("data_validade", hojeString);

  // Conta o total de Produtos cadastrados no sistema
  const { count: totalProdutos, error: prodError } = await supabase
    .from("produtos")
    .select("*", { count: "exact", head: true });

  if (empError || certError || prodError) {
    console.error("Erro ao carregar métricas do dashboard");
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho da Página */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Visão geral do compliance e rotulagem das suas empresas.</p>
        </div>
        <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200">
          Banco de Dados Ativo
        </span>
      </div>

      {/* CARDS DE MÉTRICAS RÁPIDAS (AO VIVO DO BANCO) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Empresas */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Importadores Ativos</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{empresas?.length || 0}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        {/* Card 2: Alerta de Certificados (Calculado nos últimos 30 dias) */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Certificados Vencendo (30 dias)</p>
            <h3 className={`text-3xl font-bold mt-1 ${certificadosVencendo && certificadosVencendo > 0 ? "text-red-600 animate-pulse" : "text-slate-800"}`}>
              {certificadosVencendo || 0}
            </h3>
          </div>
          <div className={`p-3 rounded-lg ${certificadosVencendo && certificadosVencendo > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Produtos Ativos */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Produtos Cadastrados</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{totalProdutos || 0}</h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        </div>
      </div>

      {/* LISTA DE EMPRESAS CADASTRADAS */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">Importadores Cadastrados</h2>
          <p className="text-slate-400 text-xs mt-0.5">Lista de empresas ativas para geração de etiquetas.</p>
        </div>

        {empresas && empresas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Razão Social</th>
                  <th className="pb-3">CNPJ</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {empresas.map((empresa, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="py-4 font-semibold text-slate-700">{empresa.razao_social}</td>
                    <td className="py-4 text-slate-500">{empresa.cnpj}</td>
                    <td className="py-4 text-right">
                      <a href="/importadores" className="text-blue-600 hover:text-blue-800 font-medium text-xs">
                        Gerenciar
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 text-sm italic">
            Nenhum importador cadastrado até o momento.
          </div>
        )}
      </div>
    </div>
  );
}
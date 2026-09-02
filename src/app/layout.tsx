import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link"; // Adicionado para navegação SPA sem recarregamento
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MR KAIRÓS",
  description: "Gerenciamento de rotulagem e compliance de produtos importados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-slate-50 text-slate-800 antialiased`}>
        <div className="flex min-h-screen">
          {/* SIDEBAR LATERAL FIXA - DESIGN ULTRA PREMIUM */}
          <aside className="w-64 bg-slate-950 text-white flex flex-col fixed h-full shadow-[4px_0_24px_rgba(0,0,0,0.3)] border-r border-slate-800/60 z-40">
            {/* Header da Sidebar com Glow Sutil */}
            <div className="p-5 border-b border-slate-800/80 flex items-center space-x-3.5 bg-gradient-to-r from-blue-900/30 to-transparent">
              <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700/60 flex items-center justify-center p-1.5 shadow-inner flex-shrink-0">
                <img 
                  src="/logo-kairos.png" 
                  alt="MR Kairós" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-base font-bold tracking-tight text-white leading-snug">MR Kairós</h1>
                <p className="text-blue-400 text-[11px] font-medium tracking-wide">Automação de Rotulagem</p>
              </div>
            </div>

            {/* Links de Navegação */}
            <nav className="flex-1 px-3 py-6 space-y-2">
              <Link 
                href="/" 
                className="group flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900/90 transition-all duration-150 text-[15px] font-medium border border-transparent hover:border-slate-800"
              >
                <div className="p-2 rounded-lg bg-slate-900 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150 shadow-sm border border-slate-800">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                  </svg>
                </div>
                <span>Dashboard</span>
              </Link>

              <Link 
                href="/importadores" 
                className="group flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900/90 transition-all duration-150 text-[15px] font-medium border border-transparent hover:border-slate-800"
              >
                <div className="p-2 rounded-lg bg-slate-900 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150 shadow-sm border border-slate-800">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <span>Importadores</span>
              </Link>

              <Link 
                href="/certificados" 
                className="group flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900/90 transition-all duration-150 text-[15px] font-medium border border-transparent hover:border-slate-800"
              >
                <div className="p-2 rounded-lg bg-slate-900 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150 shadow-sm border border-slate-800">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span>Certificados</span>
              </Link>

              <Link 
                href="/produtos" 
                className="group flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900/90 transition-all duration-150 text-[15px] font-medium border border-transparent hover:border-slate-800"
              >
                <div className="p-2 rounded-lg bg-slate-900 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150 shadow-sm border border-slate-800">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <span>Produtos</span>
              </Link>

              <Link 
                href="/etiquetas" 
                className="group flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900/90 transition-all duration-150 text-[15px] font-medium border border-transparent hover:border-slate-800"
              >
                <div className="p-2 rounded-lg bg-slate-900 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150 shadow-sm border border-slate-800">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M6 20h12a2 2 0 002-2V9a2 2 0 00-2-2h-1m-4-4h.01M9 16h.01M5 16h.01M13 16h.01M17 16h.01M9 9h.01M13 9h.01M17 9h.01m-10 7a3 3 0 11-6 0 3 3 0 016 0zm10 0a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span>Gerar Etiquetas</span>
              </Link>
            </nav>

            {/* Rodapé da Sidebar */}
            <div className="p-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-950/60">
              <div className="flex items-center space-x-2 pl-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-semibold text-slate-300">Sistema Conectado</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">MR Kairós</span>
            </div>
          </aside>

          {/* CONTEÚDO PRINCIPAL (Fica recuado à direita da sidebar) */}
          <main className="flex-1 ml-64 p-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
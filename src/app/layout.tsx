import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
          {/* SIDEBAR LATERAL FIXA */}
          <aside className="w-64 bg-blue-900 text-white flex flex-col fixed h-full shadow-xl">
            {/* Header da Sidebar */}
            <div className="p-6 border-b border-blue-800 flex items-center space-x-3">
              <img 
                src="/logo-kairos.png" 
                alt="MR Kairós Logo" 
                className="w-10 h-10 rounded-full object-cover border border-blue-700 bg-white"
              />
              <div>
                <h1 className="text-lg font-bold tracking-wider leading-none">MR Kairós</h1>
                <p className="text-blue-300 text-[10px] mt-1.5 font-medium">Automação de Rotulagem</p>
              </div>
            </div>

            {/* Links de Navegação */}
            <nav className="flex-1 p-4 space-y-1">
              <a href="/" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-800/50 text-blue-100 hover:text-white font-medium transition">
                <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                </svg>
                <span>Dashboard</span>
              </a>

              <a href="/importadores" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-800/50 text-blue-100 hover:text-white font-medium transition">
                <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>Importadores</span>
              </a>

              <a href="/certificados" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-800/50 text-blue-100 hover:text-white font-medium transition">
                <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Certificados</span>
              </a>

              <a href="/produtos" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-800/50 text-blue-100 hover:text-white font-medium transition">
                {/* Ícone de Caixa 3D para Produtos */}
                <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>Produtos</span>
              </a>

              <a href="/etiquetas" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-800/50 text-blue-100 hover:text-white font-medium transition">
                <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M6 20h12a2 2 0 002-2V9a2 2 0 00-2-2h-1m-4-4h.01M9 16h.01M5 16h.01M13 16h.01M17 16h.01M9 9h.01M13 9h.01M17 9h.01m-10 7a3 3 0 11-6 0 3 3 0 016 0zm10 0a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Gerar Etiquetas</span>
              </a>
            </nav>

            {/* Rodapé da Sidebar */}
            <div className="p-4 border-t border-blue-800 text-center text-xs text-blue-300">
              Versão 1.0.0
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
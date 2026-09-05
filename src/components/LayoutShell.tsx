"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LayoutShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/";
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Se for a tela inicial de login, não precisa checar nada
    if (isLoginPage) {
      setIsAuthenticated(true);
      return;
    }

    // Trava de segurança: Checa se há usuário logado no Supabase
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Se não tem login, chuta para a tela de login
        setIsAuthenticated(false);
        router.replace("/");
      } else {
        // Sessão válida, libera o sistema
        setIsAuthenticated(true);
      }
    }

    checkAuth();

    // Fica escutando se o usuário deslogou
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !isLoginPage) {
        setIsAuthenticated(false);
        router.replace("/");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, isLoginPage, router]);

  // Se estiver na tela de login (/), exibe em tela cheia direto
  if (isLoginPage) {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  // Enquanto valida a sessão nas páginas internas, exibe uma tela preta discreta
  // (Isso impede que o dashboard "pisque" na tela de quem não tá logado)
  if (isAuthenticated === null || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center space-x-3 text-slate-400 text-xs font-semibold">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Validando credenciais...</span>
        </div>
      </div>
    );
  }

  // Usuário autenticado: exibe o sistema com o menu lateral normalmente
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {sidebar}
      <main className="flex-1 ml-64 p-10">
        {children}
      </main>
    </div>
  );
}
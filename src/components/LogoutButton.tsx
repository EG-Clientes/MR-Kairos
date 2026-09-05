"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LogoutButton() {
  const router = useRouter();
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirmLogout() {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (err) {
      console.error("Erro ao deslogar:", err);
    } finally {
      setLoading(false);
      setOpenModal(false);
    }
  }

  return (
    <>
      {/* Botão na Sidebar */}
      <div className="mt-auto pt-3 border-t border-slate-800/80">
        <button
          onClick={() => setOpenModal(true)}
          type="button"
          className="w-full group flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 text-[15px] font-medium border border-transparent hover:border-red-500/20 cursor-pointer"
        >
          <div className="p-2 rounded-lg bg-slate-900 text-slate-400 group-hover:bg-red-500/20 group-hover:text-red-400 transition-colors duration-150 border border-slate-800 group-hover:border-red-500/30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          <span>Sair do Sistema</span>
        </button>
      </div>

      {/* MODAL DE CONFIRMAÇÃO ELEGANTE */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center space-x-3.5">
              <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="text-base font-bold text-white tracking-tight">Encerrar Sessão?</h4>
                <p className="text-xs text-slate-400">Você voltará para a tela inicial de login.</p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                disabled={loading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/20 transition flex items-center space-x-1.5 cursor-pointer"
              >
                {loading ? <span>Saindo...</span> : <span>Confirmar e Sair</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
"use client";

interface ModalAvisoProps {
  isOpen: boolean;
  tipo?: "perigo" | "alerta" | "sucesso" | "info";
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  onConfirmar?: () => void;
  onCancelar: () => void;
}

export default function ModalAviso({
  isOpen,
  tipo = "perigo",
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  onConfirmar,
  onCancelar,
}: ModalAvisoProps) {
  if (!isOpen) return null;

  const isConfirmacao = !!onConfirmar;

  const configTipos = {
    perigo: {
      iconeBg: "bg-red-50 border-red-100 text-red-600",
      btnConfirmar: "bg-red-600 hover:bg-red-700 text-white shadow-red-600/20",
      svg: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      ),
    },
    alerta: {
      iconeBg: "bg-amber-50 border-amber-200 text-amber-600",
      btnConfirmar: "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20",
      svg: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      ),
    },
    sucesso: {
      iconeBg: "bg-emerald-50 border-emerald-200 text-emerald-600",
      btnConfirmar: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20",
      svg: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      ),
    },
    info: {
      iconeBg: "bg-blue-50 border-blue-100 text-blue-600",
      btnConfirmar: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20",
      svg: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      ),
    },
  };

  const estilo = configTipos[tipo];

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start space-x-3.5">
          <div className={`p-3 rounded-xl border flex-shrink-0 ${estilo.iconeBg}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {estilo.svg}
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 leading-snug">{titulo}</h3>
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">{mensagem}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-2.5">
          {isConfirmacao && (
            <button
              type="button"
              onClick={onCancelar}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              {textoCancelar}
            </button>
          )}

          <button
            type="button"
            onClick={onConfirmar || onCancelar}
            className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm hover:shadow transition ${estilo.btnConfirmar}`}
          >
            {isConfirmacao ? textoConfirmar : "OK, Entendi"}
          </button>
        </div>
      </div>
    </div>
  );
}
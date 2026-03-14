import { X, Download, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToastStore, type Toast } from "../stores/toastStore";

const typeConfig = {
  update: {
    border: "border-brand-500/30",
    bg: "bg-brand-500/10",
    Icon: Download,
    iconColor: "text-brand-400",
  },
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    Icon: Info,
    iconColor: "text-blue-400",
  },
  success: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    Icon: CheckCircle2,
    iconColor: "text-emerald-400",
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    Icon: AlertTriangle,
    iconColor: "text-amber-400",
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const cfg = typeConfig[toast.type];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl toast-enter ${cfg.border} ${cfg.bg} bg-zinc-900/95`}
    >
      <cfg.Icon className={`w-5 h-5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-200">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-zinc-400 mt-0.5">{toast.message}</p>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className="mt-2 px-3 py-1 text-xs font-semibold rounded-md bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-12 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.slice(0, 5).map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

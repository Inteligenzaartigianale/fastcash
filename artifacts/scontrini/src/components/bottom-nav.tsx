import { useLocation } from "wouter";
import { ShoppingCart, Settings, History } from "lucide-react";

export function BottomNav() {
  const [location, setLocation] = useLocation();

  const items = [
    { label: "Vendita", icon: ShoppingCart, path: "/" },
    { label: "Storico", icon: History, path: "/storico" },
    { label: "Impostazioni", icon: Settings, path: "/admin" },
  ];

  return (
    <nav
      aria-label="Navigazione principale"
      className="shrink-0 bg-white border-b border-gray-200 flex z-30 pt-[env(safe-area-inset-top)]"
    >
      {items.map(({ label, icon: Icon, path }) => {
        const active = location === path;
        return (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors active:bg-gray-100 select-none ${
              active ? "text-[#1e3a5f]" : "text-gray-400"
            }`}
            style={{ minHeight: 64 }}
          >
            <Icon
              className={`w-6 h-6 ${active ? "stroke-[2.5]" : "stroke-[1.8]"}`}
            />
            <span className={`text-[11px] font-semibold leading-none ${active ? "text-[#1e3a5f]" : "text-gray-400"}`}>
              {label}
            </span>
            {active && (
              <div className="w-6 h-0.5 rounded-full bg-[#1e3a5f] mt-0.5" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

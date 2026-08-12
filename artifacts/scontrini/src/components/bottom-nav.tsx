import { useLocation } from "wouter";
import { ShoppingCart, Settings, HelpCircle } from "lucide-react";

export function BottomNav() {
  const [location, setLocation] = useLocation();

  const items = [
    { label: "Guida", icon: HelpCircle, path: "/guida" },
    { label: "Vendita", icon: ShoppingCart, path: "/" },
    { label: "Impostazioni", icon: Settings, path: "/admin" },
  ];

  return (
    <nav className="shrink-0 bg-white border-t border-gray-200 flex z-30">
      {items.map(({ label, icon: Icon, path }) => {
        const active = location === path;
        return (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              active ? "text-[#1e3a5f]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-2"}`} />
            <span className={`text-[11px] font-medium ${active ? "text-[#1e3a5f]" : ""}`}>{label}</span>
            {active && <div className="w-5 h-0.5 rounded-full bg-[#1e3a5f] mt-0.5" />}
          </button>
        );
      })}
    </nav>
  );
}

import {
  Calculator,
  FileBarChart,
  FlaskConical,
  LayoutDashboard,
  Monitor,
  Radar,
  Moon,
  ReceiptText,
  Settings2,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { navigate, type Route } from "@/lib/router";
import type { Theme } from "@/lib/theme";

export interface NavItem {
  route: Route;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const PILOTAGE: NavItem[] = [
  {
    route: "/cockpit",
    label: "Cockpit",
    description: "Solde disponible, provisions, réalisé et échéances",
    icon: LayoutDashboard,
  },
  {
    route: "/saisie",
    label: "Saisie",
    description: "Mouvements, factures et échéances",
    icon: ReceiptText,
  },
  {
    route: "/rapports",
    label: "Rapports",
    description: "Synthèses mensuelles et pistes chiffrées",
    icon: FileBarChart,
  },
];

export const OUTILS: NavItem[] = [
  {
    route: "/veille",
    label: "Veille des taux",
    description: "Sources officielles revérifiées chaque semaine",
    icon: Radar,
  },
  {
    route: "/simulateur",
    label: "Simulateur",
    description: "Ton net selon le statut, avec des taux sourcés",
    icon: Calculator,
  },
  {
    route: "/reglages",
    label: "Réglages",
    description: "Réglages datés, prévisionnel et solde bancaire",
    icon: Settings2,
  },
];

export const DEMO: NavItem = {
  route: "/demo",
  label: "Démo",
  description: "Le cockpit sur une année fictive, calculé dans le navigateur",
  icon: FlaskConical,
};

const THEMES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
];

function NavGroup({ label, items, route }: { label: string; items: NavItem[]; route: Route }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.route}>
              <SidebarMenuButton asChild isActive={route === item.route} tooltip={item.label}>
                <a
                  href={item.route}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.route);
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface Props {
  route: Route;
  demo: boolean;
  theme: Theme;
  onTheme: (t: Theme) => void;
}

export function AppSidebar({ route, demo, theme, onTheme }: Props) {
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[2];
  const ThemeIcon = current?.icon ?? Monitor;
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="font-serif text-lg leading-none">€</span>
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="font-serif text-base font-semibold">Finance Cockpit</span>
                <span className="text-xs text-muted-foreground">Freelance · 2026</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Pilotage" items={PILOTAGE} route={route} />
        <NavGroup label="Outils" items={demo ? [...OUTILS, DEMO] : OUTILS} route={route} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip="Thème">
                  <ThemeIcon />
                  <span>Thème : {current?.label}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                {THEMES.map((t) => (
                  <DropdownMenuItem
                    key={t.value}
                    onSelect={() => {
                      onTheme(t.value);
                    }}
                  >
                    <t.icon />
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

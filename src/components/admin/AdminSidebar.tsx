import { Link } from "@tanstack/react-router";
import { LogOut, ExternalLink } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { SidebarGlider } from "@/components/admin/SidebarGlider";
import { useChatBadge } from "@/lib/chat-badge";
import { supabase } from "@/integrations/supabase/client";
import headerMark from "@/assets/mg-metallic-logo-3d.png";
import type { PanelKey } from "@/lib/admin-panel-access";
import type { AdminNavGroup } from "@/lib/admin-navigation";

export function AdminSidebar({
  visibleNavGroups,
  panel,
  setPanel,
  adminOnly,
  employeeAllowed,
}: {
  visibleNavGroups: AdminNavGroup[];
  panel: PanelKey;
  setPanel: (key: PanelKey) => void;
  adminOnly: boolean;
  employeeAllowed: (key: PanelKey) => boolean;
}) {
  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="p-0">
        <div className="flex items-center justify-center px-1 py-1.5">
          <img src={headerMark} alt="MG Pro" className="w-full max-h-24 object-contain" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGlider activeKey={panel}>
          {visibleNavGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.filter((item) => adminOnly || employeeAllowed(item.key)).map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton isActive={panel === item.key} onClick={() => setPanel(item.key)}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                        {item.key === "chat" && <ChatNavBadge />}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarGlider>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {adminOnly && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/"><ExternalLink className="size-4" /><span>عرض الموقع</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={async () => { await supabase.auth.signOut(); window.location.replace("/auth"); }}>
              <LogOut className="size-4" /><span>خروج</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ChatNavBadge() {
  const count = useChatBadge();
  if (!count) return null;
  return <span className="ms-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">{count > 99 ? "99+" : count}</span>;
}

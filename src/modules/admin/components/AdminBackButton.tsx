import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminBackTarget } from "@/components/admin/back-nav";

/** Back navigation control scoped to the admin back-navigation provider. */
export function AdminBackButton() {
  const back = useAdminBackTarget();
  if (!back) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-xl gap-1 shrink-0"
      onClick={back}
      aria-label="رجوع"
    >
      <ChevronRight className="size-4" /> رجوع
    </Button>
  );
}

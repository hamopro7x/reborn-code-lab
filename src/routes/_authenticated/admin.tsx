import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

function Admin() {
  return (
    <div className="min-h-screen bg-background" dir="rtl" />
  );
}

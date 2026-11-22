import { supabase } from "@/integrations/supabase/client";

/** Upload an employee avatar to the private avatars bucket and return its storage path. */
export async function uploadEmployeeAvatar(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = userId + "/" + Date.now() + "." + ext;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

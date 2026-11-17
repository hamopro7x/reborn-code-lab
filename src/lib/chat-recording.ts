/** Upload the completed recording, then send that exact attachment without staging it. */
export async function sendChatRecording<T>(file: File, upload: (file: File) => Promise<T>, send: (attachment: T) => Promise<boolean>, preserve: (attachment: T) => void) {
  const attachment = await upload(file);
  if (!await send(attachment)) preserve(attachment);
}
/** Default `codeSettings` for `auth.sendCode` (WebK-compatible, no app-hash / Firebase). */
export function webkCodeSettings() {
  return {
    _: "codeSettings" as const,
    allow_flashcall: false,
    current_number: false,
    allow_app_hash: false,
    allow_missed_call: false,
    allow_firebase: false,
  };
}

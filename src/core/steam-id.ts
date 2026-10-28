/** Validates the SteamID64 typed in the settings screen (the app's only user input). */

export function parseSteamId(input: string): { steamId: string } | { error: string } {
  const value = input.trim();
  if (/^\d{17}$/.test(value)) return { steamId: value };
  if (/^https?:\/\/|steamcommunity\.com/i.test(value)) return { error: "Enter the 17-digit SteamID64, not a profile URL." };
  return { error: "A SteamID64 has exactly 17 digits." };
}

/** Settings screen: the SteamID64, shown at first launch and from the header's settings button. */
import { parseSteamId } from "../core/steam-id.ts";

export type SettingsScreen = {
  /** Shows the screen; without a current SteamID there is nothing to go back to, so no Cancel. */
  show(currentSteamId: string | null): void;
  hide(): void;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** onSave resolves to an error message to show, or null once the new SteamID is in use. */
export function setupSettings(onSave: (steamId: string) => Promise<string | null>): SettingsScreen {
  const screen = $<HTMLElement>("settings");
  const form = $<HTMLFormElement>("settings-form");
  const input = $<HTMLInputElement>("steam-id");
  const error = $<HTMLParagraphElement>("steam-id-error");
  const save = $<HTMLButtonElement>("save-settings");
  const cancel = $<HTMLButtonElement>("cancel-settings");
  const board = [$<HTMLElement>("filters"), document.querySelector<HTMLElement>(".table-wrap")!];

  const showError = (message: string | null) => {
    error.hidden = message === null;
    error.textContent = message ?? "";
    input.setAttribute("aria-invalid", String(message !== null));
  };

  const hide = () => {
    screen.hidden = true;
    for (const el of board) el.hidden = false;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = parseSteamId(input.value);
    if ("error" in parsed) return showError(parsed.error);
    showError(null);
    save.disabled = true;
    save.setAttribute("aria-busy", "true");
    const failure = await onSave(parsed.steamId);
    save.disabled = false;
    save.removeAttribute("aria-busy");
    if (failure) showError(failure);
    else hide();
  });
  cancel.addEventListener("click", hide);

  return {
    show(currentSteamId) {
      input.value = currentSteamId ?? "";
      cancel.hidden = currentSteamId === null;
      showError(null);
      for (const el of board) el.hidden = true;
      screen.hidden = false;
      input.focus();
    },
    hide,
  };
}

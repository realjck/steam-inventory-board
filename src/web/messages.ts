/** User-facing messages for inventory refresh failures. */
import type { InventoryFailure } from "../server/inventory.ts";

const BY_REASON: Record<Exclude<InventoryFailure, "unavailable">, string> = {
  private:
    "Steam refuse l'accès à l'inventaire : il est privé ou introuvable. Rendez-le public dans les paramètres de confidentialité du profil Steam.",
  "rate-limited": "Steam limite les requêtes d'inventaire. Réessayez dans quelques minutes.",
};

export function describeInventoryError(reason: InventoryFailure, message: string, hasCache: boolean): string {
  const text = reason === "unavailable" ? `Le rafraîchissement a échoué : ${message}.` : BY_REASON[reason];
  return hasCache ? `${text} L'inventaire affiché est celui du cache.` : text;
}

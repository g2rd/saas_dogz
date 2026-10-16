import { getRequestContext } from "@/modules/core";
import { countNewClientRequests } from "@/modules/notifications";
import { TrainerBottomNav } from "./bottom-nav";

/** Dolna nawigacja z licznikiem nowych próśb klientów; bez kontekstu (kreator organizacji) nie pokazuje się. */
export async function BottomNavSlot() {
  const ctx = await getRequestContext();
  if (!ctx.ok) return null;
  const requests = await countNewClientRequests(ctx.value);
  return <TrainerBottomNav requests={requests.ok ? requests.value : 0} />;
}

export {
  archiveClient,
  createClient,
  getClient,
  listClients,
  restoreClient,
  updateClient,
  type ClientListQuery,
} from "./application/clients";
export { ClientForm, type ClientFormValues } from "./ui/client-form";
export {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  clientFullName,
  type Client,
  type ClientStatus,
} from "./domain/client";

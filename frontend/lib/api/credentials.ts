export type CredentialType = "password" | "private_key" | "private_key_passphrase";

export interface CredentialItem {
  id: string;
  name: string;
  cred_type: CredentialType;
  username: string;
  key_version: number;
  fingerprint: string;
  description?: string;
  server_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCredentialPayload {
  name: string;
  cred_type: CredentialType;
  username: string;
  secret: string;
  passphrase?: string;
  description?: string;
}

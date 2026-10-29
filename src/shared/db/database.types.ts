
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"changes": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string | null,"id": string,"ip": unknown,"organization_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"ip"?: unknown,"organization_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"ip"?: unknown,"organization_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"beta_codes": {
                  Row: {
                    "code_hash": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"label": string,"max_uses": number,"revoked_at": string | null,"used_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"label": string,"max_uses"?: number,"revoked_at"?: string | null,"used_count"?: number
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"label"?: string,"max_uses"?: number,"revoked_at"?: string | null,"used_count"?: number
                  }
                  Relationships: [
                    
                  ]
                },"charges": {
                  Row: {
                    "amount_minor": number,"client_id": string,"created_at": string,"created_by": string | null,"currency": string,"description": string,"due_date": string,"id": string,"organization_id": string,"source_id": string | null,"source_type": string,"updated_at": string,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"client_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"due_date": string,"id"?: string,"organization_id": string,"source_id"?: string | null,"source_type"?: string,"updated_at"?: string,"voided_at"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"due_date"?: string,"id"?: string,"organization_id"?: string,"source_id"?: string | null,"source_type"?: string,"updated_at"?: string,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "charges_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    }
                  ]
                },"client_access": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"organization_id": string,"relation": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"organization_id": string,"relation"?: string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"organization_id"?: string,"relation"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_access_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_access_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    }
                  ]
                },"client_packages": {
                  Row: {
                    "canceled_at": string | null,"client_id": string,"created_at": string,"created_by": string | null,"currency": string,"dog_id": string | null,"id": string,"name": string,"organization_id": string,"package_template_id": string | null,"price_minor": number,"sessions_total": number,"updated_at": string,"valid_from": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_at"?: string | null,"client_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"dog_id"?: string | null,"id"?: string,"name": string,"organization_id": string,"package_template_id"?: string | null,"price_minor": number,"sessions_total": number,"updated_at"?: string,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Update: {
                    "canceled_at"?: string | null,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"dog_id"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"package_template_id"?: string | null,"price_minor"?: number,"sessions_total"?: number,"updated_at"?: string,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_packages_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_packages_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "client_packages_organization_id_dog_id_fkey"
      columns: ["organization_id","dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_packages_organization_id_package_template_id_fkey"
      columns: ["organization_id","package_template_id"]
isOneToOne: false
      referencedRelation: "package_templates"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"client_requests": {
                  Row: {
                    "charge_id": string | null,"client_id": string,"client_package_id": string | null,"created_at": string,"created_by": string | null,"id": string,"kind": string,"note": string | null,"organization_id": string,"seen_at": string | null,"seen_by": string | null,"session_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charge_id"?: string | null,"client_id": string,"client_package_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"organization_id": string,"seen_at"?: string | null,"seen_by"?: string | null,"session_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "charge_id"?: string | null,"client_id"?: string,"client_package_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"organization_id"?: string,"seen_at"?: string | null,"seen_by"?: string | null,"session_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_requests_organization_id_charge_id_fkey"
      columns: ["organization_id","charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_requests_organization_id_charge_id_fkey"
      columns: ["organization_id","charge_id"]
isOneToOne: false
      referencedRelation: "v_charge_balance"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_requests_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_requests_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "client_requests_organization_id_client_package_id_fkey"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "client_packages"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_requests_organization_id_client_package_id_fkey"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "v_client_package_balance"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_requests_session_fk"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "training_sessions"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_requests_session_fk"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "v_session_details"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "archived_at": string | null,"assigned_trainer_id": string | null,"created_at": string,"created_by": string | null,"email": string | null,"first_name": string,"id": string,"last_name": string,"organization_id": string,"phone": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"assigned_trainer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"first_name": string,"id"?: string,"last_name"?: string,"organization_id": string,"phone"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"assigned_trainer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"first_name"?: string,"id"?: string,"last_name"?: string,"organization_id"?: string,"phone"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_organization_id_assigned_trainer_id_fkey"
      columns: ["organization_id","assigned_trainer_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "clients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"document": string,"id": string,"locale": string | null,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"document": string,"id"?: string,"locale"?: string | null,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"document"?: string,"id"?: string,"locale"?: string | null,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"dog_notes": {
                  Row: {
                    "content": string,"created_at": string,"created_by": string | null,"dog_id": string,"id": string,"kind": string,"organization_id": string,"updated_at": string,"valid_until": string | null,"visible_to_client": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"created_by"?: string | null,"dog_id": string,"id"?: string,"kind"?: string,"organization_id": string,"updated_at"?: string,"valid_until"?: string | null,"visible_to_client"?: boolean
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"created_by"?: string | null,"dog_id"?: string,"id"?: string,"kind"?: string,"organization_id"?: string,"updated_at"?: string,"valid_until"?: string | null,"visible_to_client"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "dog_notes_organization_id_dog_id_fkey"
      columns: ["organization_id","dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"dogs": {
                  Row: {
                    "approval_status": string,"archived_at": string | null,"birth_date": string | null,"breed": string | null,"client_id": string,"created_at": string,"created_by": string | null,"created_by_client": boolean,"id": string,"name": string,"organization_id": string,"photo_file_id": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sex": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_status"?: string,"archived_at"?: string | null,"birth_date"?: string | null,"breed"?: string | null,"client_id": string,"created_at"?: string,"created_by"?: string | null,"created_by_client"?: boolean,"id"?: string,"name": string,"organization_id": string,"photo_file_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sex"?: string,"updated_at"?: string
                  }
                  Update: {
                    "approval_status"?: string,"archived_at"?: string | null,"birth_date"?: string | null,"breed"?: string | null,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"created_by_client"?: boolean,"id"?: string,"name"?: string,"organization_id"?: string,"photo_file_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sex"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dogs_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "dogs_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "dogs_organization_id_photo_file_id_fkey"
      columns: ["organization_id","photo_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "audience": string,"created_at": string,"handled_at": string | null,"id": string,"kind": string,"locale": string | null,"message": string,"organization_id": string,"page": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": string,"created_at"?: string,"handled_at"?: string | null,"id"?: string,"kind": string,"locale"?: string | null,"message": string,"organization_id": string,"page"?: string | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "audience"?: string,"created_at"?: string,"handled_at"?: string | null,"id"?: string,"kind"?: string,"locale"?: string | null,"message"?: string,"organization_id"?: string,"page"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"files": {
                  Row: {
                    "bucket": string,"created_at": string,"created_by": string | null,"duration_seconds": number | null,"id": string,"mime_type": string | null,"organization_id": string,"owner_id": string | null,"owner_type": string | null,"path": string,"retention_until": string | null,"size_bytes": number | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"created_at"?: string,"created_by"?: string | null,"duration_seconds"?: number | null,"id"?: string,"mime_type"?: string | null,"organization_id": string,"owner_id"?: string | null,"owner_type"?: string | null,"path": string,"retention_until"?: string | null,"size_bytes"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "bucket"?: string,"created_at"?: string,"created_by"?: string | null,"duration_seconds"?: number | null,"id"?: string,"mime_type"?: string | null,"organization_id"?: string,"owner_id"?: string | null,"owner_type"?: string | null,"path"?: string,"retention_until"?: string | null,"size_bytes"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invitation_lookup_failures": {
                  Row: {
                    "created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"client_id": string | null,"client_package_id": string | null,"code_hash": string | null,"created_at": string,"created_by": string | null,"email": string | null,"expires_at": string,"id": string,"invited_by": string | null,"kind": string,"organization_id": string,"revoked_at": string | null,"role": string | null,"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"client_id"?: string | null,"client_package_id"?: string | null,"code_hash"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"expires_at": string,"id"?: string,"invited_by"?: string | null,"kind": string,"organization_id": string,"revoked_at"?: string | null,"role"?: string | null,"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"client_id"?: string | null,"client_package_id"?: string | null,"code_hash"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"kind"?: string,"organization_id"?: string,"revoked_at"?: string | null,"role"?: string | null,"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_client_fk"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "invitations_client_fk"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_package_fk"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "client_packages"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "invitations_package_fk"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "v_client_package_balance"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"join_requests": {
                  Row: {
                    "client_id": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"email": string | null,"first_name": string,"id": string,"last_name": string,"note": string | null,"organization_id": string,"organization_name": string,"phone": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"email"?: string | null,"first_name": string,"id"?: string,"last_name"?: string,"note"?: string | null,"organization_id": string,"organization_name": string,"phone"?: string | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "client_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"email"?: string | null,"first_name"?: string,"id"?: string,"last_name"?: string,"note"?: string | null,"organization_id"?: string,"organization_name"?: string,"phone"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "join_requests_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "join_requests_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "join_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_log": {
                  Row: {
                    "attempts": number,"channel": string,"created_at": string,"detail": string | null,"id": string,"notification_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": string,"created_at"?: string,"detail"?: string | null,"id"?: string,"notification_id": string,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: string,"created_at"?: string,"detail"?: string | null,"id"?: string,"notification_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_log_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "email": boolean,"push": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "audience": string,"body": string,"client_id": string | null,"created_at": string,"data": NonNullable<Json>,"dedupe_key": string,"id": string,"link": string | null,"message_key": string | null,"message_params": NonNullable<Json>,"organization_id": string,"read_at": string | null,"recipient_user_id": string,"title": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": string,"body"?: string,"client_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key": string,"id"?: string,"link"?: string | null,"message_key"?: string | null,"message_params"?: NonNullable<Json>,"organization_id": string,"read_at"?: string | null,"recipient_user_id": string,"title": string,"type": string
                  }
                  Update: {
                    "audience"?: string,"body"?: string,"client_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string,"id"?: string,"link"?: string | null,"message_key"?: string | null,"message_params"?: NonNullable<Json>,"organization_id"?: string,"read_at"?: string | null,"recipient_user_id"?: string,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "notifications_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "notifications_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_admin_info": {
                  Row: {
                    "notes": string | null,"organization_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "notes"?: string | null,"organization_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "notes"?: string | null,"organization_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_admin_info_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"organization_id": string,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"organization_id": string,"role": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"organization_id"?: string,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_settings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"currency": string,"late_cancel_consumes_session": boolean,"late_cancel_hours": number,"locale": string,"organization_id": string,"reminder_hours_before": number,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"late_cancel_consumes_session"?: boolean,"late_cancel_hours"?: number,"locale"?: string,"organization_id": string,"reminder_hours_before"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"late_cancel_consumes_session"?: boolean,"late_cancel_hours"?: number,"locale"?: string,"organization_id"?: string,"reminder_hours_before"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "access_until": string | null,"archived_at": string | null,"brand_color": string | null,"created_at": string,"created_by": string | null,"id": string,"logo_file_id": string | null,"name": string,"public_name": string | null,"slug": string,"status": string,"status_changed_at": string | null,"status_changed_by": string | null,"status_reason": string | null,"status_reason_code": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_until"?: string | null,"archived_at"?: string | null,"brand_color"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"logo_file_id"?: string | null,"name": string,"public_name"?: string | null,"slug": string,"status"?: string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"status_reason"?: string | null,"status_reason_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_until"?: string | null,"archived_at"?: string | null,"brand_color"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"logo_file_id"?: string | null,"name"?: string,"public_name"?: string | null,"slug"?: string,"status"?: string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"status_reason"?: string | null,"status_reason_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_logo_file_fk"
      columns: ["logo_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"outbox_events": {
                  Row: {
                    "attempts": number,"created_at": string,"id": string,"last_error": string | null,"locked_until": string | null,"not_before": string | null,"organization_id": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"locked_until"?: string | null,"not_before"?: string | null,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"type": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"locked_until"?: string | null,"not_before"?: string | null,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbox_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"package_ledger": {
                  Row: {
                    "attendee_id": string | null,"client_package_id": string,"created_at": string,"created_by": string | null,"delta": number,"id": string,"note": string | null,"note_code": string | null,"organization_id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendee_id"?: string | null,"client_package_id": string,"created_at"?: string,"created_by"?: string | null,"delta": number,"id"?: string,"note"?: string | null,"note_code"?: string | null,"organization_id": string,"reason": string
                  }
                  Update: {
                    "attendee_id"?: string | null,"client_package_id"?: string,"created_at"?: string,"created_by"?: string | null,"delta"?: number,"id"?: string,"note"?: string | null,"note_code"?: string | null,"organization_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "package_ledger_attendee_fk"
      columns: ["organization_id","attendee_id"]
isOneToOne: false
      referencedRelation: "session_attendees"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "package_ledger_organization_id_client_package_id_fkey"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "client_packages"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "package_ledger_organization_id_client_package_id_fkey"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "v_client_package_balance"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"package_templates": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"id": string,"is_active": boolean,"name": string,"organization_id": string,"price_minor": number,"sessions_count": number,"updated_at": string,"validity_days": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"is_active"?: boolean,"name": string,"organization_id": string,"price_minor": number,"sessions_count": number,"updated_at"?: string,"validity_days"?: number | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string,"price_minor"?: number,"sessions_count"?: number,"updated_at"?: string,"validity_days"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "package_templates_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount_minor": number,"charge_id": string,"created_at": string,"created_by": string | null,"id": string,"organization_id": string,"payment_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"charge_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"payment_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"charge_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"payment_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_organization_id_charge_id_fkey"
      columns: ["organization_id","charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payment_allocations_organization_id_charge_id_fkey"
      columns: ["organization_id","charge_id"]
isOneToOne: false
      referencedRelation: "v_charge_balance"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payment_allocations_organization_id_payment_id_fkey"
      columns: ["organization_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"client_id": string,"created_at": string,"currency": string,"id": string,"method": string,"organization_id": string,"paid_at": string,"recorded_by": string | null,"reference": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"client_id": string,"created_at"?: string,"currency"?: string,"id"?: string,"method": string,"organization_id": string,"paid_at"?: string,"recorded_by"?: string | null,"reference"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"client_id"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"method"?: string,"organization_id"?: string,"paid_at"?: string,"recorded_by"?: string | null,"reference"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "payments_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": string
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_file_id": string | null,"created_at": string,"full_name": string | null,"id": string,"locale": string,"phone": string | null,"region": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_file_id"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"locale"?: string,"phone"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_file_id"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"locale"?: string,"phone"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_avatar_file_fk"
      columns: ["avatar_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"school_join_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"organization_id": string,"revoked_at": string | null,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"revoked_at"?: string | null,"token": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"revoked_at"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "school_join_links_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"session_attendees": {
                  Row: {
                    "attendance": string,"client_id": string,"client_package_id": string | null,"created_at": string,"created_by": string | null,"dog_id": string | null,"id": string,"organization_id": string,"session_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance"?: string,"client_id": string,"client_package_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"dog_id"?: string | null,"id"?: string,"organization_id": string,"session_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attendance"?: string,"client_id"?: string,"client_package_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"dog_id"?: string | null,"id"?: string,"organization_id"?: string,"session_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_attendees_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "session_attendees_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "session_attendees_organization_id_client_package_id_fkey"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "client_packages"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "session_attendees_organization_id_client_package_id_fkey"
      columns: ["organization_id","client_package_id"]
isOneToOne: false
      referencedRelation: "v_client_package_balance"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "session_attendees_organization_id_dog_id_fkey"
      columns: ["organization_id","dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "session_attendees_organization_id_session_id_fkey"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "training_sessions"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "session_attendees_organization_id_session_id_fkey"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "v_session_details"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"session_types": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"default_price_minor": number,"duration_minutes": number,"id": string,"name": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_price_minor"?: number,"duration_minutes": number,"id"?: string,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_price_minor"?: number,"duration_minutes"?: number,"id"?: string,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_types_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"slot_claims": {
                  Row: {
                    "client_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"dog_id": string | null,"id": string,"offer_id": string,"organization_id": string,"session_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"dog_id"?: string | null,"id"?: string,"offer_id": string,"organization_id": string,"session_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"dog_id"?: string | null,"id"?: string,"offer_id"?: string,"organization_id"?: string,"session_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slot_claims_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "slot_claims_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "slot_claims_organization_id_dog_id_fkey"
      columns: ["organization_id","dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "slot_claims_organization_id_offer_id_fkey"
      columns: ["organization_id","offer_id"]
isOneToOne: false
      referencedRelation: "slot_offers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "slot_claims_organization_id_session_id_fkey"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "training_sessions"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "slot_claims_organization_id_session_id_fkey"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "v_session_details"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"slot_offers": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"excluded_client_id": string | null,"id": string,"location": string | null,"note": string | null,"organization_id": string,"session_id": string,"session_type_id": string,"starts_at": string,"status": string,"trainer_id": string,"type_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"excluded_client_id"?: string | null,"id"?: string,"location"?: string | null,"note"?: string | null,"organization_id": string,"session_id": string,"session_type_id": string,"starts_at": string,"status"?: string,"trainer_id": string,"type_name": string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"excluded_client_id"?: string | null,"id"?: string,"location"?: string | null,"note"?: string | null,"organization_id"?: string,"session_id"?: string,"session_type_id"?: string,"starts_at"?: string,"status"?: string,"trainer_id"?: string,"type_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slot_offers_organization_id_session_id_fkey"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "training_sessions"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "slot_offers_organization_id_session_id_fkey"
      columns: ["organization_id","session_id"]
isOneToOne: false
      referencedRelation: "v_session_details"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"training_sessions": {
                  Row: {
                    "canceled_at": string | null,"client_summary": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"id": string,"location": string | null,"organization_id": string,"session_type_id": string,"starts_at": string,"status": string,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_at"?: string | null,"client_summary"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"location"?: string | null,"organization_id": string,"session_type_id": string,"starts_at": string,"status"?: string,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "canceled_at"?: string | null,"client_summary"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"location"?: string | null,"organization_id"?: string,"session_type_id"?: string,"starts_at"?: string,"status"?: string,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "training_sessions_organization_id_session_type_id_fkey"
      columns: ["organization_id","session_type_id"]
isOneToOne: false
      referencedRelation: "session_types"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "training_sessions_organization_id_trainer_id_fkey"
      columns: ["organization_id","trainer_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    }
                  ]
                },"waitlist_entries": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"organization_id": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waitlist_entries_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "waitlist_entries_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    }
                  ]
                }
          }
          Views: {
            "v_charge_balance": {
                  Row: {
                    "allocated_minor": number | null,"amount_minor": number | null,"client_id": string | null,"created_at": string | null,"currency": string | null,"description": string | null,"due_date": string | null,"id": string | null,"organization_id": string | null,"source_id": string | null,"source_type": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "allocated_minor"?: never,"amount_minor"?: number | null,"client_id"?: string | null,"created_at"?: string | null,"currency"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string | null,"organization_id"?: string | null,"source_id"?: string | null,"source_type"?: string | null,"voided_at"?: string | null
                         }
                        Update: {
                           "allocated_minor"?: never,"amount_minor"?: number | null,"client_id"?: string | null,"created_at"?: string | null,"currency"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string | null,"organization_id"?: string | null,"source_id"?: string | null,"source_type"?: string | null,"voided_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "charges_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "charges_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    }
                  ]
                },"v_client_balance": {
                  Row: {
                    "allocated_minor": number | null,"charged_minor": number | null,"client_id": string | null,"organization_id": string | null,"paid_minor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "allocated_minor"?: never,"charged_minor"?: never,"client_id"?: string | null,"organization_id"?: string | null,"paid_minor"?: never
                         }
                        Update: {
                           "allocated_minor"?: never,"charged_minor"?: never,"client_id"?: string | null,"organization_id"?: string | null,"paid_minor"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "clients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"v_client_package_balance": {
                  Row: {
                    "balance": number | null,"canceled_at": string | null,"client_id": string | null,"created_at": string | null,"currency": string | null,"dog_id": string | null,"id": string | null,"name": string | null,"organization_id": string | null,"package_template_id": string | null,"price_minor": number | null,"sessions_total": number | null,"valid_from": string | null,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "balance"?: never,"canceled_at"?: string | null,"client_id"?: string | null,"created_at"?: string | null,"currency"?: string | null,"dog_id"?: string | null,"id"?: string | null,"name"?: string | null,"organization_id"?: string | null,"package_template_id"?: string | null,"price_minor"?: number | null,"sessions_total"?: number | null,"valid_from"?: string | null,"valid_until"?: string | null
                         }
                        Update: {
                           "balance"?: never,"canceled_at"?: string | null,"client_id"?: string | null,"created_at"?: string | null,"currency"?: string | null,"dog_id"?: string | null,"id"?: string | null,"name"?: string | null,"organization_id"?: string | null,"package_template_id"?: string | null,"price_minor"?: number | null,"sessions_total"?: number | null,"valid_from"?: string | null,"valid_until"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "client_packages_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_packages_organization_id_client_id_fkey"
      columns: ["organization_id","client_id"]
isOneToOne: false
      referencedRelation: "v_client_balance"
      referencedColumns: ["organization_id","client_id"]
    },{
      foreignKeyName: "client_packages_organization_id_dog_id_fkey"
      columns: ["organization_id","dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "client_packages_organization_id_package_template_id_fkey"
      columns: ["organization_id","package_template_id"]
isOneToOne: false
      referencedRelation: "package_templates"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"v_session_details": {
                  Row: {
                    "attendance": string | null,"attendee_id": string | null,"client_first_name": string | null,"client_id": string | null,"client_last_name": string | null,"client_package_id": string | null,"client_summary": string | null,"completed_at": string | null,"currency": string | null,"default_price_minor": number | null,"dog_id": string | null,"dog_name": string | null,"duration_minutes": number | null,"ends_at": string | null,"id": string | null,"location": string | null,"organization_id": string | null,"session_type_id": string | null,"starts_at": string | null,"status": string | null,"trainer_id": string | null,"trainer_name": string | null,"type_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "training_sessions_organization_id_session_type_id_fkey"
      columns: ["organization_id","session_type_id"]
isOneToOne: false
      referencedRelation: "session_types"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "training_sessions_organization_id_trainer_id_fkey"
      columns: ["organization_id","trainer_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_secret_hash": string }; Returns: Json
                           },
"accept_legal":
{ Args: { "p_version": string }; Returns: undefined
                           },
"accept_member_invitation":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"accept_slot_claim":
{ Args: { "p_claim": string,"p_org": string }; Returns: string
                           },
"adjust_package":
{ Args: { "p_delta": number,"p_note": string,"p_org": string,"p_package": string,"p_reason": string }; Returns: string
                           },
"admin_create_beta_code":
{ Args: { "p_actor": string,"p_code_hash": string,"p_expires_at": string,"p_label": string,"p_max_uses": number }; Returns: string
                           },
"admin_organizations_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "access_until": string,"active_staff_7d": number,"clients_count": number,"created_at": string,"last_activity_at": string,"last_sign_in_at": string,"name": string,"new_clients_7d": number,"notes": string,"notifications_30d": number,"organization_id": string,"owner_email": string,"owner_name": string,"portal_clients_count": number,"push_devices": number,"sessions_30d": number,"sessions_7d": number,"slug": string,"staff_count": number,"status": string,"status_reason": string
            }[]
                           },
"admin_revoke_beta_code":
{ Args: { "p_actor": string,"p_code": string }; Returns: undefined
                           },
"admin_set_organization_notes":
{ Args: { "p_actor": string,"p_notes": string,"p_org": string }; Returns: undefined
                           },
"admin_set_organization_status":
{ Args: { "p_access_until": string,"p_actor": string,"p_org": string,"p_reason": string,"p_status": string }; Returns: undefined
                           },
"admin_set_signup_mode":
{ Args: { "p_actor": string,"p_mode": string }; Returns: undefined
                           },
"cancel_package":
{ Args: { "p_org": string,"p_package": string }; Returns: undefined
                           },
"cancel_session":
{ Args: { "p_consume": boolean,"p_org": string,"p_session": string }; Returns: Json
                           },
"check_signup_allowed":
{ Args: { "p_code_hash": string,"p_invite_hash": string }; Returns: string
                           },
"claim_outbox_events":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"id": string,
"last_error": string | null,
"locked_until": string | null,
"not_before": string | null,
"organization_id": string | null,
"payload": NonNullable<Json>,
"processed_at": string | null,
"type": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "outbox_events"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_slot":
{ Args: { "p_client": string,"p_dog": string,"p_offer": string,"p_org": string }; Returns: Json
                           },
"close_slot_offer":
{ Args: { "p_offer": string,"p_org": string }; Returns: undefined
                           },
"complete_session":
{ Args: { "p_note": string,"p_org": string,"p_package": string,"p_session": string,"p_without_package": boolean }; Returns: Json
                           },
"create_client_invitation":
{ Args: { "p_client": string,"p_code_hash": string,"p_email": string,"p_expires_at": string,"p_org": string,"p_package": string,"p_token_hash": string }; Returns: string
                           },
"create_client_request":
{ Args: { "p_charge": string,"p_client": string,"p_kind": string,"p_note": string,"p_org": string,"p_package": string,"p_session"?: string }; Returns: Json
                           },
"create_member_invitation":
{ Args: { "p_email": string,"p_expires_at": string,"p_org": string,"p_role": string,"p_token_hash": string }; Returns: string
                           },
"create_organization":
{ Args: { "p_name": string,"p_slug": string }; Returns: string
                           },
"create_slot_offer":
{ Args: { "p_note": string,"p_org": string,"p_session": string }; Returns: string
                           },
"decide_join_request":
{ Args: { "p_approve": boolean,"p_client"?: string,"p_org": string,"p_request": string }; Returns: string
                           },
"enqueue_daily_notification_events":
{ Args: { "p_now"?: string }; Returns: number
                           },
"expire_organization_access":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"import_clients":
{ Args: { "p_org": string,"p_rows": Json }; Returns: Json
                           },
"lookup_invitation":
{ Args: { "p_email"?: string,"p_secret_hash": string }; Returns: Json
                           },
"lookup_member_invitation":
{ Args: { "p_email"?: string,"p_token_hash": string }; Returns: Json
                           },
"lookup_school_join":
{ Args: { "p_token": string }; Returns: Json
                           },
"record_payment":
{ Args: { "p_allocations": Json,"p_amount_minor": number,"p_client": string,"p_currency": string,"p_method": string,"p_org": string,"p_paid_at": string,"p_reference": string }; Returns: string
                           },
"request_school_join":
{ Args: { "p_first_name": string,"p_last_name": string,"p_note": string,"p_phone": string,"p_token": string }; Returns: string
                           },
"revoke_client_access":
{ Args: { "p_client": string,"p_org": string,"p_user": string }; Returns: undefined
                           },
"revoke_member_invitation":
{ Args: { "p_invitation": string,"p_org": string }; Returns: undefined
                           },
"rotate_school_join_link":
{ Args: { "p_org": string,"p_token": string }; Returns: undefined
                           },
"schedule_session":
{ Args: { "p_client": string,"p_dog": string,"p_location": string,"p_org": string,"p_starts_at": string,"p_trainer": string,"p_type": string }; Returns: string
                           },
"sell_package":
{ Args: { "p_client": string,"p_currency": string,"p_dog": string,"p_due_date": string,"p_name": string,"p_org": string,"p_price_minor": number,"p_sessions": number,"p_template": string,"p_valid_from": string,"p_valid_until": string }; Returns: string
                           },
"undo_cancel_session":
{ Args: { "p_org": string,"p_session": string }; Returns: undefined
                           },
"undo_complete_session":
{ Args: { "p_org": string,"p_session": string }; Returns: undefined
                           },
"void_charge":
{ Args: { "p_charge": string,"p_org": string }; Returns: undefined
                           },
"void_payment":
{ Args: { "p_org": string,"p_payment": string }; Returns: undefined
                           },
"withdraw_slot_claim":
{ Args: { "p_claim": string,"p_org": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
